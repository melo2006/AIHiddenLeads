// Onboarding state + first-steps checklist logic (onboarding batch,
// 2026-11-12). Pure functions only — the wizard, the dashboard checklist,
// the voice-agents 'onboarding' action and the day-1 reminder sweep all
// derive their views from these helpers so the surfaces can never drift.
//
// Where state lives (no new tables):
// - The wizard persists the client's phone choices inside the agent draft
//   config (`phoneSetup`), exactly like the rest of the wizard state.
// - The operational mirror is a `telephony_clients` row (created by the
//   voice-agents 'phoneSetup' action, service role): organization + agent
//   linked, `active` stays false until the line is proven live.
// - Email stamps (welcome sent, day-1 nudge sent) live in the auth user's
//   app_metadata — written only by service-role code.

export type PhoneRoute = 'forward' | 'port' | 'new';

/** Lifecycle of the phone-number step. `not_started` = the client has not
 *  answered yet. Terminal-ish states are honest about what is proven:
 *  `live_detected` means an inbound call for this client actually arrived
 *  on the telephony path; `live_confirmed` means the client told us their
 *  test call reached Aspen (used where per-client call attribution is not
 *  available yet — flagged in the UI copy, never presented as detected). */
export type PhoneSetupStatus =
  | 'not_started'
  | 'awaiting_number' // forward route saved, dedicated Aspen number not assigned yet
  | 'waiting_first_call' // Aspen number assigned; forwarding should be on; no call seen yet
  | 'port_requested' // port route: request recorded with the team, port not complete
  | 'new_number_requested' // new-number route: provisioning requested
  | 'live_detected'
  | 'live_confirmed';

export interface PhoneSetupState {
  route?: PhoneRoute;
  /** The client's existing business number (forward/port routes), E.164-ish free text as typed. */
  businessNumber?: string;
  /** Where Aspen warm-transfers hot callers (defaults to the business number). */
  transferNumber?: string;
  /** Carrier id from the carrier-guide library (supabase/functions/_shared/carrier-guides.ts). */
  carrierId?: string;
  /** Rings before Aspen picks up: 2 | 3 | 4 | 5. */
  rings?: number;
  /** Preferred area code for a brand-new Aspen number (new route). */
  areaCode?: string;
  /** The dedicated Aspen number assigned to this client, once ops assigns one. */
  aspenNumber?: string;
  status: PhoneSetupStatus;
  savedAt?: string;
  /** ISO timestamp when the client confirmed their own test call reached Aspen. */
  testCallConfirmedAt?: string;
  /** ISO timestamp of the first attributed inbound call, when detected. */
  firstCallDetectedAt?: string;
}

export const EMPTY_PHONE_SETUP: PhoneSetupState = { status: 'not_started' };

/** Ring choices offered in the wizard. Carriers set the no-answer delay in
 *  SECONDS, not rings; one North-American ring cycle is about 5–6 seconds.
 *  `seconds` is the value the carrier guides tell the client to set. */
export const RING_OPTIONS: { rings: number; seconds: number }[] = [
  { rings: 2, seconds: 10 },
  { rings: 3, seconds: 15 },
  { rings: 4, seconds: 20 },
  { rings: 5, seconds: 25 },
];

export function ringSeconds(rings: number | undefined): number | null {
  return RING_OPTIONS.find((o) => o.rings === rings)?.seconds ?? null;
}

/** The phone step counts as "completed" for the checklist once the client
 *  has made a choice and saved it — even when the honest status is that a
 *  number assignment or port is still in flight. */
export function phoneStepCompleted(p: PhoneSetupState | undefined): boolean {
  return Boolean(p && p.status !== 'not_started' && p.route);
}

export function phoneIsLive(p: PhoneSetupState | undefined): boolean {
  return p?.status === 'live_detected' || p?.status === 'live_confirmed';
}

/** Derive the status after a save, given whether a dedicated Aspen number
 *  is assigned yet. Detection/confirmation transitions are applied by
 *  `applyPhoneSignals`, not here. */
export function statusAfterSave(route: PhoneRoute, aspenNumber?: string): PhoneSetupStatus {
  if (route === 'port') return 'port_requested';
  if (route === 'new') return 'new_number_requested';
  return aspenNumber ? 'waiting_first_call' : 'awaiting_number';
}

