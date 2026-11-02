import { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';
import type { SimliAvatarHandle } from '@/components/SimliAvatar';

// The real SimliAvatar module stays loaded (its isVideoStartFailure classifier is the
// unit under test at this seam); only the rendered component is replaced by a handle
// whose start() each test drives to the outcome SimliAvatar would have produced.
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

const NOTICE = 'Video needs a faster connection — you’re talking with Aspen by voice.';
const videoAvatar = { enabled: true, provider: 'simli' as const, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };

function stubBrowser() {
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }), enumerateDevices: async () => [] } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Context.sources = []; Socket.current = undefined; vi.clearAllMocks(); });

describe('slow-connection voice fallback', () => {
  it('starts a voice-only session with the notice when the video stalls through all retries', async () => {
    stubBrowser();
    // Exactly what SimliAvatar.start() throws once its bounded retries are exhausted.
    mocks.avatarStart.mockRejectedValue(Object.assign(new Error('Video did not arrive. Please try again.'), { videoTimeout: true }));
    const view = render(<GeminiConversation compact autoStart consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(Socket.current?.onmessage).toBeTypeOf('function'));
    const socket = Socket.current;
    if (!socket) throw new Error('Call socket was not created');
    act(() => socket.emit({ type: 'ready' }));
    await waitFor(() => expect(view.getByText(NOTICE)).toBeTruthy());
    // Her audio plays locally (voice-only mode), never through the paired video path.
    act(() => socket.emit({ type: 'audio', data: btoa(String.fromCharCode(...new Uint8Array(4800))) }));
    expect(Context.sources.length).toBeGreaterThan(0);
    expect(mocks.pcm).not.toHaveBeenCalled();
  });

  it('also degrades when the provider drops the session during startup', async () => {
    stubBrowser();
    mocks.avatarStart.mockRejectedValue(new Error('Video connection failed'));
    const view = render(<GeminiConversation compact autoStart consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(Socket.current?.onmessage).toBeTypeOf('function'));
    const socket = Socket.current;
    if (!socket) throw new Error('Call socket was not created');
    act(() => socket.emit({ type: 'ready' }));
    await waitFor(() => expect(view.getByText(NOTICE)).toBeTruthy());
  });

  it('keeps a token refusal a hard error with no fallback session', async () => {
    stubBrowser();
    mocks.avatarStart.mockRejectedValue(Object.assign(new Error('Video avatar is not enabled for this agent'), { final: true }));
    const view = render(<GeminiConversation compact autoStart consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Video avatar is not enabled for this agent')).toBeTruthy());
    expect(Socket.current).toBeUndefined();
    expect(view.queryByText(NOTICE)).toBeNull();
  });
});
