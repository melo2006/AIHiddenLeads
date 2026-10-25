# Test the 25-point audit

## Fastest route

1. Open `/demo`.
2. Select a real business example: South Florida Plumbing and Backflow, Industrial Technology, Nationwide Industrial Supply, or BankUnited.
3. Confirm the exact business name, website, branch address/city + state, and customer keyword. Examples are public businesses, not clients or verified rankings.
4. Open **View 25-Point Google Maps Rank Grid**. Website scraping and Aspen are not required to run this separate audit.
5. Select **Local Maps Grid** for one branch, or **Nationwide Google Search** for domain visibility across 25 buyer queries.
6. Click **Run Live 25-Point Audit** and wait. Only a result labeled **Live data · Serper** is measured. A simulated preview is not a successful live audit.
7. Inspect the returned address before interpreting a local grid. Green = 1–3, yellow = 4–10, red = 11+, dash = not found or unavailable. Current provider results do not distinguish a failed checkpoint from an absent listing.

## Inputs and coverage

- Local: exact listing name, branch address or city + state, and customer service keyword. ZIP is optional; a full address helps disambiguate branches. A bank homepage alone does not identify a branch.
- Local spacing is fixed at 1.6 km; the corner is approximately 2.8 miles from the center. This is not a whole-city or nationwide branch audit.
- Nationwide: website and service keyword, no city required. The current adapter searches Google organic results with 25 related queries; it does not measure AI citations and is not a 25-city nationwide sample.
- Use BankUnited with a specific branch address and `bank`. Use Industrial Technology with `custom manufacturing`. Use Nationwide Industrial Supply with `industrial supplies` in nationwide mode. Being a real business does not ensure it appears in provider results.

## Status and costs

Serper and Google Maps secret names are configured, and earlier cached scans contain 25-cell local and nationwide results. That is evidence of previous requests, not a fresh accuracy or provider-health certification. This update verifies input handling, example selection, street tiles and rendering without new paid Maps-dependent calls. Validate live behavior on the deployed authorized origin.

Each fresh scan uses 25 Serper credits; identical scans reuse a seven-day cache, with a configured limit of 30 fresh scans/day. The current matching is name/domain based, not exact Google place-ID matching. Broad names and shared multi-branch domains can produce ambiguous matches. Weekly tracking, competitor-by-competitor reports, AI-citation measurement and bespoke automated recommendations are not implemented by this panel; the growth timeline is general.