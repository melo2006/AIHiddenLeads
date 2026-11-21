import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  assignSegmentTiming, countClarifications, formatClock, mergeTranscriptFragments,
  parseConversationSummary, wavDurationSeconds,
  type DialogueTurn, type TranscriptFragment,
} from '@/lib/conversationDetail';
import { SummaryNeedsSteps } from '@/components/ConversationFormatted';

// Shared conversation-record detail: (a) AI summary card, (b) one
// per-call playback control, (c) dialogue bubbles with the stored
// fragments merged back into spoken turns, (d) a collapsed Technical
// details section holding the debug blocks and the raw fragment view.
// Used by ConversationRecordsView, the PageVisitorsView expansion, and
// the Call History / Demo History call cards — the surfaces that used
// to render fragments one-per-line with a bare <audio> per segment.
// Presentation only: capture and storage are untouched. Item 12
// (2026-11-21): the summary card's needs/next steps are the shared
// SummaryNeedsSteps bullets from components/ConversationFormatted, so
// admin and the public copy page format a summary identically; the
// turn merge below shares its rule with the proxy's persistence-time
// merge (_shared/transcript-turns.ts).

export interface ConversationAudioSegment {
  speaker: string;
  url: string;
}

interface DialogueBubblesProps {
  turns: DialogueTurn[];
  turnOffsetSeconds?: (number | null)[];
  turnSegmentIndex?: (number | null)[];
  activeSegmentIndex?: number | null;
  onPlaySegment?: (segmentIndex: number) => void;
  maxHeightClass?: string;
}

