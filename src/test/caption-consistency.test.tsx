import { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';
import type { SimliAvatarHandle } from '@/components/SimliAvatar';

// Display-consistency rule for the homepage widget: while Aspen is speaking,
// the karaoke caption (PlaybackCaption, aria-label "Live playback captions")
// owns the caption space for her WHOLE turn — including replies after the
// visitor has spoken, when state still holds the visitor's in-progress line.
// The plain transcript (aria-label "Conversation transcript") shows when she
// is silent. Harness mirrors video-fallback.test.tsx, plus a controllable
// AudioContext clock and a manually pumped rAF loop (the caption poller).
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { token: 'test', maxSeconds: 900 } })),
  avatarStart: vi.fn(async () => true),
  avatarStop: vi.fn(),
  clear: vi.fn(),
  pcm: vi.fn(() => true),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/voiceSessionAuth', () => ({ voiceSessionHeaders: async () => undefined }));
vi.mock('@/lib/campaignTracking', () => ({ campaignVisit: () => null, trackCampaignEvent: async () => {} }));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('simli-client', () => ({ LogLevel: { ERROR: 0 }, SimliClient: class { on() {} async start() {} async stop() {} sendAudioData() {} ClearBuffer() {} } }));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {} }));
vi.mock('@/components/SimliAvatar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/SimliAvatar')>();
  const MockAvatar = forwardRef<SimliAvatarHandle, Record<string, unknown>>(function MockAvatar(_, ref) {
    useImperativeHandle(ref, () => ({ start: mocks.avatarStart, stop: mocks.avatarStop, clear: mocks.clear, sendPcm24k: mocks.pcm, setPlaybackMuted: () => {}, activate: async () => {} }));
    return null;
  });
  return { ...actual, default: MockAvatar };
});

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
  static now = 0;
  static sources: Array<{ onended?: (() => void) | null }> = [];
  state = 'running'; sampleRate = 16000;
  destination = {};
  get currentTime() { return Context.now; }
  resume = async () => {}; suspend = async () => {}; close = async () => {};
  createMediaStreamSource = () => ({ connect: vi.fn() });
  createScriptProcessor = () => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: undefined });
  createBuffer = (_channels: number, count: number, rate: number) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) });
  createBufferSource = () => { const source = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null as (() => void) | null }; Context.sources.push(source); return source; };
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
}

// Let the component's rAF caption poller run against the fake AudioContext
// clock: frames fire on real timers, but every update reads Context.now.
async function flushFrames() { await act(async () => { await new Promise(r => setTimeout(r, 80)); }); }

const videoAvatar = { enabled: true, provider: 'simli' as const, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };

function pcmBase64(seconds: number) {
  const bytes = new Uint8Array(Math.round(seconds * 48000));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}

function stubBrowser() {
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }), enumerateDevices: async () => [] } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Context.now = 0; Context.sources = []; Socket.current = undefined; vi.clearAllMocks(); });

async function startCall() {
  await waitFor(() => expect(Socket.current?.onmessage).toBeTypeOf('function'));
  const socket = Socket.current;
  if (!socket) throw new Error('Call socket was not created');
  act(() => socket.emit({ type: 'ready' }));
  return socket;
}

describe('caption display consistency', () => {
  it('keeps the karaoke caption for her whole reply after the visitor has spoken (paired video)', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst autoStart consentOnOpen videoAvatar={videoAvatar} />);
    const socket = await startCall();

    // Her greeting: text + 1s of audio at t=0. Paired caption window is the
    // local schedule [0.12, 1.12] shifted by the paired-path delay -> [0.52, 1.52].
    act(() => socket.emit({ type: 'aspen_transcript', text: 'Eighty-five percent of callers never call back.' }));
    act(() => socket.emit({ type: 'audio', data: pcmBase64(1) }));
    Context.now = 0.3; await flushFrames();
    // The heard (Simli) voice has not started yet, so neither has the caption.
    expect(view.queryByLabelText('Live playback captions')).toBeNull();
    Context.now = 0.8; await flushFrames();
    const greetingCaption = view.getByLabelText('Live playback captions');
    expect(greetingCaption.textContent).toContain('85%');
    expect(view.getByLabelText('Conversation transcript').classList.contains('hidden')).toBe(true);

    // Greeting ends; the local queue drains.
    act(() => socket.emit({ type: 'turn_complete' }));
    Context.now = 1.6;
    act(() => Context.sources.forEach(s => s.onended?.()));

    // The visitor speaks: his live line belongs to the transcript surface.
    act(() => socket.emit({ type: 'user_transcript', text: 'I run a print shop.' }));
    await flushFrames();
    expect(view.queryByLabelText('Live playback captions')).toBeNull();
    expect(view.getByLabelText('Conversation transcript').classList.contains('hidden')).toBe(false);

    // Her reply: 1s of audio at t=1.6 -> local [1.72, 2.72], paired [2.12, 3.12].
    // The visitor's line is STILL in state (no turn_complete for this exchange
    // yet) — the old gate hid the karaoke for the entire reply because of it.
    act(() => socket.emit({ type: 'aspen_transcript', text: 'You get four hundred minutes included every month.' }));
    act(() => socket.emit({ type: 'audio', data: pcmBase64(1) }));
    Context.now = 2.5; await flushFrames();
    const replyCaption = view.getByLabelText('Live playback captions');
    expect(replyCaption.textContent).toContain('400');
    expect(replyCaption.textContent).not.toContain('four hundred');
    expect(view.getByLabelText('Conversation transcript').classList.contains('hidden')).toBe(true);
    // Stable across the turn: still the karaoke surface near the end of her reply.
    Context.now = 2.9; await flushFrames();
    expect(view.getByLabelText('Live playback captions')).toBeTruthy();
    expect(view.getByLabelText('Conversation transcript').classList.contains('hidden')).toBe(true);
  });

  it('applies the same rule on the local voice-only path, without the paired delay', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst autoStart consentOnOpen />);
    const socket = await startCall();

    // Local playback is heard on the local clock: window [0.12, 0.62], no shift.
    act(() => socket.emit({ type: 'aspen_transcript', text: 'Eighty-five percent never call back.' }));
    act(() => socket.emit({ type: 'audio', data: pcmBase64(0.5) }));
    Context.now = 0.3; await flushFrames();
    expect(view.getByLabelText('Live playback captions')).toBeTruthy();

    act(() => socket.emit({ type: 'turn_complete' }));
    Context.now = 1.0;
    act(() => Context.sources.forEach(s => s.onended?.()));
    act(() => socket.emit({ type: 'user_transcript', text: 'Tell me the price.' }));

    // Her reply at t=1.0 -> window [1.12, 1.62]. Karaoke despite his line in state.
    act(() => socket.emit({ type: 'aspen_transcript', text: 'It is ninety-nine dollars a month.' }));
    act(() => socket.emit({ type: 'audio', data: pcmBase64(0.5) }));
    Context.now = 1.3; await flushFrames();
    const caption = view.getByLabelText('Live playback captions');
    expect(caption.textContent).toContain('$99');
    expect(view.getByLabelText('Conversation transcript').classList.contains('hidden')).toBe(true);
  });
});
