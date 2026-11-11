// Per-route SEO head + crawler-summary data for the public marketing routes.
//
// Single source of truth, consumed by BOTH:
//  - scripts/prerender-seo.mjs (postbuild): writes a static HTML variant per
//    route with this route's own title, description, canonical, Open Graph
//    tags and a route-specific no-JS summary, so a crawler that fetches
//    /demo, /book or /agents/realtors without running JavaScript no longer
//    receives the homepage's head (and no longer a canonical pointing at the
//    homepage, which told Google to ignore those pages).
//  - src/lib/seoRoutes.ts (client): keeps document.title/meta in sync when
//    navigating inside the SPA.
//
// Keep this dependency-free plain JS so the build script can import it
// directly with node — no bundler, no new packages. Titles/descriptions are
// factual summaries of what each page actually offers; update them here only,
// never in one consumer alone.

export const SEO_SITE_ORIGIN = "https://aihiddenleads.com";

export const SEO_ROUTES = [
  {
    path: "/",
    canonical: "https://aihiddenleads.com/",
    title: "AI Hidden Leads | AI Voice Agents, B2B Leads & Local SEO",
    description:
      "Grow your business with 24/7 AI voice agents, website chat and qualified B2B prospects delivered weekly. Explore local SEO and Google Maps Boost services.",
    ogTitle: "AI Hidden Leads | AI Voice Agents, B2B Leads & Local SEO",
    ogDescription:
      "24/7 AI voice agents, website chat, weekly qualified B2B prospects and local SEO services for growing businesses.",
    heading: "AI Hidden Leads",
    summary: [
      "AI voice agents, website chat, B2B lead generation and local search marketing for growing businesses.",
      "AI voice agents and chat widgets help answer visitor questions and capture inquiries. Appointment booking and telephone transfers require configuration for each business.",
      "Our services include B2B prospect generation, database reactivation, automated outreach and Google review management. Google Maps Boost and AI Search Optimization help improve local and AI-driven search visibility. Our 25-point Google Maps audit checks neighborhood search positions; homepage before-and-after maps are illustrative, not measured results or ranking guarantees.",
    ],
  },
  {
    path: "/demo",
    canonical: "https://aihiddenleads.com/demo",
    title: "Live Demo | See Aspen Work on Your Own Website — AI Hidden Leads",
    description:
      "Enter your website and watch Aspen — our AI voice agent with a live video avatar — demo your business in about 2 minutes. Free, no signup needed to look.",
    ogTitle: "Live Demo | See Aspen Work on Your Own Website — AI Hidden Leads",
    ogDescription:
      "Enter your website URL and see our AI voice agent and video avatar present your business live in about 2 minutes — free.",
    heading: "Try your website with Aspen",
    summary: [
      "Enter your business website and watch Aspen — the AI Hidden Leads voice agent with a live, lip-synced video avatar — present your business in about 2 minutes, free.",
      "Aspen reads your public website, greets visitors by voice and chat, answers questions from your own content, and can capture inquiries and book appointments once configured. The demo preserves your website's appearance and is a simulation based on its public information, not a full business implementation.",
      "From this page you can also run the free 25-point Google Maps rank check to see where your business shows up across 25 neighborhood search points.",
    ],
  },
  {
    path: "/book",
    canonical: "https://aihiddenleads.com/book",
    title: "Book a Call | AI Hidden Leads",
    description:
      "Book a free 30-minute implementation call with the AiHiddenLeads team — weekdays 8 AM–6 PM Eastern, most calls wrap up in 15–20 minutes.",
    ogTitle: "Book a Call | AI Hidden Leads",
    ogDescription:
      "Book a free 30-minute implementation call with the AiHiddenLeads team and plan your AI voice agent setup.",
    heading: "Book your free implementation call",
    summary: [
      "Book a free 30-minute implementation call with the AiHiddenLeads team — one-on-one, weekdays 8 AM–6 PM Eastern Time, up to two weeks ahead. Most calls wrap up in 15–20 minutes.",
      "On the call we answer your questions about AI voice agents, website chat and B2B lead generation, and plan your setup. Pick a time on the booking calendar and you will receive a confirmation with a calendar invite; text confirmations are sent only with your permission.",
    ],
  },
  {
    path: "/agents/realtors",
    canonical: "https://aihiddenleads.com/agents/realtors",
    title: "AI Receptionist for Real Estate Agents | AI Hidden Leads",
    description:
      "Never miss a buyer or seller call again — even at a showing or closing. Aspen, your AI voice receptionist, answers 24/7 from $99/mo with 400 minutes included.",
    ogTitle: "AI Receptionist for Real Estate Agents | AI Hidden Leads",
    ogDescription:
      "Aspen answers your calls and website visitors 24/7, books the appointment and sends you the summary — built for realtors, from $99/mo.",
    heading: "Realtors: Never Miss a Buyer or Seller Call Again — Even at a Showing",
    summary: [
      "Built for realtors: Aspen answers calls and website visitors 24/7, books the appointment, and sends you the summary — so a ready buyer or seller never lands in voicemail while you are at a showing, a closing, or driving between them.",
      "You stay in control: your phone rings first, and only if you do not answer does Aspen pick up. Hot leads are transferred straight back to you with a summary; other callers are booked onto your calendar. After every call you get the summary and the full transcript.",
      "Plans start at $99/mo with 400 voice minutes included; a lip-synced video avatar of Aspen for your website is an optional add-on. Aspen greets callers in your name, answers basic listing questions from the details you give her, and checks buyer pre-approval and timeline before you call back.",
    ],
  },
];

