import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatWidget, { CHAT_COMPLETION_TIMEOUT_MS, invokeChatCompletion } from '@/components/landing/demo-results/ChatWidget';
import { HOMEPAGE_SALES_PROMPT } from '../../supabase/functions/_shared/homepage-knowledge';

// Chat outage (Ron, 2026-11-16): typed chat was DOWN on staging and
// live. Root cause: retell-web-call gated its WHOLE handler on
// RETELL_API_KEY, so with the secret unset every action 500'd —
// including chat-completion, which runs on GOOGLE_API_KEY/Gemini and
// never touches Retell. The client caught the error and typed the
// canned fallback, and a hung backend could freeze the panel.
// This batch: (1) the key check is scoped to the Retell-backed
// actions only; (2) Ron's answer-first plan rule lands in the typed
// homepage prompt and the voice sales layer; (3) sends get a 30s
// timeout so a dead backend can never freeze the panel again.

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
const fnSource = read('../supabase/functions/retell-web-call/index.ts');
const chatSource = read('components/landing/demo-results/ChatWidget.tsx');

/** Source between two markers (start inclusive, end exclusive). */
const region = (source: string, start: string, end: string) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  expect(a, `marker not found: ${start}`).toBeGreaterThanOrEqual(0);
  expect(b, `end marker not found: ${end}`).toBeGreaterThan(a);
  return source.slice(a, b);
};

