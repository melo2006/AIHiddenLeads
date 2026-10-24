# Architecture rules

- Keep Gemini Live session instructions and audio-detection settings server-side in its proxy; this keeps language policy consistent and private credentials out of the browser.
- Keep live provider verification tests opt-in through an environment URL; routine tests must not consume third-party call usage.
- Preview voices through the same Gemini Live model as calls, without microphone capture; save the lab preference locally without altering Retell voices.