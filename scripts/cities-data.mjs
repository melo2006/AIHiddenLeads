// City landing-page content for the /ai-receptionist/<city> pages —
// single source of truth, consumed by BOTH:
//  - scripts/seo-routes.mjs (prerender): builds each city page's route
//    entry (head, FAQPage JSON-LD, the no-JS fallback printing this exact
//    body, and — where the data carries one — a page-level LocalBusiness
//    JSON-LD).
//  - src/lib/cities.ts (client): the React CityPage renders this same
//    body and FAQ, so the visible page, the fallback and the schema can
//    never drift (Google's schema == visible rule, same discipline as
//    scripts/articles-data.mjs).
//
// Keep this dependency-free plain JS so the build script can import it
// directly with node — no bundler, no new packages.
//
// Adding a city is a DATA-ONLY change here (plus its hero image, the
// sitemap entry and the route-enumeration tests): one CityPage component
// renders every entry.
//
// HONESTY RULES (pinned by src/test/cities-seo.test.ts):
//  - Every page is written for its own city — real local industries,
//    areas and caller patterns. A name-swapped duplicate is a failed
//    page; the two launch pages share structure, never sentences.
//  - Only the program's two approved statistics (85% / 78%) and the
//    site's verified plan facts ($99/mo Premium with 400 minutes,
//    $199/mo Professional with 1,200 minutes, $79/mo avatar add-on with
//    its first month free for new customers this month, setup waived).
//  - A `localBusiness` block is carried ONLY by a city the company can
//    honestly claim a presence in, and it always uses the real address
//    of record (1401 S Ocean Blvd, Pompano Beach, FL — ruled 2026-11-23,
//    no ZIP: none exists anywhere in this codebase). Cities served
//    remotely carry NO localBusiness data and say so on the page.
//  - No ranking promises, ever.
//
// Body blocks use the articles convention ({ type: "lead" | "p" | "h2",
// text } / { type: "list", items } / { type: "stats" }) so both the
// React renderer (ArticleBody) and the fallback renderer (seoBodyHtml)
// print them unchanged. Inline links use [label](/path).

