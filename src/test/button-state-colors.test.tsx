import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingPersonFrame, { AspenWindowControls, type Stage3Controls } from '@/components/FloatingPersonFrame';
import BrowserVoiceHandoff from '@/components/BrowserVoiceHandoff';
import GeminiConversation from '@/components/GeminiConversation';

// Button state colours (2026-11-14, Ron-approved canonical spec — audit:
// ~/workspace/button-state-color-audit-2026-11-14.md §4). One hue per
// meaning, identical on every widget surface:
//   GREEN fill (--primary)   = ON / selected / engaged + primary actions
//   AMBER fill (--warning)   = muted / silenced — mic AND speaker
//   SOLID RED (--destructive) = end / disconnect ONLY
//   near-black = idle · 50% fade = disabled
//   PURPLE (--accent) is never a panel button state: the outline/ghost
//   hover was violet and stuck after Android taps, inventing a state.
// These tests pin the state -> colour mapping so it cannot drift back.
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (_fn: string, opts?: { body?: { action?: string } }) =>
    opts?.body?.action === 'token'
      ? { data: { token: 'twilio-token' }, error: null }
      : { data: { token: 'test-token', maxSeconds: 900, idleChecks: false, homepageSales: false, status: 'awaiting_owner' }, error: null }),
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

const tokens = (el: Element) => (el.className ?? '').split(/\s+/).filter(Boolean);
const has = (el: Element, cls: string) => tokens(el).includes(cls);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Socket.instances = []; vi.clearAllMocks(); });

describe('window controls: × (ends the call) vs − (harmless)', () => {
  it('× wears the destructive treatment; Minimize stays neutral', () => {
    const view = render(<AspenWindowControls onMinimize={vi.fn()} onClose={vi.fn()} />);
    const close = view.getByLabelText('End conversation');
    expect(has(close, 'text-destructive')).toBe(true);
    expect(has(close, 'border-destructive/70')).toBe(true);
    expect(has(close, 'border-primary/60')).toBe(false);
    const minimize = view.getByLabelText('Minimize');
    expect(has(minimize, 'border-border')).toBe(true);
    expect(has(minimize, 'text-destructive')).toBe(false);
    expect(has(minimize, 'bg-destructive')).toBe(false);
  });
});

describe('Stage-3 minimized bar speaks the panel colour language', () => {
  const base: Stage3Controls = {
    suspended: false, muted: false, speakerMuted: false, hasReplay: true, replaying: false,
    onToggleSuspend: vi.fn(), onEnd: vi.fn(), onToggleMic: vi.fn(), onToggleSpeaker: vi.fn(), onReplay: vi.fn(),
  };
  const renderBar = (over: Partial<Stage3Controls>) => render(
    <FloatingPersonFrame name="Frank" open={false} minimized mode="voice" onOpen={vi.fn()} onMinimize={vi.fn()} onClose={vi.fn()} onMode={vi.fn()} stage3={{ ...base, ...over }} />,
  );

  it('disconnect is SOLID red, not a red icon on a transparent button', () => {
    const view = renderBar({});
    const disconnect = view.getByLabelText('Disconnect');
    expect(has(disconnect, 'bg-destructive')).toBe(true);
    expect(has(disconnect, 'text-destructive-foreground')).toBe(true);
  });

  it('muted mic and muted speaker are AMBER fills; engaged pause is GREEN', () => {
    const view = renderBar({ muted: true, speakerMuted: true, suspended: true });
    const mic = view.getByLabelText('Unmute microphone');
    expect(has(mic, 'bg-warning')).toBe(true);
    expect(has(mic, 'text-warning-foreground')).toBe(true);
    expect(has(mic, 'bg-destructive')).toBe(false);
    const speaker = view.getByLabelText('Turn speaker sound on');
    expect(has(speaker, 'bg-warning')).toBe(true);
    expect(has(speaker, 'bg-destructive')).toBe(false);
    const suspend = view.getByLabelText('Resume conversation');
    expect(has(suspend, 'bg-primary')).toBe(true);
  });

  it('idle bar buttons carry no state fill, only the touch-safe hover marker', () => {
    const view = renderBar({});
    const mic = view.getByLabelText('Mute microphone');
    expect(has(mic, 'bg-warning')).toBe(false);
    expect(has(mic, 'bg-destructive')).toBe(false);
    expect(has(mic, 'bg-primary')).toBe(false);
    expect(has(mic, 'aspen-panel-btn')).toBe(true);
    const speaker = view.getByLabelText('Silence speaker');
    expect(has(speaker, 'bg-warning')).toBe(false);
    expect(has(speaker, 'aspen-panel-btn')).toBe(true);
  });
});

describe('Manager pill: green while a handoff is live', () => {
  it('idle pill is neutral with a dark-grey hover wash — never violet, never green', () => {
    const view = render(<BrowserVoiceHandoff pill token="tok-1" onActive={vi.fn()} microphone="default" />);
    const pill = view.getByLabelText('Talk to manager');
    expect(has(pill, 'bg-primary')).toBe(false);
    expect(has(pill, 'hover:bg-accent')).toBe(false);
    expect(has(pill, 'hover:bg-muted')).toBe(true);
    expect(has(pill, 'aspen-panel-btn')).toBe(true);
  });

  it('once the handoff starts, the pill turns GREEN (Return to Aspen)', async () => {
    const view = render(<BrowserVoiceHandoff pill token="tok-1" onActive={vi.fn()} microphone="default" />);
    fireEvent.click(view.getByLabelText('Talk to manager'));
    const back = await waitFor(() => view.getByLabelText('Return to Aspen'));
    expect(has(back, 'bg-primary')).toBe(true);
    expect(has(back, 'text-primary-foreground')).toBe(true);
    expect(has(back, 'hover:bg-accent')).toBe(false);
  });
});

