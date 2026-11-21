import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { displayNumbers } from '@/lib/displayNumbers';
import {
  mergeTranscriptFragments, parseConversationSummary,
  type TranscriptFragment,
} from '@/lib/conversationDetail';

// Shared formatted conversation renderer (item 12, 2026-11-21). One
// structure for every surface that shows a stored conversation to a
// human reader:
//   banner/header linking to aihiddenleads.com
//   → AI summary in clean sentences, with the stored needs and next
//     steps as bullets (the whole section is OMITTED when no summary
//     is stored — a summary is never invented)
//   → the conversation as readable turns (stored fragments merged
//     back into turns; AI Elements MessageResponse per house rules;
//     numbers shown as digits at render time only — the stored
//     transcript text is never rewritten)
//   → CTA block (plans from $99/mo)
//   → footer.
// The public conversation-copy page renders this component whole. The
// admin surfaces (ConversationRecordsView, CallHistoryView) share the
// same merge core and the same SummaryNeedsSteps bullets through
// ConversationDetail. The conversation-copy EMAIL mirrors this
// structure in email-safe HTML (hostinger-mail.ts conversationCopy,
// inside the branded email-shell banner/footer). The summary's
// admin-only fields (outreach draft, tone/lead assessment) are never
// rendered here.

export const CONVERSATION_SITE_URL = 'https://aihiddenleads.com';
export const CONVERSATION_CTA_HEADING = 'Plans start at $99/mo';
export const CONVERSATION_CTA_DEMO_LABEL = 'Book another demo';
export const CONVERSATION_CTA_START_LABEL = 'Get started';
export const CONVERSATION_DEMO_URL = `${CONVERSATION_SITE_URL}/demo`;
export const CONVERSATION_PLANS_URL = `${CONVERSATION_SITE_URL}/plans`;
export const CONVERSATION_PHONE_DISPLAY = '1-877-86-AI WIZ';
export const CONVERSATION_PHONE_HREF = 'tel:+18778624949';

/** The stored needs / next steps as bulleted lists — shared verbatim
 *  by the public page (via ConversationSummaryBlock) and the admin
 *  ConversationDetail summary card. Renders nothing for empty lists. */
export function SummaryNeedsSteps({ needs, nextSteps }: { needs: string[]; nextSteps: string[] }) {
  if (!needs.length && !nextSteps.length) return null;
  return (
    <div className="space-y-3">
      {needs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">What they need</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {needs.map((need, i) => <li key={i}>{need}</li>)}
          </ul>
        </div>
      )}
      {nextSteps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Next steps</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {nextSteps.map((step, i) => <li key={i}>{step}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Summary section: the stored summary as clean sentences plus the
 *  needs/next-steps bullets. Returns null when no usable summary is
 *  stored — the section is omitted, never filled in. */
export function ConversationSummaryBlock({ summary }: { summary?: unknown }) {
  const parsed = parseConversationSummary(summary);
  if (!parsed) return null;
  return (
    <section aria-label="AI summary" className="space-y-3">
      <h2 className="text-lg font-semibold">AI summary</h2>
      <p className="text-sm leading-relaxed">{parsed.summary}</p>
      <SummaryNeedsSteps needs={parsed.needs} nextSteps={parsed.nextSteps} />
      <p className="text-xs text-muted-foreground">AI summaries can contain mistakes.</p>
    </section>
  );
}

/** The conversation as readable turns: legacy chunked fragments merge
 *  back into the turns that were spoken; already-merged stored turns
 *  pass through unchanged. */
export function ConversationTurnList({ transcript }: { transcript?: readonly TranscriptFragment[] | null }) {
  const turns = mergeTranscriptFragments(transcript ?? []);
  if (!turns.length) {
    return <p className="text-sm text-muted-foreground italic">No transcript saved.</p>;
  }
  return (
    <div className="space-y-3">
      {turns.map((turn, i) => (
        <Message key={i} from={turn.speaker === 'caller' ? 'user' : 'assistant'} className="max-w-full">
          <MessageContent
            className={turn.speaker === 'caller'
              ? 'bg-primary text-primary-foreground text-sm px-3 py-2'
              : 'rounded-md bg-accent/15 px-3 py-2 text-sm text-foreground'}
          >
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-70">{turn.label}</span>
            <MessageResponse>{turn.speaker === 'assistant' ? displayNumbers(turn.text) : turn.text}</MessageResponse>
          </MessageContent>
        </Message>
      ))}
    </div>
  );
}

/** CTA block: plans from $99/mo, another demo or get started. The
 *  conversation-copy email carries the same block in email-safe HTML. */
export function ConversationCtaBlock() {
  return (
    <section aria-label="Get started with AI Hidden Leads" className="rounded-lg border border-border bg-muted/30 p-5 text-center">
      <h2 className="text-lg font-semibold">{CONVERSATION_CTA_HEADING}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Aspen answers your calls and website visitors 24/7, so leads stop going to voicemail.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <a
          href={CONVERSATION_DEMO_URL}
          className="inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline"
        >
          {CONVERSATION_CTA_DEMO_LABEL}
        </a>
        <a
          href={CONVERSATION_PLANS_URL}
          className="inline-block rounded-md border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground no-underline"
        >
          {CONVERSATION_CTA_START_LABEL}
        </a>
      </div>
    </section>
  );
}

export interface ConversationFormattedProps {
  /** Stored summary payload (either JSON shape, or a plain string). */
  summary?: unknown;
  transcript?: readonly TranscriptFragment[] | null;
  title?: string;
}

/** The full formatted view: banner → summary → turns → CTA → footer. */
export default function ConversationFormatted({ summary, transcript, title = 'Your conversation with Aspen' }: ConversationFormattedProps) {
  return (
    <div className="space-y-8">
      <header className="border-b-[3px] border-primary pb-4">
        <a href={CONVERSATION_SITE_URL} className="inline-flex items-center gap-2 text-foreground no-underline">
          <img src="/logo.png" alt="AI Hidden Leads" width={36} height={36} className="h-9 w-9" />
          <span className="text-xl font-extrabold tracking-tight">
            AI Hidden <span className="text-primary">Leads</span>
          </span>
        </a>
      </header>

      <h1 className="text-2xl font-bold">{title}</h1>

      <ConversationSummaryBlock summary={summary} />

      <section aria-label="Transcript" className="space-y-3">
        <h2 className="text-lg font-semibold">Transcript</h2>
        <ConversationTurnList transcript={transcript} />
      </section>

      <ConversationCtaBlock />

      <footer className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">AI Hidden Leads</strong>
          {' · '}
          <a href={CONVERSATION_SITE_URL} className="underline">aihiddenleads.com</a>
          {' · '}
          <a href={CONVERSATION_PHONE_HREF} className="underline">{CONVERSATION_PHONE_DISPLAY}</a>
          {' · Fort Lauderdale, Florida'}
        </p>
        <p className="mt-1">This is a private copy of your conversation. Please keep the link to this page private — anyone with it can read the transcript and summary.</p>
      </footer>
    </div>
  );
}
