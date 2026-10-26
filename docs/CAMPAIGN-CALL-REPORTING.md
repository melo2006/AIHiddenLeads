# Campaign and call reporting

Private screen: `/dashboard/campaign-results`. Existing call detail: `/dashboard/calls`.

## Available now
- Browser milestones: landing/demo page, scan start, demo-room arrival, voice start/end, checkout page and booking page.
- Source/campaign labels from `utm_source` and `utm_campaign`, retained for a tab visit and attached to browser voice sessions.
- Actual call counts/duration, consented written transcripts and rule-based call-review summaries. Transcript consent is explicit before microphone capture. Audio is processed for the conversation but full audio recordings are not saved.
- Service mentions come only from saved visitor speech. Aspen's presentation coverage is separate. The displayed rule score is an engagement indicator, not an AI buying-intent assessment; silent listeners have no score. Negated mentions may still be matches—review the quoted evidence.
- Transcript and call-history checkpoints every ten seconds reduce loss if hosting retires a worker. Unexpected close codes/end reasons are retained for new calls. Assistant render recovery cannot take down the homepage.

## Honest limits
- Past Gemini calls had no saved audio, transcripts or summaries. Those cannot be recovered.
- A tracked visit is a tab-session identifier, not an ad-platform click or verified unique person. Tests can appear in reporting. Data limits are shown on the dashboard.
- Checkout/booking page views are not purchases or confirmed bookings. No ads account or spend/impressions integration is enabled by this change.
- A daily owner email report is requested but not enabled: sender-domain setup/verification, operational digest delivery and the daily schedule remain open. No per-call emails are sent.
- Full audio storage/playback is not implemented. It requires separate recording consent, private storage and a retention/deletion policy before enabling.
- No new AI-summary provider call is made; current summaries and scores are explicitly rule-based, not fabricated AI analysis.

## Launch checklist
1. Use tagged links: `https://aihiddenleads.com/demo?utm_source=facebook&utm_campaign=voice_launch`, changing source for TikTok.
2. Run a real demo and optionally consent to a written transcript; review milestones and call evidence while signed in.
3. Publish frontend updates before launching ads. Shared deployed voice functions already use new diagnostics.
4. Verify the sender domain, then configure one owner operational report per day with private-detail links and an idempotent send.
5. Connect approved ads accounts separately if exact impressions, clicks, spend, cost per lead and conversion reconciliation are needed.