import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConversationDetail from '@/components/crm/ConversationDetail';

// Conversation detail rework (Ron, 2026-11-17): the record detail must
// read as a dialogue — fragments merged into turns, one playback
// control for the whole call, the AI summary (with tone / intent /
// lead assessment) on top, and the debug material collapsed under
// Technical details.

const SCREENSHOT_FRAGMENTS = [
  { role: 'assistant', text: 'Good afternoon, and' },
  { role: 'assistant', text: 'thanks for calling' },
  { role: 'assistant', text: 'AI Hidden Leads!' },
  { role: 'assistant', text: "I'm Aspen." },
  { role: 'caller', text: 'My name is Robert.' },
  { role: 'assistant', text: "Sorry, I didn't catch that." },
];

const EXTENDED_SUMMARY = {
  summary: 'Robert asked about missed-call coverage.',
  needs: ['Answering'], nextSteps: ['Send demo link'], outreachDraft: 'Hi Robert…',
  callerTone: 'interested', toneEvidence: 'Asked how soon it could start.',
  intent: 'Wants his missed calls answered', leadRating: 'warm', leadReason: 'Engaged, asked about start date.',
};

// WAV byte sizes for exact durations: caller 2 s @16 kHz, assistant 4 s @24 kHz.
const SEGMENTS = [
  { speaker: 'assistant', url: 'https://example.test/00000-assistant.wav' },
  { speaker: 'caller', url: 'https://example.test/00001-caller.wav' },
  { speaker: 'assistant', url: 'https://example.test/00002-assistant.wav' },
];
const SIZES: Record<string, number> = {
  'https://example.test/00000-assistant.wav': 44 + 24000 * 2 * 4,
  'https://example.test/00001-caller.wav': 44 + 16000 * 2 * 2,
  'https://example.test/00002-assistant.wav': 44 + 24000 * 2 * 4,
};

beforeEach(() => {
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

describe('ConversationDetail', () => {
  it('renders the screenshot fragments as merged dialogue bubbles', async () => {
    render(
      <ConversationDetail
        transcript={SCREENSHOT_FRAGMENTS}
        audioSegments={SEGMENTS}
        summary={EXTENDED_SUMMARY}
        durationSeconds={80}
        expectRecording
      />,
    );
    const merged = await screen.findByText(/Good afternoon, and thanks for calling AI Hidden Leads! I'm Aspen\./);
    expect(merged).toBeTruthy();
    // The fragment survives ONLY as a raw-segment line in Technical
    // details — never as its own bubble.
    expect(screen.getAllByText('Good afternoon, and', { exact: true })).toHaveLength(1);
    expect(screen.getAllByText('My name is Robert.').length).toBeGreaterThan(0);
    // Turn count reflects the merge: 3 turns, not 6 fragments.
    expect(screen.getByText(/Transcript · 3 turns/)).toBeTruthy();
  });

  it('shows the summary card with the AI assessment labeled as such', async () => {
    render(
      <ConversationDetail
        transcript={SCREENSHOT_FRAGMENTS}
        audioSegments={SEGMENTS}
        summary={EXTENDED_SUMMARY}
        durationSeconds={80}
        expectRecording
      />,
    );
    expect(await screen.findByText('Robert asked about missed-call coverage.')).toBeTruthy();
    expect(screen.getByText(/Caller tone: interested/)).toBeTruthy();
    expect(screen.getByText(/Lead: warm/)).toBeTruthy();
    expect(screen.getByText('AI assessment')).toBeTruthy();
    expect(screen.getByText(/Intent:/)).toBeTruthy();
    expect(screen.getByText(/Wants his missed calls answered/)).toBeTruthy();
    // Signals row: duration + the one clarification turn in the fixture.
    expect(screen.getByText(/Duration 1:20/)).toBeTruthy();
    expect(screen.getByText(/catch that” moments: 1/)).toBeTruthy();
  });

  it('offers one Play conversation control and per-turn offsets once durations land', async () => {
    render(
      <ConversationDetail
        transcript={SCREENSHOT_FRAGMENTS}
        audioSegments={SEGMENTS}
        summary={EXTENDED_SUMMARY}
        durationSeconds={80}
        expectRecording
      />,
    );
    expect(screen.getByRole('button', { name: /Play conversation/ })).toBeTruthy();
    // No per-segment <audio controls> players remain.
    expect(document.querySelectorAll('audio[controls]')).toHaveLength(0);
    // Total recorded duration 4+2+4 = 10 s, derived from the WAV sizes.
    expect(await screen.findByText('0:10')).toBeTruthy();
    // First assistant turn offset 0:00 (its segment starts the call).
    await waitFor(() => expect(screen.getAllByText('0:00').length).toBeGreaterThan(0));
    // A bubble-level play button appears for turns with a mapped segment.
    expect(screen.getAllByRole('button', { name: /Play from the/ }).length).toBeGreaterThan(0);
  });

  it('keeps the raw fragments collapsed under Technical details', async () => {
    const { container } = render(
      <ConversationDetail
        transcript={SCREENSHOT_FRAGMENTS}
        audioSegments={SEGMENTS}
        summary={EXTENDED_SUMMARY}
        expectRecording
      />,
    );
    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(screen.getByText('Technical details')).toBeTruthy();
    expect(screen.getByText(/Raw segments · 6 fragments/)).toBeTruthy();
  });

  it('renders old-shape summaries without assessment chips', async () => {
    render(
      <ConversationDetail
        transcript={SCREENSHOT_FRAGMENTS}
        summary={{ summary: 'Old summary text.', needs: ['Answering'], nextSteps: [], outreachDraft: 'draft' }}
        expectRecording={false}
      />,
    );
    expect(await screen.findByText('Old summary text.')).toBeTruthy();
    expect(screen.queryByText(/Caller tone:/)).toBeNull();
    expect(screen.queryByText(/Lead:/)).toBeNull();
  });

  it('shows the plain no-recording note for a voice record without audio', async () => {
    render(
      <ConversationDetail
        transcript={SCREENSHOT_FRAGMENTS}
        audioSegments={[]}
        summary={null}
        expectRecording
      />,
    );
    expect(await screen.findByText('No recording for this session')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Play conversation/ })).toBeNull();
  });
});
