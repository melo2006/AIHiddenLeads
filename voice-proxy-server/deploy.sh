#!/usr/bin/env bash
# deploy.sh — ship the website voice proxy to /opt/aspen-voice on the VPS.
# Design: proxy-vps-move-design-2026-11-10.md §2.1/§2.3.
#
# Run ON the VPS (hPanel console), from inside a checkout of this repo:
#     bash voice-proxy-server/deploy.sh
#
# What it does, in order:
#   1. Refuses to run unless /etc/aspen-voice.env exists with mode exactly 600
#      (the file holds the Supabase service-role key; values are NEVER read
#      into this script's output, let alone printed).
#   2. Backs up the currently deployed functions tree to a timestamped copy.
#   3. Copies supabase/functions/gemini-live-proxy + its _shared import closure
#      (UNMODIFIED — one source serves Edge and VPS) and the voice-proxy-server
#      entry files into /opt/aspen-voice, mirroring the repo layout so relative
#      imports resolve identically to Edge.
#   4. Pre-warms the Deno module cache (`deno cache`) — this is also the
#      closure check: if the proxy grows a new _shared import that is not in
#      SHARED_CLOSURE below, the cache step FAILS LOUDLY and the service is
#      not restarted. Update the list from:
#        grep the import graph of supabase/functions/gemini-live-proxy/index.ts
#   5. Restarts the systemd unit (if installed) and health-checks the loopback
#      ping endpoint.
#   6. Prints the git SHA deployed (the drift guard — Edge and VPS must run
#      the same source while both are live).
#
# Safe + idempotent: re-running copies the same files over themselves and
# restarts the unit. A restart drops in-flight calls — run in quiet windows.
set -euo pipefail

DEST="${ASPEN_VOICE_DIR:-/opt/aspen-voice}"
ENV_FILE="/etc/aspen-voice.env"
UNIT="aspen-voice-proxy"
DENO="${DENO:-/usr/local/bin/deno}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FUNCTIONS_SRC="${REPO_ROOT}/supabase/functions"

# The proxy's transitive _shared import closure, RE-TRACED 2026-11-12 against
# Batch 1 (28 modules — the 2026-11-11 trace had 24; Batch 1's proxy work
# added browser-handoff, contact-save, farewell and manager-transfer).
# Handoff improvement batch (2026-11-12) re-trace: 30 modules — the proxy
# now also imports handoff-return and overage-facts. (handoff-briefing-
# voice is imported only by browser-voice-handoff, which does not run on
# this box, so it is deliberately NOT in the closure.)
# RE-TRACE 2026-11-15 against Publish #85b main: 41 modules — Publishes
# #70–#85b added capture-gate, captured-contact, consent-ask,
# context-compression, discovery-gate, kb-distill and sales-gate. The
# 2026-11-15 redeploy crash-looped on the missing context-compression.ts.
# NOTE: `deno cache` (step 4) is NOT a reliable closure authority —
# server.ts loads the function entry through a dynamic import, which the
# static cache pass does not traverse (the 2026-11-15 deploy cached
# "clean" with 7 modules missing). The step-5 post-restart ping is the
# real check; keep this list traced from the import graph of
# supabase/functions/gemini-live-proxy/index.ts.
SHARED_CLOSURE=(
  alex-guide.ts
  booking-confirm.ts
  booking-gate.ts
  booking-slots.ts
  booking-tools.ts
  browser-handoff.ts
  call-review.ts
  capture-gate.ts
  captured-contact.ts
  carrier-guides.ts
  consent-ask.ts
  contact-save.ts
  context-compression.ts
  conversation-language.ts
  conversation-records.ts
  demo-sales.ts
  discovery-gate.ts
  farewell.ts
  followup.ts
  handoff-return.ts
  homepage-evidence.ts
  homepage-knowledge.ts
  homepage-pacing.ts
  homepage-services.ts
  hostinger-mail.ts
  kb-distill.ts
  live-models.ts
  manager-transfer.ts
  overage-facts.ts
  personas.ts
  phone-demo.ts
  platform-calendar.ts
  recording-audio.ts
  sales-gate.ts
  session-opening.ts
  session-resumption.ts
  team-intro.ts
  twilio-sms.ts
  usage-ledger.ts
  visitor-followup.ts
  voice-config.ts
  voice-usage.ts
)

