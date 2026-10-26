# Self-service customer setup

## Implemented now

- Homepage and public Aspen window: Try your website, Book a quick call, Start now.
- Start now opens all three plans, with Essentials first by default; a voice recommendation selects the corresponding plan.
- New-tab actions preserve the current conversation. Leaving voice mode or closing ends microphone capture as before.
- Business demos have a five-minute soft checkpoint, silence check-in/closure and fifteen-minute server safety ceiling. Interested visitors can ask implementation questions after Aspen announces leaving roleplay.

## Payment readiness

Built-in Stripe is connected in test mode and the three monthly products exist. Verified-account embedded checkout, signed notification handling and server-verified return handling are implemented. The provider rejected checkout because the unclaimed test account has no head office address for automatic tax. Owner must claim the account and configure their real business address; do not invent one or disable taxes silently. Live activation remains incomplete.

Built-in provider enablement requires owner confirmation. Do not silently reconnect or replace an active integration. Do not release onboarding or installation code before payment entitlement is verified.

## Implemented setup and billing flow (pending end-to-end payment verification)

1. Sign in or create and verify a customer account; preserve email verification and tenant isolation.
2. Derive the customer ID server-side for checkout. Verify the configured product, price and tax handling; never trust a browser-provided user ID or price amount.
3. Verify signed payment notifications; idempotently provision one customer workspace/agent per purchase. Track cancellation, failed payment and entitlement status.
4. Open guided self-service at /setup after payment, with an optional quick setup call. Verified payment creates a private workspace and agent atomically, once per account/environment.
5. Collect business website, additional vendor/documentation URLs, FAQ and knowledge sources. Bound learning to approved URL scope; review original evidence and missing answers.
6. Configure persona, approved greeting, voice, consent and escalation. Test draft voice/chat before publication. Calendar and telephone connections are separate authorized setup tasks.
7. Produce customer-specific installation code only for their published agent. Provide WordPress Custom HTML/block/plugin placement, Wix embed/custom-code placement, and general website instructions. Validate microphone iframe Permissions Policy, HTTPS, host restrictions and mobile placement before calling an embed supported.
8. If the customer lacks website access, provide copyable installation instructions for their developer and Book a quick call. Do not request website passwords in chat.
9. Verify the installed assistant from the customer's actual website; publish only after customer approval.

The /embed/:id assistant page and copyable iframe code exist; website-host microphone permission and real WordPress/Wix installation remain unverified. Customer setup uses the existing agent editor for business knowledge, FAQ, URLs, testing and publication. Cancellation schedules end-of-period expiry. Both upgrades and downgrades update immediately with always_invoice prorations; credits are not promised as cash refunds. Browser sessions and edits recheck paid entitlement. Test purchases, actual cancellation, plan-change invoices and first-customer provisioning cannot be verified until account tax setup is complete. Do not promise a two-hour completion time, automatic telephone routing or automatic social integrations.