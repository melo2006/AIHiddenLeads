# Gemini Voice Agents: homepage, clients and prospect demos

## Recommended result
One **Voice Agents** workspace in the existing admin console, not another disconnected test page. Gemini Live powers the homepage Aspen conversation and business-specific browser demos. Retell remains available as a rollback and for existing telephone workflows; Twilio stays responsible for human transfers and SMS.

The first release prioritizes owners opening demo links from your outreach emails. Their demo shows their actual website and talks about their business, not AI Hidden Leads by mistake.

## Where you will manage it
- Existing admin sign-in: `/dashboard`.
- New **Voice Agents** menu: `/dashboard/voice-agents` (to be built).
- One AI Hidden Leads agent plus separate agents associated with each client business.
- Administrator-managed setup initially; authenticated client members can manage only their own business agents. No public self-signup changes.

## Agent setup screen
Use compact tabs: **Identity & Voice**, **Conversation**, **Knowledge**, **Test & Publish**, **History & Limits**.

### Identity & Voice
- Business and agent names, avatar image upload, selectable supported Gemini voices with audition.
- Preserve Aspen’s current appearance by default. An uploaded portrait is a static avatar; automatic talking-video generation or custom voice cloning is not included.
- Voice selection is saved to the business agent, not merely this browser.

### Conversation
- Editable greeting and system prompt.
- Greeting variables: agent name, business name, time-of-day greeting, and visitor name when already known.
- Use the visitor’s local time for “Good morning/afternoon/evening”; fall back to a neutral greeting when unavailable.
- Ask the visitor’s name only when it is not already known; distinguish owner-demo mode from real customer mode.
- English by default; switch languages only when explicitly requested. Keep safety, language and verified-action rules separate from editable instructions.
- Do not claim to book appointments, send messages or transfer a call unless the corresponding action actually succeeds.

### Knowledge
- Main website URL, additional page/vendor documentation URLs, bounded crawl depth, and existing supported document uploads.
- Show each source’s processing status, last refresh and errors; refresh or remove individual sources.
- Preserve exact submitted deep URLs and the original website visuals. Reuse the existing scanner and caching rather than recreating them.
- Process sources before a call; publish a tested knowledge snapshot. Gemini uses supplied context—it is not permanently trained by an upload.
- Instruct the agent to acknowledge unknown information instead of inventing business facts.

### Test & Publish
- Preview the draft agent, audition voices, test greetings and business questions, then publish.
- Separate draft and published settings; changes never alter a live call halfway through.
- Use the working Voice Lab controls: microphone selection, hands-free mode, noisy-place hold-to-talk, mute, end call and local replay.
- Keep the Voice Lab as an internal comparison tool, not the destination sent to prospects.

## Prospect demo flow — launch priority
1. Prepare or refresh a prospect’s scan in the CRM before emailing the link.
2. Preserve prospect/lead context and resolve the correct business on the server.
3. Open the actual website demo with a personalized agent and greeting.
4. Start audio only after the visitor taps to talk; no microphone capture before permission.
5. Simulate that business using its scanned knowledge; retain the existing concise owner-demo introduction, contact verification and conversion goal.
6. Save session outcome and consent-appropriate transcript/summary to Demo History and Call History with a visible Gemini provider label.
7. Keep outreach on the existing email service with identification, opt-out and do-not-contact enforcement. Do not use built-in app emails for marketing campaigns.

## Release order
### 1. Shared settings and safe homepage rollout
Create tenant-scoped agent settings, authorized draft/publish operations, knowledge ingestion and a reusable Gemini voice experience. Create the AI Hidden Leads agent, test it in admin, and switch the homepage browser voice to its published settings with rollback available.

### 2. Personalized emailed demos
Connect the same experience to existing prospect scans and demo URLs. Verify one real prospect end-to-end before broad outreach. Surface missing knowledge or connection errors rather than silently falling back to the wrong business.

### 3. Client operation
Enable client-scoped configuration, per-agent history and usage visibility. Connect supported calendar and Twilio transfer actions separately and verify them before exposing them as promises. Browser Gemini does not automatically replace telephone inbound/outbound service.

## Technical implementation
- Reuse the Live transport and audio utilities from VoiceLab; keep prompts, credentials, knowledge assembly and provider settings server-side.
- Use protected organization memberships and a separate role table, tenant-scoped agents/sources/config versions, and private storage for uploads. Apply explicit grants and RLS; verify effective permissions on existing history tables before exposing client views.
- Do not create user profile fields unless they are needed and approved; business/agent settings do not require profiles.
- Public visitors get short-lived, scoped session authorization after server-side published-agent lookup and usage checks. Admin previews require authentication. Never trust browser-provided tenant IDs or arbitrary prompts.
- Extend existing guardrail enforcement to Gemini: atomic attempt accounting, per-call duration, existing visitor/global limits, and server-side socket shutdown. No separate custom rate limiter in this scope.
- Bound message/audio sizes and knowledge budgets; treat scraped documents as untrusted reference material, not instructions. Restrict URL fetching and uploaded file access.
- Record durations and failures. Label cost estimates as estimates; reconcile actual billed usage where available rather than presenting guessed per-session charges as invoices.
- Record new structural decisions in AGENTS.md during implementation.

## Verification before outreach
- Admin configuration survives reload; a client cannot read or change another client’s settings, sources or history.
- Homepage uses published Aspen settings and greets audibly; caller speech, interruption, mute, hold-to-talk and replay work.
- A real scanned prospect demo answers from the correct website, including a deep URL and additional source/document.
- English remains selected after noise/foreign fragments, and explicit language requests still work.
- Session duration and usage limits close or deny calls on the server; Gemini records read back in history.
- Check desktop and Android-sized layouts; actual headset/Bluetooth audio still needs physical-device confirmation.

## Not included in this first rollout
Custom voice cloning, generated talking-video avatars, complete replacement of Retell phone calling, automatic Gemini warm transfer without integration, or a guarantee that unlimited simultaneous calls are supported by your Google account quota.
