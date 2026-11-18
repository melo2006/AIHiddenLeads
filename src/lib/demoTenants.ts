// Demo tenants — client-side re-export of the shared demo-world
// fixtures (design 2026-11-18 §12.1, Phase 2.5). Canonical
// implementation: supabase/functions/_shared/demo-tenants.ts. The seed
// itself runs server-side (voice-agents seedDemoData, admin only);
// the browser uses these helpers only to recognize and badge demo
// data for what it is.
export * from "../../supabase/functions/_shared/demo-tenants";
