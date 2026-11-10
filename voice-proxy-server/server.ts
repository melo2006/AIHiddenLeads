// server.ts — thin VPS entry for the website voice proxy (Gemini Live relay).
//
// Layout on the box (design §2.1), produced by deploy.sh:
//   /opt/aspen-voice/
//     server.ts                  ← this file
//     waituntil-prelude.ts       ← EdgeRuntime shim + listen defaults
//     functions/
//       gemini-live-proxy/index.ts   (copied UNMODIFIED from supabase/functions/)
//       _shared/…                    (the proxy's import closure, copied unmodified)
//
// This file must stay thin: install the prelude FIRST (it defines the
// EdgeRuntime global the proxy reads inside its handler, and wraps Deno.serve
// to inject the loopback listen address), and only THEN load the proxy module.
// The dynamic import is load-bearing — a static import of the proxy would be
// hoisted and evaluated before the prelude runs.
//
// One source serves both runtimes: the same proxy file keeps deploying to
// Supabase Edge via the GitHub Actions workflow; nothing in this folder forks
// or patches it.

/// <reference path="./edge-runtime.d.ts" />
import { installPrelude, pendingBackgroundCount } from './waituntil-prelude.ts';

installPrelude();

await import('./functions/gemini-live-proxy/index.ts');

console.log('[aspen-voice-proxy] gemini-live-proxy module loaded; Deno.serve listener starting');

// Surface (in journald) if the process ever exits with background work still
// tracked — on Edge that work would have kept the worker alive; here it is a
// diagnostic only, because systemd restarts are operator events, not silent
// platform retirements.
addEventListener('unload', () => {
  const n = pendingBackgroundCount();
  if (n > 0) {
    console.warn(`[aspen-voice-proxy] exiting with ${n} waitUntil-tracked promise(s) still pending`);
  }
});
