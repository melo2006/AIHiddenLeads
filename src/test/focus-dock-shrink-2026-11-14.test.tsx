import { forwardRef, useImperativeHandle } from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';
import type { SimliAvatarHandle } from '@/components/SimliAvatar';

// Focus dock shrink (2026-11-14, Ron's Publish #47 phone retest).
//
// Two defects made the captions-collapsed (focus) panel a tall empty
// black box under the enlarged presenter:
//  1. The voice panel's 232px floor — designed for the STANDARD
//     captions-on panel, whose 86px caption home needs the room —
//     applied in focus too, where the whole content is the dock row +
//     status line + transport (~86px of content in a 232px card).
//  2. In wide landscape the voice transport rides inside the combined
//     toggle/transport row, and focus hides that whole row — so the
//     dock had NO voice controls at all (portrait kept its bottom-slot
//     transport; Ron's Fold is landscape, so he lost his).
// The fix scopes the floor (and the flex-1 stretch) off in focus via
// the .aspen-voice-panel-focus modifier, and gives the landscape focus
// dock its own transport row while the landscape row's centre slot
// skips the transport — exactly one transport instance mounts in all
// four combinations of focus x landscape. Layout is CSS + Tailwind
// classes, so the pins assert the stylesheet rules and the structural
// classes/DOM (the repo's established seam — see
// caption-panel-layout.test.ts); geometry follows from them.

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

function stubLandscape() {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); Socket.current = undefined; vi.clearAllMocks(); });

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('focus dock shrink — the panel floor is scoped to the standard view', () => {
  it('the standard floor and the caption home are untouched', () => {
    const css = read('../index.css');
    expect(css).toContain('.aspen-voice-panel { position: relative; z-index: 10; min-height: 232px; }');
    expect(css).toContain('.aspen-caption-space { height: 86px;');
  });

  it('the focus modifier releases the floor and the stretch, and only in focus', () => {
    const css = read('../index.css');
    const start = css.indexOf('.aspen-voice-panel.aspen-voice-panel-focus {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('min-height: 0');
    expect(block).toContain('flex: none');
    // The modifier rule appears exactly once — no second height source.
    expect(css.match(/\.aspen-voice-panel\.aspen-voice-panel-focus \{/g)).toHaveLength(1);
  });

  it('the panel carries the modifier exactly while focusView is on', () => {
    const source = read('../components/GeminiConversation.tsx');
    expect(source).toContain("(faceFirst && focusView ? ' aspen-voice-panel-focus' : '')");
    // The standard class string is unchanged ahead of the modifier.
    expect(source).toContain("'aspen-voice-panel relative z-10 flex min-h-0 flex-1 flex-col space-y-1.5");
  });
});

describe('focus dock shrink — transport placement pins', () => {
  it('the landscape centre slot skips the transport while focusView (the dock row carries it instead)', () => {
    const source = read('../components/GeminiConversation.tsx');
    expect(source).toContain('{!focusView && <div className="flex min-w-[12.5rem] flex-1 justify-center">{transportControls}</div>}');
    expect(source).toContain('data-testid="aspen-focus-transport"');
    expect(source).toContain('focusView && wideLandscape');
  });

  it('the narrow bottom slot is unchanged — portrait focus keeps its single transport there', () => {
    const source = read('../components/GeminiConversation.tsx');
    expect(source).toContain('{!wideLandscape && transportControls}');
  });
});

describe('focus dock shrink — rendered layout', () => {
  it('standard panel: no focus modifier, caption region reserved, one transport', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    const panel = view.container.querySelector('.aspen-voice-panel');
    expect(panel).toBeTruthy();
    expect(panel?.className).not.toContain('aspen-voice-panel-focus');
    expect(panel?.className).toContain('flex-1');
    expect(view.container.querySelector('.aspen-caption-region')).toBeTruthy();
    expect(view.queryByTestId('aspen-focus-transport')).toBeNull();
    expect(view.getAllByLabelText('Start conversation')).toHaveLength(1);
  });

  it('focus (portrait): the panel shrinks to the dock — floor modifier on, no caption reservation, transport still present exactly once', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    fireEvent.click(view.getByLabelText('Hide captions'));
    await waitFor(() => expect(view.getByTestId('aspen-focus-dock')).toBeTruthy());
    const panel = view.container.querySelector('.aspen-voice-panel');
    expect(panel?.className).toContain('aspen-voice-panel-focus');
    // No caption-region reservation survives into focus: the region
    // element loses both of its sizing classes (it renders hidden).
    expect(view.container.querySelector('.aspen-caption-region')).toBeNull();
    expect(view.container.querySelector('.aspen-caption-space')).toBeNull();
    // Narrow focus: no separate focus-transport row — the bottom slot
    // still carries the single transport instance inside the panel.
    expect(view.queryByTestId('aspen-focus-transport')).toBeNull();
    const starts = view.getAllByLabelText('Start conversation');
    expect(starts).toHaveLength(1);
    expect(panel?.contains(starts[0])).toBe(true);
  });

  it('focus (landscape): the transport moves OUT of the hidden row into the dock row — present, usable, exactly once', async () => {
    stubBrowser();
    stubLandscape();
    const view = render(<GeminiConversation compact faceFirst consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    // Standard landscape first: the transport rides the combined row.
    const row = view.getByTestId('toggle-transport-row');
    expect(within(row).getByLabelText('Start conversation')).toBeTruthy();
    expect(view.getAllByLabelText('Start conversation')).toHaveLength(1);

    fireEvent.click(view.getByLabelText('Hide captions'));
    await waitFor(() => expect(view.getByTestId('aspen-focus-dock')).toBeTruthy());
    // The combined row no longer carries the transport…
    expect(within(view.getByTestId('toggle-transport-row')).queryByLabelText('Start conversation')).toBeNull();
    // …the focus dock's own transport row does, inside the shrunk panel.
    const focusTransport = view.getByTestId('aspen-focus-transport');
    expect(within(focusTransport).getByLabelText('Start conversation')).toBeTruthy();
    expect(view.getAllByLabelText('Start conversation')).toHaveLength(1);
    const panel = view.container.querySelector('.aspen-voice-panel');
    expect(panel?.className).toContain('aspen-voice-panel-focus');
    expect(panel?.contains(focusTransport)).toBe(true);
  });

  it('restore: the captions-back chevron returns the standard layout exactly — modifier off, caption region back, one transport', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    fireEvent.click(view.getByLabelText('Hide captions'));
    await waitFor(() => expect(view.getByTestId('aspen-focus-dock')).toBeTruthy());
    fireEvent.click(view.getByTestId('aspen-focus-dock').querySelector('[aria-label="Show captions"]')!);
    await waitFor(() => expect(view.queryByTestId('aspen-focus-dock')).toBeNull());
    const panel = view.container.querySelector('.aspen-voice-panel');
    expect(panel?.className).not.toContain('aspen-voice-panel-focus');
    expect(view.container.querySelector('.aspen-caption-region')).toBeTruthy();
    expect(view.container.querySelector('.aspen-caption-space')).toBeTruthy();
    expect(view.getAllByLabelText('Start conversation')).toHaveLength(1);
  });
});
