// G.711 mu-law <-> PCM16 conversions between Twilio (8 kHz mu-law) and Gemini Live (16 kHz in / 24 kHz out).
export function muToPcm(u) { u = ~u & 0xff; const s = u & 0x80, e = (u >> 4) & 7, m = u & 0x0f; let x = ((m << 3) + 0x84) << e; x -= 0x84; return s ? -x : x; }
export function pcmToMu(x) { const BIAS = 0x84, CLIP = 32635; const s = (x >> 8) & 0x80; if (s) x = -x; if (x > CLIP) x = CLIP; x += BIAS; let e = 7; for (let m = 0x4000; (x & m) === 0 && e > 0; e--, m >>= 1); const man = (x >> (e + 3)) & 0x0f; return ~(s | (e << 4) | man) & 0xff; }
/** Twilio 8 kHz mu-law -> Gemini 16 kHz PCM16 (linear upsample). */
export function twilioToGemini(b64) {
  const mu = Buffer.from(b64, 'base64'); const out = Buffer.alloc(mu.length * 4);
  for (let i = 0; i < mu.length; i++) { const a = muToPcm(mu[i]), b = i + 1 < mu.length ? muToPcm(mu[i + 1]) : a; out.writeInt16LE(a, i * 4); out.writeInt16LE((a + b) >> 1, i * 4 + 2); }
  return out.toString('base64');
}
/** Gemini 24 kHz PCM16 -> Twilio 8 kHz mu-law (3-sample average). Returns { payload, samples }. */
export function geminiToTwilio(b64) {
  const pcm = Buffer.from(b64, 'base64'); const n = Math.floor(pcm.length / 6); const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) { const o = i * 6; out[i] = pcmToMu(Math.round((pcm.readInt16LE(o) + pcm.readInt16LE(o + 2) + pcm.readInt16LE(o + 4)) / 3)); }
  return out.toString('base64');
}
/** Published-rate audio estimate (not an invoice). */
export function audioEstimate(inSec, outSec, pricing) {
  if (!pricing) return null;
  return Math.round(((inSec / 60) * pricing.inputAudioPerMinute + (outSec / 60) * pricing.outputAudioPerMinute) * 1e6) / 1e6;
}
