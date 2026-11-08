/**
 * Outreach report aggregation (cold-email campaign tracking).
 *
 * Pure functions over row arrays — the outreach-report edge function feeds
 * them service-role query results; unit tests feed them fixtures. Keeping
 * the math here means the deployed numbers and the tested numbers are the
 * same numbers.
 *
 * Honest-signal design (owner decision, 2026-11-09): there is NO email-open
 * data anywhere in this report. Apple Mail Privacy Protection and Gmail
 * image prefetch make per-email opens lie, so "opened" here always means
 * "opened their personal demo link" — a server-verified resolve of the
 * invite, stamped on demo_invites by the demo-invite function.
 *
 * Demo minutes derivation: campaign milestones carry no duration, so a
 * visit's demo time is the span from its FIRST voice_started to its LAST
 * voice_ended (a lower bound on time-with-Aspen for that tab; reconnects
 * inside one tab stay inside the span). Cross-check source: the voice
 * proxy records an exact per-lead duration in gemini_voice_sessions /
 * call_history — the per-prospect row surfaces the SUM of those recorded
 * session seconds as `recordedDemoMinutes`, so the two can be compared
 * instead of silently blended.
 */

export interface OutreachSendRow {
  lead_id: string;
  campaign: string;
  step: number;
  sent_at: string;
}

export interface OutreachInviteRow {
  lead_id: string;
  campaign: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
}

export interface OutreachVisitEventRow {
  visit_id: string;
  lead_id: string | null;
  event: string;
  created_at: string;
}

export interface OutreachLeadRow {
  id: string;
  business_name: string;
  full_name: string;
  email: string | null;
  website_url: string;
}

export interface OutreachVoiceSessionRow {
  lead_id: string | null;
  duration_seconds: number | null;
}

export interface CampaignRollup {
  campaign: string;
  sent: number;
  prospectsSent: number;
  linkOpened: number;
  totalOpens: number;
  demoStarted: number;
  demoFinished: number;
  demoMinutes: number;
  recordedDemoMinutes: number;
}

export interface ProspectReport {
  leadId: string;
  businessName: string;
  contactName: string;
  email: string | null;
  websiteUrl: string;
  campaign: string | null;
  stepReached: number | null;
  opens: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  demoStarted: boolean;
  demoFinished: boolean;
  demoMinutes: number;
  recordedDemoMinutes: number;
  deepestMilestone: string | null;
}

/** Milestones from shallowest to deepest, for "deepest milestone reached". */
export const MILESTONE_DEPTH = ['page_view', 'section_view', 'scan_started', 'voice_started', 'voice_ended'] as const;

const UNATTRIBUTED = '(unattributed)';

function minutesBetween(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.round(((endMs - startMs) / 60000) * 10) / 10;
}

interface VisitStats {
  started: boolean;
  finished: boolean;
  minutes: number;
  deepest: string | null;
}

/** Per-visit demo stats from that visit's milestone rows. */
export function visitStats(events: OutreachVisitEventRow[]): VisitStats {
  let firstStart = Infinity;
  let lastEnd = -Infinity;
  let deepest: string | null = null;
  let deepestRank = -1;
  for (const e of events) {
    const rank = (MILESTONE_DEPTH as readonly string[]).indexOf(e.event);
    if (rank > deepestRank) { deepestRank = rank; deepest = e.event; }
    const at = Date.parse(e.created_at);
    if (e.event === 'voice_started' && Number.isFinite(at)) firstStart = Math.min(firstStart, at);
    if (e.event === 'voice_ended' && Number.isFinite(at)) lastEnd = Math.max(lastEnd, at);
  }
  const started = events.some(e => e.event === 'scan_started' || e.event === 'voice_started');
  const finished = events.some(e => e.event === 'voice_ended');
  return { started, finished, minutes: minutesBetween(firstStart, lastEnd), deepest };
}

/** Group visit events by lead, aggregating every visit that lead made. */
export function leadVisitStats(events: OutreachVisitEventRow[]): Map<string, { started: boolean; finished: boolean; minutes: number; deepest: string | null }> {
  const byVisit = new Map<string, OutreachVisitEventRow[]>();
  for (const e of events) {
    if (!e.lead_id) continue;
    const rows = byVisit.get(e.visit_id) ?? [];
    rows.push(e);
    byVisit.set(e.visit_id, rows);
  }
  const byLead = new Map<string, { started: boolean; finished: boolean; minutes: number; deepest: string | null }>();
  for (const rows of byVisit.values()) {
    const leadId = rows[0].lead_id!;
    const stats = visitStats(rows);
    const acc = byLead.get(leadId) ?? { started: false, finished: false, minutes: 0, deepest: null };
    acc.started = acc.started || stats.started;
    acc.finished = acc.finished || stats.finished;
    acc.minutes = Math.round((acc.minutes + stats.minutes) * 10) / 10;
    if (stats.deepest && (MILESTONE_DEPTH as readonly string[]).indexOf(stats.deepest) > (acc.deepest ? (MILESTONE_DEPTH as readonly string[]).indexOf(acc.deepest) : -1)) acc.deepest = stats.deepest;
    byLead.set(leadId, acc);
  }
  return byLead;
}

