# Architecture rules

- Keep Gemini Live session instructions and audio-detection settings server-side in its proxy; this keeps language policy consistent and private credentials out of the browser.
- Keep live provider verification tests opt-in through an environment URL; routine tests must not consume third-party call usage.
- Preview voices through the same Gemini Live model as calls, without microphone capture; save the lab preference locally without altering Retell voices.
- Gate noisy-place microphone capture in the browser and use explicit Live activity boundaries in the proxy; replay cached response audio locally with capture paused to avoid new usage and acoustic feedback.
- Resolve Gemini browser calls through single-use server-authorized sessions and published tenant agent snapshots; callers never supply prompts or tenant authorization.
- Voice Agents uses organization memberships and a separate protected platform role table; private sources and call history remain tenant-scoped.
- Reuse GeminiConversation for lab, admin tests, homepage and prospect demos; Retell components remain only for rollback and existing telephone workflows.
- Apply saved reading size through root rem sizing, with wrapping and scrollable navigation rather than CSS page zoom, to avoid horizontal clipping.
- Keep microphone amplitude filtering browser-side with silence frames and speech-tail hangover; Gemini language and provider VAD remain server-side.
- Render voice transcript messages with AI Elements MessageResponse; voice-only surfaces omit text composers because input is the existing PCM microphone stream.
- Prebundle transcript renderer dependencies and recover stale Vite chunk loads once per minute; preview updates must not leave open tabs blank or cause reload loops.
