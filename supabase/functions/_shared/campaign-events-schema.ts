import { z } from 'npm:zod@3';
import { validMilestone } from './report-context.ts';

/**
 * Request schema for the campaign-events edge function, shared between the
 * deployed function and its unit tests so the two can never drift.
 *
 * leadId is optional and backward compatible: public ad-traffic visits
 * never carry one and behave exactly as before. When present it must be a
 * well-formed UUID; the campaign-events function stores it on the visit
 * row so the outreach report can attribute the visit's milestones to the
 * invited lead. validMilestone still gates every event/path pair, so a
 * lead id can never be attached to a non-public path.
 */
export const campaignEventSchema = z.object({
  visitId: z.string().uuid(),
  event: z.enum(['page_view', 'scan_started', 'voice_started', 'voice_ended', 'section_view']),
  path: z.string().max(100),
  source: z.string().max(100).regex(/^[\w .-]*$/),
  campaign: z.string().max(100).regex(/^[\w .-]*$/),
  leadId: z.string().uuid().optional(),
}).refine(b => validMilestone(b.event, b.path));
