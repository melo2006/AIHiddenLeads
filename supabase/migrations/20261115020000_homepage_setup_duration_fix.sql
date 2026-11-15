-- One-off maintenance: align the homepage agent's stored setup-duration
-- wording with the owner's gated implementation answers (2026-11-15).
--
-- WHY: Ron's rule (2026-11-15) is that a setup-time question gets the
-- SHORT answer first — self-setup in about 15 to 30 minutes with Alex —
-- and the full build-out time (a couple of hours to a couple of days by
-- complexity) comes out only when the visitor asks for the full picture.
-- The reviewed TS reference (_shared/homepage-knowledge.ts) now carries
-- that wording, but the stored draft/published snapshots still carried
-- three stale "a few hours" claims, and a live Publish #60 test session
-- (2026-11-15) answered "how long does setup take?" with the long
-- version, blended from those stored lines.
--
-- MECHANISM: mirrors 20261115010000_homepage_permanent_pricing_fix —
-- surgical replace() pairs on the voice_agents row for slug
-- 'aspen-homepage', keys {knowledge} and {systemPrompt} in both the
-- draft and published JSONB snapshots. Every stale string is byte-exact
-- from the stored snapshots (verified by SELECT probes on 2026-11-15:
-- 'few hours' occurred twice in published systemPrompt — positions
-- 7012 and in the INTRODUCING YOUR TEAMMATES paragraph — and once in
-- published knowledge). replace() is a no-op when its string is
-- absent, so this is idempotent and safe to re-run. Applied via the
-- Supabase dashboard SQL editor (no db-push), like the pricing fix.

DO $do$
DECLARE
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('knowledge', $fix$Setup is self-service: customers can finish it in a few hours with Alex guiding each step$fix$, $fix$Setup is self-service: most customers can finish it in about 15 to 30 minutes with Alex guiding each step$fix$),
      ('systemPrompt', $fix$Setup is self-service: customers can finish it in a few hours with Alex guiding each step$fix$, $fix$Setup is self-service: most customers can finish it in about 15 to 30 minutes with Alex guiding each step$fix$),
      ('knowledge', $fix$Setup can be finished self-service in a few hours, or done-for-you.$fix$, $fix$Setup can be finished self-service in about 15 to 30 minutes for most businesses, or done-for-you.$fix$),
      ('systemPrompt', $fix$Setup can be finished self-service in a few hours, or done-for-you.$fix$, $fix$Setup can be finished self-service in about 15 to 30 minutes for most businesses, or done-for-you.$fix$),
      ('knowledge', $fix$introduce Alex by name and title: Alex, our Support Specialist, walks you through the setup step by step — the guided wizard takes most people a few hours, and done-for-you setup is available if you'd rather hand it over.$fix$, $fix$introduce Alex by name and title: Alex, our onboarding engineer, walks you through the setup step by step — the self-setup takes most people about 15 to 30 minutes with him guiding you, and done-for-you setup is available if you'd rather hand it over. The full build-out time (a couple of hours to a couple of days by complexity) comes up only if they ask for the full picture, per the IMPLEMENTATION ANSWERS in your instructions.$fix$),
      ('systemPrompt', $fix$introduce Alex by name and title: Alex, our Support Specialist, walks you through the setup step by step — the guided wizard takes most people a few hours, and done-for-you setup is available if you'd rather hand it over.$fix$, $fix$introduce Alex by name and title: Alex, our onboarding engineer, walks you through the setup step by step — the self-setup takes most people about 15 to 30 minutes with him guiding you, and done-for-you setup is available if you'd rather hand it over. The full build-out time (a couple of hours to a couple of days by complexity) comes up only if they ask for the full picture, per the IMPLEMENTATION ANSWERS in your instructions.$fix$)
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
-- remaining "few hours" occurrences in the homepage agent's stored
-- knowledge / system prompt across both snapshots.
DO $do$
DECLARE
  remaining integer;
BEGIN
  SELECT coalesce(sum(
           (select count(*) from regexp_matches(coalesce(published->>'knowledge',''), 'few hours', 'g'))
         + (select count(*) from regexp_matches(coalesce(published->>'systemPrompt',''), 'few hours', 'g'))
         + (select count(*) from regexp_matches(coalesce(draft->>'knowledge',''), 'few hours', 'g'))
         + (select count(*) from regexp_matches(coalesce(draft->>'systemPrompt',''), 'few hours', 'g'))
         ), 0)
    INTO remaining
    FROM public.voice_agents
   WHERE slug = 'aspen-homepage';
  RAISE NOTICE 'homepage setup-duration fix: % occurrence(s) of "few hours" remain in the homepage agent snapshots', remaining;
END
$do$;
