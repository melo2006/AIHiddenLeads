# Current work

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