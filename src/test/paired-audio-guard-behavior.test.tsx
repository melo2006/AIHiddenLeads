import { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';
import type { SimliAvatarHandle } from '@/components/SimliAvatar';

// Paired-audio guard behavioral test (2026-11-10): the face starts
// fine (so the session is paired), then REFUSES every PCM chunk — the
// segment-death signature. Before the fix, the first chunk ran
// stopEverything(): end_session on the socket + the red "moving face
// disconnected" banner. Now the session must degrade to voice-only:
// the chunk plays locally, the socket stays open, and later chunks
// never touch the dead face again.
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { token: 'test', maxSeconds: 900 } })),
  avatarStart: vi.fn(async () => true),
  avatarStop: vi.fn(),
  clear: vi.fn(),
  pcm: vi.fn(() => false),
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
    useImperativeHandle(ref, () => ({ start: mocks.avatarStart, stop: mocks.avatarStop, clear: mocks.clear, sendPcm24k: mocks.pcm, setPlaybackMuted: () => {}, activate: async () => true }));
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
  static sources: { stop: ReturnType<typeof vi.fn> }[] = [];
  state = 'running'; currentTime = 0; sampleRate = 16000;
  destination = {};
  resume = async () => {}; suspend = async () => {}; close = async () => {};
  createMediaStreamSource = () => ({ connect: vi.fn() });
  createScriptProcessor = () => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: undefined });
  createBuffer = (_channels: number, count: number, rate: number) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) });
  createBufferSource = () => { const source = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null }; Context.sources.push(source); return source; };
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
}

const videoAvatar = { enabled: true, provider: 'simli' as const, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };
const CHUNK = btoa(String.fromCharCode(...new Uint8Array(4800)));

function stubBrowser() {
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }), enumerateDevices: async () => [] } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Context.sources = []; Socket.current = undefined; vi.clearAllMocks(); mocks.pcm.mockReturnValue(false); mocks.avatarStart.mockResolvedValue(true); });

describe('paired-audio guard — a refused chunk degrades instead of killing the call', () => {
  it('plays the refused chunk locally, keeps the socket open, and never offers the dead face another chunk', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact autoStart consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(Socket.current?.onmessage).toBeTypeOf('function'));
    const socket = Socket.current;
    if (!socket) throw new Error('Call socket was not created');
    act(() => socket.emit({ type: 'ready' }));

    // First assistant chunk: the paired face refuses it.
    act(() => socket.emit({ type: 'audio', data: CHUNK }));
    expect(mocks.pcm).toHaveBeenCalledTimes(1);
    // The chunk was still scheduled for playback (locally)…
    expect(Context.sources.length).toBeGreaterThan(0);
    // …the call was NOT torn down (no end_session, no socket close)…
    expect(socket.send.mock.calls.some(([payload]) => String(payload).includes('end_session'))).toBe(false);
    expect(socket.close).not.toHaveBeenCalled();
    // …and the fatal banner is nowhere.
    expect(view.queryByText(/moving face disconnected/i)).toBeNull();
    // The voice-only fallback notice shows instead (honest face state).
    await waitFor(() => expect(view.getByText(/talking with Aspen by voice/i)).toBeTruthy());

    // Second chunk: the session is voice-only now — the dead face is
    // never offered audio again, and playback continues locally.
    const sourcesBefore = Context.sources.length;
    act(() => socket.emit({ type: 'audio', data: CHUNK }));
    expect(mocks.pcm).toHaveBeenCalledTimes(1);
    expect(Context.sources.length).toBeGreaterThan(sourcesBefore);
    expect(socket.close).not.toHaveBeenCalled();
  });
});
