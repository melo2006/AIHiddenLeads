-- One-off maintenance: purge the dead launch promotion from the
-- homepage agent's stored knowledge + system prompt (2026-11-15).
--
-- WHY: the Nov 9 reseed (20261109020000_reseed_homepage_agent_once)
-- seeded the homepage agent with a "Launch promotion: 50% off every
-- plan for the first 3 months" offer that has since ended. Plan
-- prices are now PERMANENT (Premium $99/mo with 400 browser voice
-- minutes, Professional $199/mo with 1,200, Platinum $349/mo with
-- 2,500), the video avatar add-on is free for the first month and
-- then $79/mo for customers who keep it, and the setup fee is waived
-- through the end of the month. The reviewed TS reference
-- (_shared/homepage-knowledge.ts) already carries the permanent
-- wording, but the stored draft/published snapshots were never
-- refreshed, so live homepage sessions kept quoting the dead
-- promotion (live proof: session 19b82691, 2026-11-14).
--
-- MECHANISM: mirrors the Nov 9 reseed's targets — the voice_agents
-- row for slug 'aspen-homepage', its draft and published JSONB
-- snapshots, keys {knowledge} and {systemPrompt} — but applies
-- surgical replace() pairs instead of a full reseed, so any Voice
-- Agents editor changes made since Nov 9 survive. Every stale
-- string below is byte-exact from the Nov 9 seed; replace() is a
-- no-op when its string is absent, so this migration is idempotent
-- and safe to re-run, and safe if the stored text has drifted
-- (drifted text is simply left as-is — the closing NOTICE reports
-- how many dead-promotion markers remain). Replacement wording
-- mirrors the current reviewed reference in
-- _shared/homepage-knowledge.ts (PLAN_FACTS_EXACT / HOMEPAGE_KNOWLEDGE
-- current-offers lines / CLOSING).

DO $do$
DECLARE
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('knowledge', $fix$Launch promotion: 50% off every plan for the first 3 months — Premium $99 instead of $199, Professional $199 instead of $399, Platinum $349 instead of $699 — with the setup fee waived on every plan. From month 4 the regular plan prices apply. Describe the promotion as ending this month; never quote a calendar date for it.$fix$, $fix$Current offers: the plan prices are permanent — there is no introductory discount and no price step-up, ever. The setup fee is waived through the end of the month on every plan. The video avatar add-on's first month is free; from month 2 it is $79/month only for customers who keep it.$fix$),
      ('knowledge', $fix$Prices above are the current promotional USD prices for the first 3 months (regular prices: Premium $199, Professional $399, Platinum $699), not old $149 promotions. Never quote a promotion end date; describe the promotion as ending this month.$fix$, $fix$Prices above are the permanent USD prices — not promotional or introductory prices, and not old $149 promotions. Never quote a promotion end date.$fix$),
      ('knowledge', $fix$Mention the approved launch promotion accurately.$fix$, $fix$Mention the approved current offers accurately: permanent plan prices, the video avatar's free first month, and the setup fee waived through the end of the month.$fix$),
      ('knowledge', $fix$$99 one-time setup, currently WAIVED FREE.$fix$, $fix$$99 one-time setup, WAIVED FREE through the end of the month.$fix$),
      ('knowledge', $fix$$199 one-time setup, currently WAIVED FREE.$fix$, $fix$$199 one-time setup, WAIVED FREE through the end of the month.$fix$),
      ('knowledge', $fix$$349 one-time setup, currently WAIVED FREE.$fix$, $fix$$349 one-time setup, WAIVED FREE through the end of the month.$fix$),
      ('systemPrompt', $fix$Every plan is 50% off for the first 3 months; the regular prices are $199, $399 and $699.$fix$, $fix$These are the permanent prices — there is no introductory discount and the price never steps up.$fix$),
      ('systemPrompt', $fix$The live video avatar is an optional add-on: $79/month on Premium, $180/month on Professional, $250/month on Platinum.$fix$, $fix$The live video avatar is an optional add-on: $79/month flat on every plan, and the first month of the avatar is FREE — from month 2 it is $79/month only if the customer keeps it; if they do not keep it, it switches off automatically and they are never charged for it.$fix$),
      ('systemPrompt', $fix$Premium is $99/month (50% off the regular $199 for the first 3 months) with website voice/chat, 400 browser voice minutes and up to 50 B2B prospects/month; the optional video avatar add-on is $79/month for visitors who choose it — never present the plan itself as "$99 plus $79". Professional video adds $180/month for 1,200 minutes; Platinum video adds $250/month for 2,500.$fix$, $fix$Premium is $99/month — the permanent price — with website voice/chat, 400 browser voice minutes and up to 50 B2B prospects/month; the optional video avatar add-on is $79/month flat on any plan, with the first month free for visitors who choose it — never present the plan itself as "$99 plus $79". Included video minutes match the plan: 400 on Premium, 1,200 on Professional, 2,500 on Platinum.$fix$),
      ('systemPrompt', $fix$Recommend Premium at $99/month (50% off for the first 3 months) with up to 50 included B2B prospects and website voice/chat first, unless the caller needs another plan.$fix$, $fix$Recommend Premium at $99/month — the permanent price — with up to 50 included B2B prospects and website voice/chat first, unless the caller needs another plan.$fix$),
      ('systemPrompt', $fix$Mention the current promotion accurately: 50% off every plan for the first 3 months, with the setup fee waived — it ends this month; never quote a calendar date for the promotion.$fix$, $fix$Mention the current offers accurately: plan prices are permanent, the video avatar add-on's first month is free, and the setup fee is waived through the end of the month; never quote a calendar date for any offer.$fix$)
    ) AS t(field, stale, replacement)
  LOOP
    UPDATE public.voice_agents
    SET published = CASE WHEN published->>pair.field IS NULL THEN published
                         ELSE jsonb_set(published, ARRAY[pair.field],
                                to_jsonb(replace(published->>pair.field, pair.stale, pair.replacement))) END,
        draft     = CASE WHEN draft->>pair.field IS NULL THEN draft
                         ELSE jsonb_set(draft, ARRAY[pair.field],
                                to_jsonb(replace(draft->>pair.field, pair.stale, pair.replacement))) END
    WHERE slug = 'aspen-homepage';
  END LOOP;
END
$do$;

-- Verification (report only, never fails the migration): count any
-- remaining dead-promotion markers in the homepage agent's stored
-- knowledge / system prompt across both snapshots.
DO $do$
DECLARE
  remaining integer;
BEGIN
  SELECT coalesce(sum(
           (length(coalesce(published->>'knowledge','')) - length(replace(lower(coalesce(published->>'knowledge','')), '50% off', ''))) / 7
         + (length(coalesce(published->>'systemPrompt','')) - length(replace(lower(coalesce(published->>'systemPrompt','')), '50% off', ''))) / 7
         + (length(coalesce(draft->>'knowledge','')) - length(replace(lower(coalesce(draft->>'knowledge','')), '50% off', ''))) / 7
         + (length(coalesce(draft->>'systemPrompt','')) - length(replace(lower(coalesce(draft->>'systemPrompt','')), '50% off', ''))) / 7
         ), 0)
    INTO remaining
    FROM public.voice_agents
   WHERE slug = 'aspen-homepage';
  RAISE NOTICE 'homepage permanent-pricing fix: % occurrence(s) of "50%% off" remain in the homepage agent snapshots', remaining;
END
$do$;
