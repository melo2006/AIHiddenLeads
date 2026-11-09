# Edge function rules

- Homepage voice pacing runs server-side in the Live proxy: a one-time soft wrap-up, then calls continue only while the caller keeps speaking, under a server safety ceiling; this saves minutes without cutting off engaged visitors.
- Prospect demos use a five-minute soft checkpoint and a fifteen-minute server ceiling; silence closure is shared, but reviewed platform sales knowledge stays separate from website roleplay and is used only after an explicitly announced transition.
- Simli sessions keep the avatar's own canvas size (only the backdrop is swapped); a smaller streaming canvas crops a window and cut the face in half.
- Recover hosting socket drops (1006/1011) with up to three silent same-conversation reconnects; the proxy resumes without re-greeting.
- Keep English as the server language lock for PHONE/telephony sessions; authorize native language-switch tools only against explicit caller transcript requests, never detected language, reference data or browser locale. WEBSITE sessions differ (Ron's decision, 2026-11-09 — do not "fix" this back): a website session starts in the language the visitor explicitly selected with the site's language switch (en / es / pt-BR, validated server-side in gemini-session from the client's stored UI selection — never browser-locale detection), covering Aspen's voice, her greeting, the chat panel and chat replies; mid-conversation switches still require an explicit transcribed request via select_conversation_language, in either direction.

- Phone answering uses signed per-turn Twilio webhooks (Gather speech -> Aspen agent config -> Chirp3-HD Say, Dial+whisper transfers) in telephony-voice, because edge sockets cap at ~400s; telephony-server/ is the optional always-on Live upgrade.
