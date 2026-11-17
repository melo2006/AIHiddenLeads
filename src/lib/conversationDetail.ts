// Conversation detail shaping for the admin record views
// (ConversationRecordsView, PageVisitorsView expansion, Call History and
// Demo History call cards). One shared renderer
// (components/crm/ConversationDetail.tsx) consumes what this module
// derives from the stored record payload:
//
//   · mergeTranscriptFragments — the voice proxy stores Gemini's streamed
//     output/input transcriptions as one {role, text} entry per fragment
//     ("Good afternoon, and" / "thanks for calling" / …). Reading those
//     raw is troubleshooting data, not a conversation; consecutive
//     same-speaker fragments merge back into the turn that was spoken.
//   · parseTranscriptString — call_history stores the same fragments as
//     one "role: text" line per fragment; this rebuilds the fragments.
//   · parseConversationSummary — the record's summary JSON. Summaries
//     written before the tone/intent/lead fields existed carry only
//     {summary, needs, nextSteps, outreachDraft}; the new fields are
//     optional end to end and are dropped here when malformed, so old
//     records render unchanged.
//   · Segment timing — audio segments are checkpoint WAV files
//     (mono PCM16, caller 16 kHz / assistant 24 kHz, 44-byte header),
//     so a segment's duration is exact from its byte size. Turn offsets
//     are the start offset of the segment a turn is assigned to
//     (assignment: per speaker, proportional by text length against
//     segment durations — word positions are estimates without provider
//     timestamps). When any duration is unknown, offsets are omitted
//     entirely rather than guessed.

export interface TranscriptFragment {
  role: string;
  text: string;
}

export type DialogueSpeaker = 'caller' | 'assistant' | 'other';

export interface DialogueTurn {
  speaker: DialogueSpeaker;
  /** Display label: 'Caller', 'Assistant', or the original role. */
  label: string;
  text: string;
  /** How many stored fragments merged into this turn. */
  fragmentCount: number;
}

const CALLER_ROLES = new Set(['caller', 'user', 'visitor', 'customer', 'human']);
const ASSISTANT_ROLES = new Set(['assistant', 'agent', 'ai', 'aspen', 'bot']);

export function speakerOf(role: string): { speaker: DialogueSpeaker; label: string } {
  const key = (role || '').trim().toLowerCase();
  if (CALLER_ROLES.has(key)) return { speaker: 'caller', label: 'Caller' };
  if (ASSISTANT_ROLES.has(key)) return { speaker: 'assistant', label: 'Assistant' };
  const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unknown';
  return { speaker: 'other', label };
}

/** Merge consecutive fragments from the same speaker into single turns.
 *  Fragments are joined with one space; empty fragments are dropped. */
export function mergeTranscriptFragments(
  fragments: readonly TranscriptFragment[] | null | undefined,
): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  for (const fragment of fragments ?? []) {
    const text = (fragment?.text ?? '').trim();
    if (!text) continue;
    const { speaker, label } = speakerOf(fragment?.role ?? '');
    const last = turns[turns.length - 1];
    if (last && last.speaker === speaker && last.label === label) {
      last.text = `${last.text} ${text}`;
      last.fragmentCount += 1;
    } else {
      turns.push({ speaker, label, text, fragmentCount: 1 });
    }
  }
  return turns;
}

const KNOWN_LINE_ROLES = new Set([...CALLER_ROLES, ...ASSISTANT_ROLES, 'system']);

/** Rebuild fragments from a call_history transcript string — one
 *  "role: text" line per stored fragment. Lines without a known role
 *  prefix are continuations of the previous fragment. Text that has no
 *  role lines at all comes back as a single unlabeled fragment. */
