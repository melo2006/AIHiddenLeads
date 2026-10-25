# Demo rank audit integration boundary

The demo top-bar toggle opens a 25-point visibility panel with two states:

1. **Simulated preview (default, no credits):** a deterministic, explicitly simulated 5x5 grid. Business name, supplied city (`city` query parameter or panel input), and niche seed illustrative values; they are not geocoded pins or measured rankings. Missing cities are never invented. No provider calls occur when opening or updating the panel.
2. **Live audit (on demand):** the "Run Live 25-Point Audit" button calls the `demo-rank-audit` edge function, which uses `SERPER_API_KEY` against `google.serper.dev`.

## Live modes

- **Local Maps Grid (`maps`):** the business location is verified through Google Places text search (`GOOGLE_MAPS_API_KEY`), then a 5x5 grid (1.6 km spacing) is built around it and one Serper Maps query (`q` = keyword, `ll` = `@lat,lng,14z`) runs per cell in batches of 5. Rank = the business's position in that cell's results, matched by normalized name or website host. This is live search ordering — a strong visibility signal, never labeled a guaranteed ranking. Results render on a Leaflet map with OpenStreetMap tiles (CARTO tiles require a paid key and are not used).
- **Nationwide AI Search Matrix (`nationwide`):** for B2B businesses without a local storefront, 25 buyer-intent queries run through Serper Search; rank = first organic position of the business domain (top 10). Rendered as a 5x5 query matrix.

## Cost and integrity guards

- Every live scan is cached in `public.rank_scan_cache` (keyed by SHA-256 of mode|business|city|keyword|host) for 7 days; repeat demos cost 0 credits. Each fresh scan costs 25 Serper credits.
- A daily cap of 30 fresh live scans bounds paid usage; when exceeded, the function returns the labeled simulated preview with reason `daily_live_scan_cap_reached`.
- Failed cells stay `rank: null` (unknown) — never fabricated as rank 11+.
- The function works for anonymous demo visitors (no auth required) because the cache and daily cap bound usage; it never accepts arbitrary SQL or provider credentials from the client.

## Offers

The Founder button reuses $99 Essentials checkout. Maps Boost goes to an implementation call request, not an unsupported payment product. The panel does not edit Aspen prompts, existing offers, or the legacy 3x3 Apify audit (`geo-grid-scan`, used by GeoGridWidget).
