// Rate card — client-side re-export of the shared rate-card logic
// (design 2026-11-18 §11). Canonical implementation:
// supabase/functions/_shared/rate-card.ts. The admin Rate Card page
// uses the full card (including our costs); tenant surfaces must only
// ever render tenantPriceView() output — never the full card.
export * from "../../supabase/functions/_shared/rate-card";