export function parseTranscriptString(transcript: string | null | undefined): TranscriptFragment[] {
  const fragments: TranscriptFragment[] = [];
  for (const line of (transcript ?? '').split('\n')) {
    const match = /^([A-Za-z]+):\s+(.*)$/.exec(line);
    if (match && KNOWN_LINE_ROLES.has(match[1].toLowerCase())) {
      fragments.push({ role: match[1].toLowerCase(), text: match[2] });
    } else if (fragments.length) {
      const prev = fragments[fragments.length - 1];
      prev.text = `${prev.text} ${line.trim()}`.trim();
    } else if (line.trim()) {
      fragments.push({ role: 'transcript', text: line.trim() });
    }
  }
  return fragments.filter((f) => f.text.trim().length > 0);
}

// ---------------------------------------------------------------------------
// "Didn't catch that" family — the practical signal that the assistant
// struggled to hear the caller. Counted on merged assistant turns, so a
// clarification spoken across several fragments counts once.

const CLARIFICATION_PATTERNS: RegExp[] = [
  /didn'?t (quite )?(catch|hear|get|understand)/i,
  /did not (catch|hear|understand)/i,
  /not sure I (caught|heard|understood|got that)/i,
  /(could|can|would) you (please )?(repeat|say that again)/i,
  /say that again/i,
  /you'?re breaking up/i,
  /connection (is|was) breaking/i,
];

export function isClarificationTurn(text: string): boolean {
  return CLARIFICATION_PATTERNS.some((pattern) => pattern.test(text));
}

export function countClarifications(turns: readonly DialogueTurn[]): number {
  return turns.filter((turn) => turn.speaker === 'assistant' && isClarificationTurn(turn.text)).length;
}

// ---------------------------------------------------------------------------
// Summary JSON — old shape and extended shape.

export const CALLER_TONES = ['calm', 'interested', 'frustrated', 'angry', 'neutral'] as const;
export type CallerTone = (typeof CALLER_TONES)[number];
export const LEAD_RATINGS = ['hot', 'warm', 'cold'] as const;
export type LeadRating = (typeof LEAD_RATINGS)[number];

export interface ConversationSummary {
  summary: string;
  needs: string[];
  nextSteps: string[];
  outreachDraft?: string;
  /** AI assessment of the caller's tone (extended summaries only). */
  callerTone?: CallerTone;
  /** One line of transcript evidence for the tone. */
  toneEvidence?: string;
  /** One line: what the caller wanted. */
  intent?: string;
  /** AI assessment of follow-up value (extended summaries only). */
  leadRating?: LeadRating;
  /** One line supporting the rating. */
  leadReason?: string;
}

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];

/** Normalize a stored summary payload. Accepts the JSON object the
 *  summarizer writes (either shape) and the plain-string summary
 *  call_history rows carry. Returns null when there is no usable
 *  summary text. Invalid tone/rating values are dropped, never kept. */