export const CITIES = [
  {
    slug: "fort-lauderdale",
    path: "/ai-receptionist/fort-lauderdale",
    cityName: "Fort Lauderdale",
    headline: "AI Receptionist for Fort Lauderdale Businesses",
    seoTitle: "AI Receptionist for Fort Lauderdale Businesses | AI Hidden Leads",
    description:
      "Aspen, the AI receptionist from Pompano Beach-based AI Hidden Leads, answers Fort Lauderdale business calls 24/7 — from $99/mo with 400 minutes included.",
    excerpt:
      "Based in Pompano Beach, serving Fort Lauderdale and Broward County: Aspen answers your business phone and website visitors 24/7, in English, Spanish, or Portuguese — booking the job and sending you the summary.",
    image: "/cities/fort-lauderdale.webp",
    imageAlt:
      "A sunny Fort Lauderdale marina full of yachts, with palm trees, waterfront cafés and glass office buildings along the canal",
    targetKeyword: "ai receptionist fort lauderdale",
    datePublished: "2026-11-27",
    dateModified: "2026-11-27",
    // Page-level LocalBusiness schema: the company's real address of
    // record is in Pompano Beach; this page's market is Fort Lauderdale
    // and Broward County, carried as areaServed — never a Fort Lauderdale
    // street address, because there isn't one.
    localBusiness: {
      telephone: "+1-877-862-4949",
      email: "info@aihiddenleads.com",
      priceRange: "$$",
      address: {
        streetAddress: "1401 S Ocean Blvd",
        addressLocality: "Pompano Beach",
        addressRegion: "FL",
        addressCountry: "US",
      },
      areaServed: [
        "Fort Lauderdale",
        "Pompano Beach",
        "Wilton Manors",
        "Oakland Park",
        "Plantation",
        "Davie",
        "Hollywood",
        "Coral Springs",
        "Broward County",
      ],
    },
    body: [
      {
        type: "lead",
        text: "In Broward County, business happens out on the water, on a job site, or on the road between appointments — rarely at a desk next to a ringing phone. Aspen is the AI receptionist from AI Hidden Leads, based up the coast in Pompano Beach: she answers your Fort Lauderdale business line on the first ring, 24/7, books the appointment while the caller is still on the phone, and sends you the summary and transcript. 85% of callers who hit voicemail never call back — and in a county where the next marina, clinic, or law firm is one search away, an unanswered phone hands that customer to a competitor.",
      },
      { type: "h2", text: "Built for how Broward County does business" },
      {
        type: "p",
        text: "Fort Lauderdale is known as the yachting capital of the world, and the marine economy shapes the phones here: yacht services, charter companies, brokers, and repair shops along the Intracoastal and the Las Olas marinas field calls from owners who expect an answer, not a callback tomorrow. Add the hotels, restaurants, and tour operators serving the beach and the cruise port, medical and dental practices across the county, law firms downtown, realtors working Wilton Manors, Oakland Park, and Plantation, and the home-services crews — air conditioning, plumbing, pool care, marine trades — whose phones ring hardest exactly when both hands are on the job. Every one of those businesses loses the same way: a good call landing in voicemail at 6 PM.",
      },
      {
        type: "p",
        text: "Broward is also multilingual. A large share of your callers are more comfortable in Spanish, and the Brazilian community around Pompano Beach and Deerfield Beach often prefers Portuguese. Aspen works in English, Spanish, and Portuguese, and switches when a caller or website visitor asks — so the conversation continues in the language your customer chose, instead of ending at a language barrier.",
      },
      { type: "h2", text: "What Aspen does on every call" },
      {
        type: "list",
        items: [
          "Answers on the first ring, 24/7 — nights, weekends, and holidays included, even during the Saturday rush of charters, showings, and weekend service calls",
          "Answers questions from your own website and the details you give her: your services, prices, hours, and the areas you cover",
          "Books appointments straight into your calendar and sends the confirmation and reminders",
          "Transfers a caller straight to you when a person is needed, with a short summary before you pick up",
          "Sends you the summary and the full transcript after every call, so nothing depends on your memory",
          "With the optional video-avatar add-on, greets your website visitors as a live video face they can see and talk to — not just a chat box",
        ],
      },
      { type: "stats" },
      { type: "h2", text: "From Las Olas to Coral Springs, one number answers everywhere" },
      {
        type: "p",
        text: "Keep your 954 or 754 number — it stays yours, and you choose whether Aspen answers first or only after your phone rings unanswered. She covers your customers across Fort Lauderdale, Pompano Beach, Wilton Manors, Oakland Park, Plantation, Davie, Hollywood, and Coral Springs, and the rest of Broward County. And we are genuinely local: AI Hidden Leads is based at 1401 S Ocean Blvd in Pompano Beach, a short drive up A1A from Las Olas. The first businesses we built this for are the ones in our own county — we know why your phone rings hardest during boat-show week.",
      },
      { type: "h2", text: "What it costs" },
      {
        type: "p",
        text: "The same flat plans as everywhere — no Broward surcharge. Premium is $99/mo with 400 voice minutes included; Professional is $199/mo with 1,200 minutes. The live video avatar is an optional add-on at $79/mo, free for the first month for new customers this month, and the setup fee is waived. One flat monthly price with minutes included beats a per-message meter: you can compare the full breakdown on the [plans page](/plans) and in our [AI receptionist cost guide](/articles/ai-receptionist-cost).",
      },
      { type: "h2", text: "How setup works" },
      {
        type: "p",
        text: "Setup is one call of about 20 to 30 minutes. Aspen learns your business from your website and your answers — your services, your prices, your service area, how you like callers handled. We connect your existing number and your calendar, you approve how she sounds, and she starts answering. If you are weighing her against a traditional service first, our comparison of an [AI receptionist vs an answering service](/articles/ai-receptionist-vs-answering-service) lays out the honest differences.",
      },
      { type: "h2", text: "See her work before you pay anything" },
      {
        type: "p",
        text: "Run the [free live demo](/demo): it builds a simulation of Aspen on a preview of your own website in about 2 minutes — your pages, your services — and nothing on your site changes. From the same page you can run the free 25-point visibility audit to see where your business shows up across 25 neighborhood search points in Broward. Or simply call 1-877-862-4949 and talk to Aspen on the phone, the way your customers will.",
      },
    ],
    faq: [
      {
        q: "Is AI Hidden Leads actually based near Fort Lauderdale?",
        a: "Yes. Our office is at 1401 S Ocean Blvd in Pompano Beach, in Broward County, and Fort Lauderdale is our home market — the businesses we serve first are the ones in our own county, from Las Olas to Coral Springs. You can reach us any time at 1-877-862-4949.",
      },
      {
        q: "Can I keep my 954 or 754 number?",
        a: "Yes — your number stays yours. You choose how Aspen picks up: she can answer on the first ring, or your phone can ring first and she answers only when you don't. Either way your callers keep dialing the 954 or 754 number they already know.",
      },
      {
        q: "Can Aspen answer my callers in Spanish or Portuguese?",
        a: "Yes. Aspen works in English, Spanish, and Portuguese, on the phone and on your website, and switches languages when a caller asks. In Broward County that is not a bonus feature — a large share of callers prefer Spanish, and many Pompano Beach and Deerfield Beach customers prefer Portuguese.",
      },
      {
        q: "How much does it cost for a Fort Lauderdale business?",
        a: "The same as everywhere: Premium is $99/mo with 400 voice minutes included, and Professional is $199/mo with 1,200 minutes. The video avatar add-on is $79/mo with its first month free for new customers this month, and the setup fee is waived. There is no local surcharge and no per-message meter.",
      },
      {
        q: "Which Fort Lauderdale businesses use an AI receptionist most?",
        a: "The ones whose work keeps them away from the desk: marine and yachting services whose owners are on the docks, realtors at showings, medical and dental practices with a full waiting room, law firms in court, and home-services crews on a job. If your phone rings while your hands are busy, Aspen is built for exactly that gap.",
      },
    ],
  },
];

