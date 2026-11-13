// edge-runtime.d.ts — TYPE-ONLY declaration of the Supabase Edge global that
// the unmodified proxy references (5 `EdgeRuntime.waitUntil` call sites).
//
// This file declares the SHAPE for the TypeScript checker; it emits no code.
// The runtime VALUE is installed by waituntil-prelude.ts (installPrelude sets
// globalThis.EdgeRuntime before server.ts imports the proxy). Shipping this
// declaration in voice-proxy-server/ is what lets `deno check server.ts` pass
// on the deployed tree WITHOUT adding anything under supabase/functions/ —
// the proxy source stays single-sourced and untouched (design §2.3).
//
// (The Edge deploy gets the same global's types from Supabase's own runtime
// typings; this file is only on the VPS entry's check path.)

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};
