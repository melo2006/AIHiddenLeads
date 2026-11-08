import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation, { type GeminiShellControls, type GeminiShellState } from '@/components/GeminiConversation';

// Stage 3 session behavior (three-stage widget, Ron 2026-11-08):
//  - the opening mic gate sends SILENCE frames until Aspen's first
//    turn_complete (turn-based, not clock-based), then real mic audio flows;
//  - shell suspend() is a TRUE suspend — the socket closes with NO
//    end_session send — and resume() re-authorizes through the existing
//    reconnect path (reconnect flag + visit-memory recap).
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { token: 'test-token', maxSeconds: 900, idleChecks: false, homepageSales: false } })),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/voiceSessionAuth', () => ({ voiceSessionHeaders: async () => undefined }));
vi.mock('@/lib/campaignTracking', () => ({ campaignVisit: () => null, trackCampaignEvent: async () => {} }));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  send = vi.fn((data: string) => { this.sent.push(data); });
  close = vi.fn();
  constructor() { Socket.instances.push(this); }
  emit(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
  audioPayloads(): number[][] {
    return this.sent.map(s => JSON.parse(s)).filter(m => m.type === 'audio').map(m => Array.from(atob(m.data), c => c.charCodeAt(0)));
  }
}
class Context {
  static nodes: { connect: () => void; disconnect: () => void; onaudioprocess?: (e: unknown) => void }[] = [];
  state = 'running'; currentTime = 0; sampleRate = 16000;
  destination = {};
  resume = async () => {}; suspend = async () => {}; close = async () => {};
  createMediaStreamSource = () => ({ connect: vi.fn() });
  createScriptProcessor = () => { const node = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: undefined as ((e: unknown) => void) | undefined }; Context.nodes.push(node); return node; };
  createBuffer = (_channels: number, count: number, rate: number) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) });
  createBufferSource = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null });
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
}

function stubBrowser() {
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }), enumerateDevices: async () => [] } });
}

const loudFrame = { inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.5), sampleRate: 16000 } };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Socket.instances = []; Context.nodes = []; vi.clearAllMocks(); });

describe('stage 3 session: opening gate + true suspend/resume', () => {
  it('silences the mic during the opening turn, then suspends without end_session and resumes via reconnect', async () => {
    stubBrowser();
    const shellControlsRef: { current: GeminiShellControls | null } = { current: null };
    const onShellState = vi.fn((_state: GeminiShellState) => {});
    render(<GeminiConversation compact autoStart consentOnOpen shellControlsRef={shellControlsRef} onShellState={onShellState} />);
    await waitFor(() => expect(Socket.instances.length).toBe(1));
    const socket = Socket.instances[0];
    await waitFor(() => expect(socket.onmessage).toBeTypeOf('function'));
    // goLive runs synchronously inside the 'ready' message: it arms the
    // opening gate and creates the mic node in the same tick. Drive the
    // gated phase synchronously from here so no wall-clock gap can trip the
    // gate's failsafe on a loaded test machine.
    act(() => socket.emit({ type: 'ready' }));
    expect(Context.nodes.length).toBeGreaterThan(0);
    const node = Context.nodes[Context.nodes.length - 1];
    expect(node.onaudioprocess).toBeTypeOf('function');

    // Opening gate: loud room noise goes out as pure silence frames.
    act(() => node.onaudioprocess?.(loudFrame));
    const gated = socket.audioPayloads();
    expect(gated.length).toBeGreaterThan(0);
    expect(gated.every(bytes => bytes.every(b => b === 0))).toBe(true);

    // Her first turn completes: the gate lifts and real mic audio flows.
    act(() => socket.emit({ type: 'aspen_transcript', text: 'Hello, welcome in.' }));
    act(() => socket.emit({ type: 'turn_complete' }));
    act(() => node.onaudioprocess?.(loudFrame));
    const open = socket.audioPayloads().slice(gated.length);
    expect(open.length).toBeGreaterThan(0);
    expect(open.some(bytes => bytes.some(b => b !== 0))).toBe(true);

    // TRUE suspend: socket closes, but no end_session is ever sent.
    expect(shellControlsRef.current).toBeTruthy();
    act(() => shellControlsRef.current?.suspend());
    expect(socket.close).toHaveBeenCalled();
    expect(socket.sent.some(s => s.includes('end_session'))).toBe(false);
    const states = onShellState.mock.calls.map(call => call[0]);
    expect(states[states.length - 1]).toMatchObject({ suspended: true, live: false });

    // Resume: a fresh gemini-session authorization rides the reconnect path.
    act(() => shellControlsRef.current?.resume());
    await waitFor(() => expect(mocks.invoke.mock.calls.length).toBeGreaterThan(1));
    const bodies = mocks.invoke.mock.calls.map(call => (call[1] as { body: Record<string, unknown> }).body);
    const resumeBody = bodies[bodies.length - 1];
    expect(resumeBody.reconnect).toBe(true);
    expect(String(resumeBody.resumeContext)).toContain('Hello, welcome in.');
  });
});
