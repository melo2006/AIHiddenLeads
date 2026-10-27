# Simple customer setup wizard + admin preview

## Goal
A 5-step, picture-first setup wizard that customers see after paying, and that you can open from your admin menu in a safe "preview" mode (no account, no payment, nothing saved or charged).

## Admin access
- New sidebar item under **Voice & avatars**: **Customer Wizard (preview)**.
- Opens the exact customer wizard with a "Preview mode" banner. Saving, publishing and paid voice calls are disabled or simulated; everything else is clickable.
- Optional sample business picker (e.g. a roofer, a dentist) so you can see it filled in.

## The wizard (one screen per step, fits a laptop without scrolling; phones scroll)
Top: progress dots 1-5 with icons. Bottom: big Back / Next buttons. Each step has one short sentence plus an (i) icon with a tooltip for longer help.

1. **Your business** - website URL, business name (auto-filled from the site), industry dropdown. We scan the site in the background.
2. **Teach Aspen** - extra website links as chips, plus a drag-and-drop box for PDFs, Word or text files, plus "Add a FAQ" cards. Shows what was learned as simple tiles.
3. **Greeting & voice** - greeting text box with an **AI suggest** button (refresh icon gives a new version) based on business, industry and website. Voice picker cards with a play button to hear the greeting.
4. **Look on your site** - pick launcher color, label ("Ask Aspen" etc.) and corner. Live preview: their real website screenshot with the floating button and chat window drawn on top.
5. **Test & go live** - "Try a call" button (real test call for paying customers; simulated in admin preview), then Publish and the install guide (WordPress / Wix / HTML, copy button).

Finish screen: "You're live" with a link to their dashboard.

## Suggestions included
- Autosave after each step so customers can leave and come back.
- A checklist on their dashboard showing what's left ("Add FAQs", "Install on site").
- Keep the current advanced editor available as "Advanced settings" for power users.

## Technical details
- New `src/components/setup-wizard/` with one component per step and a shared shell; reuses existing agent save/publish actions, website scan, voice preview and installation guide.
- `preview` prop: no backend writes, no single-use voice sessions; uses local sample data.
- AI greeting suggestion: new action in the existing agent backend function using the built-in AI models, signed-in customer or admin only.
- Uploads: existing private storage bucket, text extracted server-side into agent knowledge.
- Admin route `/dashboard/wizard-preview`, admin-only like the rest of the dashboard.
- `/setup` switches to the new wizard; the old editor moves behind "Advanced settings".
