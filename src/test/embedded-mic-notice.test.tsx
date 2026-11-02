import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';

// Same harness as video-fallback.test.tsx, with two differences: getUserMedia
// refuses the microphone the way a withholding frame makes it refuse (a
// NotAllowedError, no prompt ever shown), and isEmbeddedContext is driven by
// a hoisted flag so each test picks the framed / top-level world. The real
// classifier stays in place — it is the selection logic under test.
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { token: 'test', maxSeconds: 900 } })),
  embedded: { value: false },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/voiceSessionAuth', () => ({ voiceSessionHeaders: async () => undefined }));
vi.mock('@/lib/campaignTracking', () => ({ campaignVisit: () => null, trackCampaignEvent: async () => {} }));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('simli-client', () => ({ LogLevel: { ERROR: 0 }, SimliClient: class { on() {} async start() {} async stop() {} sendAudioData() {} ClearBuffer() {} } }));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {} }));
vi.mock('@/lib/embeddedContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/embeddedContext')>();
  return { ...actual, isEmbeddedContext: () => mocks.embedded.value };
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

const DENIED = 'Microphone permission was denied — allow it in your browser and try again.';
const NOTICE = "This embedded preview can't use your microphone. Open the full page to talk to Aspen.";

function stubBrowser() {
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('AudioContext', Context);
  const refusal = new Error('Permission denied');
  refusal.name = 'NotAllowedError';
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: vi.fn(async () => { throw refusal; }), enumerateDevices: async () => [] } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Socket.current = undefined; mocks.embedded.value = false; vi.clearAllMocks(); });

describe('microphone denial presentation', () => {
  it('shows calm full-page guidance instead of the red error inside an embedded preview', async () => {
    stubBrowser();
    mocks.embedded.value = true;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const view = render(<GeminiConversation compact autoStart consentOnOpen />);
    await waitFor(() => expect(view.getByText(NOTICE)).toBeTruthy());
    expect(view.queryByText(DENIED)).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Open full page' }));
    expect(openSpy).toHaveBeenCalledWith(window.location.href, '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('keeps the existing mic-denied error for a genuine top-level denial', async () => {
    stubBrowser();
    mocks.embedded.value = false;
    const view = render(<GeminiConversation compact autoStart consentOnOpen />);
    await waitFor(() => expect(view.getByText(DENIED)).toBeTruthy());
    expect(view.queryByText(NOTICE)).toBeNull();
    expect(view.queryByRole('button', { name: 'Open full page' })).toBeNull();
  });
});
