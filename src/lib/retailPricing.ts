// Retail pricing — client-side re-export of the shared retail-pricing
// logic (design 2026-11-18 §12.3, Phase 2.5). Canonical implementation:
// supabase/functions/_shared/retail-pricing.ts. A reseller's wholesale
// prices and his own retail settings are HIS data; his customers only
// ever receive customerRetailView() output (retail prices + labels).
export * from "../../supabase/functions/_shared/retail-pricing";
