import { REALTOR_EXAMPLE_PINNED_LEADS } from "@/data/realtorExamplePinnedLeads";
import { B2B_EXAMPLE_PINNED_LEADS } from "@/data/b2bExamplePinnedLeads";

/**
 * Synchronous seed for a pinned one-click example demo.
 *
 * Example links carry the pinned leadId; /demo-site loads the stored
 * lead via get_demo_lead, but that round-trip leaves the first frames
 * nameless (the loading curtain falls back to the bare hostname). The
 * client pinned maps already know each example's name and URL, so the
 * page can seed itself instantly with the REAL business name and let
 * the stored lead record merge over the seed when it lands.
 *
 * Only leadIds present in the client maps resolve — an unknown leadId
 * (CRM leads, invite leads) gets no seed and follows the normal path.
 */
export interface PinnedExampleSeed {
  businessName: string;
  websiteUrl: string;
}

const seedByLeadId = new Map<string, PinnedExampleSeed>([
  ...REALTOR_EXAMPLE_PINNED_LEADS.map(
    (entry) => [entry.leadId, { businessName: entry.agent, websiteUrl: entry.url }] as const,
  ),
  ...B2B_EXAMPLE_PINNED_LEADS.map(
    (entry) => [entry.leadId, { businessName: entry.business, websiteUrl: entry.url }] as const,
  ),
]);

export const pinnedExampleSeedForLeadId = (
  leadId: string | null | undefined,
): PinnedExampleSeed | undefined => (leadId ? seedByLeadId.get(leadId) : undefined);
