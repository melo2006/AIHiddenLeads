# Campaign and call reporting

Private screen: `/dashboard/campaign-results`. Existing call detail: `/dashboard/calls`.

## Available now
- Browser milestones: landing/demo page, scan start, demo-room arrival, voice start/end, checkout page and booking page.
- Source/campaign labels from `utm_source` and `utm_campaign`, retained for a tab visit and attached to browser voice sessions.
- New browser calls require the recording notice and Start & agree. Provider-received caller/assistant PCM is checkpointed separately in private WAV segments, alongside transcripts; these are not a mixed real-time recording, and interruptions/network gaps can affect completeness. Admin private records show segments, transcripts and generated summaries/draft suggestions.
- Service mentions come only from saved visitor speech. Aspen's presentation coverage is separate. The displayed rule score is an engagement indicator, not an AI buying-intent assessment; silent listeners have no score. Negated mentions may still be matches—review the quoted evidence.
- Transcript and call-history checkpoints every ten seconds reduce loss if hosting retires a worker. Unexpected close codes/end reasons are retained for new calls. Assistant render recovery cannot take down the homepage.

## Honest limits
- Past Gemini calls had no saved audio, transcripts or summaries. Those cannot be recovered.
- A tracked visit is a tab-session identifier, not an ad-platform click or verified unique person. Tests can appear in reporting. Data limits are shown on the dashboard.
- Checkout/booking page views are not purchases or confirmed bookings. No ads account or spend/impressions integration is enabled by this change.
- Daily owner digests use the Hostinger mailbox and the existing schedule; the unfinished sender-domain service is disabled. Digests cover a rolling 24-hour window, not an Eastern calendar day.
- Call cards show Eastern dates/times and visitor-local time where the browser setting was saved. Website voice and separate telephone records are identified; unknown legacy origins remain unknown.
- Public voice calls join their saved campaign visit UUID to observed pages and homepage sections (services, prices, Maps, demo, how it works, FAQ and add-ons). Section visibility is not proof of reading. Visits in other tabs/devices and telephone callers cannot be joined without a separately authorized correlation method; historical untracked sections cannot be recovered.
- Approximate caller city/country is currently unavailable: no verified IP geolocation service or trusted caller-location header is configured. Browser timezone, business headquarters, telephone area code and a Twilio webhook IP must never be substituted. A future verified coarse lookup or explicit caller statement must retain provenance; raw IP and precise coordinates must not appear in owner emails.
- Private audio storage/playback is enabled for newly agreed browser voice calls, not historical calls or telephone legs. Deletion requests go to info@aihiddenleads.com; no automatic retention purge is configured yet. Existing service-interest scores remain rule-based; new separate AI summaries can contain errors and require human review.
- The optional conversation-copy native action requires spoken email readback and on-screen permission, then emails one seven-day hashed-token private transcript/summary link via Hostinger after call close. No visitor audio or admin outreach draft is exposed by the recipient read. Recording/copy agreement is never marketing or model-training permission; no automatic outbound calls or campaigns were added.

## Launch checklist
1. Use tagged links: `https://aihiddenleads.com/demo?utm_source=facebook&utm_campaign=voice_launch`, changing source for TikTok.
2. Run a real demo and optionally consent to a written transcript; review milestones and call evidence while signed in.
3. Publish frontend updates before launching ads. Shared deployed voice functions already use new diagnostics.
4. Check the next Hostinger owner digest for Eastern/local start times, origin, summaries and observed page trails. Missing tracking/location must stay marked unavailable.
5. Connect approved ads accounts separately if exact impressions, clicks, spend, cost per lead and conversion reconciliation are needed.