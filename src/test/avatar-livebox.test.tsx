import { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';
import type { SimliAvatarHandle } from '@/components/SimliAvatar';

// The face box in the open homepage widget carries one stable size class
// (.aspen-person-livebox) across ready, connecting and live, so Aspen's photo
// never shrinks when a call starts. Harness mirrors video-fallback.test.tsx:
// the real SimliAvatar module stays loaded; only its rendered component is
// replaced by a handle whose start() succeeds.
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
  state = 'running'; currentTime = 0; sampleRate = 16000;
  destination = {};
  resume = async () => {}; suspend = async () => {}; close = async () => {};
  createMediaStreamSource = () => ({ connect: vi.fn() });
  createScriptProcessor = () => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: undefined });
  createBuffer = (_channels: number, count: number, rate: number) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) });
  createBufferSource = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null });
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
}

const videoAvatar = { enabled: true, provider: 'simli' as const, faceId: 'test', position: 'bottom-right' as const, size: 200, shape: 'square' as const };

function stubBrowser() {
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }), enumerateDevices: async () => [] } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Socket.current = undefined; vi.clearAllMocks(); });

describe('avatar face box size stability', () => {
  it('renders the stable livebox with her portrait in the ready state', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    const box = view.container.querySelector('.aspen-person-livebox');
    expect(box).toBeTruthy();
    expect(box?.querySelector('img')).toBeTruthy();
    // The box itself no longer carries the small portrait sizing class.
    expect(box?.classList.contains('aspen-person-portrait')).toBe(false);
  });

  it('keeps the same livebox element through connecting into live', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst autoStart consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(Socket.current?.onmessage).toBeTypeOf('function'));
    const connectingBox = view.container.querySelector('.aspen-person-livebox');
    expect(connectingBox).toBeTruthy();
    const socket = Socket.current;
    if (!socket) throw new Error('Call socket was not created');
    act(() => socket.emit({ type: 'ready' }));
    await waitFor(() => expect(view.container.querySelector('.aspen-person-livebox')).toBe(connectingBox));
  });
});
