// @vitest-environment jsdom
// Diag landing regression (Publish #54): session 19b82691
// (homepage Aspen, 2026-11-14, 8m11s) carried NO config.playoutDiag
// at all, although the stamping machinery existed — because the
// diag channel's only target (parentSessionIdRef/visitorKeyRef)
// was assigned solely by the swap-arming and team-intro branches
// of the authorization, and a plain homepage sales session arms
// neither. Every persist call early-returned for the whole
// session. This test drives a HOMEPAGE-SHAPED authorization
// (homepageSales, a sessionId, NO personaSwapEnabled, NO
// teamIntroEnabled, no lead/prospect) through the real component
// and pins that the go-live playout stamp — and the mic start
// stamp on the same channel — now land on the authorized row,
// carrying the rate-witness fields (the fake context's ACTUAL
// sample rate, not the requested 24000).
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';

const HOMEPAGE_SESSION_ID = '11111111-2222-4333-8444-555555555555';
const mocks = vi.hoisted(() => ({
  bodies: [] as Array<Record<string, unknown>>,
  invoke: vi.fn(async (_fn: string, opts?: { body?: Record<string, unknown> }) => {
    if (opts?.body) mocks.bodies.push(opts.body);
    return {
      data: {
        token: 'test-token',
        sessionId: HOMEPAGE_SESSION_ID,
        maxSeconds: 900,
        idleChecks: true,
        homepageSales: true,
        // Deliberately NO personaSwapEnabled / teamIntroEnabled:
        // the homepage shape that used to starve the diag channel.
      },
      error: null,
    };
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/voiceSessionAuth', () => ({ voiceSessionHeaders: async () => undefined }));
vi.mock('@/lib/campaignTracking', () => ({ campaignVisit: () => null, trackCampaignEvent: async () => {} }));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('@twilio/voice-sdk', () => ({
  Device: class {
    on() {}
    audio = { setInputDevice: async () => {} };
    async connect() { return { on: () => {}, removeAllListeners: () => {}, disconnect: () => {} }; }
    destroy() {}
  },
  Call: class {},
}));

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() { Socket.instances.push(this); }
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
function stubBrowser() {
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }), enumerateDevices: async () => [] } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Socket.instances = []; mocks.bodies.length = 0; vi.clearAllMocks(); });

describe('homepage session diag landing (Publish #54)', () => {
  it('a homepage-shaped session stamps playoutDiag AND micDiag on its own row at go-live', async () => {
    stubBrowser();
    render(<GeminiConversation compact autoStart consentOnOpen />);
    await waitFor(() => expect(Socket.instances.length).toBeGreaterThan(0));
    const socket = Socket.instances[Socket.instances.length - 1];
    await waitFor(() => expect(socket.onmessage).toBeTypeOf('function'));
    act(() => socket.emit({ type: 'ready' }));

    // The playout stamp lands on the HOMEPAGE session's row —
    // before the fix this invoke never happened for this shape.
    await waitFor(() => {
      const stamp = mocks.bodies.find((b) => b.playoutDiag);
      expect(stamp).toBeTruthy();
      expect((stamp!.playoutDiag as { sessionId: string }).sessionId).toBe(HOMEPAGE_SESSION_ID);
    });
    const detail = (mocks.bodies.find((b) => b.playoutDiag)!.playoutDiag as { detail: string }).detail;
    // Rate-witness fields ride the stamp: the fake context's
    // ACTUAL rate (16000 — the component asked for 24000 and the
    // stamp must report what the platform granted), and the
    // witness keys exist from the first stamp (rw=-: no
    // utterance has completed yet).
    expect(detail).toContain('crate=16000');
    expect(detail).toContain('rw=');

    // The mic channel shares the fix: its start stamp lands on
    // the same row through the same target.
    await waitFor(() => {
      const mic = mocks.bodies.find((b) => b.micDiag);
      expect(mic).toBeTruthy();
      expect((mic!.micDiag as { sessionId: string }).sessionId).toBe(HOMEPAGE_SESSION_ID);
    });
  });
});
