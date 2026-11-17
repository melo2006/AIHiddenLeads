import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageVisitorsView from '@/components/crm/PageVisitorsView';

// Page Visitors view (Ron, 2026-11-17): one home for homepage visitor
// conversations — voice + typed chat from conversation_records, with
// transcripts, recording segments and per-session cost estimates priced
// by the existing estimator (voice-agents usage action + shared
// audioCost), a Simli line only when the usage ledger recorded a
// video_avatar event, and day subtotals with a Today strip.

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const VOICE_ID = '11111111-1111-4111-8111-111111111111';
const CHAT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

const listFixtures = [
  {
    id: VOICE_ID, channel: 'voice', business_name: 'AI Hidden Leads', status: 'ended',
    summary_status: 'ready', summary: { summary: 'Visitor asked about missed calls.', needs: [], nextSteps: [] },
    recipient_name: 'Robert', recipient_email: null, session_ref: `gemini_${SESSION_ID}`,
    created_at: minutesAgo(70), ended_at: minutesAgo(60),
  },
  {
    id: CHAT_ID, channel: 'chat', business_name: 'AI Hidden Leads', status: 'ended',
    summary_status: 'pending', summary: null,
    recipient_name: null, recipient_email: null, session_ref: 'chat_abc',
    created_at: minutesAgo(30), ended_at: minutesAgo(20),
  },
];

const detailFixtures: Record<string, unknown> = {
  [VOICE_ID]: {
    ...listFixtures[0],
    transcript: [
      { role: 'caller', text: 'Hi, I keep missing calls.' },
      { role: 'assistant', text: 'I can help with that.' },
    ],
    audio: [{ speaker: 'caller', url: 'https://example.com/segment-1.webm' }],
  },
  [CHAT_ID]: {
    ...listFixtures[1],
    transcript: [
      { role: 'user', text: 'How much does it cost?' },
      { role: 'assistant', text: 'Premium is $99 a month.' },
    ],
    audio: [],
  },
};

const state = vi.hoisted(() => ({ list: [] as unknown[] }));

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (name: string, opts?: { body?: Record<string, unknown> }) => {
    if (name === 'conversation-records') {
      const action = opts?.body?.action;
      if (action === 'list') return { data: { records: state.list }, error: null };
      if (action === 'read') return { data: { record: detailFixtures[String(opts?.body?.id)] }, error: null };
      if (action === 'summarize') return { data: { record: detailFixtures[String(opts?.body?.id)] }, error: null };
    }
    if (name === 'voice-agents' && opts?.body?.action === 'usage') {
      return {
        data: {
          pricing: { model: 'gemini-3.8-live', inputAudioPerMinute: 0.03, outputAudioPerMinute: 0.12, source: 'https://ai.google.dev/gemini-api/docs/pricing' },
          sessions: [{
            id: '33333333-3333-4333-8333-333333333333', duration_seconds: 600,
            usage: { model: 'gemini-3.8-live', input_audio_seconds: 300, output_audio_seconds: 150, audio_estimate_usd: null },
          }],
        },
        error: null,
      };
    }
    return { data: null, error: null };
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.limit = () => Promise.resolve({
        data: [{ source_id: '33333333-3333-4333-8333-333333333333', quantity_minutes: 10 }],
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
      <PageVisitorsView />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mocks.invoke.mockClear();
  state.list = listFixtures;
});
afterEach(() => cleanup());

describe('PageVisitorsView', () => {
  it('lists voice and chat conversations with channel badges, visitor name and est. totals', async () => {
    renderView();
    expect(await screen.findByText('Robert')).toBeTruthy();
    expect(screen.getByText('Voice')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('Anonymous visitor')).toBeTruthy();
    // Voice: audioCost(300s in, 150s out) = $0.4500 + Simli 10 min × 49/5500 = $0.0891 → $0.5391
    expect(await screen.findByText('$0.5391')).toBeTruthy();
    // Chat: 10 min × $0.0155 = $0.1550
    expect(screen.getByText('$0.1550')).toBeTruthy();
    // Today strip: both conversations, summed (the Today day-group
    // header shows the same subtotal — both are expected)
    expect(screen.getByText(/Today so far:/)).toBeTruthy();
    expect(screen.getAllByText('$0.6941')).toHaveLength(2);
  });

  it('filters by channel and shows the per-channel empty state', async () => {
    state.list = [listFixtures[1]];
    renderView();
    expect(await screen.findByText('Anonymous visitor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Voice \(0\)/ }));
    expect(await screen.findByText('No voice conversations yet.')).toBeTruthy();
  });

  it('expanding a voice conversation shows summary, cost lines, recording segments and transcript', async () => {
    renderView();
    const header = await screen.findByText('Robert');
    fireEvent.click(header.closest('button')!);
    expect(await screen.findByText('Hi, I keep missing calls.')).toBeTruthy();
    expect(screen.getByText('Visitor asked about missed calls.')).toBeTruthy();
    expect(screen.getByText('Simli video avatar')).toBeTruthy();
    expect(screen.getByText('Gemini voice')).toBeTruthy();
    const audio = document.querySelector('audio');
    expect(audio).toBeTruthy();
    expect(audio?.getAttribute('src')).toBe('https://example.com/segment-1.webm');
  });

  it('expanding a chat conversation shows the transcript with no recording section', async () => {
    renderView();
    const header = await screen.findByText('Anonymous visitor');
    fireEvent.click(header.closest('button')!);
    expect(await screen.findByText('How much does it cost?')).toBeTruthy();
    expect(screen.getByText('Gemini chat')).toBeTruthy();
    expect(screen.queryByText('Simli video avatar')).toBeNull();
    expect(document.querySelector('audio')).toBeNull();
  });

  it('shows the overall empty state when there are no conversations at all', async () => {
    state.list = [];
    renderView();
    expect(await screen.findByText(/No page visitor conversations yet\./)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Today so far:/)).toBeTruthy());
  });
});
