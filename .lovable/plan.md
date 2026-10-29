# Floating Aspen assistant

## Result
Replace the floating boxed voice presentation with Aspen’s professional cut-out portrait, while retaining chat and all existing Gemini voice features. The square transparent portrait is already created and downloadable.

## Presentation
- Show the person without a surrounding frame in the lower corner. Use the new Aspen portrait by default; retain each customer’s own saved face and assistant name.
- Place **Talk to Aspen** beneath the person, or **Talk to [saved name]** for clients.
- Keep dragging and light-colored close/minimize controls. Closing ends microphone capture; minimizing preserves the existing call behavior and returns to a compact launcher.
- After starting, place a two-line scrolling transcript and the existing talk/end, mute, pause/resume, replay and settings controls beneath the portrait.
- Keep text chat available, with its usable message window and composer. Preserve explicit transcript consent and all current voice safety rules.
- Apply the shared presentation to the homepage floating assistant, demo room and customer floating widgets. Leave unrelated homepage sections, pricing and admin layouts unchanged.

## Simli face
Make the new portrait available to the existing admin photo-upload flow. Creating the new Simli face uses that flow’s explicit action; do not silently replace the saved live face with a different existing preset.

The transparent PNG is verified. Simli documentation does **not** guarantee transparent live video from a transparent portrait. Retain the cut-out photo while connecting and on voice fallback; do not claim background-free lip-sync until the returned stream is verified. If Simli returns an opaque background, report it rather than fake lip movement or hide the limitation.

## Technical details
- Reuse the existing draggable viewport positioning, shared Gemini conversation lifecycle, Simli session authorization and audio routing; do not create duplicate live sessions.
- Add a shared face-first presentation option and portrait fallback without changing provider models, time limits, consent or microphone settings.
- Keep sessions click-gated and provider credentials private. No idle live video minutes.

## Checks
Verify portrait rendering, lower-corner position, dragging, close/minimize/reset, text chat and call-consent controls on desktop and phone sizes. Run existing avatar/viewport regression tests. Verify new-face playback only after it is created and available; report unavailable video or opaque backgrounds separately from successful voice.