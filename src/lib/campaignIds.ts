// Campaign identity helpers for the CRM.
//
// prospects.campaign_id is a free-text slug (e.g. "realtors-south-florida"),
// not a foreign key. A campaigns row can bind itself to exactly the prospects
// carrying one slug by putting that slug in target_filters.campaign_id —
// CampaignDetailView honors it, and the Prospects filter lists the distinct
// slugs present in the table.

export const CAMPAIGN_ID_LABELS: Record<string, string> = {
  "realtors-south-florida": "Realtors — South Florida",
  "realtors-dallas-fort-worth": "Realtors — Dallas-Fort Worth",
};

export const campaignOptionLabel = (campaignId: string): string =>
  CAMPAIGN_ID_LABELS[campaignId] ??
  campaignId
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const campaignIdFromTargetFilters = (targetFilters: unknown): string | null => {
  if (!targetFilters || typeof targetFilters !== "object") return null;
  const value = (targetFilters as Record<string, unknown>).campaign_id;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
};
