# Demo rank audit integration boundary

The demo top-bar toggle uses a deterministic, explicitly simulated 5x5 grid. Business name, supplied city (`city` query parameter or panel input), and niche seed illustrative values; they are not geocoded pins or measured rankings. Missing cities are never invented. No provider calls occur when opening or updating the panel.

`demo-rank-audit` is an authenticated POST boundary accepting `businessName`, `city`, and `keyword` with bounded lengths. It currently returns `liveAvailable: false` and performs no paid requests. It is a hook, not a completed live scanner. Adding credentials alone does not activate live scanning.

For a future DataForSEO adapter, configure its account credentials securely, authorize the app user/tenant, resolve the verified business location, cap at 25 points, limit concurrency, cache/deduplicate scans, and validate provider result order and failed cells. Warn about paid usage before activation. Preserve unavailable cells as unknown, never rank 11+.

If using Google Maps Platform, use its linked connector and authenticated server gateway; never expose server keys or use browser Places classes. Places API returns places ordered for a search, not independently verified Maps rank; do not label that ordering a measured ranking audit. A geographic basemap, if later required, should follow the project's existing map implementation and connector restrictions.

The Founder button reuses $99 Essentials checkout. Maps Boost goes to an implementation call request, not an unsupported payment product. The panel does not edit Aspen prompts, existing offers, or the legacy 3x3 audit.