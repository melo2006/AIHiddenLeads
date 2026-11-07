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
const SILENCE_GAP_MS = 700; // mirrors the Gemini VAD silenceDurationMs

export function createLatencyTracker(provider) {
  const setupEpoch = {}; // name -> epoch ms
  const turns = [];
  let zeroAt = null; // epoch ms of the setup-chain origin (first setup mark)
  let lastInboundAt = null;
  let burstStartAt = null; // first inbound frame after a silence gap
  let outboundOpen = false; // an outbound turn is being emitted
  let greetingFirstOutAt = null;

  const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null;

  return {
    /** Record a named setup-chain timestamp (epoch ms). First mark is the origin. */
    noteSetup(name, at = Date.now()) {
      if (zeroAt == null) zeroAt = at;
      if (setupEpoch[name] == null) setupEpoch[name] = at;
    },
    /** An inbound media frame arrived from the carrier. */
    noteInbound(at = Date.now()) {
      if (lastInboundAt == null || at - lastInboundAt > SILENCE_GAP_MS) burstStartAt = at;
      lastInboundAt = at;
      outboundOpen = false; // caller speech closes any outbound turn in progress
    },
    /** An outbound media frame was sent to the carrier. */
    noteOutbound(at = Date.now()) {
      if (greetingFirstOutAt == null) greetingFirstOutAt = at;
      if (!outboundOpen && lastInboundAt != null) {
        turns.push({ t_first_in_after_silence: burstStartAt, t_last_in: lastInboundAt, t_first_out: at, turn_latency_ms: at - lastInboundAt });
      }
      outboundOpen = true;
    },
    /** Gemini reported an interruption: the next outbound frame starts a new turn. */
    noteInterrupted() { outboundOpen = false; },
    /** End-of-call summary for the backend `end` report + journal logging. */
    snapshot() {
      const lat = turns.map(t => t.turn_latency_ms).sort((a, b) => a - b);
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
      };
    },
  };
}
