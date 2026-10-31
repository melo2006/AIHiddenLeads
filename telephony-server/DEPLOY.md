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
TELEPHONY_FUNCTION_URL=https://gvlmpywrrovbncdhklfq.supabase.co/functions/v1/telephony-stream
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
