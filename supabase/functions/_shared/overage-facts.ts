// Browser-minutes overage pin (Handoff improvement batch, 2026-11-12).
// Forensic trigger (Ron's live session d6f353f7, 2026-11-12): asked
// what happens past the included minutes, Aspen first quoted "20
// cents per minute" for BROWSER voice minutes, then — pressed —
// contradicted herself ("I'm not entirely sure about the exact
// overage rate"). The 20¢ figure is real but scoped: it is the rate
// for additional VIDEO AVATAR minutes beyond the included video
// minutes on the avatar add-on (homepage-knowledge.ts, HOMEPAGE_
// ADDONS). NO per-minute overage rate for browser voice minutes
// exists anywhere in the pricing source of truth, and the sales
// prompt already forbids quoting exact overage prices — so this pin
// states the sourced facts and the one consistent answer, and the
// proxy appends it to homepage-sales sessions only (every other
// session's prompt stays byte-identical). Rollover is Ron-approved
// (2026-11-08) and already pinned in PLAN_FACTS_EXACT; it is
// restated here so the overage answer is complete in one place.

export const BROWSER_MINUTES_OVERAGE_POLICY = `BROWSER MINUTES AND OVERAGE — ANSWER CONSISTENTLY: The included browser voice minutes are 400 a month on Premium, 1,200 on Professional and 2,500 on Platinum, and they roll over month to month while the subscription stays active (banked minutes expire after 90 days, and unused minutes are forfeited if the subscription ends). If a visitor asks what happens when they go over the included browser voice minutes, give the same answer every time: no per-minute overage rate for browser voice minutes is published, so never quote one — not 20 cents, not any other figure. The 20 cents/minute figure applies ONLY to additional video avatar minutes beyond the included video minutes on the video avatar add-on; never present it as the browser voice rate. Telephone usage is a separate allowance, billed at 5 cents/minute. For browser minutes past the included amount, say plainly that the exact arrangement is not one you can quote, and offer a quick call with a sales specialist who can confirm it — without first quoting a rate and without guessing.`;
