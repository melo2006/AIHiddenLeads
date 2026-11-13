import { forwardRef, useImperativeHandle } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingPersonFrame, { PersonPortrait, PersonaNameLabel, type Stage3Controls } from '@/components/FloatingPersonFrame';
import GeminiConversation from '@/components/GeminiConversation';
import type { SimliAvatarHandle } from '@/components/SimliAvatar';

// Persona name badge (Ron, 2026-11-13): the floating panel showed the
// persona's face but never their name. The badge is a lower-third pill
// at the bottom of the portrait/video area, driven by the same
// identity/persona config that selects face + voice — the widget's
// displayName in the shell (chat mode), PERSONAS[activePersona] / the
// session identity name inside the conversation (voice mode) — and it
// never renders on the Stage 1 bubble or the Stage 3 minimized bar.

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

const frameProps = { onOpen: vi.fn(), onClose: vi.fn(), onMinimize: vi.fn(), onMode: vi.fn() };
const stage3: Stage3Controls = {
  suspended: false, muted: false, speakerMuted: false, hasReplay: true, replaying: false,
  onToggleSuspend: vi.fn(), onEnd: vi.fn(), onToggleMic: vi.fn(), onToggleSpeaker: vi.fn(), onReplay: vi.fn(),
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Socket.current = undefined; vi.clearAllMocks(); });

describe('PersonaNameLabel', () => {
  it('renders the first name as a non-interactive lower-third pill', () => {
    const view = render(<PersonaNameLabel name="Sara" />);
    const badge = view.getByTestId('persona-name-label');
    expect(badge.textContent).toBe('Sara');
    expect(badge.className).toContain('pointer-events-none');
    expect(badge.className).toContain('absolute');
    expect(badge.querySelector('span')?.className).toContain('rounded-full');
  });

  it('shows only the first name and renders nothing for an empty name', () => {
    const view = render(<PersonaNameLabel name="Maria Lopez" />);
    expect(view.getByTestId('persona-name-label').textContent).toBe('Maria');
    cleanup();
    const empty = render(<PersonaNameLabel name="  " />);
    expect(empty.queryByTestId('persona-name-label')).toBeNull();
  });
});

describe('PersonPortrait nameLabel opt-in', () => {
  it('overlays the badge only when nameLabel is passed', () => {
    const plain = render(<PersonPortrait name="Aspen" animated={false} />);
    expect(plain.queryByTestId('persona-name-label')).toBeNull();
    cleanup();
    const labelled = render(<PersonPortrait name="Aspen" animated={false} nameLabel />);
    expect(labelled.getByTestId('persona-name-label').textContent).toBe('Aspen');
    expect(labelled.getByAltText('Aspen')).toBeTruthy();
  });
});

describe('FloatingPersonFrame badge placement', () => {
  it('chat mode: the badge sits on the portrait and follows the shell display name', () => {
    render(<FloatingPersonFrame {...frameProps} open mode="chat" name="Sara"><div>panel</div></FloatingPersonFrame>);
    const badge = screen.getByTestId('persona-name-label');
    expect(badge.textContent).toBe('Sara');
    // The badge's wrapper is the portrait's positioned container: the
    // portrait img lives in the same wrapper, ahead of the badge.
    expect(badge.parentElement?.querySelector('img')).toBeTruthy();
  });

  it('stage 1 bubble and stage 3 minimized bar carry NO badge', () => {
    render(<FloatingPersonFrame {...frameProps} open={false} />);
    expect(screen.queryByTestId('persona-name-label')).toBeNull();
    cleanup();
    render(<FloatingPersonFrame {...frameProps} open={false} minimized stage3={stage3}><div>conversation</div></FloatingPersonFrame>);
    expect(screen.queryByTestId('persona-name-label')).toBeNull();
  });

  it('voice mode: the frame itself renders no badge — the conversation owns it', () => {
    render(<FloatingPersonFrame {...frameProps} open mode="voice"><div>conversation</div></FloatingPersonFrame>);
    expect(screen.queryByTestId('persona-name-label')).toBeNull();
  });
});

describe('GeminiConversation livebox badge', () => {
  it('ready state: the badge inside the livebox shows the session identity name', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst consentOnOpen videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    const box = view.container.querySelector('.aspen-person-livebox');
    const badge = box?.querySelector('[data-testid="persona-name-label"]');
    expect(badge?.textContent).toBe('Aspen');
  });

  it('a tenant identity name drives the badge (config, not a hardcoded persona)', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst consentOnOpen name="Maria" videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    const box = view.container.querySelector('.aspen-person-livebox');
    expect(box?.querySelector('[data-testid="persona-name-label"]')?.textContent).toBe('Maria');
  });

  it('the Alex guide session badges the registry display name', async () => {
    stubBrowser();
    const view = render(<GeminiConversation compact faceFirst consentOnOpen guide="alex" name="Aspen" videoAvatar={videoAvatar} />);
    await waitFor(() => expect(view.getByText('Ready to talk')).toBeTruthy());
    const box = view.container.querySelector('.aspen-person-livebox');
    expect(box?.querySelector('[data-testid="persona-name-label"]')?.textContent).toBe('Alex');
  });
});
