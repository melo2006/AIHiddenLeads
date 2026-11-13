# Voice proxy on the VPS — deploy runbook (Phases C–E)

Design authority: `~/workspace/proxy-vps-move-design-2026-11-10.md` (§5 steps 5–13).
Phase B (this package) is repo-only. Everything below happens later, on the box,
via the **hPanel web console** (SSH from the build VM does not work), with Ron
present or on his standing authorization. Secret values are copied
dashboard → console only — never through chat, git, or logs.

The phone bridge (systemd unit `aspen`, port 8080) is a separate service and is
**never touched** by any step of this move.

---

## 0. `/etc/aspen-voice.env` checklist (NAMES ONLY)

Authority: `grep -rn "Deno.env.get" supabase/functions/gemini-live-proxy supabase/functions/_shared`,
diffed against the proxy's actual transitive import closure (re-traced
2026-11-11 from `gemini-live-proxy/index.ts` against origin/main f46856f:
the proxy + 24 `_shared` modules — the follow-up pack added `twilio-sms.ts`,
which is why the three Twilio names below are now required).

Required by the proxy's import closure — every one must be present:

| Name | Notes |
|---|---|
| `GOOGLE_API_KEY` | Gemini Live socket + record summaries. The bridge's `/etc/aspen.env` already holds a Gemini key on this box. |
| `SUPABASE_URL` | Not secret; the project URL (`https://mrtvqttecdfgphgxeygj.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | **The one genuinely new secret on the box** (design §4.1). Consume RPC + all table/Storage writes. |
| `GOOGLE_SA_CLIENT_EMAIL` | Platform-calendar availability/booking tools. |
| `GOOGLE_SA_PRIVATE_KEY` | Calendar JWT signing. Copy byte-exact from the dashboard. |
| `GOOGLE_SA_TOKEN_URI` | Has a code default; set anyway. |
| `HOSTINGER_SMTP_PASSWORD` | Follow-up / booking / transcript-copy mail via Hostinger SMTP (info@aihiddenleads.com mailbox). |
| `TWILIO_ACCOUNT_SID` | Follow-up SMS via Twilio (`_shared/twilio-sms.ts`, in the closure since the follow-up pack). Exists as a Supabase function secret today. |
| `TWILIO_AUTH_TOKEN` | Twilio API auth for follow-up SMS. |
| `TWILIO_MESSAGING_SERVICE_SID` | Has a code-constant fallback (the AI Hidden Leads messaging service); set explicitly anyway so the VPS matches Edge behaviour exactly. |
| `PORT` | Set to `8081` (bridge owns 8080). Read by `waituntil-prelude.ts`, which injects the listen address into the proxy's `Deno.serve` call. Loopback bind is the prelude default (`VOICE_PROXY_BIND` can override it — don't, unless there is a reason). **Production does override it** — see “Production state (as deployed 2026-11-11)” below. |

Surfaced by the full-tree grep but **NOT** needed by this service — they belong
to `_shared` modules outside the proxy's import closure (payments/Stripe
functions). Listed so a diff against the dashboard secret list is explainable;
do not copy them here:

- `PAYMENTS_LIVE_WEBHOOK_SECRET`
- `PAYMENTS_SANDBOX_WEBHOOK_SECRET`
- `STRIPE_LIVE_API_KEY`
- `STRIPE_SANDBOX_API_KEY`

File rules: root-owned, `chmod 600`. `deploy.sh` refuses to run otherwise.

---

## Phase C — VPS install (dark; nothing routes to it yet)

1. **Install Deno** (official installer), pinned version. The Phase B smoke on
   the build VM used **Deno 2.9.8**; install the same on the box and record
   the version here when done: `deno --version` → `______`. The binary must
   land at `/usr/local/bin/deno` (the unit's `ExecStart` path); if the
   installer puts it elsewhere, symlink or adjust the unit — one or the other,
   deliberately.
2. **Create the layout:** `mkdir -p /opt/aspen-voice`, clone/checkout this repo
   on the box (or rsync it), then run `bash voice-proxy-server/deploy.sh`.
   It gates on the env file (step 3 first if it doesn't exist yet), backs up
   any previous functions tree, copies the function tree + entry, pre-warms
   the Deno cache, and prints the deployed git SHA.
3. **Write `/etc/aspen-voice.env`** with the names in §0 (values from the
   Supabase dashboard secret list; the Gemini key may come from the bridge's
   existing env). `chown root:root`, `chmod 600`.
4. **Install the unit:** `cp voice-proxy-server/aspen-voice-proxy.service
   /etc/systemd/system/ && systemctl daemon-reload && systemctl enable
   aspen-voice-proxy`.
5. **Start + loopback health:**
   `systemctl start aspen-voice-proxy`;
   `curl 'http://127.0.0.1:8081/?ping=1'` → `{"ok":true,"model":…}`;
   `journalctl -u aspen-voice-proxy` shows the prelude line and a clean boot
   with no env errors. **Gate:** health from loopback before any public
   routing exists.
6. **DNS + edge:** add the `voice-proxy.aihiddenleads.com` A record → VPS IP
   (Hostinger DNS, same as `voice.aihiddenleads.com`); add
   `nginx-voice-proxy.conf`'s server block to the live edge layer
   (`aspen-edge` nginx in the docker traefik stack — read the LIVE config
   first; copy its TLS mechanism, the conf's cert lines are placeholders);
   reload the edge. **Verify from an external network:**
   `curl 'https://voice-proxy.aihiddenleads.com/?ping=1'` → ok, valid cert.

## Phase D — staged proof

7. **Socket proof (> 400 s):** authorize a real session via `gemini-session`
   (admin test path), connect a scripted WS client to
   `wss://voice-proxy.aihiddenleads.com?token=…`, hold it **> 400 s** with
   periodic audio frames, close cleanly. **Verify in the DB:** the session row
   finalizes `ended` with a real `ended_at` (no zombie); duration > 400 s —
   past every Edge ceiling; `call_history` row (and Storage WAV chunks, with
   recording consent on) exist. (The Phase B smoke only proved ping + the 401
   consume path; this is the real-session proof.)
8. **Publish the client resolver** (Phase B step 4, already in the repo) via
   the normal Studio publish flow. This publish changes **no default** —
   visitors still land on Edge. **Verify:** live-bundle fingerprint shows the
   resolver; a normal visitor session behaves exactly as before.
9. **Stage 1–2 device tests** with the per-device override: visit any site
   page once with `?voiceProxy=vps` (stored per device; `?voiceProxy=edge`
   restores). Builder desktop + phone first, then Ron's phone with the same
   one-tap link: a full demo including a Sara swap and a > 3-minute
   conversation. **Verify:** Ron's verdict; DB rows finalize cleanly;
   connect→first-audio latency compared against a same-day Edge session
   (design Q3 gate — if first-audio regresses materially, stop and reassess).
10. **SMTP/booking proof:** in a VPS-hosted test session, trigger one platform
    follow-up or booking confirmation. **Verify:** the owner email arrives
    (proves SMTP egress + the `finalizeRecord` path from the VPS).

## Phase E — flip + settle

11. **Default flip:** add ONE line to the site `.env`:
    `VITE_VOICE_PROXY_WS_URL=wss://voice-proxy.aihiddenleads.com`, then a
    Studio publish (batch with the next regular change if one is imminent —
    anti-fragmentation rule). **Verify:** fresh page loads open VPS-hosted
    sessions; monitor **48 h**: zombie-row count on new sessions = 0; the
    bridge (`aspen`) untouched and healthy throughout.
12. **Settle:** the Edge proxy stays deployed and warm as fallback for at
    least one release cycle; the per-device overrides remain available. Log
    the flip (date + the git SHA recorded in `/opt/aspen-voice/DEPLOYED_SHA`)
    in the AiHiddenLeads checklist + daily memory.

## Rollback

- **Client (any time, incl. after the flip):** remove the
  `VITE_VOICE_PROXY_WS_URL` line from `.env` and republish — new page loads
  return to the Edge proxy, which is untouched and warm. Per-device:
  `?voiceProxy=edge` restores a single device immediately. In-flight sessions
  are never affected (the host is chosen when a socket is constructed).
- **VPS:** `systemctl stop aspen-voice-proxy`. To roll back a bad deploy of
  the function tree: restore the timestamped backup
  (`/opt/aspen-voice/functions.bak-<timestamp>`) over
  `/opt/aspen-voice/functions`, re-run `deno cache server.ts` in
  `/opt/aspen-voice`, and `systemctl restart aspen-voice-proxy`.

## Production state (as deployed 2026-11-11)

Phase C–E were executed on the box on 2026-11-11. The live edge layout
differs from the Phase C sketch above in one load-bearing way: the proxy
does **not** bind loopback in production.

### Bind: Docker gateway, not loopback, not public

The proxy binds **`172.16.0.1:8081`** — the Docker gateway address — via the
`VOICE_PROXY_BIND` env var (read by `waituntil-prelude.ts`; loopback is only
the default). The value is supplied on the box by a systemd drop-in (below),
not by the repo unit, because the gateway bind is a property of this box's
Docker edge, not of the service in general.

Why: the public edge for this host is a **sibling nginx container**,
`aspen-voice-edge` (config `/opt/aspen-voice-edge/nginx.conf`, in the same
docker traefik stack as the phone path's `aspen-edge` container — which is
never touched). Its upstream is `host.docker.internal:8081` — i.e. the
gateway address — with WebSocket upgrade headers and the load-bearing
**1200 s** `proxy_read_timeout` / `proxy_send_timeout` (they must exceed the
proxy's 900 s session ceiling). Traefik labels on the container route
`Host(\`voice-proxy.aihiddenleads.com\`)` with the stack's letsencrypt
certresolver, same mechanism as `voice.aihiddenleads.com`.
`nginx-voice-proxy.conf` in this folder remains the reference server block;
the deployed container config is its adapted form.

Because the proxy binds only the gateway address, **port 8081 stays off the
public internet** — the only public path in is Traefik → `aspen-voice-edge`
→ gateway:8081.

### Health checks after the gateway bind

Loopback no longer answers: `curl http://127.0.0.1:8081/?ping=1` fails on
the production box even when the service is healthy. Use either:

- `curl 'http://172.16.0.1:8081/?ping=1'` (on the box), or
- `curl 'https://voice-proxy.aihiddenleads.com/?ping=1'` (public path,
  proves edge + proxy together).

Note: `deploy.sh` step 5 still pings loopback (it predates the gateway
bind). On the production box a re-deploy can therefore end with the
loopback health-check error on an otherwise good deploy — verify with the
gateway or public ping above before concluding anything is broken.

### Production drop-ins (box state, recorded here in full)

Directory: `/etc/systemd/system/aspen-voice-proxy.service.d/`

`10-deno-dir.conf` — the DENO_DIR fix, applied on the box during the first
production start (without it, Deno running as user `aspen` tried to cache
npm packages under `/nonexistent` and the unit crash-looped). **Superseded
by this repo:** `aspen-voice-proxy.service` now carries the same
`Environment=` line and `deploy.sh` now creates `/opt/aspen-voice/cache`
owned by `aspen:aspen`. Once a deploy has run with those fixes, this
drop-in is a harmless duplicate and can be removed in a later sitting.

```ini
[Service]
Environment=DENO_DIR=/opt/aspen-voice/cache
```

`20-bind.conf` — the gateway bind described above. **Still load-bearing:**
nothing in the repo sets `VOICE_PROXY_BIND`, by design.

```ini
[Service]
Environment=VOICE_PROXY_BIND=172.16.0.1
```

### Phase B local verification (build VM, 2026-11-11 — for the Phase C operator)

Deno **2.9.8** was installed user-locally on the build VM; the staged tree
(`server.ts` + `waituntil-prelude.ts` + `edge-runtime.d.ts` + the copied
function tree, dummy env values, `PORT=8081`) verified:

- Prelude boot line + `Listening on http://127.0.0.1:8081/` — the `Deno.serve`
  listen-injection wrap works on Deno 2.9.8.
- `GET /?ping=1` → `{"ok":true,"model":"gemini-3.8-live"}` (HTTP 200).
- Raw WebSocket upgrade with a deliberately bogus token → **HTTP 401**
  `{"error":"A valid voice session is required"}` — the request reached the
  real `consume_gemini_session` RPC with the dummy service-role key and was
  rejected at the session check (the consume path executes end-to-end). Note:
  Deno's own WebSocket *client* hides pre-upgrade HTTP statuses (it surfaces
  only an error/close(0) event), so probe with a raw handshake or curl-style
  request when checking statuses.
- `deno lint` clean on the entry files. `deno check` on the staged tree has
  exactly ONE remaining error: **TS2322 `Type 'Timeout' is not assignable to
  type 'number'`** at `functions/gemini-live-proxy/index.ts:250` (`pacingTimer`
  is annotated `number | undefined` at :217; in the plain-Deno lib the global
  `setInterval` returns a `Timeout` object). Supabase Edge's worker typings
  type timers as numbers, which is why Edge never flagged it. **Type-only** —
  the runtime is unaffected (proven by the smoke above). Do NOT patch it by
  editing the proxy: the source stays single-sourced. If a fully clean
  `deno check` is ever required on the VPS, supply a timer-typing declaration
  from the `voice-proxy-server/` side (e.g. a `.d.ts` in this folder picked up
  via the reference in `server.ts`), never a source edit.