CITIES.push({
  slug: "dallas",
  path: "/ai-receptionist/dallas",
  cityName: "Dallas",
  headline: "AI Receptionist for Dallas Businesses",
  seoTitle: "AI Receptionist for Dallas Businesses | AI Hidden Leads",
  description:
    "Aspen, the AI receptionist from AI Hidden Leads, answers Dallas–Fort Worth business calls 24/7 on Central Time — from $99/mo with 400 minutes included.",
  excerpt:
    "Serving Dallas–Fort Worth remotely, set up over one call: Aspen answers your business phone 24/7 on Central Time, in English or Spanish — booking the job and sending you the summary after every call.",
  image: "/cities/dallas.webp",
  imageAlt:
    "The downtown Dallas skyline at golden hour, with Reunion Tower and glass office towers above a landscaped park and wide boulevards",
  targetKeyword: "ai receptionist dallas",
  datePublished: "2026-11-27",
  dateModified: "2026-11-27",
  // NO localBusiness block: AI Hidden Leads has no Dallas office,
  // address, or local number, and this page never invents one — the
  // body says plainly that Dallas is served remotely (see the
  // "Straight about where we're based" section and the first FAQ).
  body: [
    {
      type: "lead",
      text: "Dallas–Fort Worth is big, spread out, and always moving — your customers call from job sites, from the truck, from three area codes away, and when nobody picks up they call the next name on the list. Aspen is an AI receptionist who answers your Dallas business line on the first ring, 24/7 on Central Time, books the job or the appointment while the caller is still on the phone, and sends you the summary. 78% of customers abandoned a business after just one unanswered call — in the Metroplex, that caller doesn't wait; they dial a competitor across town.",
    },
    { type: "h2", text: "When the Texas heat does your marketing for you" },
    {
      type: "p",
      text: "Every Dallas summer tells the same story: the first real heat wave arrives, air conditioners start failing all over the Metroplex, and HVAC phones ring in the evening and on weekends — exactly when the crew is still out on the last job. The same pattern hits plumbers after a hard freeze, roofers after a hailstorm rolls through, and electricians whenever the grid strains. Aspen answers every one of those calls, asks your intake questions — what's down, where, how urgent, what number to call back — and books the visit into your calendar. Not one of them waits on hold, and not one of them lands in a voicemail box you'll check tomorrow.",
    },
    { type: "h2", text: "What she handles on every call" },
    {
      type: "list",
      items: [
        "Answers on the first ring, 24/7 on Central Time — including the 9 PM “my AC just quit” call in August",
        "Asks the intake questions your trade or practice needs, in English or Spanish, and switches languages when a caller asks",
        "Books the job, the consultation, or the appointment straight into your calendar and sends confirmations and reminders",
        "When a caller needs a human, she puts them through to you live — and whispers the gist of the call first, so you never pick up cold",
        "Sends you the summary and the full transcript after every call, whether it came from Dallas, Fort Worth, or Plano",
        "On your website, the optional video-avatar add-on lets visitors see her and talk with her face to face, instead of typing into a chat box",
      ],
    },
    { type: "stats" },
    { type: "h2", text: "One receptionist for the whole Metroplex" },
    {
      type: "p",
      text: "Your customers don't think in city limits, and neither does your phone coverage. Aspen answers for businesses across Dallas, Fort Worth, Plano, Irving, Richardson, Garland, and Arlington, and your callers keep the number they already know — 214, 469, 972, or 945 in Dallas, 817 over in Fort Worth. Beyond the trades, she covers the same ground for law firms that can't miss an intake call, medical and dental offices booking against a full schedule, and [real estate agents](/agents/realtors) who are out at showings across two counties when a buyer calls.",
    },
    { type: "h2", text: "Straight about where we're based" },
    {
      type: "p",
      text: "AI Hidden Leads is based in Florida, not Dallas. There is no Dallas office and no Dallas street address behind this page, and we won't pretend otherwise to win a search ranking. What Dallas businesses get instead is the whole service, delivered remotely: setup happens over one call, your receptionist answers on Central Time from the first day, and support is a phone call away at 1-877-862-4949. Plenty of answering services rent a Dallas post-office box to look local; we'd rather be honest about where we sit and excellent at answering your phone.",
    },
    { type: "h2", text: "Pricing for Dallas–Fort Worth" },
    {
      type: "p",
      text: "One flat plan, priced the same in Texas as everywhere: Premium is $99/mo with 400 voice minutes included; Professional is $199/mo with 1,200 minutes. The live video avatar is an optional add-on at $79/mo, free for the first month for new customers this month, and the setup fee is waived. That flat price matters most in a Dallas summer, when call volume spikes — compare it with a per-minute answering service in our [AI receptionist cost guide](/articles/ai-receptionist-cost), and see every plan on the [plans page](/plans).",
    },
    { type: "h2", text: "Getting started from Dallas" },
    {
      type: "p",
      text: "No site visit, no waiting on an installer. On one call of about 20 to 30 minutes, Aspen learns your business from your website and your answers — services, prices, service area, how you want callers handled. We connect your existing number and your calendar, you approve how she sounds, and she starts answering on Central Time. If you're comparing her with a traditional service, our breakdown of an [AI receptionist vs an answering service](/articles/ai-receptionist-vs-answering-service) covers the differences honestly.",
    },
    { type: "h2", text: "Try her on your own website first" },
    {
      type: "p",
      text: "Run the [free live demo](/demo): it builds a simulation of Aspen on a preview of your own website in about 2 minutes — your pages, your services — and nothing on your site changes. From the same page, run the free 25-point visibility audit to see where your business shows up across 25 neighborhood search points around Dallas. Or call 1-877-862-4949 and talk to Aspen yourself, the way your customers will.",
    },
  ],
  faq: [
    {
      q: "Do you have a Dallas office?",
      a: "No — and we'd rather say so plainly. AI Hidden Leads is based in Florida; Dallas–Fort Worth is served remotely. Setup is done over one call, your receptionist answers on Central Time, and support is at 1-877-862-4949. What you don't get is a local storefront; what you do get is every call answered, 24/7.",
    },
    {
      q: "Can I keep my 214, 972, or 817 number?",
      a: "Yes — your number stays yours, whether it's a 214, 469, 972, or 945 in Dallas or an 817 in Fort Worth. You choose how Aspen picks up: on the first ring, or after your phone rings unanswered. Your customers keep dialing the number already on your trucks, cards, and website.",
    },
    {
      q: "Can Aspen answer my callers in Spanish?",
      a: "Yes. Aspen answers in English or Spanish, on the phone and on your website, and switches when a caller asks. Across Dallas–Fort Worth, a large share of callers prefer Spanish — with Aspen, that preference never costs you the job.",
    },
    {
      q: "How does she handle the summer HVAC rush?",
      a: "She answers every call on the first ring, even when the heat wave has five customers calling in the same hour — there is no hold queue and no voicemail box filling up while your crews are on rooftops. Each caller gets your intake questions asked, the visit booked into your calendar, and a summary sent to you after the call.",
    },
    {
      q: "How much does it cost for a Dallas business?",
      a: "The same flat plans as everywhere: Premium is $99/mo with 400 voice minutes included, and Professional is $199/mo with 1,200 minutes. The video avatar add-on is $79/mo with its first month free for new customers this month, and the setup fee is waived. No Texas surcharge, no per-minute meter running during your busiest month.",
    },
  ],
});

export function cityForSlug(slug) {
  return CITIES.find((c) => c.slug === slug) || null;
}

/** Rough word count for a city page (headline + body + FAQ), the same
 * measure articleWordCount applies to articles — the launch band is
 * pinned by src/test/cities-seo.test.ts. */
export function cityWordCount(city) {
  const textOf = (block) => {
    if (block.type === "table") return [...block.head, ...block.rows.flat()].join(" ");
    if (block.type === "list") return block.items.join(" ");
    return block.text || "";
  };
  const words = [
    city.headline,
    ...city.body.map(textOf),
    ...city.faq.flatMap((f) => [f.q, f.a]),
  ]
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .split(/\s+/)
    .filter(Boolean).length;
  return words;
}
