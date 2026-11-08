import { supabase } from '@/integrations/supabase/client';

/**
 * Cold-email outreach tracking — client types + the sends contract.
 *
 * The data lives behind the admin-only `outreach-report` edge function
 * (demo_invites / outreach_sends / campaign_visit_events are service-role
 * only). There is deliberately NO email-open tracking anywhere in this
 * system: Apple Mail Privacy Protection and Gmail image prefetch make
 * opens lie, so "opened" always means the prospect opened their personal
 * demo link (a server-verified invite resolve).
 *
 * SENDS CONTRACT for the future sending driver: after each email is
 * actually sent, insert ONE row into public.outreach_sends (service role):
 *   { lead_id, prospect_id (nullable), campaign, source, step,
 *     mailbox, message_id (nullable), sent_at, status: 'sent' }
 * That row is the denominator for every rate in the report. No row = the
 * email does not count as sent. This file defines the shape only — no
 * sending code lives here.
 */
export interface OutreachSendRecord {
  lead_id: string;
  prospect_id?: string | null;
  campaign: string;
  source?: string | null;
  step: number;
  mailbox: string;
  sent_at?: string;
  message_id?: string | null;
  status?: string;
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

export interface ProspectReportRow {
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

export interface OutreachReportData {
  ok: boolean;
  generatedAt: string;
  campaigns: CampaignRollup[];
  prospects: ProspectReportRow[];
}

export async function fetchOutreachReport(): Promise<OutreachReportData> {
  const { data, error } = await supabase.functions.invoke('outreach-report', { body: {} });
  if (error) throw error;
  return data as OutreachReportData;
}
