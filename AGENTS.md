# Architecture rules

- Keep a public-only HTML fallback for non-JavaScript readers; React replaces it. Never include tenant data or imply route-specific rendering.

- Keep demo progress pending until scan data arrives and render captured screenshots eagerly while iframe checks run; preload only cached public voice identity before interaction, never single-use voice capabilities or microphone capture, to reduce startup waits without premature usage.

- Isolate rank audits and homepage comparisons from voice/site rendering; label deterministic examples simulated and share offer arithmetic. Keep the homepage Aspen window preview session-free.

- Keep Gemini Live session instructions and audio-detection settings server-side in its proxy; this keeps language policy consistent and private credentials out of the browser.
- Keep live provider verification tests opt-in through an environment URL; routine tests must not consume third-party call usage.
- Preview voices through the same Gemini Live model as calls, without microphone capture; save the lab preference locally without altering Retell voices.
- Gate noisy-place microphone capture in the browser and use explicit Live activity boundaries in the proxy; replay cached response audio locally with capture paused to avoid new usage and acoustic feedback.
- Resolve Gemini browser calls through single-use server-authorized sessions and published tenant agent snapshots; callers never supply prompts or tenant authorization.
- Voice Agents uses organization memberships and a separate protected platform role table; private sources and call history remain tenant-scoped.
- Reuse GeminiConversation for lab, admin tests, homepage and prospect demos; Retell components remain only for rollback and existing telephone workflows.
- Apply saved reading size through root rem sizing, with wrapping and scrollable navigation rather than CSS page zoom, to avoid horizontal clipping.
- Keep microphone amplitude filtering browser-side with silence frames and speech-tail hangover; Gemini language and provider VAD remain server-side.
- Render transcript messages with AI Elements MessageResponse; the demo shares one floating shell around existing chat and Gemini voice transports, ending microphone capture when leaving voice mode so text chat never captures audio.
- Share launcher face/label across Aspen widgets. Portal floating shells to the document body and derive the default lower-right corner from current viewport and measured size, so loading/keyboard resizing cannot leave a stale top position. Preserve manual dragging until open/close reset, keep composer outside transcript, and layer dialogs/selects above widgets.
- Prebundle transcript renderer dependencies and recover stale Vite chunk loads once per minute; preview updates must not leave open tabs blank or cause reload loops.
- Build prospect simulation configurations separately from homepage sales configurations, sharing only voice identity so platform greetings never leak into business roleplay.
- Store editable prospect simulation templates separately from homepage sales templates; platform actions require explicit on-screen confirmation and never act for the simulated business.
- Use a session-bound pending-action registry for Gemini native tools; only browser-confirmed contact data can be saved, and platform bookings share verified Google Calendar availability and slot rules with the booking page.
- Derive platform calendar conflicts from paginated original event boundaries, not merged freeBusy intervals, so date-only travel can remain nonblocking while timed events, offsets and existing reservations stay authoritative.
- Keep WebSocket lifetime work pending until close to avoid early worker retirement; server session deadlines remain authoritative and hard hosting limits still apply.
- Keep scraped business contacts in source knowledge, not visitor contact fields; confirmed visitor data is recorded in call history without overwriting populated lead fields.
- Seed homepage-only reviewed sales knowledge into draft/published snapshots; never scrape marketing for offers. Identify sales sessions by saved slug, separate their allowance from simulations, and wait for playback before silence check-ins; suspend for pauses, handoffs and confirmations.
- Share ordered homepage service positioning and attributed evidence between public copy and server sales knowledge; allow one bounded next-service continuation after a permission question, preserving silence closure and explicit-action consent.
- Persist voice audio measurements and raw provider reports server-side with periodic checkpoints; apply only model-matched explicit rate snapshots and label estimates separately from invoices.
- Keep documented Live model comparison limited to authorized draft tests and voice auditions; published conversations retain the default, and model-specific published audio rates are versioned separately from recorded measurements.
- Share model-matched conversation planning totals between Voice Agents and Voice Costs, with explicit input/output assumptions; recorded per-session estimates remain separate from provider invoices.
- Discover website learning links within the submitted URL scope, preserve source-labelled original evidence ahead of generated research, and bound two-level scans by page and time budgets.
- Classify voice auditions and verified platform-admin tests server-side separately from visitor calls; retain the shared daily cap and return expected quota denials as handled session results.
- Isolate assistant rendering from the public page; checkpoint consented transcripts and call diagnostics, distinguish caller mentions from sales coverage, and keep campaign milestones contact-free and admin-readable.

- Authorize browser handoffs from server-issued session capabilities and saved agent destinations; validate Twilio webhook signatures and atomically persist transitions, never accept client-supplied telephone targets.
- Pause Gemini capture and playback during the Twilio browser leg, retaining its session for return; keep legacy callback transfers separate to prevent duplicate dialing.
- Use plain imperative Leaflet (`L.map` in useEffect), never react-leaflet: react-leaflet v5 requires React 19 and crashes on React 18 with "render2 is not a function".
- Share the isolated Leaflet street-map renderer between homepage illustrations and measured audits; public demo examples prefill editable inputs without opening paid scans or voice sessions.
- Live rank audits go through the `demo-rank-audit` function (Serper), cached 7 days in `rank_scan_cache` with a 30-scan daily cap; failed cells stay null, never fabricated.
- Homepage voice pacing runs server-side in the Live proxy: a one-time soft wrap-up, then calls continue only while the caller keeps speaking, under a server safety ceiling; this saves minutes without cutting off engaged visitors.
- Prospect demos use a five-minute soft checkpoint and a fifteen-minute server ceiling; silence closure is shared, but reviewed platform sales knowledge stays separate from website roleplay and is used only after an explicitly announced transition.
- Share compact sales actions across public Aspen shells; server-validated plan recommendations open the matching plan-selection anchor in a new tab, never charge or navigate a live conversation automatically. Do not show platform sales actions on tenant agent pages.
- Provision private customer workspaces atomically only from server-verified payments; recheck environment-scoped entitlements for edits/sessions. Never infer payment from return URLs or grant platform roles. Customer /account is separate from admin; scope its editor to the paid agent and share public header/footer.
- Version validated appearance in agent JSON; expose only public color/font tokens. Website style suggestions use captured scan evidence for review, never arbitrary CSS or private prompts.
- Send owner/operational app emails through the owner's Hostinger mailbox SMTP helper (_shared/hostinger-mail.ts); Hostinger cannot delegate subdomains and the owner wants a portable setup.
- Public headers show one AccountMenu: signed-out Log in/Create account links to /account; admin menu entries appear only from the protected platform role table, never hidden gestures or client flags.
