import { forwardRef, useImperativeHandle } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingPersonFrame, { PersonaNameLabel, type Stage3Controls } from '@/components/FloatingPersonFrame';
import GeminiConversation from '@/components/GeminiConversation';
import ChatWidget from '@/components/landing/demo-results/ChatWidget';
import type { SimliAvatarHandle } from '@/components/SimliAvatar';

// Demo fix batch (2026-11-14) — component-level proof for the parts
// that do not need a live Simli/Gemini session:
//  * item 5b FOCUS VIEW: Captions pill collapses captions into the
//    floating layout, the shell is told (focus flag), the dock with
//    the big name badge appears, and the choice is remembered for
//    the session.
//  * item 5c MINIMIZED LIVE FACE: Stage 3 carries the live-face
//    mirror canvas and the still in one stack at the enlarged 79px
//    size, with exactly ONE of them visible at a time (the Publish
//    #52 double-image fix); the not-yet-started Stage 1 keeps the
//    still/wave untouched.
//  * item 3 PRESENTER NAME: the typed chat's consent card and opening
//    greeting name the actual presenter; without a presenter they
//    render the Aspen strings exactly as before.

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { token: 'test', maxSeconds: 900 } })),
  avatarStart: vi.fn(async () => true),
  avatarStop: vi.fn(),
  clear: vi.fn(),
  pcm: vi.fn(() => true),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));
vi.mock('@/lib/voiceSessionAuth', () => ({ voiceSessionHeaders: async () => undefined }));
vi.mock('@/lib/campaignTracking', () => ({ campaignVisit: () => null, trackCampaignEvent: async () => {} }));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('simli-client', () => ({ LogLevel: { ERROR: 0 }, SimliClient: class { on() {} async start() {} async stop() {} sendAudioData() {} ClearBuffer() {} } }));
vi.mock('@/lib/chromaKey', () => ({ startChromaKey: () => () => {}, chromaKeyProfileForPersona: () => undefined }));
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

const frameProps = { onOpen: vi.fn(), onClose: vi.fn(), onMinimize: vi.fn(), onMode: vi.fn() };
const stage3: Stage3Controls = {
  suspended: false, muted: false, speakerMuted: false, hasReplay: true, replaying: false,
  onToggleSuspend: vi.fn(), onEnd: vi.fn(), onToggleMic: vi.fn(), onToggleSpeaker: vi.fn(), onReplay: vi.fn(),
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); Socket.current = undefined; vi.clearAllMocks(); });

