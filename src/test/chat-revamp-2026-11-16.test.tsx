import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatWidget, { attachmentNote, attachmentSupported, formatFileSize, prepareImagePayload, readAloudVoiceFor, speechLangFor, threadFromVisitMemory } from '@/components/landing/demo-results/ChatWidget';
import { visitMemoryAppend, visitMemoryDelete, visitMemoryGet } from '@/lib/visitMemory';
import { micDiagDetail, micDiagStamp, createMicFlowState } from '@/lib/micWatchdog';

// Chat revamp (Ron, 2026-11-16, from his phone tests + annotated
// Gemini-app screenshot):
//  * Gemini-style composer — one rounded bar: "+" attach menu
//    (Camera / Photos / Files, exactly three entries), the field,
//    an in-field dictation mic, a voice-mode switch, a send button
//    that appears when there is something to send.
//  * Dictation is review-then-send: speech lands as editable text in
//    the field, never auto-sent, and mixes with typed corrections.
//  * Attachments ride the text-only chat path as a bracketed note;
//    the thread shows the chip. Guardrails: allow-list + 10 MB cap.
//  * Her replies get read-aloud + copy (+ local thumbs).
//  * ONE continuous conversation: the typed thread and the voice
//    panel share the visit-memory store.
//  * Two-side colours: visitor = emerald primary bubble, Aspen =
//    violet accent-tinted bubble — here and in the voice transcript.
//  * Keyboard fit: no dvh cap on the embedded list; the chat panel's
//    floor is capped against the visual-viewport height var.

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

const read = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

const chatProps = {
  businessName: 'AI Hidden Leads',
  businessNiche: 'general',
  websiteUrl: 'https://aihiddenleads.com',
  businessInfo: 'AI voice and chat assistants.',
  embedded: true,
  active: true,
};

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  started = false;
  stopped = false;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; }
  stop() { this.stopped = true; this.onend?.(); }
  abort() { /* no-op */ }
  emit(transcript: string) {
    this.onresult?.({ results: [{ 0: { transcript }, isFinal: false, length: 1 }] });
  }
}

const pickFile = (input: HTMLElement, file: File) => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
};

beforeEach(() => {
  mocks.invoke.mockClear();
  FakeRecognition.instances = [];
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe('Gemini-style composer', () => {
  it('renders the rounded bar: attach menu with exactly Camera / Photos / Files, field, voice-mode switch; send appears only with text', async () => {
    const onVoiceMode = vi.fn();
    render(<ChatWidget {...chatProps} onVoiceMode={onVoiceMode} />);
    fireEvent.click(screen.getByText('Start chat & agree'));

    expect(screen.getByTestId('chat-composer')).toBeTruthy();
    // No dictation button without the SpeechRecognition API.
    expect(screen.queryByTestId('chat-dictate-button')).toBeNull();
    // Send is hidden until there is something to send.
    expect(screen.queryByRole('button', { name: /send message/i })).toBeNull();

    // The "+" menu: exactly three entries, no Plugins.
    fireEvent.click(screen.getByRole('button', { name: 'Attach a file' }));
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(items).toEqual(['Camera', 'Photos', 'Files']);
    expect(screen.queryByText(/plugins/i)).toBeNull();
    // Camera captures on the spot; Photos is images/video only.
    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(fileInputs).toHaveLength(3);
    expect(fileInputs[0].getAttribute('capture')).toBe('environment');
    expect(fileInputs[0].getAttribute('accept')).toBe('image/*');
    expect(fileInputs[1].getAttribute('accept')).toBe('image/*,video/*');

    // Voice-mode switch calls back to the shell.
    fireEvent.click(screen.getByRole('button', { name: 'Switch to voice conversation' }));
    expect(onVoiceMode).toHaveBeenCalledTimes(1);

    // Typing reveals Send; Enter sends through the existing path.
    const field = screen.getByLabelText(/message aspen/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'How much does it cost?' } });
    expect(screen.getByRole('button', { name: /send message/i })).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(mocks.invoke.mock.calls.some(([name]) => name === 'retell-web-call')).toBe(true));
    const call = mocks.invoke.mock.calls.find(([name]) => name === 'retell-web-call') as unknown as [string, { body: { messages: { role: string; content: string }[] } }];
    expect(call[1].body.messages.at(-1)).toEqual({ role: 'user', content: 'How much does it cost?' });
  });

  it('without an onVoiceMode callback the voice-mode button does not render', () => {
    render(<ChatWidget {...chatProps} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    expect(screen.queryByRole('button', { name: 'Switch to voice conversation' })).toBeNull();
  });
});

