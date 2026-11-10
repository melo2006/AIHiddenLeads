// waituntil-prelude.ts — Edge-runtime compatibility prelude for running the
// UNMODIFIED gemini-live-proxy (supabase/functions/gemini-live-proxy/index.ts)
// under plain Deno on the VPS.
//
// Why this exists (design: ~/workspace/proxy-vps-move-design-2026-11-10.md §1.2):
// the proxy's ONLY Edge-only API is `EdgeRuntime.waitUntil(p)` — 5 call sites
// (socket-lifetime promise, close finalization, heartbeat persistUsage ×2,
// transfer-briefing checkpoint). On Supabase Edge, waitUntil tells the runtime
// "do not retire this worker while this promise is pending". Under systemd the
// process is immortal, so the semantics reduce to fire-and-track: keep the
// promise in a Set, drop it when it settles, and LOG rejections (on Edge a
// rejected waitUntil promise is equally invisible unless the function logs it;
// here we at least get it into journald).
//
// The proxy references `EdgeRuntime` as a bare global and only ever reads it
// INSIDE the request handler (never at module top level), so installing
// `globalThis.EdgeRuntime` before the proxy module is imported is sufficient
// and reliable — no proxy source change, no fork. One source keeps serving
// both runtimes (design §2.3).
//
// This prelude ALSO wraps `Deno.serve` to inject the listen address. The proxy
// calls `Deno.serve(handler)` with no options; on Edge the runtime owns the
// listener, but plain Deno would default to port 8000 on all interfaces. The
// wrapper supplies { port: PORT env (default 8081), hostname: 127.0.0.1 }
// (loopback only — the public edge on the same box terminates TLS and proxies
// in, design §2.1). installPrelude() fails LOUDLY at boot if the wrap cannot
// be installed, rather than silently binding the wrong address.

const pending = new Set<Promise<unknown>>();

/** Track background work the way EdgeRuntime.waitUntil does: hold the promise
 *  until it settles; log (never swallow silently, never rethrow) rejections. */
export function track(p: Promise<unknown>): void {
  const q = Promise.resolve(p);
  pending.add(q);
  q.then(
    () => {
      pending.delete(q);
    },
    (err) => {
      pending.delete(q);
      console.error('[aspen-voice-proxy] waitUntil-tracked promise rejected:', err);
    },
  );
}

/** Diagnostic: how many tracked background promises are still in flight. */
export function pendingBackgroundCount(): number {
  return pending.size;
}

type ServeFn = (optionsOrHandler: unknown, maybeHandler?: unknown) => unknown;

function installServeDefaults(port: number, hostname: string): void {
  const denoNs = Deno as unknown as { serve: ServeFn };
  const original = denoNs.serve;
  const wrapped: ServeFn = (optionsOrHandler, maybeHandler) => {
    if (typeof optionsOrHandler === 'function') {
      // The proxy's call shape: Deno.serve(handler) — inject listen options.
      return original({ port, hostname }, optionsOrHandler);
    }
    return original(optionsOrHandler, maybeHandler);
  };
  try {
    denoNs.serve = wrapped;
  } catch {
    // Fall through to defineProperty below.
  }
  if (denoNs.serve !== wrapped) {
    Object.defineProperty(Deno, 'serve', {
      value: wrapped,
      configurable: true,
      writable: true,
    });
  }
  if (denoNs.serve !== wrapped) {
    throw new Error(
      '[aspen-voice-proxy] FATAL: could not wrap Deno.serve to inject the listen address — refusing to boot on a default/wrong address.',
    );
  }
}

/** Install the EdgeRuntime shim + Deno.serve listen defaults.
 *  MUST run before the proxy module is imported (server.ts dynamic-imports it
 *  only after calling this). Idempotent. */
export function installPrelude(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.EdgeRuntime === 'undefined') {
    g.EdgeRuntime = {
      waitUntil: (p: Promise<unknown>) => track(p),
    };
  }
  const portRaw = Deno.env.get('PORT') ?? '8081';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[aspen-voice-proxy] FATAL: invalid PORT value: ${JSON.stringify(portRaw)}`);
  }
  const hostname = Deno.env.get('VOICE_PROXY_BIND') ?? '127.0.0.1';
  installServeDefaults(port, hostname);
  console.log(`[aspen-voice-proxy] prelude installed (EdgeRuntime.waitUntil shim; listen ${hostname}:${port})`);
}
