# Aspen phone bridge on the Hostinger VPS

Live phone numbers stay on their current setup. Only a **test number** is pointed here until testing passes.

## 1. Server (Ubuntu, as root)
```bash
apt update && apt install -y nodejs npm caddy   # Node 20+ required: node -v
adduser --system --group aspen
mkdir -p /opt/aspen && cp server.mjs codec.mjs package.json /opt/aspen/ && cd /opt/aspen && npm install --omit=dev
```
`/etc/aspen.env` (chmod 600, owner root):
```
GOOGLE_API_KEY=...            # Gemini API key
TELEPHONY_SERVER_SECRET=...   # same value as the backend secret
TELEPHONY_FUNCTION_URL=https://mrtvqttecdfgphgxeygj.supabase.co/functions/v1/telephony-stream
PORT=8080
```
`/etc/systemd/system/aspen.service`:
```
[Unit]
Description=Aspen phone bridge
After=network-online.target
[Service]
User=aspen
EnvironmentFile=/etc/aspen.env
WorkingDirectory=/opt/aspen
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=2
[Install]
WantedBy=multi-user.target
```
`systemctl enable --now aspen`

## 2. HTTPS (Caddy, automatic certificate)
Point a DNS A record such as `voice.aihiddenleads.com` to the VPS IP. `/etc/caddy/Caddyfile`:
```
voice.aihiddenleads.com {
  reverse_proxy 127.0.0.1:8080
}
```
`systemctl reload caddy`, then `curl https://voice.aihiddenleads.com/` should return `{"ok":true,...}`.
Firewall: allow only 22, 80, 443 (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`).

## 3. Backend secret
Set `TELEPHONY_STREAM_WSS=wss://voice.aihiddenleads.com/media`. Without it, test calls fall back to the existing phone flow.

## 4. Test number only
On a spare Twilio number: Voice URL `…/functions/v1/telephony-stream?action=incoming` (POST), Status callback `…/functions/v1/telephony-voice?action=status` (POST, records minutes and Twilio price).

## Test checklist (before any live routing change)
- Greeting is Aspen's voice and saved greeting; interruptions stop her speaking.
- Transfer reaches the saved manager number with the whisper; no-answer message plays.
- Calls over ~10 minutes keep going (session resumption); `reconnects` is recorded.
- `telephony_calls.ai_usage` and `telephony_usage` show seconds and estimates.
- `systemctl restart aspen` during idle; health check returns afterwards.
- Run `node --test` in this folder.

Rollback: point the test number back to its previous Voice URL. Nothing else changes.

## 5. Telnyx adapter (772 number, A/B against Twilio)

Code: `telnyx.mjs` (webhook `POST /telnyx/voice`, media WS `/telnyx/media`) — built
and unit-tested locally, **not deployed**. Full draft + prerequisites:
`~/workspace/telnyx-adapter/README.md` and the backend patch
`~/workspace/telnyx-adapter/telephony-stream.telnyx.patch` (must be applied to the
`telephony-stream` function before Telnyx calls can start).

Before deploying:
1. **Diff `/opt/aspen/server.mjs` + `codec.mjs` against this repo copy** — the live
   files were copied by hand and may have drifted; build the deploy on the live source.
2. Copy `server.mjs telnyx.mjs latency.mjs codec.mjs package.json` to `/opt/aspen/`
   (keep the pre-deploy copies for rollback).
3. Add to `/etc/aspen.env`:
   ```
   TELNYX_API_KEY=...        # Telnyx API key (Bearer, Call Control commands)
   TELNYX_PUBLIC_KEY=...     # account public key, base64 (webhook Ed25519 verify)
   TELNYX_CONNECTION_ID=...  # the Call Control Application id
   TELNYX_STREAM_WSS=wss://voice.aihiddenleads.com/telnyx/media
   ```
4. Telnyx portal: create the Call Control Application with webhook
   `https://voice.aihiddenleads.com/telnyx/voice`, assign **+1 772 362 4949** to it.
5. Backend: apply the patch, and insert the `telephony_clients` row for
   `+17723624949` (active, `transfer_phone = +19547706622`, same agent as the 561 row).
6. Deploy only in a quiet window: check the health endpoint shows `activeCalls: 0`,
   then `systemctl restart aspen` (restart drops in-flight calls and is required for
   the new env vars).

Rollback (Telnyx only): reassign the 772 number away from the application in the
portal; restore the pre-deploy `/opt/aspen` files and restart. The Twilio 561 path
is untouched by every step above.