/** Fold live signals (a detected first call, a client test-call
 *  confirmation) into the stored status. Detection wins over confirmation;
 *  neither can move a port/new-number request to live on its own — those
 *  complete when the number actually lands, which ops records by setting
 *  `aspenNumber` + route 'forward' semantics on the telephony row. */
export function applyPhoneSignals(
  p: PhoneSetupState,
  signals: { firstCallAt?: string | null; testCallConfirmedAt?: string | null },
): PhoneSetupState {
  if (p.route !== 'forward') return p;
  if (signals.firstCallAt && (p.status === 'waiting_first_call' || p.status === 'live_confirmed')) {
    return { ...p, status: 'live_detected', firstCallDetectedAt: signals.firstCallAt };
  }
  if (signals.testCallConfirmedAt && p.status === 'waiting_first_call') {
    return { ...p, status: 'live_confirmed', testCallConfirmedAt: signals.testCallConfirmedAt };
  }
  return p;
}

// ---------------------------------------------------------------------------
// First-steps checklist
// ---------------------------------------------------------------------------

export type ChecklistItemId = 'calendar' | 'phone' | 'teach' | 'testcall' | 'golive';

export interface ChecklistItem {
  id: ChecklistItemId;
  title: string;
  detail: string;
  done: boolean;
  /** Where the client goes to do it. */
  href: string;
}

export interface ChecklistInputs {
  /** Bookings run on the platform calendar out of the box — there is no
   *  per-client calendar connection in the product, so this item is done
   *  as soon as the workspace exists; the copy says exactly that. */
  workspaceReady: boolean;
  phone?: PhoneSetupState;
  /** At least one learned source ready, or FAQs/guidance saved. */
  taught: boolean;
  /** A draft test session exists for the agent, or the client confirmed one. */
  testCallDone: boolean;
  published: boolean;
}

export function deriveChecklist(i: ChecklistInputs): ChecklistItem[] {
  const phoneDone = phoneStepCompleted(i.phone);
  const phoneLive = phoneIsLive(i.phone);
  return [
    {
      id: 'calendar',
      title: 'Bookings calendar',
      detail: 'Nothing to connect — Aspen books appointments on our calendar and emails you every booking.',
      done: i.workspaceReady,
      href: '/account',
    },
    {
      id: 'phone',
      title: 'Set up your phone number',
      detail: phoneLive
        ? 'Aspen is answering your calls.'
        : phoneDone
          ? 'Saved — finish the last step so Aspen can answer your calls.'
          : 'Keep your number, bring it to us, or get a new one — your phone rings first, then Aspen answers.',
      done: phoneDone,
      href: '/setup',
    },
    {
      id: 'teach',
      title: 'Teach Aspen your business',
      detail: 'Add your website, a price list or your most common questions so Aspen answers like your own team.',
      done: i.taught,
      href: '/setup',
    },
    {
      id: 'testcall',
      title: 'Make a test call',
      detail: 'Try your assistant before real visitors do — fix anything that sounds off back in the teach step.',
      done: i.testCallDone,
      href: '/setup',
    },
    {
      id: 'golive',
      title: 'Go live',
      detail: 'Publish your assistant and add the one snippet to your website.',
      done: i.published,
      href: '/setup',
    },
  ];
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number; complete: boolean } {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, complete: done === items.length };
}

// ---------------------------------------------------------------------------
// Day-1 reminder ("finish your number setup")
// ---------------------------------------------------------------------------

export interface Day1Inputs {
  /** When the welcome email went out (ISO). */
  welcomeSentAt?: string | null;
  /** When the day-1 nudge already went out (ISO) — stamp-gated like the
   *  followup sweep: never send twice. */
  day1SentAt?: string | null;
  phone?: PhoneSetupState;
  now: Date;
  /** Minimum age of the welcome email before the nudge is due (hours). */
  minAgeHours?: number;
}

/** The day-1 nudge is due only when the welcome email is at least
 *  `minAgeHours` old (default 20h — "day 1", forgiving of sweep cadence),
 *  it has never been sent, and the phone step is still incomplete. */
export function day1NudgeDue(i: Day1Inputs): boolean {
  if (!i.welcomeSentAt || i.day1SentAt) return false;
  if (phoneStepCompleted(i.phone)) return false;
  const ageMs = i.now.getTime() - new Date(i.welcomeSentAt).getTime();
  return ageMs >= (i.minAgeHours ?? 20) * 3600_000;
}
