// @vitest-environment jsdom
import { forwardRef, useImperativeHandle } from 'react';
import { act, cleanup, render, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applySinkIdToElement,
  buildSpeakerMenuOptions,
  classifySpeakerOutputLabel,
  pickDefaultSpeakerOutput,
  toSpeakerOutputDevices,
  type SpeakerOutputDevice,
} from '@/lib/speakerOutput';
import GeminiConversation from '@/components/GeminiConversation';

const devices: SpeakerOutputDevice[] = [
  { deviceId: 'spk1', label: 'Built-in Speaker', kind: 'speaker' },
  { deviceId: 'ear1', label: 'Earpiece', kind: 'earpiece' },
  { deviceId: 'bt1', label: 'Pixel Buds', kind: 'bluetooth' },
  { deviceId: 'usb1', label: 'USB Sound Card', kind: 'unknown' },
];

describe('speaker output helpers', () => {
  it('classifies labels conservatively — unknown stays unknown, never invented as earpiece', () => {
    expect(classifySpeakerOutputLabel('Built-in Speaker')).toBe('speaker');
    expect(classifySpeakerOutputLabel('Loudspeaker')).toBe('speaker');
    expect(classifySpeakerOutputLabel('Earpiece')).toBe('earpiece');
    expect(classifySpeakerOutputLabel('Bluetooth Headset')).toBe('bluetooth');
    expect(classifySpeakerOutputLabel('AirPods Pro')).toBe('bluetooth');
    expect(classifySpeakerOutputLabel('USB Sound Card')).toBe('unknown');
    expect(classifySpeakerOutputLabel('')).toBe('unknown');
  });

  it('keeps only audiooutput devices, deduped, with their labels', () => {
    const mapped = toSpeakerOutputDevices([
      { deviceId: 'a', kind: 'audiooutput', label: 'Built-in Speaker' },
      { deviceId: 'a', kind: 'audiooutput', label: 'Built-in Speaker' },
      { deviceId: 'mic1', kind: 'audioinput', label: 'Mic' },
      { deviceId: 'b', kind: 'audiooutput', label: '' },
    ]);
    expect(mapped.map(d => d.deviceId)).toEqual(['a', 'b']);
    expect(mapped[1].kind).toBe('unknown');
  });

  it('menu with selectable devices: Loudspeaker, Phone earpiece, Bluetooth/headset + unknown by their own labels, then Mute', () => {
    const options = buildSpeakerMenuOptions({ devices, canSelect: true, selectedDeviceId: 'spk1', muted: false });
    expect(options.map(o => o.id)).toEqual(['device:spk1', 'device:ear1', 'device:bt1', 'device:usb1', 'mute']);
    expect(options[0].synthetic).toBe('loudspeaker');
    expect(options[0].selected).toBe(true);
    expect(options[1].synthetic).toBe('earpiece');
    expect(options[2].rawLabel).toBe('Pixel Buds');
    expect(options[3].rawLabel).toBe('USB Sound Card');
    expect(options[4].kind).toBe('mute');
    // A muted session checkmarks Mute, never a device.
    const mutedOptions = buildSpeakerMenuOptions({ devices, canSelect: true, selectedDeviceId: 'spk1', muted: true });
    expect(mutedOptions.find(o => o.kind === 'mute')?.selected).toBe(true);
    expect(mutedOptions[0].selected).toBe(false);
  });

  it('menu without selectable outputs is honest: Phone default (video sound) + Mute only', () => {
    for (const input of [
      { devices: [] as SpeakerOutputDevice[], canSelect: false },
      { devices, canSelect: false },
      { devices: [] as SpeakerOutputDevice[], canSelect: true },
    ]) {
      const options = buildSpeakerMenuOptions({ ...input, selectedDeviceId: null, muted: false });
      expect(options.map(o => o.id)).toEqual(['platform', 'mute']);
      expect(options[0].synthetic).toBe('platform');
      expect(options[0].selected).toBe(true);
    }
  });

  it('default pick prefers Bluetooth, then the loudspeaker, then the platform default device', () => {
    expect(pickDefaultSpeakerOutput(devices)?.deviceId).toBe('bt1');
    expect(pickDefaultSpeakerOutput(devices.filter(d => d.kind !== 'bluetooth'))?.deviceId).toBe('spk1');
    expect(pickDefaultSpeakerOutput([{ deviceId: 'default', label: '', kind: 'unknown' }])?.deviceId).toBe('default');
    expect(pickDefaultSpeakerOutput([{ deviceId: 'usb1', label: 'USB Sound Card', kind: 'unknown' }])).toBeNull();
    expect(pickDefaultSpeakerOutput([])).toBeNull();
  });

  it('applySinkIdToElement calls setSinkId with the device and reports failure honestly', async () => {
    const ok = { setSinkId: vi.fn(async () => {}) };
    await expect(applySinkIdToElement(ok, 'spk1')).resolves.toBe(true);
    expect(ok.setSinkId).toHaveBeenCalledWith('spk1');
    const throwing = { setSinkId: vi.fn(async () => { throw new Error('gone'); }) };
    await expect(applySinkIdToElement(throwing, 'spk1')).resolves.toBe(false);
    await expect(applySinkIdToElement({}, 'spk1')).resolves.toBe(false);
    await expect(applySinkIdToElement(null, 'spk1')).resolves.toBe(false);
  });
});

