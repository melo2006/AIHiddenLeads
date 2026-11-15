import { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';

// Publish #68, defect 1b — the "Form waiting" chip, driven through
// the real conversation component on a stubbed socket (the
// conversation-interruption harness pattern):
//
//   card arrives → visitor dismisses it (Not now) → the chip is in
//   the panel → tapping it sends reopen_action → the proxy's fresh
//   confirm_action renders the SAME card again → confirming it this
//   time leaves NO chip behind.
//
// Before #68 the dismissed card was simply gone: no chip, no way
// back, and the presenter had no re-issue path either (the proxy
// half is pinned in capture-integrity.test.ts).

const mocks = vi.hoisted(() => ({ clear: vi.fn(), pcm: vi.fn(() => true), invoke: vi.fn(async () => ({ data: { token: 'test', maxSeconds: 900 } })) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/voiceSessionAuth', () => ({ voiceSessionHeaders: async () => undefined }));
vi.mock('@/lib/campaignTracking', () => ({ campaignVisit: () => null, trackCampaignEvent: async () => {} }));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/SimliAvatar', () => ({ SOUND_BLOCKED: 'blocked', default: forwardRef(function Avatar(_, ref) {
  useImperativeHandle(ref, () => ({ start: async () => true, stop: vi.fn(), clear: mocks.clear, sendPcm24k: mocks.pcm, setPlaybackMuted: vi.fn() }));
  return null;
}) }));

class Socket {
  static OPEN = 1;
  static current: Socket | undefined;
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose = null;
  onerror = null;
  send = vi.fn(); close = vi.fn();
  constructor() { Socket.current = this; }
  emit(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
class Context {
  static capture: { onaudioprocess?: (event: unknown) => void };
  static sources: { stop: ReturnType<typeof vi.fn> }[] = [];
  state = 'running'; currentTime = 0; sampleRate = 16000;
  destination = {};
  resume = async () => {}; suspend = async () => {}; close = async () => {};
  createMediaStreamSource = () => ({ connect: vi.fn() });
  createScriptProcessor = () => { const node = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: undefined }; Context.capture = node; return node; };
  createBuffer = (_channels: number, count: number, rate: number) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) });
  createBufferSource = () => { const source = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null }; Context.sources.push(source); return source; };
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Context.sources = []; Socket.current = undefined; vi.clearAllMocks(); });

const CARD = {
  type: 'confirm_action',
  id: 'card-1',
  action: 'request_platform_followup',
  contact: { name: 'Tony Miller', email: 'tony@example.com', phone: '954-770-6622' },
};

async function liveConversation() {
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('AudioContext', Context);
  Element.prototype.setPointerCapture = vi.fn(); Element.prototype.releasePointerCapture = vi.fn(); Element.prototype.hasPointerCapture = vi.fn(() => false); Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [], }), enumerateDevices: async () => [] } });
  const view = render(<GeminiConversation compact autoStart consentOnOpen />);
  await waitFor(() => expect(Socket.current?.onmessage).toBeTypeOf('function'));
  const socket = Socket.current;
  if (!socket) throw new Error('Call socket was not created');
  act(() => socket.emit({ type: 'ready' }));
  return { view, socket };
}

describe('Publish #68 — the Form waiting chip', () => {
  it('a dismissed card leaves the chip; the chip re-issues the same card; a confirm retires it', async () => {
    const { view, socket } = await liveConversation();

    // The card arrives from the proxy.
    act(() => socket.emit(CARD));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Form waiting — tap to open' })).toBeNull();

    // The visitor dismisses it unsubmitted (Not now — the X and the
    // outside tap land on the same decline).
    fireEvent.click(view.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(view.queryByText('Confirm your follow-up details')).toBeNull());

    // The chip is the way back, and it persists in the panel.
    const chip = await view.findByRole('button', { name: 'Form waiting — tap to open' });
    expect(chip).toBeTruthy();

    // One tap asks the proxy to re-issue the card; the chip stands down.
    socket.send.mockClear();
    fireEvent.click(chip);
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"reopen_action"'));
    await waitFor(() => expect(view.queryByRole('button', { name: 'Form waiting — tap to open' })).toBeNull());

    // The proxy answers with a fresh confirm_action — the same card,
    // same details, new id — and it renders again.
    act(() => socket.emit({ ...CARD, id: 'reopen-1' }));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());
    expect((view.getByLabelText('Confirmed email') as HTMLInputElement).value).toBe('tony@example.com');

    // This time the visitor confirms: the answer goes out under the
    // re-issued id, and no chip is left behind.
    fireEvent.click(view.getByLabelText(/These details are correct/));
    socket.send.mockClear();
    fireEvent.click(view.getByRole('button', { name: 'Confirm & save' }));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"confirm_action","id":"reopen-1","approved":true'));
    await waitFor(() => expect(view.queryByText('Confirm your follow-up details')).toBeNull());
    expect(view.queryByRole('button', { name: 'Form waiting — tap to open' })).toBeNull();
  });

  it('a provider cancellation (cancel_action) also leaves the chip behind', async () => {
    const { view, socket } = await liveConversation();
    act(() => socket.emit(CARD));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());
    // The provider cancels the tool call while the card is up: the
    // card vanishes without any visitor answer — the chip must
    // still offer the way back.
    act(() => socket.emit({ type: 'cancel_action', id: 'card-1' }));
    await waitFor(() => expect(view.queryByText('Confirm your follow-up details')).toBeNull());
    expect(await view.findByRole('button', { name: 'Form waiting — tap to open' })).toBeTruthy();
  });
});
