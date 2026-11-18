import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CallHistoryView from '@/components/crm/CallHistoryView';

// Call History Gemini recording join (Ron, 2026-11-17): a Gemini
// call's audio lives on the session's Private conversation record
// (conversation_records.session_ref === call.retell_call_id), not on
// the call_history row. Expanding a Gemini row must resolve that
// record lazily and hand its real segments to the shared
// ConversationDetail player — the old "recordings are in Private
// conversation records above" pointer note is gone.

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const RECORD_ID = '11111111-1111-4111-8111-111111111111';

const baseCall = {
  lead_id: null, prospect_id: null, website_url: null,
  owner_name: null, owner_email: null, caller_email: null, caller_phone: null,
  transfer_requested: false, transfer_status: '', transfer_target_phone: null,
  transfer_error: null, trigger_source: null, ended_at: null, metadata: null,
};

const CALLS = [
  {
    ...baseCall,
    id: 'call-gemini-with-record',
    retell_call_id: `gemini_${SESSION_ID}`,
    business_name: 'AI Hidden Leads',
    caller_name: 'Robert',
    call_status: 'completed',
    summary: 'Robert asked about missed calls.',
    transcript: 'assistant: Good afternoon, and\nassistant: thanks for calling\ncaller: My name is Robert.',
    recording_url: null,
    duration_seconds: 80,
    started_at: minutesAgo(61), created_at: minutesAgo(60),
    metadata: { end_reason: 'user_ended' },
  },
  {
    ...baseCall,
    id: 'call-gemini-no-record',
    retell_call_id: 'gemini_prebucket_session',
    business_name: 'Old Shop',
    caller_name: 'Nancy',
    call_status: 'completed',
    summary: null,
    transcript: 'caller: Hello?',
    recording_url: null,
    duration_seconds: 30,
    started_at: minutesAgo(3001), created_at: minutesAgo(3000),
  },
  {
    ...baseCall,
    id: 'call-retell',
    retell_call_id: 'call_retell123',
    business_name: 'Retell Biz',
    caller_name: 'Tom',
    call_status: 'completed',
    summary: 'A Retell call.',
    transcript: 'user: Hi there\nagent: Hello!',
    recording_url: 'https://example.test/retell-call.mp3',
    duration_seconds: 45,
    started_at: minutesAgo(121), created_at: minutesAgo(120),
  },
];

const RECORD_LIST = [
  {
    id: RECORD_ID, channel: 'voice', business_name: 'AI Hidden Leads', status: 'ended',
    summary_status: 'ready', summary: { summary: 'Robert asked about missed calls.', needs: [], nextSteps: [] },
    recipient_name: 'Robert', recipient_email: null, session_ref: `gemini_${SESSION_ID}`,
    created_at: minutesAgo(60), ended_at: minutesAgo(59),
  },
];

const SEGMENTS = [
  { speaker: 'assistant', url: 'https://example.test/00000-assistant.wav' },
  { speaker: 'caller', url: 'https://example.test/00001-caller.wav' },
];
const SIZES: Record<string, number> = {
  'https://example.test/00000-assistant.wav': 44 + 24000 * 2 * 4,
  'https://example.test/00001-caller.wav': 44 + 16000 * 2 * 2,
};

const RECORD_DETAILS: Record<string, unknown> = {
  [RECORD_ID]: {
    ...RECORD_LIST[0],
    transcript: [
      { role: 'assistant', text: 'Good afternoon, and thanks for calling' },
      { role: 'caller', text: 'My name is Robert.' },
    ],
    audio: SEGMENTS,
  },
};

const state = vi.hoisted(() => ({ calls: [] as unknown[], records: [] as unknown[] }));

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (name: string, opts?: { body?: Record<string, unknown> }) => {
    if (name === 'conversation-records') {
      const action = opts?.body?.action;
      if (action === 'list') return { data: { records: state.records }, error: null };
      if (action === 'read') return { data: { record: RECORD_DETAILS[String(opts?.body?.id)] }, error: null };
      if (action === 'summarize') return { data: { record: RECORD_DETAILS[String(opts?.body?.id)] }, error: null };
    }
    return { data: null, error: null };
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.limit = () => Promise.resolve({
        data: table === 'call_history' ? state.calls : [],
        error: null,
      });
      return chain;
    },
  },
}));

const renderView = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CallHistoryView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const readCalls = () => mocks.invoke.mock.calls.filter(
  ([name, opts]) => name === 'conversation-records' && (opts?.body as Record<string, unknown>)?.action === 'read',
);

beforeEach(() => {
  mocks.invoke.mockClear();
  state.calls = CALLS;
  state.records = RECORD_LIST;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    if (init?.method === 'HEAD') {
      return { headers: { get: (name: string) => (name === 'content-length' ? String(SIZES[url] ?? 0) : null) } };
    }
    throw new Error('unexpected fetch');
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CallHistoryView — Gemini recording join', () => {
  it('plays the matched conversation record inside a Gemini row', async () => {
    renderView();
    const callerLine = await screen.findByText('Robert');
    fireEvent.click(callerLine.closest('button')!);

    // The shared player appears once the record's segments resolve.
    expect(await screen.findByRole('button', { name: /Play conversation/ }, { timeout: 5000 })).toBeTruthy();
    // The record was read exactly once, by its id.
    await waitFor(() => expect(readCalls()).toHaveLength(1));
    expect((readCalls()[0][1]?.body as Record<string, unknown>)?.id).toBe(RECORD_ID);
    // The old pointer note is gone.
    expect(screen.queryByText(/New agreed recordings are in Private conversation records above/)).toBeNull();
    expect(screen.queryByText(/Historical unsaved audio cannot be recovered/)).toBeNull();
  });

  it('shows the plain no-recording line for a Gemini call with no matching record', async () => {
    renderView();
    const callerLine = await screen.findByText('Nancy');
    fireEvent.click(callerLine.closest('button')!);

    expect(await screen.findByText('No recording for this session', undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Play conversation/ })).toBeNull();
    expect(screen.queryByText(/New agreed recordings are in Private conversation records above/)).toBeNull();
    // No record matched, so nothing was read.
    expect(readCalls()).toHaveLength(0);
  });

  it('keeps the Gemini Voice Costs link inside the collapsed Technical details', async () => {
    renderView();
    const callerLine = await screen.findByText('Robert');
    fireEvent.click(callerLine.closest('button')!);
    await screen.findByRole('button', { name: /Play conversation/ }, { timeout: 5000 });

    const link = screen.getByText(/Gemini Voice Costs/);
    const details = link.closest('details');
    expect(details).toBeTruthy();
    expect(details?.hasAttribute('open')).toBe(false);
  });

  it('leaves Retell rows on their own recording_url path', async () => {
    renderView();
    const callerLine = await screen.findByText('Tom');
    fireEvent.click(callerLine.closest('button')!);

    // The single mixed recording still drives the shared player, and
    // the Retell fetch control is still offered.
    expect(await screen.findByRole('button', { name: /Play conversation/ }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeTruthy();
    expect(screen.queryByText('No recording for this session')).toBeNull();
    // No conversation-record read was fired for the Retell row.
    expect(readCalls()).toHaveLength(0);
  });
});
