import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ConversationFormatted from '@/components/ConversationFormatted';
import ConversationCopy from '@/pages/ConversationCopy';
import { mergeTranscriptTurns } from '@/lib/conversationDetail';
import {
  mergeTranscriptTurns as mergeTranscriptTurnsShared,
  transcriptTurnsToText,
} from '../../supabase/functions/_shared/transcript-turns';

// Item 12 (2026-11-21): stored transcripts were persisted as raw
// streaming chunks, so the public copy page, the copy email and the
// admin views rendered dozens of 2–5-word fragments with no banner,
// no CTA and no footer. The fix: the proxy merges chunks into turns
// at persistence (_shared/transcript-turns.ts), every surface merges
// legacy chunked records at render time through the same rule
// (src/lib/conversationDetail.ts), and one shared formatted renderer
// (components/ConversationFormatted) gives page + admin the same
// banner → summary → turns → CTA → footer structure, mirrored in
// email-safe HTML by the conversationCopy email.

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

const FRAGMENTS = [
  { role: 'assistant', text: 'Good morning, and thanks' },
  { role: 'assistant', text: 'for calling AI' },
  { role: 'assistant', text: 'Hidden Leads!' },
  { role: 'caller', text: 'Hi, I keep' },
  { role: 'caller', text: 'missing calls.' },
  { role: 'assistant', text: 'We can fix that.' },
];

const MERGED = [
  { role: 'assistant', text: 'Good morning, and thanks for calling AI Hidden Leads!' },
  { role: 'caller', text: 'Hi, I keep missing calls.' },
  { role: 'assistant', text: 'We can fix that.' },
];

describe('mergeTranscriptTurns — one merge rule, client + Deno twins', () => {
  it('merges consecutive same-speaker fragments into turns (client)', () => {
    expect(mergeTranscriptTurns(FRAGMENTS)).toEqual(MERGED);
  });

  it('merges identically in the proxy persistence helper', () => {
    expect(mergeTranscriptTurnsShared(FRAGMENTS)).toEqual(MERGED);
    expect(mergeTranscriptTurnsShared(FRAGMENTS)).toEqual(mergeTranscriptTurns(FRAGMENTS));
  });

  it('collapses speaker aliases into one turn and keeps the first role', () => {
    const aliased = [
      { role: 'user', text: 'Hello' },
      { role: 'caller', text: 'there.' },
      { role: 'aspen', text: 'Hi!' },
      { role: 'assistant', text: 'How can I help?' },
    ];
    const expected = [
      { role: 'user', text: 'Hello there.' },
      { role: 'aspen', text: 'Hi! How can I help?' },
    ];
    expect(mergeTranscriptTurns(aliased)).toEqual(expected);
    expect(mergeTranscriptTurnsShared(aliased)).toEqual(expected);
  });

  it('drops empty fragments and is a no-op on already-merged turns', () => {
    const withEmpties = [
      { role: 'assistant', text: '  ' },
      { role: 'assistant', text: 'Hello.' },
      { role: 'caller', text: '' },
    ];
    expect(mergeTranscriptTurns(withEmpties)).toEqual([{ role: 'assistant', text: 'Hello.' }]);
    expect(mergeTranscriptTurnsShared(MERGED)).toEqual(MERGED);
    expect(mergeTranscriptTurns(null)).toEqual([]);
    expect(mergeTranscriptTurnsShared(undefined)).toEqual([]);
  });

  it('renders merged turns to the call_history "role: text" storage shape', () => {
    expect(transcriptTurnsToText(MERGED)).toBe(
      'assistant: Good morning, and thanks for calling AI Hidden Leads!\n'
      + 'caller: Hi, I keep missing calls.\n'
      + 'assistant: We can fix that.',
    );
  });
});

const SUMMARY = {
  summary: 'The caller misses calls during the day and wants them answered.',
  needs: ['24/7 answering', 'Call summaries by email'],
  nextSteps: ['Run the free website demo', 'Book a setup call'],
  outreachDraft: 'ADMIN-ONLY DRAFT TEXT',
};