# --- 1. Env file gate ---------------------------------------------------------
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} is missing. Create it first (names only are listed" >&2
  echo "       in voice-proxy-server/DEPLOY.md) and chmod 600 it. Refusing to deploy." >&2
  exit 1
fi
ENV_MODE="$(stat -c '%a' "${ENV_FILE}")"
if [[ "${ENV_MODE}" != "600" ]]; then
  echo "ERROR: ${ENV_FILE} has mode ${ENV_MODE}, expected exactly 600" >&2
  echo "       (it holds the Supabase service-role key). Fix: chmod 600 ${ENV_FILE}" >&2
  exit 1
fi
echo "env file gate: ${ENV_FILE} present, mode 600 ✓ (values never printed)"

if [[ ! -x "${DENO}" ]]; then
  echo "ERROR: deno not found at ${DENO}. Install Deno first (see DEPLOY.md Phase C)." >&2
  exit 1
fi

GIT_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || echo 'unknown (not a git checkout)')"

# --- 2. Backup ----------------------------------------------------------------
mkdir -p "${DEST}/functions/_shared" "${DEST}/functions/gemini-live-proxy"
if [[ -f "${DEST}/functions/gemini-live-proxy/index.ts" ]]; then
  BACKUP="${DEST}/functions.bak-$(date +%Y%m%d%H%M%S)"
  cp -a "${DEST}/functions" "${BACKUP}"
  echo "backup: previous functions tree kept at ${BACKUP}"
fi

# --- 3. Copy (unmodified function tree + thin entry) ---------------------------
cp -a "${FUNCTIONS_SRC}/gemini-live-proxy/index.ts" "${DEST}/functions/gemini-live-proxy/index.ts"
for f in "${SHARED_CLOSURE[@]}"; do
  cp -a "${FUNCTIONS_SRC}/_shared/${f}" "${DEST}/functions/_shared/${f}"
done
cp -a "${SCRIPT_DIR}/server.ts" "${DEST}/server.ts"
cp -a "${SCRIPT_DIR}/waituntil-prelude.ts" "${DEST}/waituntil-prelude.ts"
cp -a "${SCRIPT_DIR}/edge-runtime.d.ts" "${DEST}/edge-runtime.d.ts"
echo "copied: gemini-live-proxy + ${#SHARED_CLOSURE[@]} _shared modules + server entry → ${DEST}"

# --- 3b. Service Deno cache dir -------------------------------------------------
# The unit sets DENO_DIR=${DEST}/cache and runs as user aspen. Without this
# directory, owned by aspen, Deno tries to cache npm packages under the aspen
# user's home (/nonexistent) and the unit crash-loops (production finding,
# 2026-11-11). deploy.sh runs as root, so create it explicitly. Idempotent:
# re-running install -d on an existing directory just reasserts ownership.
install -d -o aspen -g aspen "${DEST}/cache"
echo "service cache dir: ${DEST}/cache (aspen:aspen) ✓"

# --- 4. Pre-warm module cache -------------------------------------------------
(cd "${DEST}" && "${DENO}" cache server.ts)
echo "deno cache: module graph resolved ✓"

# --- 5. Restart + health check --------------------------------------------------
# Production binds 172.16.0.1 (VOICE_PROXY_BIND in the env file), NOT the
# loopback default — the 2026-11-15 deploy's loopback-only check reported
# failure against a healthy-by-its-own-lights restart. Try both addresses.
if systemctl cat "${UNIT}" >/dev/null 2>&1; then
  systemctl restart "${UNIT}"
  echo "restarted: ${UNIT}"
  PING_OK=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    for ADDR in 127.0.0.1 172.16.0.1; do
      if curl -fsS "http://${ADDR}:8081/?ping=1" >/dev/null 2>&1; then
        PING_OK="${ADDR}"
        break 2
      fi
    done
    sleep 1
  done
  if [[ -n "${PING_OK}" ]]; then
    echo "health: $(curl -fsS "http://${PING_OK}:8081/?ping=1") via ${PING_OK} ✓"
  else
    echo "ERROR: unit restarted but ping did not answer on 127.0.0.1 or 172.16.0.1 within 10s." >&2
    echo "       Check: journalctl -u ${UNIT} -n 100" >&2
    exit 1
  fi
else
  echo "notice: systemd unit ${UNIT} is not installed yet — files + cache are in"
  echo "        place; install the unit per DEPLOY.md Phase C, then start it."
fi

# --- 6. Drift guard --------------------------------------------------------------
echo "deployed git SHA: ${GIT_SHA}"
echo "${GIT_SHA}" > "${DEST}/DEPLOYED_SHA"
echo "done."