export function parseConversationSummary(raw: unknown): ConversationSummary | null {
  if (typeof raw === 'string') {
    const summary = nonEmptyString(raw);
    return summary ? { summary, needs: [], nextSteps: [] } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const summary = nonEmptyString(record.summary);
  if (!summary) return null;
  const toneRaw = typeof record.callerTone === 'string' ? record.callerTone.trim().toLowerCase() : '';
  const ratingRaw = typeof record.leadRating === 'string' ? record.leadRating.trim().toLowerCase() : '';
  return {
    summary,
    needs: stringList(record.needs),
    nextSteps: stringList(record.nextSteps),
    outreachDraft: nonEmptyString(record.outreachDraft),
    callerTone: (CALLER_TONES as readonly string[]).includes(toneRaw) ? (toneRaw as CallerTone) : undefined,
    toneEvidence: nonEmptyString(record.toneEvidence),
    intent: nonEmptyString(record.intent),
    leadRating: (LEAD_RATINGS as readonly string[]).includes(ratingRaw) ? (ratingRaw as LeadRating) : undefined,
    leadReason: nonEmptyString(record.leadReason),
  };
}

// ---------------------------------------------------------------------------
// Segment timing.

/** "0:07", "1:20", "12:05" — session offsets and durations. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Recording sample rates from the capture pipeline
 *  (supabase/functions/gemini-live-proxy): caller audio is stored at
 *  16 kHz, assistant audio at 24 kHz, both mono PCM16 under a 44-byte
 *  WAV header — so byte size gives an exact segment duration. */
export const SEGMENT_SAMPLE_RATES: Record<string, number> = { caller: 16000, assistant: 24000 };
export const WAV_HEADER_BYTES = 44;

export function wavDurationSeconds(contentLength: number | null | undefined, speaker: string): number | null {
  const rate = SEGMENT_SAMPLE_RATES[(speaker || '').trim().toLowerCase()];
  if (!rate || contentLength == null || !Number.isFinite(contentLength)) return null;
  const dataBytes = contentLength - WAV_HEADER_BYTES;
  if (dataBytes <= 0) return null;
  return dataBytes / (rate * 2);
}

export interface SegmentTimingInput {
  speaker: string;
  durationSeconds: number | null;
}

export interface SegmentTiming {
  /** Start offset (seconds from session start) per segment, or null
   *  entries when timing is unavailable. */
  segmentStartSeconds: (number | null)[];
  /** Segment index each turn is assigned to (same length as turns). */
  turnSegmentIndex: (number | null)[];
  /** Start offset of each turn's segment (same length as turns). */
  turnOffsetSeconds: (number | null)[];
}

/** Assign turns to audio segments and derive offsets. Requires every
 *  segment duration; if any is unknown the whole timing comes back
 *  null (offsets are omitted, never guessed). Assignment is per
 *  speaker: a turn is placed in the segment whose share of that
 *  speaker's total recorded duration contains the turn's midpoint
 *  share of that speaker's total text — monotonic within a speaker. */
export function assignSegmentTiming(
  turns: readonly DialogueTurn[],
  segments: readonly SegmentTimingInput[],
): SegmentTiming {
  const none: SegmentTiming = {
    segmentStartSeconds: segments.map(() => null),
    turnSegmentIndex: turns.map(() => null),
    turnOffsetSeconds: turns.map(() => null),
  };
  if (!segments.length || !turns.length) return none;
  if (segments.some((s) => s.durationSeconds == null || !(s.durationSeconds > 0))) return none;

  const starts: number[] = [];
  let cursor = 0;
  for (const segment of segments) {
    starts.push(cursor);
    cursor += segment.durationSeconds as number;
  }

  const turnSegmentIndex: (number | null)[] = turns.map(() => null);
  for (const speaker of ['caller', 'assistant', 'other'] as const) {
    const segIdxs = segments
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => speakerOf(s.speaker).speaker === speaker)
      .map(({ i }) => i);
    const turnIdxs = turns
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.speaker === speaker)
      .map(({ i }) => i);
    if (!segIdxs.length || !turnIdxs.length) continue;
    const totalDuration = segIdxs.reduce((sum, i) => sum + (segments[i].durationSeconds as number), 0);
    const totalWeight = turnIdxs.reduce((sum, i) => sum + Math.max(1, turns[i].text.length), 0);
    let cumWeight = 0;
    let segCursor = 0; // position within segIdxs
    let segCumDuration = segments[segIdxs[0]].durationSeconds as number;
    for (const turnIdx of turnIdxs) {
      const weight = Math.max(1, turns[turnIdx].text.length);
      const midpoint = ((cumWeight + weight / 2) / totalWeight) * totalDuration;
      while (segCursor < segIdxs.length - 1 && midpoint > segCumDuration) {
        segCursor += 1;
        segCumDuration += segments[segIdxs[segCursor]].durationSeconds as number;
      }
      turnSegmentIndex[turnIdx] = segIdxs[segCursor];
      cumWeight += weight;
    }
  }

  return {
    segmentStartSeconds: starts,
    turnSegmentIndex,
    turnOffsetSeconds: turnSegmentIndex.map((segIdx) => (segIdx == null ? null : starts[segIdx])),
  };
}