// --- Component integration (harness mirrors conversation-interruption) ---

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  pcm: vi.fn(() => true),
  invoke: vi.fn(async () => ({ data: { token: 'test', maxSeconds: 900 } })),
  playbackMuted: vi.fn(),
  setOutputDevice: vi.fn(async () => true),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/voiceSessionAuth', () => ({ voiceSessionHeaders: async () => undefined }));
vi.mock('@/lib/campaignTracking', () => ({ campaignVisit: () => null, trackCampaignEvent: async () => {} }));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/SimliAvatar', () => ({ SOUND_BLOCKED: 'blocked', isVideoStartFailure: () => false, default: forwardRef(function Avatar(_, ref) {
  useImperativeHandle(ref, () => ({ start: async () => true, activate: async () => {}, stop: vi.fn(), clear: mocks.clear, sendPcm24k: mocks.pcm, setPlaybackMuted: mocks.playbackMuted, setOutputDevice: mocks.setOutputDevice }));
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
  state = 'running'; currentTime = 0; sampleRate = 16000;
  destination = {};
  resume = async () => {}; suspend = async () => {}; close = async () => {};
  createMediaStreamSource = () => ({ connect: vi.fn() });
  createScriptProcessor = () => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: undefined });
  createBuffer = (_channels: number, count: number, rate: number) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) });
  createBufferSource = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null });
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
}

const outputDevices = () => [
  { deviceId: 'spk1', kind: 'audiooutput', label: 'Built-in Speaker' },
  { deviceId: 'ear1', kind: 'audiooutput', label: 'Earpiece' },
  { deviceId: 'bt1', kind: 'audiooutput', label: 'Pixel Buds' },
  { deviceId: 'usb1', kind: 'audiooutput', label: 'USB Sound Card' },
];

async function startLiveConversation() {
  const view = render(<GeminiConversation compact autoStart consentOnOpen videoAvatar={{ enabled: true, provider: 'simli', faceId: 'test', position: 'bottom-right', size: 200, shape: 'square' }} />);
  await waitFor(() => expect(Socket.current?.onmessage).toBeTypeOf('function'));
  const socket = Socket.current;
  if (!socket) throw new Error('Call socket was not created');
  act(() => socket.emit({ type: 'ready' }));
  await waitFor(() => expect(view.getByRole('button', { name: 'Speaker output' })).toBeTruthy());
  return view;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  Socket.current = undefined;
  vi.clearAllMocks();
  delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
});

describe('speaker output menu (component)', () => {
  it('with selectable outputs: menu lists devices, Loudspeaker applies setSinkId via the avatar element, nothing is persisted', async () => {
    (HTMLMediaElement.prototype as unknown as { setSinkId: unknown }).setSinkId = vi.fn(async () => {});
    vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('AudioContext', Context);
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }), enumerateDevices: async () => outputDevices() } });
    const view = await startLiveConversation();
    // Session-start default: Bluetooth wins when connected (owner's rule).
    await waitFor(() => expect(mocks.setOutputDevice).toHaveBeenCalledWith('bt1'));

    fireEvent.click(view.getByRole('button', { name: 'Speaker output' }));
    expect(view.getByRole('menuitemradio', { name: 'Loudspeaker' })).toBeTruthy();
    expect(view.getByRole('menuitemradio', { name: 'Phone earpiece' })).toBeTruthy();
    expect(view.getByRole('menuitemradio', { name: 'Pixel Buds' })).toBeTruthy();
    expect(view.getByRole('menuitemradio', { name: 'USB Sound Card' })).toBeTruthy();
    expect(view.getByRole('menuitemradio', { name: 'Pixel Buds' }).getAttribute('aria-checked')).toBe('true');

    mocks.setOutputDevice.mockClear();
    const storedBefore = Object.keys(localStorage);
    fireEvent.click(view.getByRole('menuitemradio', { name: 'Loudspeaker' }));
    await waitFor(() => expect(mocks.setOutputDevice).toHaveBeenCalledWith('spk1'));
    // Session-scoped only: selecting an output writes NOTHING to storage.
    expect(Object.keys(localStorage)).toEqual(storedBefore);
    for (const key of Object.keys(localStorage)) expect(key.toLowerCase()).not.toMatch(/speaker|output/);

    // Mute still mutes through the existing playback-mute path.
    fireEvent.click(view.getByRole('button', { name: 'Speaker output' }));
    expect(view.getByRole('menuitemradio', { name: 'Loudspeaker' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(view.getByRole('menuitemradio', { name: 'Mute' }));
    expect(mocks.playbackMuted).toHaveBeenCalledWith(true);
    fireEvent.click(view.getByRole('button', { name: 'Speaker output' }));
    expect(view.getByRole('menuitemradio', { name: 'Mute' }).getAttribute('aria-checked')).toBe('true');
  });

  it('without selectable outputs: menu offers Phone default (video sound) + Mute and says why, with no dead Loudspeaker row', async () => {
    vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('AudioContext', Context);
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] }), enumerateDevices: async () => [] } });
    const view = await startLiveConversation();
    fireEvent.click(view.getByRole('button', { name: 'Speaker output' }));
    expect(view.getByRole('menuitemradio', { name: 'Phone default (video sound)' })).toBeTruthy();
    expect(view.queryByRole('menuitemradio', { name: 'Loudspeaker' })).toBeNull();
    expect(view.getByText(/doesn't expose speaker selection/)).toBeTruthy();
    fireEvent.click(view.getByRole('menuitemradio', { name: 'Mute' }));
    expect(mocks.playbackMuted).toHaveBeenCalledWith(true);
  });
});