/** Sum of proxy-recorded voice session seconds per lead, in minutes. */
export function recordedMinutesByLead(sessions: OutreachVoiceSessionRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    if (!s.lead_id || !s.duration_seconds || s.duration_seconds <= 0) continue;
    totals.set(s.lead_id, (totals.get(s.lead_id) ?? 0) + s.duration_seconds);
  }
  for (const [leadId, seconds] of totals) totals.set(leadId, Math.round((seconds / 60) * 10) / 10);
  return totals;
}

export function buildOutreachReport(input: {
  sends: OutreachSendRow[];
  invites: OutreachInviteRow[];
  events: OutreachVisitEventRow[];
  leads: OutreachLeadRow[];
  sessions: OutreachVoiceSessionRow[];
}): { campaigns: CampaignRollup[]; prospects: ProspectReport[] } {
  const visitsByLead = leadVisitStats(input.events);
  const recordedByLead = recordedMinutesByLead(input.sessions);

  // A lead's campaign comes from its send when one exists, else its invite.
  const campaignByLead = new Map<string, string>();
  for (const inv of input.invites) if (inv.campaign && !campaignByLead.has(inv.lead_id)) campaignByLead.set(inv.lead_id, inv.campaign);
  for (const s of input.sends) campaignByLead.set(s.lead_id, s.campaign);

  const inviteByLead = new Map<string, OutreachInviteRow>();
  for (const inv of input.invites) {
    const prev = inviteByLead.get(inv.lead_id);
    if (!prev) { inviteByLead.set(inv.lead_id, inv); continue; }
    inviteByLead.set(inv.lead_id, {
      ...prev,
      open_count: prev.open_count + inv.open_count,
      first_opened_at: [prev.first_opened_at, inv.first_opened_at].filter(Boolean).sort()[0] ?? null,
      last_opened_at: [prev.last_opened_at, inv.last_opened_at].filter(Boolean).sort().slice(-1)[0] ?? null,
    });
  }

  const stepByLead = new Map<string, number>();
  for (const s of input.sends) stepByLead.set(s.lead_id, Math.max(stepByLead.get(s.lead_id) ?? 0, s.step));

  const campaignOf = (leadId: string) => campaignByLead.get(leadId) ?? UNATTRIBUTED;

  const prospects: ProspectReport[] = input.leads.map(lead => {
    const inv = inviteByLead.get(lead.id);
    const visits = visitsByLead.get(lead.id);
    return {
      leadId: lead.id,
      businessName: lead.business_name,
      contactName: lead.full_name,
      email: lead.email,
      websiteUrl: lead.website_url,
      campaign: campaignByLead.get(lead.id) ?? null,
      stepReached: stepByLead.get(lead.id) ?? null,
      opens: inv?.open_count ?? 0,
      firstOpenedAt: inv?.first_opened_at ?? null,
      lastOpenedAt: inv?.last_opened_at ?? null,
      demoStarted: visits?.started ?? false,
      demoFinished: visits?.finished ?? false,
      demoMinutes: visits?.minutes ?? 0,
      recordedDemoMinutes: recordedByLead.get(lead.id) ?? 0,
      deepestMilestone: visits?.deepest ?? null,
    };
  }).sort((a, b) => (b.opens - a.opens) || (b.demoMinutes - a.demoMinutes) || a.businessName.localeCompare(b.businessName));

  const rollupByCampaign = new Map<string, CampaignRollup>();
  const rollupFor = (campaign: string): CampaignRollup => {
    let r = rollupByCampaign.get(campaign);
    if (!r) {
      r = { campaign, sent: 0, prospectsSent: 0, linkOpened: 0, totalOpens: 0, demoStarted: 0, demoFinished: 0, demoMinutes: 0, recordedDemoMinutes: 0 };
      rollupByCampaign.set(campaign, r);
    }
    return r;
  };

  const sentLeadsByCampaign = new Map<string, Set<string>>();
  for (const s of input.sends) {
    rollupFor(s.campaign).sent += 1;
    const set = sentLeadsByCampaign.get(s.campaign) ?? new Set<string>();
    set.add(s.lead_id);
    sentLeadsByCampaign.set(s.campaign, set);
  }
  for (const [campaign, set] of sentLeadsByCampaign) rollupFor(campaign).prospectsSent = set.size;

  for (const inv of input.invites) {
    const r = rollupFor(inv.campaign ?? UNATTRIBUTED);
    r.totalOpens += inv.open_count;
    if (inv.open_count > 0) r.linkOpened += 1;
  }

  // Demo depth attributes to the lead's campaign (send wins over invite).
  const countedStarted = new Set<string>();
  const countedFinished = new Set<string>();
  for (const [leadId, visits] of visitsByLead) {
    const r = rollupFor(campaignOf(leadId));
    if (visits.started && !countedStarted.has(leadId)) { r.demoStarted += 1; countedStarted.add(leadId); }
    if (visits.finished && !countedFinished.has(leadId)) { r.demoFinished += 1; countedFinished.add(leadId); }
    r.demoMinutes = Math.round((r.demoMinutes + visits.minutes) * 10) / 10;
  }
  for (const [leadId, minutes] of recordedByLead) {
    const r = rollupFor(campaignOf(leadId));
    r.recordedDemoMinutes = Math.round((r.recordedDemoMinutes + minutes) * 10) / 10;
  }

  const campaigns = [...rollupByCampaign.values()].sort((a, b) => b.sent - a.sent || a.campaign.localeCompare(b.campaign));
  return { campaigns, prospects };
}
