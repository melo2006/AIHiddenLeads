import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatWidget from '@/components/landing/demo-results/ChatWidget';

// Dictation keep-recording (Ron, 2026-11-17): the browser's
// recognition session ends ITSELF on a silence pause or a transient
// error, and the old composer treated that as the visitor finishing
// — truncating him mid-sentence (~10s in). The contract now:
//  * a session that ends on its own restarts seamlessly while the
//    visitor's dictation intent stands, final speech banked across
//    sessions so every sentence lands exactly once;
//  * ONLY the visitor's stop tap (or send / mode switch / unmount)
//    ends a dictation;
//  * a hard mic denial ends it with a notice and never loops;
//  * speech still lands as editable field text, never auto-sent.

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

const chatProps = {
  businessName: 'AI Hidden Leads',
  businessNiche: 'general',
  websiteUrl: 'https://aihiddenleads.com',
  businessInfo: 'AI voice and chat assistants.',
  embedded: true,
  active: true,
};

type FakeResult = { 0: { transcript: string }; isFinal: boolean; length: number };
const result = (transcript: string, isFinal: boolean): FakeResult => ({ 0: { transcript }, isFinal, length: 1 });

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((event: { results: FakeResult[] }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  results: FakeResult[] = [];
  started = false;
  stopped = false;
  aborted = false;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; }
  stop() { this.stopped = true; this.onend?.(); }
  abort() { this.aborted = true; }
  private fire() { this.onresult?.({ results: [...this.results] }); }
  sayInterim(transcript: string) {
    const last = this.results[this.results.length - 1];
    if (last && !last.isFinal) this.results[this.results.length - 1] = result(transcript, false);
    else this.results.push(result(transcript, false));
    this.fire();
  }
  sayFinal(transcript: string) {
    const last = this.results[this.results.length - 1];
    if (last && !last.isFinal) this.results[this.results.length - 1] = result(transcript, true);
    else this.results.push(result(transcript, true));
    this.fire();
  }
  endByItself() { this.onend?.(); }
  fail(code: string) { this.onerror?.({ error: code }); }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function renderChat() {
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  render(<ChatWidget {...chatProps} />);
  fireEvent.click(screen.getByText('Start chat & agree'));
  return {
    mic: screen.getByTestId('chat-dictate-button'),
    field: screen.getByLabelText(/message aspen/i) as HTMLTextAreaElement,
  };
}

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

describe('dictation keep-recording (2026-11-17)', () => {
  it('a session that ends itself mid-dictation restarts; speech continues with no sentence lost or repeated', async () => {
    const { mic, field } = renderChat();
    fireEvent.click(mic);
    expect(FakeRecognition.instances).toHaveLength(1);
    const first = FakeRecognition.instances[0];
    expect(first.started).toBe(true);
    expect(first.continuous).toBe(true);

    act(() => first.sayFinal('I need a quote for my roof.'));
    expect(field.value).toBe('I need a quote for my roof.');

    // The engine ends the session on its own (silence pause) — the
    // visitor has NOT pressed stop, so dictation must continue.
    act(() => first.endByItself());
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    expect(mic.getAttribute('aria-label')).toBe('Stop dictation');

    await waitFor(() => expect(FakeRecognition.instances).toHaveLength(2));
    const second = FakeRecognition.instances[1];
    expect(second.started).toBe(true);
    expect(second.lang).toBe('en-US');

    act(() => second.sayInterim('And also'));
    expect(field.value).toBe('I need a quote for my roof. And also');
    act(() => second.sayFinal('And also for the fence.'));
    expect(field.value).toBe('I need a quote for my roof. And also for the fence.');
    // Still not auto-sent.
    expect(mocks.invoke.mock.calls.some(([name]) => name === 'retell-web-call')).toBe(false);

    // Only the visitor's stop tap ends it — and nothing restarts after.
    fireEvent.click(mic);
    expect(second.stopped).toBe(true);
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    await sleep(600);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(field.value).toBe('I need a quote for my roof. And also for the fence.');
  });

  it('a restarted session re-delivering the last banked sentence does not duplicate it', async () => {
    const { mic, field } = renderChat();
    fireEvent.click(mic);
    const first = FakeRecognition.instances[0];
    act(() => first.sayFinal('Same sentence.'));
    act(() => first.endByItself());
    await waitFor(() => expect(FakeRecognition.instances).toHaveLength(2));
    const second = FakeRecognition.instances[1];
    // The engine replays the banked sentence as the new session's
    // first final, then the visitor keeps talking.
    act(() => second.sayFinal('Same sentence.'));
    expect(field.value).toBe('Same sentence.');
    act(() => second.sayFinal(' A new thought.'));
    expect(field.value).toBe('Same sentence. A new thought.');
    fireEvent.click(mic);
    expect(field.value).toBe('Same sentence. A new thought.');
  });

  it('a transient no-speech error does not end the dictation', async () => {
    const { mic } = renderChat();
    fireEvent.click(mic);
    const first = FakeRecognition.instances[0];
    act(() => first.fail('no-speech'));
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    act(() => first.endByItself());
    await waitFor(() => expect(FakeRecognition.instances).toHaveLength(2));
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(mic);
  });

  it('a mic permission denial stops dictation with a notice and never restarts', async () => {
    const { mic } = renderChat();
    fireEvent.click(mic);
    const first = FakeRecognition.instances[0];
    act(() => first.fail('not-allowed'));
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('alert').textContent).toMatch(/microphone access is blocked/i);
    // The browser still fires onend after the error — it must not
    // resurrect the dictation, and no restart loop may spin up.
    act(() => first.endByItself());
    await sleep(1200);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it('pressing stop while a restart is pending ends the dictation for good', async () => {
    const { mic } = renderChat();
    fireEvent.click(mic);
    const first = FakeRecognition.instances[0];
    // Session dies instantly with nothing heard — a restart is
    // pending on the backoff timer when the visitor taps stop.
    act(() => first.endByItself());
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(mic);
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    await sleep(700);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it('sending the message ends the dictation immediately', async () => {
    const { mic, field } = renderChat();
    fireEvent.click(mic);
    const first = FakeRecognition.instances[0];
    act(() => first.sayFinal('How much does it cost?'));
    expect(field.value).toBe('How much does it cost?');
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    expect(first.aborted).toBe(true);
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    await waitFor(() => expect(mocks.invoke.mock.calls.some(([name]) => name === 'retell-web-call')).toBe(true));
    await sleep(500);
    expect(FakeRecognition.instances).toHaveLength(1);
  });
});