describe('voice transport (live session)', () => {
  async function goLive(extra: React.ComponentProps<typeof GeminiConversation> = {}) {
    stubBrowser();
    const view = render(<GeminiConversation compact autoStart consentOnOpen {...extra} />);
    await waitFor(() => expect(Socket.instances.length).toBeGreaterThan(0));
    const socket = Socket.instances[Socket.instances.length - 1];
    await waitFor(() => expect(socket.onmessage).toBeTypeOf('function'));
    act(() => socket.emit({ type: 'ready' }));
    return view;
  }

  it('End is solid red; muting the mic turns AMBER — never the End red', async () => {
    const view = await goLive();
    const end = await waitFor(() => view.getByLabelText('End conversation'));
    expect(has(end, 'bg-destructive')).toBe(true);
    const mic = view.getByLabelText('Mute microphone');
    expect(has(mic, 'bg-warning')).toBe(false);
    expect(has(mic, 'hover:bg-accent')).toBe(false);
    expect(has(mic, 'hover:bg-muted')).toBe(true);
    fireEvent.click(mic);
    const mutedMic = await waitFor(() => view.getByLabelText('Unmute microphone'));
    expect(has(mutedMic, 'bg-warning')).toBe(true);
    expect(has(mutedMic, 'text-warning-foreground')).toBe(true);
    expect(has(mutedMic, 'bg-destructive')).toBe(false);
  });

  it('speaker mutes AMBER too, and the popover marks the current output with a green wash + green check', async () => {
    const view = await goLive();
    await waitFor(() => view.getByLabelText('End conversation'));
    fireEvent.click(view.getByLabelText('Speaker output'));
    const rows = await waitFor(() => view.getAllByRole('menuitemradio'));
    // Exactly the checked row(s) wear the green wash; unchecked rows don't.
    for (const row of rows) {
      expect(has(row, 'bg-primary/15')).toBe(row.getAttribute('aria-checked') === 'true');
    }
    const checked = rows.find((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toBeTruthy();
    expect(checked!.querySelector('svg')?.classList.contains('text-primary')).toBe(true);
    // Mute the speaker from the popover: the transport button turns amber.
    fireEvent.click(view.getByRole('menuitemradio', { name: 'Mute' }));
    const speaker = await waitFor(() => view.getByLabelText('Speaker output'));
    expect(has(speaker, 'bg-warning')).toBe(true);
    expect(has(speaker, 'bg-destructive')).toBe(false);
    expect(has(speaker, 'bg-secondary')).toBe(false);
  });

  it('captions toggle is a word pill wearing the GREEN ON fill while captions are on', async () => {
    const view = await goLive({ faceFirst: true });
    const toggle = await waitFor(() => view.getByLabelText('Hide captions'));
    expect(has(toggle, 'bg-primary')).toBe(true);
    expect(has(toggle, 'text-primary-foreground')).toBe(true);
    // The control is the "Captions" word pill (2026-11-14, Ron's pick
    // over the up/down chevron): the word is the label in BOTH states —
    // the fill carries the state, the text never changes.
    expect(toggle.textContent).toBe('Captions');
    expect(has(toggle, 'rounded-full')).toBe(true);
    // Turning captions off leaves focus view: the dock's Captions pill
    // is the OFF state — no green fill.
    fireEvent.click(toggle);
    const dockPill = await waitFor(() => view.getByLabelText('Show captions'));
    expect(has(dockPill, 'bg-primary')).toBe(false);
    expect(has(dockPill, 'aspen-panel-btn')).toBe(true);
    expect(dockPill.textContent).toBe('Captions');
    expect(has(dockPill, 'rounded-full')).toBe(true);
  });
});

describe('canonical spec plumbing (source pins)', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

  it('the theme exposes an amber warning button variant end to end', () => {
    expect(read('../components/ui/button.tsx')).toContain('warning: "bg-warning text-warning-foreground');
    expect(read('../../tailwind.config.ts')).toContain('warning:');
    expect(read('../index.css')).toContain('--warning-foreground');
  });

  it('no panel button can paint the violet accent hover any more', () => {
    for (const rel of ['../components/GeminiConversation.tsx', '../components/FloatingPersonFrame.tsx', '../components/BrowserVoiceHandoff.tsx']) {
      expect(read(rel)).not.toContain('hover:bg-accent');
    }
    // Touch gets NO lingering hover fill inside the panel (the sticky
    // purple in Ron's screenshot): the opt-in marker rule exists.
    const css = read('../index.css');
    expect(css).toContain('@media (hover: none)');
    expect(css).toContain('.aspen-panel-btn:hover');
  });

  it('red is reserved: no mute control maps to the destructive variant', () => {
    const conversation = read('../components/GeminiConversation.tsx');
    expect(conversation).not.toContain('muted ? "destructive"');
    expect(conversation).not.toContain('speakerMuted ? "secondary"');
    expect(conversation).toContain('muted ? "warning"');
    expect(conversation).toContain('speakerMuted ? "warning"');
  });
});
