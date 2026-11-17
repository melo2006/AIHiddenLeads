import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatWidget, {
  CAMERA_FRAME_NOTE,
  LIVE_CAMERA_FRAME_INTERVAL_MS,
  LIVE_CAMERA_FRAME_MAX_EDGE_PX,
  LIVE_CAMERA_FRAME_STALE_MS,
  cameraFrameFresh,
  cameraShouldSample,
  captureCameraFrame,
  type CameraFramePayload,
} from '@/components/landing/demo-results/ChatWidget';

// Live camera (Ron, 2026-11-17 — "Build the camera next"): the
// composer's Camera entry starts the visitor's camera IN the panel.
// Frames are sampled locally (2s, freshest only, never stored) and
// ride the proven photo-vision path ONLY on conversation turns —
// one intro turn at start, then each visitor send while live. An
// idle camera makes zero model calls. These tests pin: the
// start/stop lifecycle (menu, strip, mode switch, unmount), the
// permission-denied + no-camera notices, the frame riding a send,
// the snapshot-to-photo path, and the sampling cadence helpers.

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (name: string) => (
    name === 'retell-web-call'
      ? { data: { content: 'Happy to help with that!' }, error: null }
      : { data: null, error: null }
  )),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));
vi.mock('@/components/ai-elements/message', () => ({ Message: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>, MessageResponse: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const JPEG_BASE64 = Buffer.from(JPEG_BYTES).toString('base64');

const chatProps = {
  businessName: 'AI Hidden Leads',
  businessNiche: 'general',
  websiteUrl: 'https://aihiddenleads.com',
  businessInfo: 'AI voice and chat assistants.',
  embedded: true,
  active: true,
};

type FakeTrack = { kind: string; stop: ReturnType<typeof vi.fn> };
function fakeStream() {
  const track: FakeTrack = { kind: 'video', stop: vi.fn() };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  return { stream, track };
}

function installMediaDevices(getUserMedia: unknown, enumerateDevices?: unknown) {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    value: {
      getUserMedia,
      enumerateDevices: enumerateDevices ?? (async () => []),
    },
    configurable: true,
  });
}

function renderChat(extra: Record<string, unknown> = {}) {
  const view = render(<ChatWidget {...chatProps} {...extra} />);
  fireEvent.click(screen.getByText('Start chat & agree'));
  return view;
}

function clickCameraMenuItem() {
  fireEvent.click(screen.getByRole('button', { name: 'Attach a file' }));
  const items = screen.getAllByRole('menuitem');
  expect(items.map((el) => el.textContent)).toEqual(['Camera', 'Photos', 'Files']);
  fireEvent.click(items[0]);
}

async function startCamera() {
  clickCameraMenuItem();
  await waitFor(() => expect(screen.getByTestId('chat-camera-preview')).toBeTruthy());
}

function chatCalls() {
  return mocks.invoke.mock.calls.filter(([name]) => name === 'retell-web-call') as unknown as [string, { body: { image?: { data: string; mimeType: string }; messages: { role: string; content: string }[] } }][];
}

beforeEach(() => {
  mocks.invoke.mockClear();
  sessionStorage.clear();
  localStorage.clear();
  // Canvas plumbing for frame capture (same stubs as the photo
  // vision tests): a 2d context that accepts draws, and a toBlob
  // that yields a tiny JPEG.
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = () => ({ drawImage: () => undefined });
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toBlob = function (cb: (b: Blob | null) => void) { cb(new Blob([JPEG_BYTES], { type: 'image/jpeg' })); };
  (URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:mock';
  (URL as unknown as Record<string, unknown>).revokeObjectURL = () => undefined;
  // The preview video always has frames to draw in these tests.
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
  (HTMLVideoElement.prototype as unknown as Record<string, unknown>).play = () => Promise.resolve();
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window.navigator, 'mediaDevices', { value: undefined, configurable: true });
});

describe('live camera — sampling cadence helpers', () => {
  it('pins the cadence: sample every 2s, frames at a 768px edge, stale after 10s', () => {
    expect(LIVE_CAMERA_FRAME_INTERVAL_MS).toBe(2000);
    expect(LIVE_CAMERA_FRAME_MAX_EDGE_PX).toBe(768);
    expect(LIVE_CAMERA_FRAME_STALE_MS).toBe(10_000);
  });

  it('cameraShouldSample requires on + visible + a live-sized video', () => {
    expect(cameraShouldSample({ on: true, hidden: false, videoWidth: 640, videoHeight: 480 })).toBe(true);
    expect(cameraShouldSample({ on: false, hidden: false, videoWidth: 640, videoHeight: 480 })).toBe(false);
    expect(cameraShouldSample({ on: true, hidden: true, videoWidth: 640, videoHeight: 480 })).toBe(false);
    expect(cameraShouldSample({ on: true, hidden: false, videoWidth: 0, videoHeight: 480 })).toBe(false);
    expect(cameraShouldSample({ on: true, hidden: false, videoWidth: 640, videoHeight: 0 })).toBe(false);
  });

  it('cameraFrameFresh honours the stale bound, inclusive at the edge', () => {
    const now = 1_000_000;
    const frame = (capturedAt: number): CameraFramePayload => ({ data: 'x', mimeType: 'image/jpeg', byteSize: 3, capturedAt });
    expect(cameraFrameFresh(null, now)).toBe(false);
    expect(cameraFrameFresh(frame(now), now)).toBe(true);
    expect(cameraFrameFresh(frame(now - LIVE_CAMERA_FRAME_STALE_MS), now)).toBe(true);
    expect(cameraFrameFresh(frame(now - LIVE_CAMERA_FRAME_STALE_MS - 1), now)).toBe(false);
  });

  it('captureCameraFrame downscales a 1280×720 frame to a 768px-edge JPEG payload', async () => {
    let drawnCanvas: HTMLCanvasElement | null = null;
    (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = function (this: HTMLCanvasElement) {
      drawnCanvas = this;
      return { drawImage: () => undefined };
    };
    const video = { videoWidth: 1280, videoHeight: 720 } as unknown as HTMLVideoElement;
    const frame = await captureCameraFrame(video);
    expect(frame?.mimeType).toBe('image/jpeg');
    expect(frame?.data).toBe(JPEG_BASE64);
    expect(frame?.byteSize).toBe(JPEG_BYTES.length);
    expect(drawnCanvas!.width).toBe(768);
    expect(drawnCanvas!.height).toBe(432);
    // A video with no frames yet yields nothing.
    expect(await captureCameraFrame({ videoWidth: 0, videoHeight: 0 } as unknown as HTMLVideoElement)).toBeNull();
  });
});

describe('live camera — lifecycle', () => {
  it('starts on the Camera menu tap: video-only stream, preview strip with the LIVE indicator, and one intro vision turn', async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn(async () => stream);
    installMediaDevices(getUserMedia);
    renderChat();

    await startCamera();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false });
    const preview = screen.getByTestId('chat-camera-preview');
    expect(preview.textContent).toContain('Live camera');
    // Front-camera self-view is mirrored.
    expect(preview.querySelector('video')?.className).toContain('-scale-x-100');

    // The intro turn: her first frame rides the vision path with
    // the visitor's camera-on line, and the thread shows both the
    // line and the frame thumbnail chip.
    await waitFor(() => expect(chatCalls()).toHaveLength(1));
    const body = chatCalls()[0][1].body;
    expect(body.image).toEqual({ data: JPEG_BASE64, mimeType: 'image/jpeg' });
    expect(body.messages.at(-1)?.content).toContain('I turned on my camera');
    expect(body.messages.at(-1)?.content).toContain(CAMERA_FRAME_NOTE);
    expect(screen.getByText(/I turned on my camera/)).toBeTruthy();
    expect(screen.getByTestId('chat-message-attachment').textContent).toContain('Live camera');
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });
  });

  it('the Stop button ends every track and removes the preview', async () => {
    const { stream, track } = fakeStream();
    installMediaDevices(vi.fn(async () => stream));
    renderChat();
    await startCamera();
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });

    fireEvent.click(screen.getByRole('button', { name: 'Stop camera' }));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('chat-camera-preview')).toBeNull();
  });

  it('tapping the Camera menu entry again stops the camera', async () => {
    const { stream, track } = fakeStream();
    installMediaDevices(vi.fn(async () => stream));
    renderChat();
    await startCamera();

    clickCameraMenuItem();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('chat-camera-preview')).toBeNull();
  });

  it('leaving chat mode (active=false) and unmounting both end the tracks', async () => {
    const first = fakeStream();
    installMediaDevices(vi.fn(async () => first.stream));
    const view = renderChat();
    await startCamera();
    view.rerender(<ChatWidget {...chatProps} active={false} />);
    expect(first.track.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('chat-camera-preview')).toBeNull();
    view.unmount();

    const second = fakeStream();
    installMediaDevices(vi.fn(async () => second.stream));
    const view2 = renderChat();
    await startCamera();
    view2.unmount();
    expect(second.track.stop).toHaveBeenCalledTimes(1);
  });

  it('a denied permission shows the localized notice and starts nothing', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    installMediaDevices(vi.fn(async () => { throw denied; }));
    renderChat();

    clickCameraMenuItem();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Camera access is blocked'));
    expect(screen.queryByTestId('chat-camera-preview')).toBeNull();
    expect(chatCalls()).toHaveLength(0);
  });

  it('with no mediaDevices at all the visitor gets the unavailable notice', async () => {
    Object.defineProperty(window.navigator, 'mediaDevices', { value: undefined, configurable: true });
    renderChat();
    clickCameraMenuItem();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No camera is available'));
    expect(screen.queryByTestId('chat-camera-preview')).toBeNull();
  });

  it('flip appears only with a second camera and re-acquires facing the other way', async () => {
    const first = fakeStream();
    const second = fakeStream();
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);
    installMediaDevices(getUserMedia, async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }]);
    renderChat();
    await startCamera();

    const flip = await screen.findByRole('button', { name: 'Switch camera' });
    fireEvent.click(flip);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(getUserMedia.mock.calls[1][0]).toEqual({ video: { facingMode: 'environment' }, audio: false });
    expect(first.track.stop).toHaveBeenCalledTimes(1);
    // Still live on the new stream, no longer mirrored.
    const preview = screen.getByTestId('chat-camera-preview');
    expect(preview.querySelector('video')?.className).not.toContain('-scale-x-100');
  });

  it('with a single camera no flip button is offered', async () => {
    const { stream } = fakeStream();
    installMediaDevices(vi.fn(async () => stream), async () => [{ kind: 'videoinput' }]);
    renderChat();
    await startCamera();
    expect(screen.queryByRole('button', { name: 'Switch camera' })).toBeNull();
  });
});