export function seoRouteForPath(path) {
  return SEO_ROUTES.find((r) => r.path === path) || null;
}

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// The route-specific no-JS summary that replaces the homepage <main> inside
// #root in the static variant. Mirrors the index.html fallback structure
// (public-only content, hidden behind the themed startup once React mounts,
// per repo AGENTS.md) — wording is a factual summary of the route's page.
export function seoMainHtml(route) {
  const paragraphs = route.summary.map((p) => `          <p>${escapeHtml(p)}</p>`).join("\n");
  return `      <main>
        <header>
          <img src="/logo.png" alt="AI Hidden Leads logo" width="160" height="160" />
          <h1>${escapeHtml(route.heading)}</h1>
        </header>
        <section>
${paragraphs}
        </section>
        <footer>
          <a href="/demo">Try the free website demo</a> · <a href="/book">Book a brief introductory call</a> · <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of service</a>
        </footer>
      </main>`;
}

// Rewrite the homepage head in a built index.html into this route's own
// head: <title>, meta description, canonical, og:url, og:title/description
// and twitter:title/description. Everything else (scripts, styles, JSON-LD,
// startup screen) is shared and left untouched.
export function applyRouteHead(html, route) {
  let out = html;
  const replaceOnce = (pattern, replacement, label) => {
    if (!pattern.test(out)) throw new Error(`prerender-seo: could not find ${label} in built index.html`);
    out = out.replace(pattern, replacement);
  };
  replaceOnce(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`, "<title>");
  replaceOnce(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${escapeHtml(route.description)}">`,
    "meta description",
  );
  replaceOnce(
    /<link rel="canonical" href="[^"]*">/,
    `<link rel="canonical" href="${route.canonical}">`,
    "canonical link",
  );
  replaceOnce(
    /<meta property="og:url" content="[^"]*">/,
    `<meta property="og:url" content="${route.canonical}">`,
    "og:url",
  );
  replaceOnce(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${escapeHtml(route.ogTitle)}">`,
    "og:title",
  );
  replaceOnce(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${escapeHtml(route.ogTitle)}">`,
    "twitter:title",
  );
  replaceOnce(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${escapeHtml(route.ogDescription)}">`,
    "og:description",
  );
  replaceOnce(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${escapeHtml(route.ogDescription)}">`,
    "twitter:description",
  );
  return out;
}

// Swap the no-JS fallback <main> inside #root for the route's own summary.
export function applyRouteMain(html, route) {
  const pattern = /(<div id="root">\s*<!--[^>]*-->\s*)<main>[\s\S]*?<\/main>/;
  if (!pattern.test(html)) throw new Error("prerender-seo: could not find the fallback <main> in built index.html");
  return html.replace(pattern, `$1${seoMainHtml(route)}`);
}

export function buildRouteHtml(indexHtml, route) {
  return applyRouteMain(applyRouteHead(indexHtml, route), route);
}
