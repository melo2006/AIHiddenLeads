// Tenancy — client-side re-export of the shared tenancy logic
// (multi-tenant / reseller design Phase 2, 2026-11-18). The canonical
// implementation lives in supabase/functions/_shared/tenancy.ts so the
// edge functions and the browser run the SAME role ladder, subtree
// scoping, limits normalization and cap evaluation. Client code uses
// these helpers for display and form state only — every enforcement
// decision is re-made server-side.
export * from "../../supabase/functions/_shared/tenancy";
