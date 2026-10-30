// Shared phone-answering rules (also unit-tested from src/lib).
type PricingLike = { twilio_inbound_per_min: number; default_markup_pct: number; fixed_voice_per_min: number | null };
type ClientLike = { markup_pct: number | null; fixed_voice_per_min: number | null };

/** Customer $/min: client fixed > client markup > default fixed > default markup. */
export function monthlyRate(p: PricingLike, c: ClientLike): number {
  if (c.fixed_voice_per_min != null) return Number(c.fixed_voice_per_min);
  if (c.markup_pct != null) return Number(p.twilio_inbound_per_min) * (1 + Number(c.markup_pct) / 100);
  if (p.fixed_voice_per_min != null) return Number(p.fixed_voice_per_min);
  return Number(p.twilio_inbound_per_min) * (1 + Number(p.default_markup_pct) / 100);
}

/** Seconds Aspen may talk on this call: 15-minute ceiling, reduced by the remaining monthly cap. */
export function phoneMaxSeconds(capUsd: number | null, ratePerMin: number, usedSeconds: number): number {
  const CEILING = 900;
  if (capUsd == null || ratePerMin <= 0) return CEILING;
  const remaining = Number(capUsd) - (usedSeconds / 60) * ratePerMin;
  if (remaining <= 0) return 0;
  return Math.min(CEILING, Math.floor((remaining / ratePerMin) * 60));
}

const CHIRP = new Set(['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat']);
/** Twilio <Say> voice matching Aspen's Gemini voice name (same Google voice family). */
export function chirpVoice(geminiVoice: string): string {
  return `Google.en-US-Chirp3-HD-${CHIRP.has(geminiVoice) ? geminiVoice : 'Kore'}`;
}
