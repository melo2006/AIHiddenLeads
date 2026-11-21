import { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';

// Homepage-test item 5, FORM half (2026-11-21) — the draft, driven
// through the real conversation component on a stubbed socket (the
// capture-integrity harness pattern):
//
//   card arrives with a SPOKEN prefill → the fields show the
//   cleaned candidate → the visitor corrects the email → the
//   provider cancels the tool call (cancel_action) → the chip
//   offers the way back → the re-issued card opens with the
//   CORRECTION in place, not the model's original values.
//
// Before this fix the edits lived in the card's mount-scoped state:
// the cancellation unmounted it, and the re-issued card restarted
// from the raw args. A later card carrying DIFFERENT details must
// still retire the stale draft — same base = same card coming
// back; different base = a new ask with its own values.

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

// The card as the proxy sends it when the model passed the visitor's
// SPOKEN details as raw tool arguments.
const SPOKEN_CARD = {
  type: 'confirm_action',
  id: 'card-1',
  action: 'request_platform_followup',
  contact: { name: 'Tony Miller', email: 'tony miller at example dot com', phone: 'nine five four seven seven zero six six two two' },
};

describe('item 5 form fix — normalized prefill + parent-held draft', () => {
  it('the spoken prefill arrives cleaned, not as raw fragments', async () => {
    const { view, socket } = await liveConversation();
    act(() => socket.emit(SPOKEN_CARD));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());
    expect((view.getByLabelText('Confirmed email') as HTMLInputElement).value).toBe('tonymiller@example.com');
    expect((view.getByLabelText('Confirmed phone') as HTMLInputElement).value).toBe('9547706622');
  });

  it('a provider cancellation re-presents the card with the visitor’s corrections intact', async () => {
    const { view, socket } = await liveConversation();
    act(() => socket.emit(SPOKEN_CARD));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());

    // The visitor corrects the email Aspen misheard.
    fireEvent.change(view.getByLabelText('Confirmed email'), { target: { value: 'tony@corrected.com' } });

    // Gemini cancels the tool call mid-edit (the spoken-correction
    // kill path): the card unmounts, the chip remains.
    act(() => socket.emit({ type: 'cancel_action', id: 'card-1' }));
    await waitFor(() => expect(view.queryByText('Confirm your follow-up details')).toBeNull());
    const chip = await view.findByRole('button', { name: 'Form waiting — tap to open' });
    fireEvent.click(chip);

    // The proxy re-issues the SAME card with the ORIGINAL (cleaned)
    // values under a reopen id — the form must show the correction.
    act(() => socket.emit({ ...SPOKEN_CARD, id: 'reopen-1', contact: { name: 'Tony Miller', email: 'tonymiller@example.com', phone: '9547706622' } }));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());
    expect((view.getByLabelText('Confirmed email') as HTMLInputElement).value).toBe('tony@corrected.com');
  });

  it('a later card with different details retires the stale draft', async () => {
    const { view, socket } = await liveConversation();
    act(() => socket.emit(SPOKEN_CARD));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());
    fireEvent.change(view.getByLabelText('Confirmed email'), { target: { value: 'tony@corrected.com' } });
    fireEvent.click(view.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(view.queryByText('Confirm your follow-up details')).toBeNull());

    // A genuinely new ask — the visitor gave different details —
    // starts from its own values, never from the abandoned draft.
    act(() => socket.emit({ type: 'confirm_action', id: 'card-2', action: 'request_platform_followup', contact: { name: 'Pat Lee', email: 'pat@example.com', phone: '' } }));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());
    expect((view.getByLabelText('Confirmed email') as HTMLInputElement).value).toBe('pat@example.com');
    expect((view.getByLabelText('Confirmed full name') as HTMLInputElement).value).toBe('Pat Lee');
  });

  it('a confirmed answer retires the draft: the same details later start clean', async () => {
    const { view, socket } = await liveConversation();
    act(() => socket.emit(SPOKEN_CARD));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());
    fireEvent.change(view.getByLabelText('Confirmed email'), { target: { value: 'tony@corrected.com' } });
    fireEvent.click(view.getByLabelText(/These details are correct/));
    fireEvent.click(view.getByRole('button', { name: 'Confirm & save' }));
    await waitFor(() => expect(view.queryByText('Confirm your follow-up details')).toBeNull());

    // The same base values arrive again (a fresh ask): no draft
    // survives a completed confirmation, so the issued values show.
    act(() => socket.emit({ ...SPOKEN_CARD, id: 'card-9', contact: { name: 'Tony Miller', email: 'tonymiller@example.com', phone: '9547706622' } }));
    await waitFor(() => expect(view.getByText('Confirm your follow-up details')).toBeTruthy());
    expect((view.getByLabelText('Confirmed email') as HTMLInputElement).value).toBe('tonymiller@example.com');
  });
});