describe('dictation — review, edit, then send (never auto-sent)', () => {
  it('mic appears only with the API; interim speech fills the field; typed corrections mix in; send is manual', async () => {
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    render(<ChatWidget {...chatProps} />);
    fireEvent.click(screen.getByText('Start chat & agree'));

    const mic = screen.getByTestId('chat-dictate-button');
    fireEvent.click(mic);
    expect(FakeRecognition.instances).toHaveLength(1);
    const recognition = FakeRecognition.instances[0];
    expect(recognition.started).toBe(true);
    expect(recognition.lang).toBe('en-US');
    // Recording state: pressed + stop affordance.
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    expect(mic.getAttribute('aria-label')).toBe('Stop dictation');

    act(() => recognition.emit('I need a quote for my roof'));
    const field = screen.getByLabelText(/message aspen/i) as HTMLTextAreaElement;
    expect(field.value).toBe('I need a quote for my roof');
    // NOT auto-sent: no chat call was made.
    expect(mocks.invoke.mock.calls.some(([name]) => name === 'retell-web-call')).toBe(false);

    // Stop, then mix typed corrections into the same field.
    fireEvent.click(mic);
    expect(recognition.stopped).toBe(true);
    fireEvent.change(field, { target: { value: 'I need a quote for my roof, please call me back' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(mocks.invoke.mock.calls.some(([name]) => name === 'retell-web-call')).toBe(true));
    const call = mocks.invoke.mock.calls.find(([name]) => name === 'retell-web-call') as unknown as [string, { body: { messages: { role: string; content: string }[] } }];
    expect(call[1].body.messages.at(-1)?.content).toBe('I need a quote for my roof, please call me back');
  });

  it('dictation speaks the site language (pt-BR pick → pt-BR recognition)', () => {
    // chat-fix3: a language pick is recorded in sessionStorage (the
    // switcher's languageChanged hook writes it there; localStorage
    // is only a mirror and no longer drives anything on its own).
    sessionStorage.setItem('lang', 'pt-BR');
    localStorage.setItem('lang', 'pt-BR');
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    render(<ChatWidget {...chatProps} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    fireEvent.click(screen.getByTestId('chat-dictate-button'));
    expect(FakeRecognition.instances[0].lang).toBe('pt-BR');
    expect(speechLangFor('pt-BR')).toBe('pt-BR');
    expect(speechLangFor('es')).toBe('es');
    expect(speechLangFor(undefined)).toBe('en-US');
  });
});

describe('attachments', () => {
  it('guardrail helpers: allow-list, size formatting, payload note', () => {
    expect(attachmentSupported({ name: 'photo.png', type: 'image/png' })).toBe(true);
    expect(attachmentSupported({ name: 'clip.mp4', type: 'video/mp4' })).toBe(true);
    expect(attachmentSupported({ name: 'voice.m4a', type: 'audio/mp4' })).toBe(true);
    expect(attachmentSupported({ name: 'report.pdf', type: 'application/pdf' })).toBe(true);
    expect(attachmentSupported({ name: 'notes.docx', type: '' })).toBe(true);
    expect(attachmentSupported({ name: 'setup.exe', type: 'application/x-msdownload' })).toBe(false);
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(attachmentNote({ name: 'report.pdf', type: 'application/pdf', size: 2048 })).toBe('[Attached file: report.pdf (application/pdf, 2 KB)]');
  });

  it('a picked file stages as a removable chip; an unsupported type and an oversize file get friendly errors', () => {
    render(<ChatWidget {...chatProps} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    const filesInput = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[2];

    pickFile(filesInput, new File(['hello'], 'setup.exe', { type: 'application/x-msdownload' }));
    expect(screen.getByRole('alert').textContent).toContain("isn't supported");
    expect(screen.queryByTestId('chat-attachment-chip')).toBeNull();

    pickFile(filesInput, new File([new Uint8Array(11 * 1024 * 1024)], 'tour.mp4', { type: 'video/mp4' }));
    expect(screen.getByRole('alert').textContent).toContain('too large');

    pickFile(filesInput, new File(['%PDF-1.4'], 'report.pdf', { type: 'application/pdf' }));
    const chip = screen.getByTestId('chat-attachment-chip');
    expect(chip.textContent).toContain('report.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }));
    expect(screen.queryByTestId('chat-attachment-chip')).toBeNull();
  });

  it('an attachment alone can be sent: the thread shows the chip and the payload carries the note', async () => {
    render(<ChatWidget {...chatProps} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    const filesInput = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[2];
    pickFile(filesInput, new File(['%PDF-1.4'], 'report.pdf', { type: 'application/pdf' }));
    // Send appears for the staged attachment even with an empty field.
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(screen.getByTestId('chat-message-attachment')).toBeTruthy());
    expect(screen.getByTestId('chat-message-attachment').textContent).toContain('report.pdf');
    const call = mocks.invoke.mock.calls.find(([name]) => name === 'retell-web-call') as unknown as [string, { body: { messages: { role: string; content: string }[] } }];
    expect(call[1].body.messages.at(-1)?.content).toContain('[Attached file: report.pdf (application/pdf,');
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });
  });
});

describe('photo vision — she actually sees attached photos (Ron, 2026-11-16)', () => {
  const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  let originalImage: unknown;
  let toBlobImpl: (cb: (b: Blob | null) => void) => void;

  class FakeImage {
    naturalWidth = 4000;
    naturalHeight = 3000;
    width = 4000;
    height = 3000;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }

  beforeEach(() => {
    originalImage = (globalThis as Record<string, unknown>).Image;
    (globalThis as Record<string, unknown>).Image = FakeImage;
    toBlobImpl = (cb) => cb(new Blob([JPEG_BYTES], { type: 'image/jpeg' }));
    (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = () => ({ drawImage: () => undefined });
    (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).toBlob = function (cb: (b: Blob | null) => void) { toBlobImpl(cb); };
    (URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:mock';
    (URL as unknown as Record<string, unknown>).revokeObjectURL = () => undefined;
  });
  afterEach(() => {
    (globalThis as Record<string, unknown>).Image = originalImage;
  });

  it('prepareImagePayload downscales a 4000×3000 shot to a 1568px-edge JPEG payload', async () => {
    let drawnCanvas: HTMLCanvasElement | null = null;
    (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = function (this: HTMLCanvasElement) {
      drawnCanvas = this;
      return { drawImage: () => undefined };
    };
    const prep = await prepareImagePayload(new File([JPEG_BYTES], 'yard.jpg', { type: 'image/jpeg' }));
    expect(prep).toEqual({ image: { data: Buffer.from(JPEG_BYTES).toString('base64'), mimeType: 'image/jpeg' } });
    expect(drawnCanvas!.width).toBe(1568);
    expect(drawnCanvas!.height).toBe(1176);
  });

  it('prepareImagePayload ignores non-images and refuses a payload still over the cap after downscaling', async () => {
    expect(await prepareImagePayload(new File(['x'], 'report.pdf', { type: 'application/pdf' }))).toBeNull();
    toBlobImpl = (cb) => cb(new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'image/jpeg' }));
    expect(await prepareImagePayload(new File([JPEG_BYTES], 'huge.jpg', { type: 'image/jpeg' }))).toEqual({ error: 'too-large' });
  });

  it('sending a photo carries the downscaled image in the chat payload, next to the note', async () => {
    render(<ChatWidget {...chatProps} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    const photosInput = document.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
    pickFile(photosInput, new File([JPEG_BYTES], 'yard.jpg', { type: 'image/jpeg' }));
    expect(screen.getByTestId('chat-attachment-chip').textContent).toContain('yard.jpg');
    const field = screen.getByLabelText(/message aspen/i);
    fireEvent.change(field, { target: { value: 'Can you fix a roof like this?' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(mocks.invoke.mock.calls.some(([name]) => name === 'retell-web-call')).toBe(true));
    const call = mocks.invoke.mock.calls.find(([name]) => name === 'retell-web-call') as unknown as [string, { body: { image?: { data: string; mimeType: string }; messages: { role: string; content: string }[] } }];
    expect(call[1].body.image).toEqual({ data: Buffer.from(JPEG_BYTES).toString('base64'), mimeType: 'image/jpeg' });
    expect(call[1].body.messages.at(-1)?.content).toContain('[Attached file: yard.jpg (image/jpeg,');
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });
  });

  it('server pin: the chat endpoint validates the image and attaches it to the last user message as an image_url part', () => {
    const fn = readFileSync(path.join(__dirname, '..', '..', 'supabase/functions/retell-web-call/index.ts'), 'utf8');
    expect(fn).toContain("const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];");
    expect(fn).toContain('const MAX_IMAGE_BASE64_CHARS = 5_600_000;');
    expect(fn).toContain("{ type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageData.replace(/\\s+/g, '')}` } }");
    expect(fn).toContain('...outboundMessages,');
    // Text-only behaviour is preserved when no image validates.
    expect(fn).toContain('let outboundMessages = chatMessages;');
  });
});

describe('reply actions + two-side colours', () => {
  // Read-aloud (Ron, 2026-11-16 fix): Listen must speak in the
  // presenter's own Gemini voice — synthesized by the chat-read-aloud
  // function — never the browser's speechSynthesis robot voice.
  class FakeAudio {
    static instances: FakeAudio[] = [];
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play = vi.fn(async () => undefined);
    pause = vi.fn();
    constructor(public src: string) { FakeAudio.instances.push(this); }
  }
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalAudio: unknown;
  let originalFetch: unknown;

  const sendOneMessage = async () => {
    render(<ChatWidget {...chatProps} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    const field = screen.getByLabelText(/message aspen/i);
    fireEvent.change(field, { target: { value: 'Tell me about pricing' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });
    await waitFor(() => expect(screen.getAllByTestId('chat-message-actions')).toHaveLength(2));
    return screen.getAllByTestId('chat-message-actions').at(-1) as HTMLElement;
  };

  beforeEach(() => {
    FakeAudio.instances = [];
    originalAudio = (globalThis as Record<string, unknown>).Audio;
    originalFetch = (globalThis as Record<string, unknown>).fetch;
    (globalThis as Record<string, unknown>).Audio = FakeAudio;
    (URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:mock-reply-audio';
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['RIFF....WAVE'], { type: 'audio/wav' }) }));
    (globalThis as Record<string, unknown>).fetch = fetchMock;
  });
  afterEach(() => {
    (globalThis as Record<string, unknown>).Audio = originalAudio;
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  });

  it('her replies carry read-aloud, copy and local thumbs; the two sides wear different colours', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const actions = await sendOneMessage();

    const bubbles = screen.getAllByTestId('chat-message-bubble');
    const userBubble = bubbles.find((b) => b.getAttribute('data-side') === 'user');
    const aspenBubble = bubbles.find((b) => b.getAttribute('data-side') === 'assistant' && b.textContent?.includes('Happy to help'));
    expect(userBubble?.className).toContain('bg-primary');
    expect(aspenBubble?.className).toContain('bg-accent/15');
    expect(aspenBubble?.className).not.toContain('bg-primary');

    expect(actions).toBeTruthy();
    fireEvent.click(within(actions).getByRole('button', { name: 'Copy reply' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Happy to help')));
    const good = within(actions).getByRole('button', { name: 'Good reply' });
    fireEvent.click(good);
    expect(good.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(good);
    expect(good.getAttribute('aria-pressed')).toBe('false');
  });

  it('Listen fetches her Gemini voice from chat-read-aloud (Aspen = Kore), plays it, toggles stop, and replays from cache', async () => {
    const actions = await sendOneMessage();
    const listen = within(actions).getByRole('button', { name: 'Listen to this reply' });

    fireEvent.click(listen);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain('/functions/v1/chat-read-aloud');
    const body = JSON.parse(init.body) as { text: string; voice: string };
    expect(body.text).toContain('Happy to help with that!');
    expect(body.voice).toBe('Kore');
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    expect(FakeAudio.instances[0].src).toBe('blob:mock-reply-audio');
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1);
    expect(listen.getAttribute('aria-pressed')).toBe('true');

    // Second tap stops playback.
    fireEvent.click(listen);
    expect(FakeAudio.instances[0].pause).toHaveBeenCalledTimes(1);
    expect(listen.getAttribute('aria-pressed')).toBe('false');

    // Third tap replays from the in-memory cache — no second fetch.
    fireEvent.click(listen);
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances[1].play).toHaveBeenCalledTimes(1);
  });

  it('a failed synthesis shows the localized error — and never falls back to the browser voice', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 502, blob: async () => new Blob([]) }));
    const actions = await sendOneMessage();
    fireEvent.click(within(actions).getByRole('button', { name: 'Listen to this reply' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("Couldn't play the audio"));
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('source pin: the chat panel never touches the browser speech-synthesis API', () => {
    const source = read('components/landing/demo-results/ChatWidget.tsx');
    expect(source).not.toContain('window.speechSynthesis');
    expect(source).not.toContain('SpeechSynthesisUtterance');
    expect(source).toContain('/functions/v1/chat-read-aloud');
  });
});

describe('read-aloud voice resolution — the presenter\'s assigned Gemini voice per language', () => {
  it('resolves the persona registry voice with the session language remap', () => {
    expect(readAloudVoiceFor(undefined, 'en')).toBe('Kore');
    expect(readAloudVoiceFor('Aspen', undefined)).toBe('Kore');
    expect(readAloudVoiceFor('Aspen', 'pt-BR')).toBe('Despina');
    expect(readAloudVoiceFor('Aspen', 'es')).toBe('Kore');
    expect(readAloudVoiceFor('Frank', 'en')).toBe('Schedar');
    expect(readAloudVoiceFor('Frank', 'pt-BR')).toBe('Alnilam');
    expect(readAloudVoiceFor('Frank', 'es')).toBe('Orus');
    expect(readAloudVoiceFor('Monica', 'en')).toBe('Sulafat');
    expect(readAloudVoiceFor('Monica', 'pt-BR')).toBe('Callirrhoe');
    // An unknown presenter name falls back to Aspen, the chat default.
    expect(readAloudVoiceFor('Somebody New', 'en')).toBe('Kore');
  });
});

describe('one continuous conversation across Voice ⇄ Type', () => {
  const KEY = 'revamp-test-visit';
  beforeEach(() => { visitMemoryDelete(KEY); });

  it('the chat opens on the voice-side thread (no fresh greeting) and typed lines join the same store', async () => {
    visitMemoryAppend(KEY, { role: 'assistant', text: 'Hello! I am Aspen. What kind of business do you run?' });
    visitMemoryAppend(KEY, { role: 'user', text: 'A locksmith business in Dallas.' });
    visitMemoryAppend(KEY, { role: 'divider', text: '' });
    visitMemoryAppend(KEY, { role: 'user', text: '[visit fact] teamIntroSeen: the visitor watched the intro.' });

    render(<ChatWidget {...chatProps} memoryKey={KEY} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    expect(screen.getByText('Hello! I am Aspen. What kind of business do you run?')).toBeTruthy();
    expect(screen.getByText('A locksmith business in Dallas.')).toBeTruthy();
    // No canned greeting, no divider, no [visit fact] plumbing in the thread.
    expect(screen.queryByText(/Tap a suggestion below/)).toBeNull();
    expect(threadFromVisitMemory(KEY)).toHaveLength(2);

    const field = screen.getByLabelText(/message aspen/i);
    fireEvent.change(field, { target: { value: 'What does it cost?' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(screen.getByText(/Happy to help with that!/)).toBeTruthy(), { timeout: 15000 });
    // The reply joins the store when its stream completes (a beat
    // after the full text first renders), so poll the store too.
    await waitFor(() => {
      const stored = visitMemoryGet(KEY).map((turn) => `${turn.role}:${turn.text}`);
      expect(stored).toContain('user:What does it cost?');
      expect(stored).toContain('assistant:Happy to help with that!');
    });
  });

  it('turns spoken while the chat was inactive join the thread on reactivation', () => {
    const view = render(<ChatWidget {...chatProps} memoryKey={KEY} active={false} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    visitMemoryAppend(KEY, { role: 'assistant', text: 'Welcome back — shall we pick up on pricing?' });
    visitMemoryAppend(KEY, { role: 'user', text: 'Yes, go ahead.' });
    view.rerender(<ChatWidget {...chatProps} memoryKey={KEY} active />);
    expect(screen.getByText('Welcome back — shall we pick up on pricing?')).toBeTruthy();
    expect(screen.getByText('Yes, go ahead.')).toBeTruthy();
  });
});

describe('keyboard fit + focus toggle + mic gate diagnostics — source pins', () => {
  it('the embedded message list carries no dvh cap, so flex absorbs the keyboard squeeze', () => {
    const source = read('components/landing/demo-results/ChatWidget.tsx');
    expect(source).not.toContain('max-h-[35dvh]');
    expect(source).toContain("'min-h-0 flex-1'");
  });

  it('the chat panel floor is capped against the visual-viewport height var, and chat mode widens the shell', () => {
    const css = read('index.css');
    expect(css).toContain('.aspen-chat-dock .aspen-panel { min-height: min(20rem, max(0px, calc(var(--aspen-available-height, 20rem) - 11rem))); }');
    expect(css).toContain('.aspen-person-expanded.aspen-person-chat { width: min(28rem, calc(100vw - 16px)); }');
  });

  it('the voice transcript wears the same two-side colours as the chat thread', () => {
    const source = read('components/GeminiConversation.tsx');
    expect(source).toContain('rounded-md bg-accent/15 px-2 py-1 text-sm font-bold leading-6 text-foreground');
    expect(source).toContain('bg-primary text-primary-foreground text-xs px-2 py-1');
  });

  it('micDiag stamps carry the ambient floor and the active noise filter', () => {
    const flow = createMicFlowState();
    const withEnv = micDiagStamp({ event: 'end', flow, permission: 'granted', track: 'live', inputSec: 1.5, ambientFloor: 0.0123, noiseFilter: 'strong' });
    expect(micDiagDetail(withEnv)).toContain('amb=0.0123');
    expect(micDiagDetail(withEnv)).toContain('nf=strong');
    // Without the gate context the historical detail shape is unchanged.
    const legacy = micDiagStamp({ event: 'end', flow, permission: 'granted', track: 'live', inputSec: 1.5 });
    expect(micDiagDetail(legacy)).toBe('ev=end;perm=granted;track=live;flow=0;first=-;frames=0;sec=1.5;fired=0');
    const convo = read('components/GeminiConversation.tsx');
    expect(convo).toContain('ambientFloor: ambientTrackerRef.current.floor, noiseFilter: noiseFilterRef.current');
  });
});