export function DialogueBubbles({
  turns, turnOffsetSeconds, turnSegmentIndex, activeSegmentIndex, onPlaySegment,
  maxHeightClass = 'max-h-80',
}: DialogueBubblesProps) {
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (activeSegmentIndex == null || !turnSegmentIndex) return;
    const idx = turnSegmentIndex.findIndex((seg) => seg === activeSegmentIndex);
    if (idx < 0) return;
    try {
      bubbleRefs.current[idx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch { /* scroll is a nicety; jsdom and older browsers may not implement it */ }
  }, [activeSegmentIndex, turnSegmentIndex]);

  if (!turns.length) {
    return <p className="text-[11px] text-muted-foreground italic">No transcript saved.</p>;
  }
  return (
    <div className={`overflow-y-auto rounded-lg bg-muted/20 p-3 space-y-2.5 ${maxHeightClass}`}>
      {turns.map((turn, i) => {
        const segmentIndex = turnSegmentIndex?.[i] ?? null;
        const offset = turnOffsetSeconds?.[i] ?? null;
        const active = segmentIndex != null && segmentIndex === activeSegmentIndex;
        const alignEnd = turn.speaker === 'caller';
        return (
          <div key={i} className={`flex flex-col ${alignEnd ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1.5 px-1 pb-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{turn.label}</span>
              {offset != null && <span className="text-[10px] tabular-nums text-muted-foreground">{formatClock(offset)}</span>}
              {segmentIndex != null && onPlaySegment && (
                <button
                  type="button"
                  aria-label={`Play from the ${turn.label.toLowerCase()} turn at ${offset != null ? formatClock(offset) : 'this point'}`}
                  onClick={() => onPlaySegment(segmentIndex)}
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20"
                >
                  <Play className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            <div
              ref={(el) => { bubbleRefs.current[i] = el; }}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                turn.speaker === 'caller'
                  ? 'rounded-br-sm bg-primary text-primary-foreground'
                  : turn.speaker === 'assistant'
                    ? 'rounded-bl-sm bg-muted text-foreground'
                    : 'rounded-bl-sm bg-muted/60 text-foreground'
              } ${active ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
            >
              {turn.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Segment durations: exact WAV math from the byte size when the
 *  segment is one of the pipeline's PCM WAVs (HEAD → content-length),
 *  with an audio-metadata probe as the fallback for anything else. */
function useSegmentDurations(segments: ConversationAudioSegment[]): (number | null)[] {
  const [durations, setDurations] = useState<(number | null)[]>(() => segments.map(() => null));
  const key = segments.map((s) => `${s.speaker}:${s.url}`).join('|');
  useEffect(() => {
    let cancelled = false;
    setDurations(segments.map(() => null));
    segments.forEach((segment, i) => {
      const apply = (d: number | null) => {
        if (cancelled || d == null || !(d > 0) || !Number.isFinite(d)) return;
        setDurations((prev) => {
          if (prev[i] === d) return prev;
          const next = [...prev];
          next[i] = d;
          return next;
        });
      };
      fetch(segment.url, { method: 'HEAD' })
        .then((res) => {
          const len = Number(res.headers.get('content-length'));
          return Number.isFinite(len) && len > 0 ? wavDurationSeconds(len, segment.speaker) : null;
        })
        .catch(() => null)
        .then((d) => {
          if (cancelled) return;
          if (d != null) { apply(d); return; }
          const probe = new Audio();
          probe.preload = 'metadata';
          probe.onloadedmetadata = () => apply(probe.duration);
          probe.onerror = () => apply(null);
          probe.src = segment.url;
        });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return durations;
}

export interface ConversationDetailProps {
  transcript?: TranscriptFragment[] | null;
  audioSegments?: ConversationAudioSegment[] | null;
  /** Stored summary payload (either JSON shape, or a plain string). */
  summary?: unknown;
  /** The view's own Generate-summary control, rendered in the card. */
  summaryAction?: ReactNode;
  summaryError?: string | null;
  durationSeconds?: number | null;
  endReason?: string | null;
  /** Voice records: show the plain no-recording note when the record
   *  holds no audio (sessions before the recordings bucket existed). */
  expectRecording?: boolean;
  /** Extra debug content for the collapsed Technical details section
   *  (e.g. Call History's SMS/WhatsApp recap debug panel). */
  technicalDetails?: ReactNode;
  /** Extra content rendered between the dialogue and Technical
   *  details (e.g. the outreach-draft editor). */
  afterDialogue?: ReactNode;
}

export default function ConversationDetail({
  transcript, audioSegments, summary, summaryAction, summaryError,
  durationSeconds, endReason, expectRecording, technicalDetails, afterDialogue,
}: ConversationDetailProps) {
  const fragments = useMemo<TranscriptFragment[]>(
    () => (transcript ?? []).filter((f) => f && typeof f.text === 'string'),
    [transcript],
  );
  const turns = useMemo(() => mergeTranscriptFragments(fragments), [fragments]);
  const parsedSummary = useMemo(() => parseConversationSummary(summary), [summary]);
  const clarifications = useMemo(() => countClarifications(turns), [turns]);

  const segments = useMemo(
    () => (audioSegments ?? []).filter((s) => s && typeof s.url === 'string' && s.url),
    [audioSegments],
  );
  const durations = useSegmentDurations(segments);
  const timing = useMemo(
    () => assignSegmentTiming(turns, segments.map((s, i) => ({ speaker: s.speaker, durationSeconds: durations[i] }))),
    [turns, segments, durations],
  );
  const totalDuration = durations.every((d) => d != null) && durations.length
    ? durations.reduce((sum, d) => sum + (d as number), 0)
    : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const segmentKey = segments.map((s) => s.url).join('|');
  useEffect(() => {
    setCurrent(null);
    setPlaying(false);
    setPosition(0);
    const el = audioRef.current;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
  }, [segmentKey]);

  const playSegment = (index: number) => {
    const el = audioRef.current;
    if (!el || !segments[index]) return;
    if (current !== index) {
      el.src = segments[index].url;
      setCurrent(index);
      setPosition(0);
    }
    try {
      const result = el.play();
      if (result && typeof result.catch === 'function') result.catch(() => setPlaying(false));
    } catch { setPlaying(false); }
  };
  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); return; }
    if (current != null) {
      try {
        const result = el.play();
        if (result && typeof result.catch === 'function') result.catch(() => setPlaying(false));
      } catch { setPlaying(false); }
      return;
    }
    playSegment(0);
  };
  const stopPlayback = () => {
    const el = audioRef.current;
    if (el) el.pause();
    setCurrent(null);
    setPlaying(false);
    setPosition(0);
  };
  const handleEnded = () => {
    if (current != null && current + 1 < segments.length) {
      playSegment(current + 1);
    } else {
      setPlaying(false);
      setCurrent(null);
      setPosition(0);
    }
  };

  const elapsed = current != null && timing.segmentStartSeconds[current] != null
    ? (timing.segmentStartSeconds[current] as number) + position
    : null;

  const toneChipClass = (tone: string) =>
    tone === 'interested' ? 'bg-green-500/20 text-green-400 border-green-500/30'
    : tone === 'frustrated' || tone === 'angry' ? 'bg-destructive/20 text-destructive border-destructive/30'
    : 'bg-muted text-muted-foreground border-border';
  const ratingChipClass = (rating: string) =>
    rating === 'hot' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    : rating === 'warm' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : 'bg-sky-500/20 text-sky-400 border-sky-500/30';

  const hasSignals = durationSeconds != null || turns.length > 0 || Boolean(endReason);

  return (
    <div className="space-y-3">
      {/* (a) Summary card */}
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">AI summary</p>
          {summaryAction}
        </div>
        {parsedSummary ? (
          <>
            <p className="text-sm">{parsedSummary.summary}</p>
            {parsedSummary.intent && (
              <p className="text-xs"><span className="text-muted-foreground">Intent: </span>{parsedSummary.intent}</p>
            )}
            {(parsedSummary.callerTone || parsedSummary.leadRating) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {parsedSummary.callerTone && (
                  <Badge variant="outline" className={`text-[10px] capitalize ${toneChipClass(parsedSummary.callerTone)}`}>
                    Caller tone: {parsedSummary.callerTone}
                  </Badge>
                )}
                {parsedSummary.leadRating && (
                  <Badge variant="outline" className={`text-[10px] capitalize ${ratingChipClass(parsedSummary.leadRating)}`}>
                    Lead: {parsedSummary.leadRating}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">AI assessment</span>
              </div>
            )}
            {parsedSummary.toneEvidence && (
              <p className="text-[11px] text-muted-foreground italic">Tone evidence: {parsedSummary.toneEvidence}</p>
            )}
            {parsedSummary.leadReason && (
              <p className="text-[11px] text-muted-foreground italic">Lead reason: {parsedSummary.leadReason}</p>
            )}
            {/* Needs / next steps render as the same bulleted lists the
                public copy page shows (shared SummaryNeedsSteps,
                item 12) instead of one " · "-joined line. */}
            <SummaryNeedsSteps needs={parsedSummary.needs} nextSteps={parsedSummary.nextSteps} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No AI summary yet.</p>
        )}
        {summaryError && <p role="alert" className="text-xs text-destructive">{summaryError}</p>}
        {hasSignals && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            {durationSeconds != null && <span>Duration {formatClock(durationSeconds)}</span>}
            {turns.length > 0 && <span>“Didn’t catch that” moments: {clarifications}</span>}
            {endReason && <span>End reason: {endReason}</span>}
          </div>
        )}
      </div>

      {/* (b) Playback */}
      {segments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={togglePlay} aria-label={playing ? 'Pause conversation playback' : 'Play conversation'}>
            {playing ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            {playing ? 'Pause' : current != null ? 'Resume' : 'Play conversation'}
          </Button>
          <Button size="sm" variant="ghost" onClick={stopPlayback} disabled={current == null && !playing} aria-label="Stop conversation playback">
            <Square className="mr-1.5 h-3.5 w-3.5" /> Stop
          </Button>
          <span className="text-[11px] tabular-nums text-muted-foreground" role="status">
            {current != null
              ? elapsed != null && totalDuration != null
                ? `${formatClock(elapsed)} / ${formatClock(totalDuration)}`
                : `Segment ${current + 1} of ${segments.length}`
              : totalDuration != null
                ? formatClock(totalDuration)
                : `${segments.length} segment${segments.length !== 1 ? 's' : ''}`}
          </span>
          <audio
            ref={audioRef}
            preload="none"
            className="hidden"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
            onEnded={handleEnded}
          />
        </div>
      ) : expectRecording ? (
        <p className="text-[11px] text-muted-foreground italic">No recording for this session</p>
      ) : null}

      {/* (c) Dialogue */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Transcript · {turns.length} turn{turns.length !== 1 ? 's' : ''}
        </p>
        <DialogueBubbles
          turns={turns}
          turnOffsetSeconds={timing.turnOffsetSeconds}
          turnSegmentIndex={timing.turnSegmentIndex}
          activeSegmentIndex={current}
          onPlaySegment={segments.length ? playSegment : undefined}
        />
      </div>

      {afterDialogue}

      {/* (d) Technical details — collapsed by default */}
      {(technicalDetails || fragments.length > 0) && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
          <div className="mt-2 space-y-3">
            {technicalDetails}
            {fragments.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Raw segments · {fragments.length} fragment{fragments.length !== 1 ? 's' : ''}
                </p>
                <div className="max-h-40 space-y-0.5 overflow-y-auto rounded bg-muted/30 p-2">
                  {fragments.map((f, i) => (
                    <p key={i} className="whitespace-pre-wrap text-[11px] text-foreground/70">
                      <strong className="text-foreground">{f.role}: </strong>{f.text}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