describe('live camera — frames in the conversation', () => {
  it('the freshest frame rides a visitor send while live, with the camera-frame note', async () => {
    const { stream } = fakeStream();
    installMediaDevices(vi.fn(async () => stream));
    renderChat();
    await startCamera();
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });
    // The full text renders a beat before the type-out clears the
    // busy flag — wait for the composer to actually free up.
    await waitFor(() => expect((screen.getByLabelText(/message aspen/i) as HTMLTextAreaElement).disabled).toBe(false));
    mocks.invoke.mockClear();

    const field = screen.getByLabelText(/message aspen/i);
    fireEvent.change(field, { target: { value: 'What do you see?' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(chatCalls()).toHaveLength(1));
    const body = chatCalls()[0][1].body;
    expect(body.image).toEqual({ data: JPEG_BASE64, mimeType: 'image/jpeg' });
    expect(body.messages.at(-1)?.content).toContain('What do you see?');
    expect(body.messages.at(-1)?.content).toContain(CAMERA_FRAME_NOTE);
  });

  it('once the camera stops, sends carry no image again', async () => {
    const { stream } = fakeStream();
    installMediaDevices(vi.fn(async () => stream));
    renderChat();
    await startCamera();
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });
    await waitFor(() => expect((screen.getByLabelText(/message aspen/i) as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Stop camera' }));
    mocks.invoke.mockClear();

    const field = screen.getByLabelText(/message aspen/i);
    fireEvent.change(field, { target: { value: 'Thanks!' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(chatCalls()).toHaveLength(1));
    expect(chatCalls()[0][1].body.image).toBeUndefined();
    expect(chatCalls()[0][1].body.messages.at(-1)?.content).toBe('Thanks!');
  });

  it('the snapshot button stages the current frame as a photo — and the camera keeps running', async () => {
    const { stream } = fakeStream();
    installMediaDevices(vi.fn(async () => stream));
    renderChat();
    await startCamera();

    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    await waitFor(() => expect(screen.getByTestId('chat-attachment-chip')).toBeTruthy());
    expect(screen.getByTestId('chat-attachment-chip').textContent).toContain('camera-photo.jpg');
    expect(screen.getByTestId('chat-camera-preview')).toBeTruthy();
  });
});
