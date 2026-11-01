-- Disable restrictive default daily call caps for ad traffic and live demo visitors
ALTER TABLE public.voice_guardrails
  ALTER COLUMN enabled SET DEFAULT false,
  ALTER COLUMN max_calls_per_visitor_per_day SET DEFAULT 100000,
  ALTER COLUMN max_calls_per_day_total SET DEFAULT 1000000;

UPDATE public.voice_guardrails
SET
  enabled = false,
  max_calls_per_visitor_per_day = GREATEST(max_calls_per_visitor_per_day, 100000),
  max_calls_per_day_total = GREATEST(max_calls_per_day_total, 1000000);
