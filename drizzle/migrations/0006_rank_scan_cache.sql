CREATE TABLE public.rank_scan_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  scan_mode text NOT NULL,
  business_name text NOT NULL,
  city text,
  keyword text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rank_scan_cache TO authenticated;
GRANT ALL ON public.rank_scan_cache TO service_role;

ALTER TABLE public.rank_scan_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scan cache"
  ON public.rank_scan_cache FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_rank_scan_cache_created_at ON public.rank_scan_cache (created_at);