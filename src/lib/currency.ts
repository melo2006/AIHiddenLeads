// Currency conversion — client-side re-export of the shared currency
// logic (design 2026-11-18 §12.4, Phase 2.5). Canonical implementation:
// supabase/functions/_shared/currency.ts. The platform always settles
// in USD; conversion exists only to DISPLAY a reseller's retail prices
// to his customers in their currency.
export * from "../../supabase/functions/_shared/currency";
