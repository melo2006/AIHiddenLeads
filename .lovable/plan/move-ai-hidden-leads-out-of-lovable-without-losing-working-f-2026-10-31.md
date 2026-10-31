# Move AI Hidden Leads out of Lovable without losing working features

## Goal
Preserve the current app, private data, Aspen voice/avatar behavior, customer accounts and integrations. Use Google-assisted development outside Lovable, with independently controlled hosting and database services. Do not rebuild the app from screenshots or change the live site during preparation.

## Confirmed spending
- Screenshot: five paid $45 top-ups on October 24, 26, 28, 29 and 30: **$225**, corresponding to **750 granted credits**. One paid $5 subscription on October 10 brings the visible invoice total to **$230**.
- Workspace recorded credit deductions, October 25–31 at the lookup time: **628.08 credits**, including **607.78 building-related** and **20.30 Cloud/app AI**. This includes other workspace projects.
- Current billing period, October 10–November 10: **777.41 credits used**; **145.59 credits remaining** at lookup.
- Lifetime dollars paid and lifetime credit consumption are not established by these figures.
- Current auto-top-up lookup reports disabled and never configured for this workspace. Reconcile this discrepancy with the invoice workspace and purchase records; do not label the visible payments automatic without evidence.

## 1. Control spending and preserve the current app
- Pause feature additions and unrelated rework. Do not buy credits or increase Cloud memory as part of migration.
- Owner checks auto-top-up in the workspace associated with the invoices and disables it if enabled. This assistant's available control is read-only.
- Keep enough existing service coverage for the current app during migration. Do not pause or delete its backend before exports and replacement tests succeed.
- Keep GitHub public temporarily as requested, but never put private exports, secrets, password hashes or recordings there.

## 2. Make a complete private backup
- Download the current GitHub source and record the source revision. Include both migration directories, functions, phone-server source and architecture rules.
- Export the current database through **More → Database → Manage → Settings → Export data**. This project currently shares one backend between preview and published app.
- Download storage files separately through **More → Storage**: recordings, uploaded documents, screenshots and avatars. Database exports do not include these bytes.
- Save provider/configuration names and retrieve replacement credentials directly from their providers into a private password manager or destination secret store. Never paste secret values into chat or GitHub.
- Record login provider configuration, role boundaries, webhooks, schedules, bucket permissions and public callback URLs separately. Connectors and managed credentials do not transfer automatically.
- Validate that the backup can be restored into an isolated destination. An export existing is not proof of a working restore.

## 3. Verify the Google development workflow first
- Confirm current Google AI Studio support for importing and editing this existing multi-file React/Vite repository. Do not assume GitHub export implies GitHub import.
- Test a source-only copy with no private database exports or credentials.
- If AI Studio cannot faithfully edit the existing repository, use Google's repository-capable development tooling, such as Gemini CLI, against the same code rather than rewriting the app.
- Preserve the current pages, design, Aspen controls and business rules. The existing portability document is outdated; do not follow its old Retell-first or fixed table-count instructions.

## 4. Build an independent test destination
- Use the prepaid Hostinger VPS as the candidate for the website and persistent Gemini Live telephone bridge, after checking existing workloads, secure HTTPS, restart behavior, monitoring and backups.
- Prefer an independently owned compatible managed database/auth/storage service for the initial migration to reduce simultaneous changes. Evaluate self-hosting separately if desired; do not promise it is maintenance-free or cheaper overall.
- Restore the full database and user accounts using destination-supported procedures. Preserve IDs, memberships and protected admin roles. Password/session compatibility must be tested, not assumed.
- Recreate storage buckets and upload file bytes while preserving privacy and references.
- Deploy server functions and scheduled work in compatible runtimes. A static website or an ordinary PostgreSQL database alone cannot run the full app.

## 5. Reconnect every capability
Track code, data, credentials, deployment and verification separately for:
- Public website, service pages, demos, chat, Aspen video and Gemini Live browser voice.
- Admin/customer login, protected roles, paid workspaces, setup wizard, document learning and private demo links.
- CRM, imports, enrichment, Maps audits, campaign visits, conversation records and copy links.
- Payments, subscriptions, entitlement verification and signed payment webhooks.
- Hostinger SMTP, daily reports, opt-in follow-ups and Google Calendar booking.
- Twilio telephone answering, browser-to-phone handoff, transfers, SMS safeguards, spend caps and usage reporting.
- Simli, website capture, scraping/search providers and all retained external accounts.

Replace Lovable-only gateway calls, connector authentication and preview-login dependencies with destination-supported equivalents. Keep provider-specific model names, permissions, retry/error handling and secret storage correct. Preserve existing provider accounts where compatible; do not create duplicate subscriptions unnecessarily.

Natural Gemini Live telephone service remains a separate unfinished capability: do not mark it working merely because its server source migrates. Keep rollback routing available until real inbound calls and transfers pass.

## 6. Prove the replacement before switching
- Compare source revision, record counts, relationships and storage inventory.
- Verify admin and customer access, email confirmation, private-data isolation and a new write/read in the destination.
- Test website learning, saved drafts, sharing/revocation, Maps results and reports.
- Test Aspen startup, one voice, video/lip-sync, interruption, reconnection and saved conversation records on desktop and phone.
- Test safe payment paths, confirmation return, entitlements and webhook signatures without making unintended charges.
- Test real calendar conflicts and Hostinger delivery to the approved test recipient.
- Test incoming telephone calls and transfers, long calls, controlled concurrency, cost reporting and server restart recovery. Provider tests consume their own usage; approve the bounded test budget first.
- Set alerts and monitor destination costs. Hosting, AI, telephone and avatar usage remain separate costs; no fixed migration-credit or savings promise.

## 7. Controlled cutover
- Agree a short final-data sync window and rollback procedure.
- Update website DNS, OAuth callbacks, signed webhooks and scheduled targets only after explicit approval and replacement verification.
- Avoid duplicate emails, schedules, payment handling or telephone dialing during overlap.
- Confirm new records and recordings arrive at the destination after switching.
- Only then decide whether to disconnect Lovable sync, cancel its plan or retire its backend. Retain private backups outside the VPS as well as GitHub code.

## First owner action
Download the full database export; keep it private. The next guided step will be storage backup, followed by validating Google's existing-repository workflow—one step at a time.

## Technical notes
The inspected app is React/Vite/TypeScript with database/auth/storage clients, SQL migrations in two directories, server functions and a WebSocket phone bridge. The inventory found no bundled record export. Migration files are historical evidence, not a verified snapshot of live schema. Deployment secrets must be issued or restored securely at the destination; managed Cloud database credentials are not available for extraction. No live routing, resources or prices are changed by approving this plan.