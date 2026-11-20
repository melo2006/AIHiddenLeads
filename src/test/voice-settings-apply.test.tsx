import { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';

// Voice settings Apply (2026-11-20): the settings dialog's microphone
// and conversation-mode picks are drafts until "Apply settings" commits
// them; noise filtering and speaker volume stay instant. These tests pin
// the draft/commit/discard contract on a live session.

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

async function startLiveSession() {
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('AudioContext', Context);
  Element.prototype.setPointerCapture = vi.fn(); Element.prototype.releasePointerCapture = vi.fn(); Element.prototype.hasPointerCapture = vi.fn(() => false); Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }), enumerateDevices: async () => [] } });
  const view = render(<GeminiConversation compact autoStart consentOnOpen />);
  await waitFor(() => expect(Socket.current?.onmessage).toBeTypeOf('function'));
  const socket = Socket.current;
  if (!socket) throw new Error('Call socket was not created');
  act(() => socket.emit({ type: 'ready' }));
  return { view, socket };
}

const speech = () => act(() => Context.capture.onaudioprocess?.({ inputBuffer: { sampleRate: 16000, getChannelData: () => new Float32Array(2048).fill(0.1) } }));

async function openSettings(view: ReturnType<typeof render>) {
  const toggle = view.container.querySelector('button[aria-label="Voice settings"]');
  if (!toggle) throw new Error('Settings toggle not rendered');
  fireEvent.click(toggle);
  return view.findByRole('combobox', { name: 'Conversation mode' });
}

async function pickMode(view: ReturnType<typeof render>, trigger: HTMLElement, optionName: string) {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const option = await view.findByRole('option', { name: optionName });
  fireEvent.keyDown(option, { key: 'Enter' });
}

function closeDialog(trigger: HTMLElement) {
  const dialog = trigger.closest('[role="dialog"]');
  if (dialog) fireEvent.keyDown(dialog, { key: 'Escape' });
}

describe('voice settings Apply', () => {
  it('holds a mode pick as a draft until Apply, then commits it', async () => {
    const { view, socket } = await startLiveSession();
    const modeSelect = await openSettings(view);

    // Nothing pending yet: Apply is present but disabled, no hint.
    const apply = view.getByRole('button', { name: 'Apply settings' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(view.queryByText(/aren't applied yet/)).toBeNull();

    await pickMode(view, modeSelect, 'Noisy place — hold to talk');

    // Draft only: the pending hint shows and the live session still
    // streams hands-free (the mode has NOT switched yet).
    expect(view.getByText(/aren't applied yet/)).toBeTruthy();
    expect((view.getByRole('button', { name: 'Apply settings' }) as HTMLButtonElement).disabled).toBe(false);
    socket.send.mockClear();
    speech();
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"audio"'));

    // Apply commits: the confirmation flashes and the mode takes over.
    fireEvent.click(view.getByRole('button', { name: 'Apply settings' }));
    expect(view.getByText('Applied ✓')).toBeTruthy();
    closeDialog(modeSelect);
    await waitFor(() => expect(view.getByRole('button', { name: 'Hold to talk' })).toBeTruthy());
    socket.send.mockClear();
    speech();
    expect(socket.send).not.toHaveBeenCalledWith(expect.stringContaining('"type":"audio"'));
  });

  it('discards an un-applied draft when the dialog closes', async () => {
    const { view } = await startLiveSession();
    let modeSelect = await openSettings(view);
    await pickMode(view, modeSelect, 'Noisy place — hold to talk');
    // Close WITHOUT applying.
    closeDialog(modeSelect);
    // No hold button appears — the live mode never changed.
    expect(view.queryByRole('button', { name: 'Hold to talk' })).toBeNull();
    // Reopening re-syncs the draft from the live value (Hands-free).
    modeSelect = await openSettings(view);
    expect(modeSelect.textContent).toContain('Hands-free');
    expect(view.queryByText(/aren't applied yet/)).toBeNull();
  });
});
