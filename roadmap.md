# Current work

- [x] Correct platform calendar availability: ignore all-day events, honor timed busy events, use 8am–6pm Eastern and offer next openings within two weeks. Deployed and verified live /book openings October 26 through November 6; selected 8am without creating an event. Calendar/slot tests passed; live spoken booking confirmation remains unverified.
- [ ] Fix clipped voice settings with a simple three-level noise menu; visible street maps and distinct business-center marker.
- [ ] Make homepage business name optional, use scanned identity, and provide reusable B2B audit searches/results.
- [ ] Add editable simulation greeting/system prompt, five-minute duration visibility, confirmed visitor contact capture and platform-only calendar booking.
- [ ] Verify connected personal calendar availability and demo/appointment flows; diagnose premature voice disconnects.

- [x] Improve homepage and live rank marker readability over real street maps; homepage remains explicitly illustrative.
- [x] Add four verified editable public business examples and direct audit access on /demo; explain required inputs and local versus nationwide limitations.
- [x] Verify example selection, validation and street tiles without paid Google Maps calls; 21 tests passed. Fresh live Google Maps behavior awaits user validation on the deployed authorized origin; testing guide in docs/RANK-AUDIT-TESTING.md.

- [x] Keep homepage scan progress continuous until actual data arrives; eager screenshot fallback skips unnecessary remote browser wait, with bounded slow-iframe fallback. Delayed 18-second scan test confirmed no premature ready message and successful demo transition.
- [x] Preload cached public Aspen identity/avatar and free proxy health check; prepare authorization and microphone concurrently after a click, autostart externally opened demo widgets. BankUnited screenshot appeared in 3 seconds, greeting in 4.9 seconds, no pre-click voice session or runtime errors; 11 focused tests passed. Real-device/provider timing varies.

- [x] Add homepage interactive illustrative 25-point before/after comparison directly below laptop section; both maps, pin selection and demo-form CTA verified in browser, phone layout without horizontal overflow.
- [x] Update growth package copy and $299/mo search bundle in English, Portuguese and Spanish; 15 grid/offer tests passed, Portuguese rendering verified, no browser errors. Live measurement/tracking remains provider-setup dependent; Aspen unchanged.

- [x] Allow SEO/AI crawlers and enrich static metadata with factual LocalBusiness schema; no invented address or hours.
- [x] Add isolated demo-bar 25-point simulated audit, fast-win summary, offer links and authenticated future live-provider hook; 8 rule tests passed, desktop/phone panel and both offer destinations verified. Live provider integration intentionally deferred until credentials and adapter setup; no paid calls made.

- [x] Audit homepage Aspen knowledge, add reviewed services/prices/limitations to draft and published snapshots without publishing unrelated transfer settings; live homepage answer gave all three monthly/setup prices and reactivation correctly; 16 tests passed.
- [ ] Reconcile conflicting marketing terms (100 vs 500 included conversations, fixed overages vs passthrough, obsolete Retell/$149 offer and unsupported statistics); awaits owner-confirmed usage/overage terms before changing commercial promises.

- [x] Add browser handoff controls, saved agent manager destination, private press-1 acceptance, no-answer recovery and atomic call-history status; deployed and 19 tests passed; authenticated settings verified.
- [ ] Verify actual browser-to-manager call, private audio and return to Aspen; blocked on Twilio Voice signing keys and configured manager number. Prospect simulations remain non-dialing until a separately authorized business destination is configured.
- [x] Give step-by-step Twilio browser signing-key links and explain why existing connector credentials cannot sign browser tokens.
- [x] Verify Google's shared Live rates and model IDs; show model-matched 1/2/5/10-minute conversation estimates in both screens. Use $0.00576/min token-derived input and $0.018/min published output for future estimates; saved historical snapshots preserved. Verified signed-in selection and 24 cost records; 16 tests passed.
- [x] Recommend Twilio for the first Gemini telephone rollout and Telnyx as a later cost option; identify /dashboard/telephony scope, true browser handoff versus existing callback bridge, carrier fees, consent and signed-webhook prerequisites. Telephone migration is a recommendation, not enabled in this change.
- [x] Separate verified admin tests and auditions from visitor quota; retain the shared daily cap. Verified signed-in session authorization and handled quota message with the page still usable; 14 tests passed.
- [x] Add Play/Stop auditions beside the agent voice selector and link agent/history screens to Voice Costs.
- [x] Verify exact Google Live pricing and supported alternatives; show model-matched per-call and per-minute estimates separately from measurements.
- [x] Add documented model comparison for authorized tests without changing published agents; authenticated phone and desktop pages show costs without page overflow. Audition connections reached ready for 3.8 and 3.1; extended-thinking audio was not verified.
- [x] Remove sales pitches from business simulations and preserve business-specific greetings; live BankUnited greeting and banking answer verified.
- [x] Expand first-level menu learning and optional second-level coverage without replacing deep listing scope; BankUnited refresh read 8 pages within the deadline, not all pages.
- [x] Add protected per-call voice usage reporting, unknown historical costs, rate snapshots and CSV export; live test saved 19 seconds and two provider usage reports.
- [x] Enable dollar estimates using Google's exact Live audio minute equivalents verified October 24, 2026; retain unknown costs for unmeasured history.
- [x] Verify simulation rules, learning scope, cost calculations and authenticated cost screen at desktop and phone sizes.
- [x] Fix screenshot homepage/menu clipping; verified phone text at 320, 338 and 390 pixels through 150% reading size.
- [x] Add saved menu text-size controls, labelled voice controls and microphone sensitivity; verified pause stays suspended, replay does not duplicate captions and settings persist.

- [x] Approve and implement Gemini homepage, Voice Agents settings, and existing prospect-demo links.
- [x] Verify saved settings, publishing, homepage greeting, document processing and business-specific demo history.
- [x] Restrict legacy CRM and upload permissions when enabling client voice memberships.
- [x] Add microphone selection, mute and hold-to-talk; verified no audio sent when released or muted.
- [x] Strengthen English response guidance and verify explicit language changes only.
- [x] Verify real English speech through the browser microphone path; caller's name and services question recognized in English and answered in English. Added mobile sample-rate normalization and tests.
- [ ] Confirm performance on the user's actual Android headset; physical microphone testing requires their device.
- [x] Add local replay of Aspen's last message; verified no new provider request and no capture during replay.

- [x] Fix silent startup; verify greeting playback, outgoing microphone audio and caller-triggered responses. Synthetic speech recognition remains imperfect; real Android testing is needed.
- [x] Add voice previews and save the preferred Gemini voice in this browser.

- [x] Default Gemini Live to English; switch only on explicit language request.
- [x] Keep language/noise instructions and restore prompt speech onset detection after low sensitivity missed caller speech.
- [x] Deploy and verify English responses and explicit Portuguese switching.
- [x] Explain the shared customer knowledge and transfer integration needed for a future admin provider choice.
## Serper live 25-point audit (Oct 26, 2026)
- [x] rank_scan_cache table (7-day cache, daily cap 30 live scans)
- [x] demo-rank-audit: live Serper Maps 5x5 grid + Nationwide AI Search Matrix
- [x] RankAuditPanel: live Leaflet map (OSM tiles), mode toggle, 3-part timeline
- [x] MapVisibilitySection: 3-part growth timeline (en/es/pt-BR)
- [x] Verified live maps + nationwide scans end-to-end; cache hits cost 0 credits
- [ ] Aspen widget Type Chat toggle (voice-only today; needs proxy text turns)
