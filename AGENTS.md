# Architecture rules

- Keep public-only no-JS HTML; hide it behind themed startup until React mounts. Never include tenant data or imply route-specific rendering.

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
- Share FloatingPersonFrame/GeminiConversation and viewport drag. Minimize preserves calls; close unmounts calls only. Both retain a draggable reopen bubble. Compact captions, separate composer, dialogs above.
- Prebundle transcript renderer dependencies and recover stale Vite chunk loads once per minute; preview updates must not leave open tabs blank or cause reload loops.
- Build prospect simulation configurations separately from homepage sales configurations, sharing only voice identity so platform greetings never leak into business roleplay.
- Store editable prospect simulation templates separately from homepage sales templates; platform actions require explicit on-screen confirmation and never act for the simulated business.
- Use a session-bound pending-action registry for Gemini native tools; only browser-confirmed contact data can be saved, and platform bookings share verified Google Calendar availability and slot rules with the booking page.
- Derive platform calendar conflicts from paginated original event boundaries, not merged freeBusy intervals, so date-only travel can remain nonblocking while timed events, offsets and existing reservations stay authoritative.
- Keep WebSocket lifetime work pending until close to avoid early worker retirement; server session deadlines remain authoritative and hard hosting limits still apply.
- Keep scraped business contacts in source knowledge, not visitor contact fields; confirmed visitor data is recorded in call history without overwriting populated lead fields.
- Seed homepage-only reviewed sales knowledge into draft/published snapshots; never scrape marketing for offers. Identify sales sessions by saved slug, separate their allowance from simulations, and wait for playback before silence check-ins; suspend for pauses, handoffs and confirmations.
- Share canonical homepage greeting, services and evidence with public previews; reseed only sales fields, preserving transport. Allow one bounded next-service turn after a permission question, preserving silence closure and consent.
- Persist voice audio measurements and raw provider reports server-side with periodic checkpoints; apply only model-matched explicit rate snapshots and label estimates separately from invoices.
- Keep documented Live model comparison limited to authorized draft tests and voice auditions; published conversations retain the default, and model-specific published audio rates are versioned separately from recorded measurements.
- Share model-matched conversation planning totals between Voice Agents and Voice Costs, with explicit input/output assumptions; recorded per-session estimates remain separate from provider invoices.
- Discover website learning links within the submitted URL scope, preserve source-labelled original evidence ahead of generated research, and bound two-level scans by page and time budgets.
- Restore auth and attach bearer tokens on demo starts/reconnects; server-validate admin/audition quota, retain visitor/shared caps and handle denials. Failed auth must not silently downgrade to visitor usage.
- Isolate assistant rendering; checkpoint agreed private audio/text, distinguish caller interest from coverage. Admin-only records/AI drafts; confirmed recipient copies use expiring hashed links, never audio/admin drafts; no auto-outreach.

- Authorize browser handoffs from server-issued session capabilities and saved agent destinations; validate Twilio webhook signatures and atomically persist transitions, never accept client-supplied telephone targets.
- Pause Gemini capture and playback during the Twilio browser leg, retaining its session for return; keep legacy callback transfers separate to prevent duplicate dialing.
- Share the Leaflet renderer for illustrated/live maps and public business presets for audits/setup; preset selection only prefills editable fields, never learns, pays, calls or publishes automatically.
- Live rank audits go through the `demo-rank-audit` function (Serper), cached 7 days in `rank_scan_cache` with a 30-scan daily cap; failed cells stay null, never fabricated.
- Share compact sales actions across public Aspen shells; server-validated plan recommendations open the matching plan-selection anchor in a new tab, never charge or navigate a live conversation automatically. Do not show platform sales actions on tenant agent pages.
- Provision private customer workspaces atomically only from server-verified payments; recheck environment-scoped entitlements for edits/sessions. Never infer payment from return URLs or grant platform roles. Customer /account is separate from admin; scope its editor to the paid agent and share public header/footer.
- Version validated appearance in agent JSON; expose only public color/font tokens. Website style suggestions use captured scan evidence for review, never arbitrary CSS or private prompts.
- Send owner/operational app emails through the owner's Hostinger mailbox SMTP helper (_shared/hostinger-mail.ts); Hostinger cannot delegate subdomains and the owner wants a portable setup.
- Public headers show one AccountMenu: signed-out Log in/Create account links to /account; admin menu entries appear only from the protected platform role table, never hidden gestures or client flags.

- Read nested AGENTS.md. Demo headers are normal-flow, not overlays.
- Share customer/admin setup with real ingestion/Gemini tests; admin drafts never grant payment access. Publish only explicitly. Prefer captured originals over iframe checks; guard loading and save before switching drafts to prevent lost work.
- Share drafts via hashed expiring server tokens; appearance-only, visitor quota, no handoff.
- Simli lip-syncs Gemini; guard sends/drain, secrets, photo fallback. Transparency = server green backdrop + browser WebGL key, never assumed alpha. Share catalog/device tests; check custom readiness.