beforeEach(() => {
  mocks.invoke.mockClear();
  mocks.invoke.mockImplementation(async (name: string) => (
    name === 'retell-web-call'
      ? { data: { content: 'Happy to help with that!' }, error: null }
      : { data: null, error: null }
  ));
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('retell-web-call: RETELL_API_KEY gates only the Retell-backed actions', () => {
  it('no blanket guard ahead of the chat branch: nothing between Deno.serve and chat-completion returns the Retell error', () => {
    const head = region(fnSource, 'Deno.serve', "action === 'chat-completion'");
    expect(head).not.toContain('RETELL_API_KEY not configured');
    expect(head).not.toMatch(/if \(!retellApiKey\)/);
  });

  it('chat-completion needs only GOOGLE_API_KEY', () => {
    const chat = region(fnSource, "action === 'chat-completion'", "action === 'get-call-transfer-context'");
    expect(chat).toContain('GOOGLE_API_KEY not configured');
    expect(chat).not.toContain('RETELL_API_KEY not configured');
  });

  it('get-call-transfer-context still fails loudly without the key', () => {
    const branch = region(fnSource, "action === 'get-call-transfer-context'", "action === 'email-call-summary'");
    expect(branch).toContain("if (!retellApiKey)");
    expect(branch).toContain('RETELL_API_KEY not configured');
  });

  it('email-call-summary still fails loudly without the key', () => {
    const branch = region(fnSource, "action === 'email-call-summary'", "action === 'send-recap-email'");
    expect(branch).toContain("if (!retellApiKey)");
    expect(branch).toContain('RETELL_API_KEY not configured');
  });

  it('send-recap-email (Resend + Supabase only) never required the key', () => {
    const branch = region(fnSource, "action === 'send-recap-email'", "action === 'refresh-recording'");
    expect(branch).not.toContain('RETELL_API_KEY not configured');
  });

  it('refresh-recording keeps its own key check', () => {
    const branch = region(fnSource, "action === 'refresh-recording'", "action === 'warm-transfer'");
    expect(branch).toContain('RETELL_API_KEY not configured');
  });

  it('create-web-call (the default fall-through) checks the key before any Retell call', () => {
    const tail = fnSource.slice(fnSource.indexOf("action === 'warm-transfer'"));
    const checkAt = tail.indexOf('RETELL_API_KEY not configured');
    const firstRetellUseAt = tail.indexOf('ensureSharedRetellPrompt(retellApiKey');
    expect(checkAt).toBeGreaterThanOrEqual(0);
    expect(firstRetellUseAt).toBeGreaterThan(checkAt);
    // Four loud checks in total: transfer-context, email-summary,
    // refresh-recording, create-web-call.
    expect(fnSource.split('RETELL_API_KEY not configured').length - 1).toBeGreaterThanOrEqual(4);
  });
});

describe('answer-first plan rule — typed chat prompt', () => {
  const sendAndCapturePrompt = async (props: Record<string, unknown>, fieldLabel: RegExp) => {
    render(<ChatWidget {...(props as never)} />);
    fireEvent.click(screen.getByText('Start chat & agree'));
    const field = screen.getByLabelText(fieldLabel) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Do you have an unlimited plan?' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));
    await waitFor(() => expect(mocks.invoke.mock.calls.some(([name]) => name === 'retell-web-call')).toBe(true));
    const call = mocks.invoke.mock.calls.find(([name]) => name === 'retell-web-call') as unknown as [string, { body: { systemPrompt: string } }];
    return call[1].body.systemPrompt;
  };

  it('homepage Aspen chat carries the rule with the exact plan table', async () => {
    const prompt = await sendAndCapturePrompt({
      businessName: 'AI Hidden Leads',
      businessNiche: 'general',
      websiteUrl: 'https://aihiddenleads.com',
      businessInfo: 'AI voice and chat assistants.',
      embedded: true,
      active: true,
    }, /message aspen/i);
    expect(prompt).toContain('AI HIDDEN LEADS PLANS — ANSWER FIRST');
    expect(prompt).toContain('ANSWER directly and truthfully FIRST');
    expect(prompt).toContain('There is NO unlimited plan and NO Enterprise plan');
    // Chat-fix6: the plan table now leads with DOLLARS (Ron's
    // "how much" was answered in minutes only); minutes remain as
    // supporting detail in the same line.
    expect(prompt).toContain('Premium ($99/month — 400 minutes');
    expect(prompt).toContain('Professional ($199/month — 1,200 minutes');
    expect(prompt).toContain('Platinum ($349/month — 2,500 minutes');
    expect(prompt).toContain('Never answer a money question with minutes alone');
    expect(prompt).toContain('sales director can sometimes arrange custom terms');
    expect(prompt).toContain('never instead of answering');
  });

  it('presenter demo chats answer for the demo business — no AiHiddenLeads plan rule', async () => {
    const prompt = await sendAndCapturePrompt({
      businessName: 'Martinez Realty',
      businessNiche: 'realtors',
      websiteUrl: 'https://martinez.example.com',
      businessInfo: 'A real estate brokerage.',
      presenterName: 'Frank',
      embedded: true,
      active: true,
    }, /message frank/i);
    expect(prompt).not.toContain('AI HIDDEN LEADS PLANS — ANSWER FIRST');
    expect(prompt).not.toContain('custom terms');
  });

  it('prospect simulation chats never see the plan rule either', async () => {
    const prompt = await sendAndCapturePrompt({
      businessName: 'Acme Roofing LLC',
      businessNiche: 'roofing',
      websiteUrl: 'https://acme.example.com',
      businessInfo: 'A roofing company.',
      embedded: true,
      active: true,
    }, /message aspen/i);
    expect(prompt).not.toContain('AI HIDDEN LEADS PLANS — ANSWER FIRST');
    expect(prompt).not.toContain('custom terms');
  });
});

describe('answer-first plan rule — voice sales layer', () => {
  it('HOMEPAGE_SALES_PROMPT answers first and opens the custom-terms door only after', () => {
    expect(HOMEPAGE_SALES_PROMPT).toContain('answer the question directly and truthfully FIRST');
    expect(HOMEPAGE_SALES_PROMPT).toContain('there is no unlimited plan');
    expect(HOMEPAGE_SALES_PROMPT).toContain('the top plan is Platinum at 2,500 minutes');
    expect(HOMEPAGE_SALES_PROMPT).toContain('sales director can sometimes arrange custom terms for larger needs');
    expect(HOMEPAGE_SALES_PROMPT).toContain('never use a meeting, a callback or a manager handoff to dodge a plan question');
    expect(HOMEPAGE_SALES_PROMPT).toContain('never quote a price for a plan that does not exist');
  });
});

describe('chat send timeout — a hung backend can never freeze the panel', () => {
  it('the cap is 30 seconds', () => {
    expect(CHAT_COMPLETION_TIMEOUT_MS).toBe(30_000);
  });

  it('sendToAI routes through the timeout wrapper, not a bare invoke', () => {
    const sendToAI = region(chatSource, 'const sendToAI', 'const typeAssistantResponse');
    expect(sendToAI).toContain('invokeChatCompletion({');
    expect(sendToAI).not.toContain('supabase.functions.invoke');
    expect(chatSource).toContain('signal: controller.signal');
  });

  it('a healthy invoke passes its result through, with an AbortSignal attached', async () => {
    const result = await invokeChatCompletion({ action: 'chat-completion' });
    expect(result.data).toEqual({ content: 'Happy to help with that!' });
    const call = mocks.invoke.mock.calls.at(-1) as unknown as [string, { body: unknown; signal: AbortSignal }];
    expect(call[0]).toBe('retell-web-call');
    expect(call[1].signal).toBeInstanceOf(AbortSignal);
    expect(call[1].signal.aborted).toBe(false);
  });

  it('a hung invoke is aborted at the cap and rejects (handleSend then types the fallback)', async () => {
    mocks.invoke.mockImplementation((_name: string, options?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('AbortError: signal aborted')));
    }) as never);
    await expect(invokeChatCompletion({ action: 'chat-completion' }, 25)).rejects.toThrow(/abort/i);
  });
});