describe('ConversationFormatted — the shared renderer', () => {
  it('renders banner → summary with bullets → merged turns → CTA → footer', async () => {
    const { container } = render(<ConversationFormatted summary={SUMMARY} transcript={FRAGMENTS} />);

    // Banner: logo + wordmark linking to the site.
    const bannerLink = container.querySelector('header a');
    expect(bannerLink?.getAttribute('href')).toBe('https://aihiddenleads.com');

    // Summary in clean sentences, needs/next steps as bullets.
    expect(await screen.findByText('The caller misses calls during the day and wants them answered.')).toBeTruthy();
    expect(screen.getByText('24/7 answering').closest('li')).toBeTruthy();
    expect(screen.getByText('Call summaries by email').closest('li')).toBeTruthy();
    expect(screen.getByText('Run the free website demo').closest('li')).toBeTruthy();
    expect(screen.getByText('Book a setup call').closest('li')).toBeTruthy();

    // Turns: fragments merged into one readable turn each.
    expect(await screen.findByText('Good morning, and thanks for calling AI Hidden Leads!')).toBeTruthy();
    expect(screen.getByText('Hi, I keep missing calls.')).toBeTruthy();

    // CTA block.
    expect(screen.getByText('Plans start at $99/mo')).toBeTruthy();
    expect(screen.getByText('Book another demo').closest('a')?.getAttribute('href')).toBe('https://aihiddenleads.com/demo');
    expect(screen.getByText('Get started').closest('a')?.getAttribute('href')).toBe('https://aihiddenleads.com/plans');

    // Footer with phone + city.
    expect(screen.getByText(/1-877-86-AI WIZ/)).toBeTruthy();
    expect(screen.getByText(/Fort Lauderdale, Florida/)).toBeTruthy();

    // The admin-only outreach draft never reaches a recipient copy.
    expect(screen.queryByText(/ADMIN-ONLY DRAFT TEXT/)).toBeNull();
  });

  it('omits the summary section entirely when no summary is stored', async () => {
    render(<ConversationFormatted summary={null} transcript={FRAGMENTS} />);
    expect(await screen.findByText('Good morning, and thanks for calling AI Hidden Leads!')).toBeTruthy();
    expect(screen.queryByText('AI summary')).toBeNull();
    expect(screen.queryByText('What they need')).toBeNull();
  });

  it('omits the summary section when the stored summary has no usable text', () => {
    render(<ConversationFormatted summary={{ summary: '  ', needs: ['x'], nextSteps: [] }} transcript={[]} />);
    expect(screen.queryByText('AI summary')).toBeNull();
    expect(screen.getByText('No transcript saved.')).toBeTruthy();
  });
});

describe('ConversationCopy page', () => {
  it('renders a real stored record through the shared formatted view', async () => {
    window.location.hash = '#test-token';
    mocks.invoke.mockResolvedValue({
      data: { record: { transcript: FRAGMENTS, summary: SUMMARY, summary_status: 'ready' } },
      error: null,
    });
    render(<ConversationCopy />);
    expect(await screen.findByText('Good morning, and thanks for calling AI Hidden Leads!')).toBeTruthy();
    expect(screen.getByText('Plans start at $99/mo')).toBeTruthy();
    expect(mocks.invoke).toHaveBeenCalledWith('conversation-records', { body: { action: 'copy', token: 'test-token' } });
  });

  it('shows the expired-link alert when the copy action fails', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('nope') });
    render(<ConversationCopy />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('persistence + email wiring (source pins — Deno modules vitest cannot import)', () => {
  const proxy = readFileSync(path.join(__dirname, '..', '..', 'supabase/functions/gemini-live-proxy/index.ts'), 'utf8');
  const mail = readFileSync(path.join(__dirname, '..', '..', 'supabase/functions/_shared/hostinger-mail.ts'), 'utf8');

  it('the proxy merges turns at every transcript persistence site', () => {
    expect(proxy).toContain("from '../_shared/transcript-turns.ts'");
    // conversation_records checkpoint, session checkpoint + final,
    // call_history checkpoint + final.
    expect(proxy.match(/mergeTranscriptTurns\(transcript\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(proxy.match(/transcriptTurnsToText\(mergeTranscriptTurns\(transcript\)\)/g)?.length).toBe(2);
    // No raw-chunk persistence remains.
    expect(proxy).not.toContain('transcript:[...transcript]');
    expect(proxy).not.toContain('transcript.map(t=>');
    expect(proxy).not.toContain('transcript.map(t =>');
  });

  it('the conversation-copy email carries the shared CTA block', () => {
    const ctaStart = mail.indexOf('const conversationCtaBlock');
    const ctaSource = mail.slice(ctaStart, ctaStart + 1200);
    expect(ctaSource).toContain('Plans start at $99/mo');
    expect(ctaSource).toContain("'Book another demo'");
    expect(ctaSource).toContain("'Get started'");
    const copyStart = mail.indexOf('export const conversationCopy');
    const copySource = mail.slice(copyStart, copyStart + 2000);
    expect(copySource).toContain('conversationCtaBlock()');
    expect(copySource).toContain('Plans start at $99/month');
    // The email keeps the expiring-link model: a button to the private
    // copy page, never the transcript inline.
    expect(copySource).toContain('View transcript & AI summary');
  });
});