describe('focus view (item 5b)', () => {
  it('the CC toggle switches captions off into focus and back, and reports focus to the shell', async () => {
    stubBrowser();
    // Every session starts captions-off (2026-11-16); this test
    // exercises the toggle FROM the captions-on layout, so seed the
    // same-visit mirror ON first.
    sessionStorage.setItem('aspen-widget-captions', 'on');
    const onShellState = vi.fn();
    const view = render(<GeminiConversation compact faceFirst consentOnOpen videoAvatar={videoAvatar} onShellState={onShellState} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    // Chat-fix4 (2026-11-16): there is no focus dock anymore — ONE
    // merged control row serves every state, and the presenter's
    // name rides the seam pill INSIDE the panel (never the livebox),
    // in captions-on and captions-off alike.
    expect(view.queryByTestId('aspen-focus-dock')).toBeNull();
    expect(view.container.querySelector('.aspen-voice-panel [data-testid="persona-name-label"]')?.textContent).toBe('Aspen');
    expect(view.container.querySelector('.aspen-person-livebox [data-testid="persona-name-label"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="aspen-captions-toggle"]')?.textContent).toBe('CC');
    expect(onShellState).toHaveBeenCalledWith(expect.objectContaining({ focus: false }));

    fireEvent.click(view.getByLabelText('Hide captions'));

    // Focus state: focus reported to the shell; the seam pill stays;
    // the CC button flips to its Show-captions face.
    await waitFor(() => expect(onShellState).toHaveBeenCalledWith(expect.objectContaining({ focus: true })));
    expect(view.container.querySelector('.aspen-voice-panel [data-testid="persona-name-label"]')?.textContent).toBe('Aspen');
    expect(view.container.querySelector('[aria-label="Show captions"]')).toBeTruthy();
    expect(sessionStorage.getItem('aspen-widget-captions')).toBe('off');
    // No cross-visit preference is written anymore (2026-11-16).
    expect(localStorage.getItem('aspen-widget-captions')).toBeNull();

    // The CC toggle brings captions (and the standard layout) back.
    fireEvent.click(view.getByLabelText('Show captions'));
    await waitFor(() => expect(sessionStorage.getItem('aspen-widget-captions')).toBe('on'));
    expect(localStorage.getItem('aspen-widget-captions')).toBeNull();
  });

  it("remembers the visitor's captions choice for the session", async () => {
    stubBrowser();
    sessionStorage.setItem('aspen-widget-captions', 'off');
    const view = render(<GeminiConversation compact faceFirst consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    // Captions-off = focus state: the seam pill renders inside the
    // panel and the CC button offers to show captions.
    expect(view.container.querySelector('.aspen-voice-panel [data-testid="persona-name-label"]')).toBeTruthy();
    expect(view.container.querySelector('[aria-label="Show captions"]')).toBeTruthy();
  });

  it('the frame widens only when open and in focus', () => {
    const focused = render(<FloatingPersonFrame {...frameProps} open focus mode="voice"><div>panel</div></FloatingPersonFrame>);
    expect(focused.container.querySelector('section')?.className).toContain('aspen-person-focus');
    cleanup();
    const standard = render(<FloatingPersonFrame {...frameProps} open mode="voice"><div>panel</div></FloatingPersonFrame>);
    expect(standard.container.querySelector('section')?.className).not.toContain('aspen-person-focus');
  });

  it('the dock badge is the larger in-flow variant of the name pill', () => {
    const view = render(<PersonaNameLabel name="Frank" variant="dock" />);
    const badge = view.getByTestId('persona-name-label');
    expect(badge.textContent).toBe('Frank');
    expect(badge.className).not.toContain('absolute');
    expect(badge.querySelector('span')?.className).toContain('text-sm');
  });
});

describe('minimized live face (item 5c)', () => {
  it('stage 3 renders the face stack at the enlarged 79px size, still visible and mirror hidden before any frame flows', () => {
    const view = render(<FloatingPersonFrame {...frameProps} open={false} minimized stage3={stage3} name="Frank"><div>conversation</div></FloatingPersonFrame>);
    const mirror = view.getByTestId('stage3-live-face');
    expect(mirror.tagName).toBe('CANVAS');
    const faceButton = view.getByLabelText('Open Frank');
    expect(faceButton.className).toContain('h-[79px]');
    expect(faceButton.className).toContain('w-[79px]');
    expect(faceButton.contains(mirror)).toBe(true);
    // Single-image invariant, pre-live: the still is the one visible
    // image; the mirror is hidden and reports not-live.
    const still = view.getByTestId('stage3-still-face');
    expect(faceButton.contains(still)).toBe(true);
    expect(still.className).not.toContain('invisible');
    expect(mirror.className).toContain('invisible');
    expect(mirror.getAttribute('data-live')).toBe('false');
  });

  it('stage 3 shows exactly ONE image while live video flows: the mirror replaces the still, never blends with it', async () => {
    const view = render(<FloatingPersonFrame {...frameProps} open={false} minimized stage3={stage3} name="Frank"><div>conversation</div></FloatingPersonFrame>);
    // A live face source appears inside the shell, as SimliAvatar's
    // keyed canvas does while a call is live.
    const source = document.createElement('canvas');
    source.width = 240;
    source.height = 240;
    source.setAttribute('data-live-face-source', '');
    view.container.querySelector('section')!.appendChild(source);
    const mirror = view.getByTestId('stage3-live-face');
    const still = view.getByTestId('stage3-still-face');
    await waitFor(() => expect(mirror.getAttribute('data-live')).toBe('true'));
    // The still is fully hidden and the mirror is the one visible
    // image, on an opaque backdrop — no superimposition.
    expect(still.className).toContain('invisible');
    expect(mirror.className).not.toContain('invisible');
    expect(mirror.className).toContain('bg-primary');
  });

  it('stage 3 hands back to the still alone when the live source stops (stall / image-only fallback)', async () => {
    const view = render(<FloatingPersonFrame {...frameProps} open={false} minimized stage3={stage3} name="Frank"><div>conversation</div></FloatingPersonFrame>);
    const source = document.createElement('canvas');
    source.width = 240;
    source.height = 240;
    source.setAttribute('data-live-face-source', '');
    view.container.querySelector('section')!.appendChild(source);
    const mirror = view.getByTestId('stage3-live-face');
    const still = view.getByTestId('stage3-still-face');
    await waitFor(() => expect(mirror.getAttribute('data-live')).toBe('true'));
    source.remove();
    await waitFor(() => expect(mirror.getAttribute('data-live')).toBe('false'));
    expect(mirror.className).toContain('invisible');
    expect(still.className).not.toContain('invisible');
  });

  it('stage 1 (not yet started) has no live-face mirror — the wave state is untouched', () => {
    const view = render(<FloatingPersonFrame {...frameProps} open={false} name="Frank" />);
    expect(view.queryByTestId('stage3-live-face')).toBeNull();
  });
});

describe('presenter name in the typed chat (item 3)', () => {
  const chatProps = {
    businessName: 'Paul Saperstein Homes',
    businessNiche: 'realtors',
    websiteUrl: 'https://paulsapersteinhomes.com',
    businessInfo: 'A real estate brokerage.',
    callerName: 'John Doe',
    embedded: true,
    active: true,
  };

  it('a presenter demo names the presenter on the consent card and in the greeting', async () => {
    render(<ChatWidget {...chatProps} presenterName="Frank" />);
    expect(screen.getByText('Try Frank chat')).toBeTruthy();
    fireEvent.click(screen.getByText('Start chat & agree'));
    await waitFor(() => expect(screen.getByText(/I'm Frank, the AI assistant for Paul Saperstein Homes/)).toBeTruthy());
    expect(screen.queryByText(/I'm Aspen/)).toBeNull();
  });

  it('without a presenter the chat renders the Aspen strings exactly as before', async () => {
    render(<ChatWidget {...chatProps} />);
    expect(screen.getByText('Try Aspen chat')).toBeTruthy();
    fireEvent.click(screen.getByText('Start chat & agree'));
    await waitFor(() => expect(screen.getByText(/I'm Aspen, the AI assistant for Paul Saperstein Homes/)).toBeTruthy());
  });
});
