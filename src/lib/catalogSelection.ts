// Catalog selection — client-side re-export of the shared catalog
// selection logic (design 2026-11-18 §12.5, Phase 2.5). Canonical
// implementation: supabase/functions/_shared/catalog-selection.ts.
// Which avatars / voices / languages a reseller offers his clients;
// null list = the whole shared library.
export * from "../../supabase/functions/_shared/catalog-selection";
