import { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiConversation from '@/components/GeminiConversation';

const mocks = vi.hoisted(() => ({ clear: vi.fn(), pcm: vi.fn(() => true), invoke: vi.fn(async () => ({ data: { token: 'test', maxSeconds: 900 } })) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/voiceSessionAuth', () => ({ voiceSessionHeaders: async () => undefined }));
vi.mock('@/lib/campaignTracking', () => ({ campaignVisit: () => null, trackCampaignEvent: async () => {} }));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/SimliAvatar', () => ({ SOUND_BLOCKED: 'blocked', default: forwardRef(function Avatar(_, ref) {
  useImperativeHandle(ref, () => ({ start: async () => true, stop: vi.fn(), clear: mocks.clear, sendPcm24k: mocks.pcm, setPlaybackMuted: vi.fn() }));
  return null;
}) }));

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
  static capture: { onaudioprocess?: (event: unknown) => void };
  static sources: { stop: ReturnType<typeof vi.fn> }[] = [];
  state = 'running'; currentTime = 0; sampleRate = 16000;
  destination = {};
  resume = async () => {}; suspend = async () => {}; close = async () => {};
  createMediaStreamSource = () => ({ connect: vi.fn() });
  createScriptProcessor = () => { const node = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: undefined }; Context.capture = node; return node; };
  createBuffer = (_channels: number, count: number, rate: number) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) });
  createBufferSource = () => { const source = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null }; Context.sources.push(source); return source; };
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); Context.sources = []; Socket.current = undefined; vi.clearAllMocks(); });

describe.each([{ paired: false, mode: 'handsfree' }, { paired: true, mode: 'handsfree' }, { paired: false, mode: 'hold' }, { paired: true, mode: 'hold' }])('caller interruption $mode paired video $paired', ({ paired, mode }) => {
  it('streams speech during generation and queued playback, clears on interruption, and respects mute/pause', async () => {
    vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('AudioContext', Context);
    Element.prototype.setPointerCapture = vi.fn(); Element.prototype.releasePointerCapture = vi.fn(); Element.prototype.hasPointerCapture = vi.fn(() => false); Element.prototype.scrollIntoView = vi.fn();
    // Even a persisted hold preference must not govern the session start:
    // every session starts hands-free (2026-11-09 incident), so the hold
    // cases below switch modes mid-session via the settings control.
    localStorage.setItem('voice-capture-mode', mode);
    vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [], }), enumerateDevices: async () => [] } });
    const view = render(<GeminiConversation compact autoStart consentOnOpen videoAvatar={paired ? { enabled: true, provider: 'simli', faceId: 'test', position: 'bottom-right', size: 200, shape: 'square' } : undefined} />);
    await waitFor(() => expect(Socket.current?.onmessage).toBeTypeOf('function'));
    const socket = Socket.current;
    if (!socket) throw new Error('Call socket was not created');
    act(() => socket.emit({ type: 'ready' }));
    const speech = () => act(() => Context.capture.onaudioprocess?.({ inputBuffer: { sampleRate: 16000, getChannelData: () => new Float32Array(2048).fill(0.1) } }));
    if (mode === 'hold') {
      // The session started hands-free despite the stored 'hold' above:
      // speech already streams. Switch to hold-to-talk through Settings.
      speech(); expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"audio"'));
      socket.send.mockClear();
      const settingsToggle = view.container.querySelector('button[aria-label="Voice settings"]');
      if (!settingsToggle) throw new Error('Settings toggle not rendered');
      fireEvent.click(settingsToggle);
      const modeSelect = await view.findByRole('combobox', { name: 'Conversation mode' });
      // Radix Select is keyboard driven when pointer capture is unavailable
      // in jsdom: focus the trigger, open with ArrowDown, pick the option.
      modeSelect.focus();
      fireEvent.keyDown(modeSelect, { key: 'ArrowDown' });
      const holdOption = await view.findByRole('option', { name: 'Noisy place — hold to talk' });
      fireEvent.keyDown(holdOption, { key: 'Enter' });
      // The settings dialog overlays the panel while open; close it so the
      // hold button underneath becomes accessible again.
      const dialog = modeSelect.closest('[role="dialog"]');
      if (dialog) fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(view.getByRole('button', { name: 'Hold to talk' })).toBeTruthy());
      // Switching into hold sends a one-off audio_pause control frame (the
      // select's pauseCapture); clear it so the assertion below measures
      // only microphone audio frames.
      socket.send.mockClear();
      speech(); expect(socket.send).not.toHaveBeenCalled();
      vi.stubGlobal('PointerEvent', MouseEvent);
      const hold = view.getByRole('button', { name: 'Hold to talk' });
      hold.setPointerCapture = vi.fn();
      fireEvent.pointerDown(hold, { button: 0 });
    }
    speech();
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"audio"'));
    act(() => socket.emit({ type: 'audio', data: btoa(String.fromCharCode(...new Uint8Array(4800))) }));
    expect(Context.sources.length).toBeGreaterThan(0);
    if (paired) expect(mocks.pcm).toHaveBeenCalled();
    socket.send.mockClear();
    speech();
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"audio"'));
    act(() => socket.emit({ type: 'interrupted' }));
    expect(Context.sources[0].stop).toHaveBeenCalled();
    if (paired) expect(mocks.clear).toHaveBeenCalled();
    // Speaker silence (Studio addition): muting her voice must not gate the
    // microphone — captions and the conversation keep running.
    fireEvent.click(view.getByRole('button', { name: 'Silence speaker' }));
    expect(view.getByRole('button', { name: 'Turn speaker sound on' })).toBeTruthy();
    socket.send.mockClear(); speech();
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"audio"'));
    fireEvent.click(view.getByRole('button', { name: 'Turn speaker sound on' }));
    if (mode === 'hold') {
      // Hold-to-talk renders no mic-mute toggle by design (GeminiConversation
      // gates it on captureMode !== 'hold'): the mic only streams while the
      // talk button is held, so there is nothing for a mute to gate.
      expect(view.queryByRole('button', { name: 'Mute microphone' })).toBeNull();
    } else {
      fireEvent.click(view.getByRole('button', { name: 'Mute microphone' }));
      socket.send.mockClear(); speech(); expect(socket.send).not.toHaveBeenCalled();
      fireEvent.click(view.getByRole('button', { name: 'Unmute microphone' }));
    }
    fireEvent.click(view.getByRole('button', { name: 'Pause conversation' }));
    socket.send.mockClear(); speech(); expect(socket.send).not.toHaveBeenCalled();
  });
});

it('requires a real play tap before authorizing usage when mobile auto-start cannot unlock audio', async () => {
  class PhoneContext extends Context { state = 'suspended'; resume = async () => {}; }
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('AudioContext', PhoneContext);
  vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), enumerateDevices: async () => [], getUserMedia: vi.fn() } });
  const view = render(<GeminiConversation compact autoStart consentOnOpen />);
  await waitFor(() => expect(view.getByText(/Your sign-in and demo allowance are unchanged/)).toBeTruthy());
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(Socket.current).toBeUndefined();
  vi.stubGlobal('AudioContext', Context);
  navigator.mediaDevices.getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }) as unknown as MediaStream);
  fireEvent.click(view.getByRole('button', { name: /Start/ }));
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
});