// Browser-minutes overage facts (Handoff improvement batch,
// 2026-11-12; browser rate added 2026-11-12 on Ron's decision).
// Forensic trigger (Ron's live session d6f353f7, 2026-11-12): asked
// what happens past the included minutes, Aspen first quoted "20
// cents per minute" for BROWSER voice minutes, then — pressed —
// contradicted herself ("I'm not entirely sure about the exact
// overage rate"). At that time the 20¢ figure was real but scoped:
// it was the rate for additional VIDEO AVATAR minutes beyond the
// included video minutes on the avatar add-on (homepage-knowledge
// .ts, HOMEPAGE_ADDONS), and NO per-minute overage rate for browser
// voice minutes existed anywhere in the pricing source of truth —
// so the original pin forbade quoting one. Ron then DECIDED the
// browser voice overage rate himself (2026-11-12): 20 cents per
// minute, quotable. The pin now states that rate cold, while the
// video avatar rate stays a SEPARATE fact with its own source —
// same number, different allowance, never merged. Rollover is
// Ron-approved (2026-11-08) and already pinned in PLAN_FACTS_EXACT;
// it is restated here so the overage answer is complete in one
// place. The proxy appends this pin to homepage-sales sessions
// only (every other session's prompt stays byte-identical).
//
// Why the constant lives here and not in a plans/pricing module:
// no module is shared as the quotable-sales-facts source across
// the edge functions and the site — payment-rules.ts is Stripe
// billing plumbing (legacy plan ids, charge amounts), src/lib/
// telephonyPricing.ts is per-second PHONE/SMS pricing in the
// client tree (unreachable from Deno functions at deploy time),
// and PLAN_FACTS_EXACT is a frozen verbatim string. This module
// is the dedicated overage source of truth the proxy consumes.

/** Browser voice minutes beyond the included plan minutes.
 *  Source: Ron's decision, 2026-11-12. Quotable — Aspen states it. */
export const BROWSER_VOICE_OVERAGE_CENTS_PER_MINUTE = 20;

export const BROWSER_MINUTES_OVERAGE_POLICY = `BROWSER MINUTES AND OVERAGE — ANSWER CONSISTENTLY: The included browser voice minutes are 400 a month on Premium, 1,200 on Professional and 2,500 on Platinum, and they roll over month to month while the subscription stays active (banked minutes expire after 90 days, and unused minutes are forfeited if the subscription ends). If a visitor asks what happens when they go over the included browser voice minutes, give the same answer every time: browser voice minutes beyond the included amount cost ${BROWSER_VOICE_OVERAGE_CENTS_PER_MINUTE} cents per minute — state that plainly, every time, without hedging, without saying you are not sure, and without deflecting to a sales specialist; this rate is approved and confirmed, and it is the exception to any general caution about quoting overage prices, which covers only details that are not confirmed. Keep the other usage facts separate and never mix the allowances up: additional video avatar minutes beyond the included video minutes on the video avatar add-on also cost 20 cents/minute — the same price, but a different allowance, priced from the add-on — and that video overage applies only once the avatar is a kept, paid add-on: during the avatar's free first month there are no overage charges, and if the included video minutes run out the avatar pauses to voice-only for the rest of that month; telephone usage is a separate allowance, billed at 5 cents/minute.`;
