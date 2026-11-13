// Symmetric per-call latency instrumentation for the phone bridge (SCOPE §5).
// Used identically by the Twilio handler (server.mjs) and the Telnyx handler
// (telnyx.mjs); only the provider tag and the setup-chain vantage differ.
//
// Headline metric per conversational turn:
//   turn_latency_ms = t_first_out - t_last_in
// where t_last_in is the arrival time of the last inbound media frame before
// Gemini's response turn starts (~ caller speech end as the bridge sees it)
// and t_first_out is the first outbound media frame of that turn. The figure
// includes Gemini VAD endpointing + model time-to-first-audio; with identical
// Gemini config on both carriers, the delta between carriers is the
// carrier + transport contribution.
//
// KNOWN LIMIT of the legacy metric (proven on Ron's 2026-11-12 A&R Towing
// call: avg 10 ms / max 20 ms across 303 "turns"): inbound media frames —
// silence included — arrive every ~20 ms and noteInbound() resets
// outboundOpen, so almost every outbound chunk measures ~one frame interval
// instead of a conversational pause. The speech-aware conversational turns
// below (convTurns / conv_turn_latency_ms) are the meaningful measure: last
// caller SPEECH end -> first outbound frame of Aspen's next turn. They are
// additive only — the legacy turns/summaries keep their exact shape because
// server.mjs and the dashboard consumers rely on them.

// Burst-gap threshold for inbound bookkeeping: when inbound frames pause for
// longer than this, the next frame starts a new burst (burstStartAt, which
// feeds the legacy turns' t_first_in_after_silence). It does NOT measure or
// gate turn latency. The value is aligned to the phone-path Gemini VAD
// silenceDurationMs (1000 ms) so a "burst" here spans roughly what the VAD
// treats as one utterance.
export const SILENCE_GAP_MS = 1000;

// A caller speech burst counts as COMPLETED once a non-speech gap of at
// least this long has been observed after its last speech frame. 250 ms is
// deliberately far below the 1000 ms VAD window: mid-word / mid-list pauses
// shorter than this keep the burst open, so a conversational turn is only
// measured from the end of a burst the caller actually finished.
export const SPEECH_BURST_COMPLETE_GAP_MS = 250;

export function createLatencyTracker(provider) {
  const setupEpoch = {}; // name -> epoch ms
  const turns = [];
  const convTurns = [];
  let zeroAt = null; // epoch ms of the setup-chain origin (first setup mark)
  let lastInboundAt = null;
  let burstStartAt = null; // first inbound frame after a silence gap
  let outboundOpen = false; // an outbound turn is being emitted
  let greetingFirstOutAt = null;
  // Speech-aware state. speechFlagsSeen flips the first time any caller
  // passes opts.speech (the Telnyx handler always does; the Twilio handler
  // in server.mjs never does, so its snapshots keep convTurns empty and the
  // conv summaries null — byte-compatible with the pre-existing shape).
  let speechFlagsSeen = false;
  let openBurst = null; // { startAt, lastSpeechAt } — burst still running
  let completedBurst = null; // { t_last_speech_end } — latest finished burst, unconsumed

  const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null;

  // Lazily close the open speech burst once `at` proves a >=250 ms
  // non-speech gap after its last speech frame. Called from inbound frames
  // (speech or not) and from outbound frames — whichever observes the gap
  // first — so no timers are needed.
  const maybeCompleteBurst = (at) => {
    if (openBurst && at - openBurst.lastSpeechAt >= SPEECH_BURST_COMPLETE_GAP_MS) {
      completedBurst = { t_last_speech_end: openBurst.lastSpeechAt };
      openBurst = null;
    }
  };

  return {
    /** Record a named setup-chain timestamp (epoch ms). First mark is the origin. */
    noteSetup(name, at = Date.now()) {
      if (zeroAt == null) zeroAt = at;
      if (setupEpoch[name] == null) setupEpoch[name] = at;
    },
    /**
     * An inbound media frame arrived from the carrier. `opts.speech`
     * (optional boolean) marks frames whose audio energy looks like speech;
     * callers that never pass it keep the legacy behaviour untouched.
     */
    noteInbound(at = Date.now(), opts) {
      if (lastInboundAt == null || at - lastInboundAt > SILENCE_GAP_MS) burstStartAt = at;
      lastInboundAt = at;
      outboundOpen = false; // caller speech closes any outbound turn in progress
      if (opts && typeof opts.speech === 'boolean') {
        speechFlagsSeen = true;
        if (opts.speech) {
          // A speech frame arriving a full burst-gap after the previous
          // burst's last speech frame ends that burst outright (the >=250 ms
          // completion rule is already satisfied) and starts a fresh one.
          if (openBurst && at - openBurst.lastSpeechAt >= SILENCE_GAP_MS) maybeCompleteBurst(at);
          if (openBurst) openBurst.lastSpeechAt = at;
          else openBurst = { startAt: at, lastSpeechAt: at };
        } else {
          maybeCompleteBurst(at);
        }
      }
    },
    /** An outbound media frame was sent to the carrier. */
    noteOutbound(at = Date.now()) {
      if (greetingFirstOutAt == null) greetingFirstOutAt = at;
      // An outbound frame can be the first observer of the post-speech gap
      // (speech frames then nothing until Aspen replies): close the burst
      // before deciding whether this frame answers it.
      if (speechFlagsSeen) maybeCompleteBurst(at);
      const isTurnStart = !outboundOpen;
      if (isTurnStart && lastInboundAt != null) {
        turns.push({ t_first_in_after_silence: burstStartAt, t_last_in: lastInboundAt, t_first_out: at, turn_latency_ms: at - lastInboundAt });
      }
      if (isTurnStart && completedBurst) {
        convTurns.push({ t_last_speech_end: completedBurst.t_last_speech_end, t_first_out: at, conv_turn_latency_ms: at - completedBurst.t_last_speech_end });
        completedBurst = null; // consumed: one reply answers one burst
      }
      outboundOpen = true;
    },
    /** Gemini reported an interruption: the next outbound frame starts a new turn. */
    noteInterrupted() { outboundOpen = false; },
    /** End-of-call summary for the backend `end` report + journal logging. */
    snapshot() {
      const lat = turns.map(t => t.turn_latency_ms).sort((a, b) => a - b);
      const convLat = convTurns.map(t => t.conv_turn_latency_ms).sort((a, b) => a - b);
      const setupMs = {};
      for (const [k, v] of Object.entries(setupEpoch)) setupMs[k] = zeroAt == null ? null : v - zeroAt;
      return {
        provider,
        setup: setupEpoch,
        setupMs,
        greetingMs: greetingFirstOutAt != null && zeroAt != null ? greetingFirstOutAt - zeroAt : null,
        turns,
        turnLatencyAvgMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
        turnLatencyMedianMs: lat.length ? lat[Math.floor((lat.length - 1) / 2)] : null,
        turnLatencyP95Ms: percentile(lat, 95),
        // Conversational (speech-aware) turns — additive fields. Empty /
        // null whenever no speech flags were ever supplied.
        convTurns,
        convTurnLatencyAvgMs: convLat.length ? Math.round(convLat.reduce((a, b) => a + b, 0) / convLat.length) : null,
        convTurnLatencyMedianMs: convLat.length ? convLat[Math.floor((convLat.length - 1) / 2)] : null,
        convTurnLatencyP95Ms: percentile(convLat, 95),
      };
    },
  };
}
