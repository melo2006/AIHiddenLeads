import { HOMEPAGE_KNOWLEDGE } from './homepage-knowledge.ts';
export const DEMO_CHECKPOINT_SECONDS = 300;
export const DEMO_SAFETY_SECONDS = 900;
export function demoPacingAction(elapsed: number, checkpointSent: boolean) {
  return !checkpointSent && elapsed >= DEMO_CHECKPOINT_SECONDS ? 'checkpoint' : null;
}
export function salesRecommendation(value: unknown) {
  return typeof value === 'string' && ['essentials', 'growth', 'fullservice'].includes(value) ? value : null;
}
export const SALES_ACTION_POLICY = `The on-screen AI Hidden Leads actions are Try your website, Book a quick call, and Start now. Start now opens plan selection, not an immediate charge. Recommend Premium ($99/month) first unless a stated need supports Growth or Platinum; call recommend_plan when the visitor expresses a purchase or plan-selection interest, using essentials, growth or fullservice. Never navigate or charge automatically. Explain that the visitor reviews inclusions and completes payment themselves. A quick call is a 15–20-minute introduction, reserving 15 minutes on the calendar. Do not claim payment or onboarding is complete. Self-service website/FAQ/vendor-source setup and WordPress/Wix installation guidance are planned, not released; offer assisted setup or the quick call, without promising a two-hour deadline.`;
export const DEMO_SALES_POLICY = `The roleplay and AI Hidden Leads sales roles are separate. When the visitor explicitly asks about implementing, buying, pricing or installing this AI service, first say you are stepping out of the business simulation to discuss AI Hidden Leads. Answer the visitor's particular need conversationally using ONLY the reviewed AI Hidden Leads reference below for platform offers; never use that reference for the simulated business's prices or services. Do not launch a sales pitch merely because time has elapsed. If they want to resume roleplay, clearly announce the return. Around five minutes offer to keep exploring, discuss setup, or book a quick call, without rushing an engaged visitor. Continue relevant questions while they are engaged, subject to the server safety ceiling. Honor refusals, silence check-in and goodbye prompts. ${SALES_ACTION_POLICY}
REVIEWED AI HIDDEN LEADS SALES REFERENCE (separate from simulated business evidence):
${HOMEPAGE_KNOWLEDGE}`;