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
//
// Each route also carries `faq`: the keyword Q&A set written for the exact
// questions buyers type into Google and ask AI search (approved 2026-11-11).
// The SAME items are what the page shows visibly (homepage FAQ section,
// /demo Q&A section, realtor vertical FAQ — parity pinned by
// src/test/seo-head.test.ts), what the no-JS fallback prints, and what the
// FAQPage JSON-LD declares. Google requires schema == visible content, so
// the three surfaces must never drift: edit the wording here AND on the
// visible surface in the same change.

import { ARTICLES, formatArticleDate } from "./articles-data.mjs";

export const SEO_SITE_ORIGIN = "https://aihiddenleads.com";

// The no-JS fallback footer is the same on every route (labels localized
// per route): the demo and booking doors, the articles section, and the
// legal pages. The /articles link joined the set with the articles
// foundation (2026-11-23) so every prerendered page links the section in
// raw HTML — the internal-linking surface crawlers walk.
const EN_FOOTER_LINKS = [
  { href: "/demo", label: "Try the free website demo" },
  { href: "/book", label: "Book a brief introductory call" },
  { href: "/articles", label: "Articles and guides" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
];
const PT_FOOTER_LINKS = [
  { href: "/demo", label: "Experimente a demo gratuita do site" },
  { href: "/book", label: "Agende uma breve ligação de apresentação" },
  { href: "/articles", label: "Artigos e guias" },
  { href: "/privacy", label: "Política de Privacidade" },
  { href: "/terms", label: "Termos de Uso" },
];

// The /articles index route: no Q&A set of its own — its fallback lists
// every article with a crawlable link (see seoArticleIndexHtml), which is
// the section's internal-linking hub.
const ARTICLES_INDEX_ROUTE = {
  path: "/articles",
  canonical: "https://aihiddenleads.com/articles",
  title: "Articles & Guides | AI Receptionist Costs, Comparisons & How It Works — AI Hidden Leads",
  description:
    "Plain-English guides for small-business owners: what an AI receptionist costs, how it compares with an answering service, and what an AI receptionist with a video avatar actually does.",
  ogTitle: "Articles & Guides | AI Receptionist Costs, Comparisons & How It Works — AI Hidden Leads",
  ogDescription:
    "Plain-English guides for small-business owners: AI receptionist costs, the answering-service comparison, and how a video avatar receptionist works.",
  heading: "Articles & guides",
  summary: [
    "Straight answers to the questions small-business owners ask before they buy an AI receptionist: what it costs, how it compares with a traditional answering service, and what an AI receptionist with a live video avatar actually does.",
    "Every guide is written from the same facts our own pages publish — real prices, real plan details, and the differences that actually matter when your phone rings.",
  ],
  footerLinks: EN_FOOTER_LINKS,
  articleIndex: true,
};

// One route per article, generated from scripts/articles-data.mjs so the
// head, the Article + FAQPage schema and the no-JS fallback all carry the
// article's own wording — the same single-source discipline as the routes
// above. `body` is the full article (rendered by seoBodyHtml); `article`
// carries the Article JSON-LD facts.
function articleSeoRoutes() {
  return ARTICLES.map((a) => ({
    path: a.path,
    canonical: `https://aihiddenleads.com${a.path}`,
    title: a.seoTitle,
    description: a.description,
    ogTitle: a.seoTitle,
    ogDescription: a.description,
    heading: a.headline,
    summary: [a.excerpt],
    footerLinks: EN_FOOTER_LINKS,
    faqHeading: "Common questions",
    faq: a.faq,
    body: a.body,
    article: {
      datePublished: a.datePublished,
      dateModified: a.dateModified,
      section: "AI Receptionist Guides",
    },
  }));
}

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
    footerLinks: EN_FOOTER_LINKS,
    faqHeading: "Common questions",
    faq: [
      {
        q: "What is the best AI receptionist for a small business?",
        a: "The best AI receptionist for a small business answers every call instantly, around the clock, books appointments into your calendar, and sends you a summary after each call. AiHiddenLeads is built to that checklist: Aspen answers by voice and website chat, can appear as a live video avatar, and starts at $99/mo with 400 voice minutes included. The honest test is your own website — the free live demo takes about 2 minutes.",
      },
      {
        q: "How much does an AI receptionist cost per month?",
        a: "Premium is $99/mo — the permanent price — with 400 voice minutes, website chat, and up to 50 B2B prospects per month included (no specific count is guaranteed). Professional is $199/mo with 1,200 minutes and up to 100 prospects, and Platinum is $349/mo with 2,500 minutes and up to 200 prospects. The $199 setup fee is waived through the end of the month, and Aspen's live video avatar is an optional add-on at $79/mo on any plan — its first month is free.",
      },
      {
        q: "Is there an AI receptionist with a video avatar?",
        a: "Yes. Aspen, the AiHiddenLeads AI receptionist, can appear on your website as a live, lip-synced video avatar — your AI spokesperson — while she talks with visitors by voice and chat. The avatar is an optional add-on at $79/mo on any plan — and its first month is free; the voice receptionist works on its own if you skip it. You can watch her work in the free live demo on your own website.",
      },
      {
        q: "Does an AI receptionist answer calls 24/7 and book appointments?",
        a: "Yes. Aspen answers 24/7 — nights, weekends, and holidays — so callers never land in voicemail; 85% of callers who hit voicemail don't call back. She books appointments straight into your calendar, sends confirmations and reminders, and can transfer a caller straight to you when a human is needed.",
      },
      {
        q: "How is an AI receptionist different from an answering service?",
        a: "A traditional answering service has people take messages — often with a fee for every message or minute — and you call back later. An AI receptionist answers instantly, follows your script the same way on every call, and does the work during the call itself: answering questions, booking the appointment, and sending you a summary with the transcript. At AiHiddenLeads the price is one flat monthly plan with minutes included, not a meter running on every message.",
      },
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
    footerLinks: EN_FOOTER_LINKS,
    faqHeading: "Common questions",
    faq: [
      {
        q: "What happens in the free demo?",
        a: "You enter your website address, and Aspen builds a live simulation on a preview of your actual site: she greets visitors by voice and chat, answers questions from your own pages, and shows how she would capture inquiries and book appointments for your business. Nothing is installed and nothing on your site changes — it is a mock-up built from your public pages.",
      },
      {
        q: "How long does the demo take?",
        a: "About 2 minutes to see Aspen live on your website. Building the full simulation from your site's pages takes around 10 minutes, and Aspen uses that time to learn your business and answer your questions.",
      },
      {
        q: "Do you change or hack my website?",
        a: "No. Demo mock-up — your website is untouched, nothing on your server is changed. The demo runs on a preview copy built from your public pages, so your live site stays exactly as it is.",
      },
    ],
  },
  {
    // Publish #71: the fully-Portuguese demo route. The head (and the
    // link-preview card a recipient sees before the page even opens)
    // is Brazilian Portuguese, mirroring /demo's facts with no new
    // claims.
    path: "/demo/br",
    canonical: "https://aihiddenleads.com/demo/br",
    title: "Demo ao Vivo | Veja a Aspen trabalhando no seu próprio site — AI Hidden Leads",
    description:
      "Digite o endereço do seu site e veja a Aspen — nossa agente de voz com IA e avatar em vídeo ao vivo — apresentar sua empresa em cerca de 2 minutos. Grátis, sem precisar se cadastrar para olhar.",
    ogTitle: "Demo ao Vivo | Veja a Aspen trabalhando no seu próprio site — AI Hidden Leads",
    ogDescription:
      "Digite o endereço do seu site e veja nossa agente de voz com IA e avatar em vídeo apresentar sua empresa ao vivo em cerca de 2 minutos — grátis.",
    heading: "Experimente seu site com a Aspen",
    summary: [
      "Digite o site da sua empresa e veja a Aspen — a agente de voz da AI Hidden Leads com avatar em vídeo ao vivo e sincronização labial — apresentar sua empresa em cerca de 2 minutos, grátis.",
      "A Aspen lê seu site público, atende os visitantes por voz e chat, responde perguntas a partir do seu próprio conteúdo e pode captar consultas e agendar compromissos depois de configurada. A demo preserva a aparência do seu site e é uma simulação baseada nas informações públicas dele, não uma implementação completa da sua empresa.",
      "Nesta página você também pode executar a verificação gratuita de classificação no Google Maps com 25 pontos para ver onde sua empresa aparece em 25 pontos de busca do bairro.",
    ],
    footerLinks: PT_FOOTER_LINKS,
    faqHeading: "Perguntas frequentes",
    faq: [
      {
        q: "O que acontece na demo gratuita?",
        a: "Você digita o endereço do seu site e a Aspen monta uma simulação ao vivo sobre uma prévia do seu site de verdade: ela atende os visitantes por voz e chat, responde perguntas a partir das suas próprias páginas e mostra como captaria consultas e agendaria compromissos para a sua empresa. Nada é instalado e nada no seu site muda — é uma maquete montada a partir das suas páginas públicas.",
      },
      {
        q: "Quanto tempo leva a demo?",
        a: "Cerca de 2 minutos para ver a Aspen ao vivo no seu site. A montagem da simulação completa a partir das páginas do seu site leva em torno de 10 minutos, e a Aspen usa esse tempo para aprender sobre a sua empresa e responder às suas perguntas.",
      },
      {
        q: "Vocês alteram ou invadem meu site?",
        a: "Não. É uma maquete de demonstração — seu site fica intacto, nada no seu servidor é alterado. A demo roda sobre uma cópia de prévia montada a partir das suas páginas públicas, então seu site ao vivo continua exatamente como está.",
      },
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
    footerLinks: EN_FOOTER_LINKS,
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
    footerLinks: EN_FOOTER_LINKS,
    faqHeading: "Common questions",
    faq: [
      {
        q: "How much does an AI receptionist for real estate agents cost?",
        a: "Premium is $99/mo with 400 minutes included. The live video avatar — Aspen with a real, lip-synced video face on your website — is an optional add-on at $79/mo, and its first month is free. You choose it or skip it; the $99 plan works on its own.",
      },
      {
        q: "What happens when I'm at a showing?",
        a: "Your phone rings first — 2–3 rings, a setting you choose. If you don't pick up, Aspen answers in your name, qualifies the caller, and books the showing or consultation on your calendar. If the lead is hot, she warm-transfers them straight back to you with a short summary first — and after every call you get the summary and the transcript.",
      },
      {
        q: "Do I get recordings?",
        a: "Not yet — recordings are not part of the service today. What you do get, in your dashboard after every call, is the lead's name and contact details, the AI summary, and the full transcript of the conversation, plus the appointment that was booked.",
      },
      {
        q: "Can it book showings and consultations?",
        a: "Yes. Aspen books showings, buyer consultations, and seller valuation appointments as 30-minute bookings, against your real availability once your calendar is connected in setup. Each booking sends a confirmation with a calendar invite, and reminders go out before the appointment.",
      },
    ],
  },
  ARTICLES_INDEX_ROUTE,
  ...articleSeoRoutes(),
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

// The route's keyword Q&A as a no-JS fallback section: the exact questions
// as headings, the exact answers as paragraphs — the same text the page
// shows visibly and the FAQPage schema declares (schema == visible rule).
// The section heading is the route's OWN localized string (route.faqHeading,
// carried with the route's other localized fields) — never a hardcoded
// English literal: /demo/br's Portuguese Q&A sits under "Perguntas
// frequentes", not "Common questions".
export function seoFaqSectionHtml(route) {
  if (!route.faq || route.faq.length === 0) return "";
  const items = route.faq
    .map((item) => `          <h3>${escapeHtml(item.q)}</h3>\n          <p>${escapeHtml(item.a)}</p>`)
    .join("\n");
  return `
        <section>
          <h2>${escapeHtml(route.faqHeading)}</h2>
${items}
        </section>`;
}

// Inline links inside article body text use the light [label](/path)
// convention (see articles-data.mjs); the fallback renders them as real
// anchors so the article pages cross-link in raw HTML too. Escape first —
// the bracket/paren syntax survives escaping, so the pattern still matches.
function renderInlineHtml(text) {
  return escapeHtml(text).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// An article route's full body as fallback HTML: the complete article
// text (headings, paragraphs, lists, tables) — not a summary — so a
// crawler that never runs JavaScript reads the whole piece, the same
// text the React page renders from the same data.
export function seoBodyHtml(route) {
  const blocks = (route.body || []).map((block) => {
    switch (block.type) {
      case "lead":
      case "p":
        return `          <p>${renderInlineHtml(block.text)}</p>`;
      case "h2":
        return `          <h2>${escapeHtml(block.text)}</h2>`;
      case "list":
        return `          <ul>\n${block.items.map((i) => `            <li>${renderInlineHtml(i)}</li>`).join("\n")}\n          </ul>`;
      case "table": {
        const head = block.head.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
        const rows = block.rows
          .map(
            (row) =>
              `            <tr>${row.map((c, i) => (i === 0 ? `<th scope="row">${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`)).join("")}</tr>`,
          )
          .join("\n");
        return `          <table>\n            <thead><tr>${head}</tr></thead>\n            <tbody>\n${rows}\n            </tbody>\n          </table>`;
      }
      default:
        return "";
    }
  });
  return `        <section>\n${blocks.join("\n")}\n        </section>`;
}

// The /articles fallback body: one crawlable card per article — headline
// link, excerpt and date — so the section hub links every article in raw
// HTML (and each article links back here through its own page chrome).
export function seoArticleIndexHtml() {
  const items = ARTICLES.map(
    (a) => `          <article>
            <h2><a href="${escapeHtml(a.path)}">${escapeHtml(a.headline)}</a></h2>
            <p>${escapeHtml(a.excerpt)}</p>
            <p><time datetime="${a.datePublished}">${formatArticleDate(a.datePublished)}</time></p>
          </article>`,
  ).join("\n");
  return `        <section>\n${items}\n        </section>`;
}

// The route-specific no-JS summary that replaces the homepage <main> inside
// #root in the static variant. Mirrors the index.html fallback structure
// (public-only content, hidden behind the themed startup once React mounts,
// per repo AGENTS.md) — wording is a factual summary of the route's page.
// Article routes carry their full body instead of a summary; the /articles
// index carries its summary plus the article list. The footer link labels
// are the route's OWN localized strings (route.footerLinks, carried with
// the route's other localized fields) — never hardcoded English literals:
// /demo/br's footer reads "Política de Privacidade" / "Termos de Uso", not
// "Privacy policy" / "Terms of service".
export function seoMainHtml(route) {
  const footerLinks = route.footerLinks
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join(" · ");
  let content;
  if (route.body) {
    content = seoBodyHtml(route);
  } else if (route.articleIndex) {
    const paragraphs = route.summary.map((p) => `          <p>${escapeHtml(p)}</p>`).join("\n");
    content = `        <section>\n${paragraphs}\n        </section>\n${seoArticleIndexHtml()}`;
  } else {
    const paragraphs = route.summary.map((p) => `          <p>${escapeHtml(p)}</p>`).join("\n");
    content = `        <section>\n${paragraphs}\n        </section>`;
  }
  return `      <main>
        <header>
          <img src="/logo.png" alt="AI Hidden Leads logo" width="160" height="160" />
          <h1>${escapeHtml(route.heading)}</h1>
        </header>
${content}${seoFaqSectionHtml(route)}
        <footer>
          ${footerLinks}
        </footer>
      </main>`;
}

// FAQPage JSON-LD for a route's keyword Q&A set, generated from the same
// data as the visible section and the fallback — one wording, three
// surfaces. The script tag carries data-faq-schema so the prerender can
// find and replace the homepage block baked into index.html (and so tests
// can tell it apart from the LocalBusiness block, which stays untouched).
export function faqPageJsonLd(route) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (route.faq || []).map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function faqSchemaScriptHtml(route) {
  return `<script type="application/ld+json" data-faq-schema>\n    ${JSON.stringify(faqPageJsonLd(route), null, 2).replace(/\n/g, "\n    ")}\n  </script>`;
}

const FAQ_SCHEMA_PATTERN = /\s*<script type="application\/ld\+json" data-faq-schema>[\s\S]*?<\/script>/;

// Swap whatever FAQPage block the HTML carries (the homepage's, baked into
// index.html) for this route's own — or remove it when the route has no
// Q&A set, so no page ever declares another page's questions.
export function applyRouteFaq(html, route) {
  let out = html.replace(FAQ_SCHEMA_PATTERN, "");
  if (route.faq && route.faq.length > 0) {
    if (!out.includes("</head>")) throw new Error("prerender-seo: could not find </head> for FAQ schema");
    // Function replacement: the schema text carries prices ($199, $79…)
    // whose $ sequences String.replace would otherwise read as patterns.
    out = out.replace("</head>", () => `  ${faqSchemaScriptHtml(route)}\n</head>`);
  }
  return out;
}

// Rewrite the homepage head in a built index.html into this route's own
// head: <title>, meta description, canonical, og:url, og:title/description
// and twitter:title/description. Everything else (scripts, styles, JSON-LD,
// startup screen) is shared and left untouched.
export function applyRouteHead(html, route) {
  let out = html;
  const replaceOnce = (pattern, replacement, label) => {
    if (!pattern.test(out)) throw new Error(`prerender-seo: could not find ${label} in built index.html`);
    // Function replacement so $ sequences in route copy stay literal.
    out = out.replace(pattern, () => replacement);
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
// The replacement MUST be a function: route copy carries prices ($199,
// $149…) and "$1" in a replacement string is String.replace's group-1
// pattern — with a string replacement, "$199/mo" silently became the
// captured <div id="root"> prefix + "99/mo" (latent until the first route
// whose copy contained a $1xx price — the articles, 2026-11-23).
export function applyRouteMain(html, route) {
  const pattern = /(<div id="root">\s*<!--[^>]*-->\s*)<main>[\s\S]*?<\/main>/;
  if (!pattern.test(html)) throw new Error("prerender-seo: could not find the fallback <main> in built index.html");
  return html.replace(pattern, (_match, prefix) => `${prefix}${seoMainHtml(route)}`);
}

// Article JSON-LD for article routes, generated from the same data as the
// visible article page and the fallback (one wording, three surfaces).
// The script tag carries data-article-schema so the prerender can find
// and replace it, mirroring the data-faq-schema convention above.
export function articleJsonLd(route) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: route.heading,
    description: route.description,
    image: `${SEO_SITE_ORIGIN}/logo.png`,
    datePublished: route.article.datePublished,
    dateModified: route.article.dateModified,
    articleSection: route.article.section,
    author: { "@type": "Organization", name: "AI Hidden Leads", url: `${SEO_SITE_ORIGIN}/` },
    publisher: {
      "@type": "Organization",
      name: "AI Hidden Leads",
      url: `${SEO_SITE_ORIGIN}/`,
      logo: { "@type": "ImageObject", url: `${SEO_SITE_ORIGIN}/logo.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": route.canonical },
  };
}

export function articleSchemaScriptHtml(route) {
  return `<script type="application/ld+json" data-article-schema>\n    ${JSON.stringify(articleJsonLd(route), null, 2).replace(/\n/g, "\n    ")}\n  </script>`;
}

const ARTICLE_SCHEMA_PATTERN = /\s*<script type="application\/ld\+json" data-article-schema>[\s\S]*?<\/script>/;

// Inject this route's Article block (article routes only); every other
// route gets any stray block stripped, so no page ever declares another
// page's article.
export function applyRouteArticle(html, route) {
  let out = html.replace(ARTICLE_SCHEMA_PATTERN, "");
  if (route.article) {
    if (!out.includes("</head>")) throw new Error("prerender-seo: could not find </head> for Article schema");
    // Function replacement, same $-pattern guard as applyRouteFaq.
    out = out.replace("</head>", () => `  ${articleSchemaScriptHtml(route)}\n</head>`);
  }
  return out;
}

export function buildRouteHtml(indexHtml, route) {
  return applyRouteArticle(applyRouteFaq(applyRouteMain(applyRouteHead(indexHtml, route), route), route), route);
}
