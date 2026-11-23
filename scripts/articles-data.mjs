// Article content for the /articles section — single source of truth,
// consumed by BOTH:
//  - scripts/seo-routes.mjs (prerender): builds each article's route entry
//    (head, Article + FAQPage JSON-LD, and the no-JS fallback, which prints
//    this exact body so a crawler without JavaScript reads the full text).
//  - src/lib/articles.ts (client): the React article pages render this
//    same body and FAQ, so the visible page, the fallback and the schema
//    can never drift (Google's schema == visible rule, same discipline as
//    the route Q&A sets in seo-routes.mjs).
//
// Keep this dependency-free plain JS so the build script can import it
// directly with node — no bundler, no new packages.
//
// Body blocks: { type: "lead" | "p" | "h2", text } renders a paragraph or
// heading; { type: "list", items } a bullet list; { type: "table", head,
// rows } a comparison table. Inline links inside text use the light
// convention [label](/path) and are rendered as real anchors by both
// consumers. Prices and plan facts are the site's verified ones; competitor
// prices are the published ones documented in the 2026-11-23 audit
// (~/workspace/seo/audit-rankings-competitors.md) — update them here only.

export const ARTICLES = [
  {
    slug: "ai-receptionist-cost",
    path: "/articles/ai-receptionist-cost",
    headline: "How Much Does an AI Receptionist Cost? (2026 Price Guide)",
    seoTitle: "How Much Does an AI Receptionist Cost? 2026 Price Guide | AI Hidden Leads",
    description:
      "Real 2026 prices for AI receptionists, answering services and human receptionists — published provider plans compared, the per-minute math, and exactly what AI Hidden Leads charges.",
    excerpt:
      "Published AI receptionist plans run $49–$299/mo. Here's how that compares with an answering service's meter and a human receptionist's salary — with the per-minute math done for you.",
    targetKeyword: "ai receptionist cost",
    datePublished: "2026-11-23",
    dateModified: "2026-11-23",
    body: [
      {
        type: "lead",
        text: "An AI receptionist typically costs $49–$299 per month for a small business, priced by the minutes or callers included. At AI Hidden Leads, Premium is $99/mo with 400 voice minutes included; Professional is $199/mo with 1,200 minutes. For scale: a full-time human receptionist commonly costs several thousand dollars a month in salary alone, and an answering service usually charges a base fee plus a per-minute or per-call meter. Here is the full breakdown, with real published prices.",
      },
      { type: "h2", text: "The three ways to pay for answered calls" },
      {
        type: "p",
        text: "Every option for covering your phone is one of three shapes. You can employ a person, which buys a set number of hours at a fixed salary. You can rent people by the minute from an answering service — flexible, but metered. Or you can subscribe to an AI receptionist: a flat monthly plan with a block of minutes included. The stickers aren't comparable until you look at what each shape covers — hours, call volume, and whether the work finishes during the call or comes back to you as a message.",
      },
      { type: "h2", text: "What a human receptionist costs" },
      {
        type: "p",
        text: "A full-time in-house receptionist commonly runs about $2,800–$3,800 a month in salary alone, depending on your market — before payroll taxes, benefits, equipment, and covering sick days and vacations. What you get is a real person at a desk during business hours: greeting walk-ins, handling office work, answering one call at a time. Calls that arrive at 7 PM, on weekends, or while that person is already on the phone still go to voicemail — and 85% of callers who hit voicemail never call back.",
      },
      {
        type: "p",
        text: "A part-time or shared receptionist costs less but covers fewer hours, and still buys one conversation at a time. When most calls are simple — hours, prices, booking — most of that salary pays for presence, not call handling.",
      },
      { type: "h2", text: "What an answering service costs" },
      {
        type: "p",
        text: "A traditional answering service usually combines a monthly base fee with a meter: often around $1–$2 per minute of operator talk time, or a charge per call or per message, with after-hours and holiday surcharges on some plans. A quiet month is cheap; a busy month is not, and you can't know the bill in advance because it scales with volume and talkativeness.",
      },
      {
        type: "p",
        text: "What the meter buys is message-taking: the operator follows a script, writes down the caller's name, number and reason, and passes it to you. The actual work — answering the real question, booking the appointment — still lands back on you as a callback. Some services can book into a shared calendar, but in most engagements the deliverable is the message slip.",
      },
      { type: "h2", text: "What an AI receptionist costs" },
      {
        type: "p",
        text: "AI receptionists are sold as flat monthly plans with minutes (or, in Goodcall's case, callers) included. Published prices from the main small-business providers, checked November 2026:",
      },
      {
        type: "table",
        head: ["Provider", "Plan", "Price", "What's included"],
        rows: [
          ["Rosie", "Professional", "$49/mo", "250 minutes"],
          ["Goodcall", "Starter", "$79/mo", "100 unique customers — billed per customer, not per minute"],
          ["Frontdesk", "Business-in-a-Box", "$99/mo", "200 voice minutes; overage at $0.25/min"],
          ["AI Hidden Leads", "Premium", "$99/mo", "400 voice minutes, website chat, up to 50 B2B prospects/mo"],
          ["Rosie", "Scale", "$149/mo", "1,000 minutes; booking and live transfers start at this tier"],
          ["AI Hidden Leads", "Professional", "$199/mo", "1,200 voice minutes, website chat, up to 100 B2B prospects/mo"],
          ["Rosie", "Growth", "$299/mo", "2,000 minutes"],
        ],
      },
      {
        type: "p",
        text: "Prices change; check each provider's own site before you buy. The shape matters as much as the number: per-minute plans punish a busy month, per-customer pricing is hard to compare until you know your caller count, and included minutes only help if the plan also does the work you need — booking and answering real questions.",
      },
      { type: "h2", text: "Do the per-minute math before you compare stickers" },
      {
        type: "p",
        text: "The fair comparison is cost per included minute — price divided by the minutes in the block — plus what happens when you run past it:",
      },
      {
        type: "list",
        items: [
          "AI Hidden Leads Premium: $99 ÷ 400 minutes ≈ 25¢ per included minute. Professional: $199 ÷ 1,200 ≈ 17¢.",
          "Frontdesk: $99 ÷ 200 minutes ≈ 50¢ per included minute, then 25¢/min in overage.",
          "Rosie: $49 ÷ 250 ≈ 20¢; $149 ÷ 1,000 ≈ 15¢; $299 ÷ 2,000 ≈ 15¢ — strong raw per-minute math at the higher tiers.",
          "Goodcall prices per unique customer instead (79¢ each on Starter), which suits short calls and penalizes nothing for a long one.",
        ],
      },
      {
        type: "p",
        text: "On raw per-minute math alone, some high-tier plans run lower than ours. What differs is the bundle: whether the plan also answers on your website by voice and chat, appears as a video avatar, books into your calendar, and includes prospect generation. Compare the whole bundle, at your real call volume — not the cheapest line in the table.",
      },
      { type: "h2", text: "What AI Hidden Leads charges — exactly" },
      {
        type: "p",
        text: "Premium is $99/mo — the permanent price — with 400 voice minutes, website chat, and up to 50 B2B prospects per month included (no specific count is guaranteed). Professional is $199/mo with 1,200 minutes and up to 100 prospects. Aspen's [live video avatar](/articles/ai-receptionist-with-video-avatar) is an optional add-on at $79/mo on any plan, and its first month is free; the voice receptionist works fully without it. The standard $199 setup fee is waived this month. There are no per-message fees, and Aspen answers 24/7 — nights, weekends and holidays — for the same flat price.",
      },
      { type: "h2", text: "Which option fits your business?" },
      {
        type: "p",
        text: "If you get a handful of simple calls a week, a basic answering service can be the cheapest honest option. If calls are your lifeline and need to end in a booked appointment, the flat AI plan usually wins on math and coverage — it answers instantly and finishes the booking during the call. And if you need a physical presence greeting walk-ins, that's a human's job; no software replaces it.",
      },
      {
        type: "p",
        text: "The fastest way to price it for your own business is to watch it work: the [free live demo](/demo) puts Aspen on your own website in about 2 minutes and installs nothing. The [plans page](/plans) shows exactly what is in each tier, and [AI receptionist vs answering service](/articles/ai-receptionist-vs-answering-service) covers how the two differ beyond price.",
      },
    ],
    faq: [
      {
        q: "How much does an AI receptionist cost per month?",
        a: "Most small-business AI receptionists run $49–$299/mo depending on the minutes included. At AI Hidden Leads, Premium is $99/mo with 400 voice minutes included and Professional is $199/mo with 1,200 minutes. The live video avatar is an optional add-on at $79/mo whose first month is free, and the setup fee is waived this month.",
      },
      {
        q: "Is an AI receptionist cheaper than an answering service?",
        a: "It depends on your call volume. An answering service adds per-minute or per-call charges on top of a base fee, so a busy month costs more and the bill is hard to predict. An AI receptionist is a flat plan with minutes included. For a handful of calls a month, a basic answering service can be cheaper; once you field calls daily, the flat AI plan usually wins — and it books the appointment during the call instead of taking a message.",
      },
      {
        q: "How much does a human receptionist cost compared with an AI receptionist?",
        a: "A full-time human receptionist commonly costs about $2,800–$3,800 a month in salary alone, before payroll taxes, benefits and time-off coverage — and one person takes one call at a time, during business hours. An AI receptionist at $99/mo answers 24/7 and handles several calls at once. It does not greet walk-ins or do office work; they are different tools, and many businesses use the AI for the phones and a human for the office.",
      },
      {
        q: "Are there per-minute or per-message charges on top of the plan?",
        a: "At AI Hidden Leads there are no per-message fees. Each plan includes a block of voice minutes — 400 on Premium, 1,200 on Professional — and if your call volume regularly runs past your block, moving up a tier beats a meter running in the background.",
      },
      {
        q: "Is there a setup fee?",
        a: "The standard setup fee is $199, and it is waived this month. Setup includes training Aspen on your website, services and prices, connecting your calendar for bookings, and configuring call transfers to your phone.",
      },
    ],
  },
];

ARTICLES.push(
  {
    slug: "ai-receptionist-vs-answering-service",
    path: "/articles/ai-receptionist-vs-answering-service",
    headline: "AI Receptionist vs Answering Service: What's the Difference?",
    seoTitle: "AI Receptionist vs Answering Service: What's the Difference? | AI Hidden Leads",
    description:
      "An answering service rents you people who take messages; an AI receptionist answers instantly and finishes the work in the call. An honest side-by-side — including where humans are genuinely better.",
    excerpt:
      "One rents you people who take messages. The other answers instantly and books the appointment during the call. The honest side-by-side, including where humans win.",
    targetKeyword: "ai receptionist vs answering service",
    datePublished: "2026-11-23",
    dateModified: "2026-11-23",
    body: [
      {
        type: "lead",
        text: "An answering service employs people who take your calls and pass you messages. An AI receptionist is software that answers instantly, follows your script the same way on every call, and does the work during the call itself — answering questions, booking the appointment, and sending you a summary. Neither is better in the abstract; the right choice depends on the calls you actually get. Here is the honest side-by-side.",
      },
      { type: "h2", text: "What an answering service actually does" },
      {
        type: "p",
        text: "You forward your line to a call center, where trained operators follow a script in your business's name. They greet the caller, write down the name, number and reason for the call, and deliver the message to you by text, email or an app. Some services can also patch a caller through to you, and some can book into a shared calendar — but in most engagements, the deliverable is the message slip, and the real work still waits for your callback. Quality is human: a good operator brings judgment to an odd request, and a tired one, at a busy center, may not. You are billed a base fee plus a meter — per minute, per call or per message.",
      },
      { type: "h2", text: "What an AI receptionist actually does" },
      {
        type: "p",
        text: "An AI receptionist answers on the first ring, at any hour, and is trained on your business — your website, services, prices and way of working. It holds a real conversation: answering questions, qualifying the caller, booking the appointment into your calendar, and sending confirmations and reminders. When a call needs you, it can transfer the caller straight to your phone. After every call you get a summary and the full transcript. It performs the same way on the first call of the day and the fiftieth, and it can handle several callers at the same moment — no queue, no hold music, no voicemail. At AI Hidden Leads the price is one flat monthly plan with minutes included, not a meter running on every message.",
      },
      { type: "h2", text: "Side by side" },
      {
        type: "table",
        head: ["", "Answering service", "AI receptionist"],
        rows: [
          ["Who answers", "Human operators at a call center", "Software — at AI Hidden Leads, Aspen, by phone and on your website"],
          ["Speed to answer", "After a queue; varies with the center's load", "Instantly, on the first ring"],
          ["Hours", "24/7 available; after-hours surcharges are common", "24/7 included in the plan"],
          ["Consistency", "Varies by operator", "Same script, same answers, every call"],
          ["Booking appointments", "Usually message-taking; some book via a shared calendar", "Books into your calendar during the call"],
          ["Knowledge of your business", "A script and notes", "Trained on your website, services and prices"],
          ["Video presence", "None", "Optional live video avatar on your website"],
          ["After the call", "A message slip", "A summary and the full transcript"],
          ["Cost shape", "Base fee plus a per-minute or per-call meter", "Flat monthly plan with minutes included"],
          ["Simultaneous calls", "Limited by staffing", "Several callers at once"],
        ],
      },
      { type: "h2", text: "Where a human answering service is genuinely better" },
      {
        type: "p",
        text: "There are calls where a person is simply the right tool, and any honest comparison should say so:",
      },
      {
        type: "list",
        items: [
          "Sensitive situations — a distressed caller, a medical or legal matter with real nuance — where human judgment and empathy carry the call.",
          "Highly unusual requests that fall outside any script and need improvisation or negotiation.",
          "Callers who strongly prefer a person and will disengage from anything else.",
          "Complex coordination across several people, where the 'receptionist' is really doing case management.",
        ],
      },
      {
        type: "p",
        text: "If most of your calls look like that, hire the humans. Most small-business calls, though, are hours, prices, availability and booking — and for those, the differences run the other way.",
      },
      { type: "h2", text: "Where an AI receptionist wins" },
      {
        type: "list",
        items: [
          "Nobody reaches voicemail. 85% of callers who hit voicemail never call back — an AI answers every call, instantly, including nights and weekends.",
          "The work finishes in the call. The appointment is booked and confirmed before the caller hangs up, instead of starting a callback chain that decays by the hour.",
          "The cost is predictable. One flat plan with minutes included, instead of a meter that makes your busiest month your most expensive.",
          "It never has a bad day. The greeting, the questions and the follow-through are identical on every call.",
          "It scales for free. A sudden rush — an ad working, a storm, a seasonal spike — is just more simultaneous calls, not a staffing problem.",
        ],
      },
      { type: "h2", text: "The hybrid most owners actually want" },
      {
        type: "p",
        text: "For most businesses the real answer is both, in sequence: the AI answers first — instantly, around the clock — handles the routine majority end to end, and transfers the calls that need a human straight to you or your team, with a summary of what was said. You keep the judgment where it matters and stop paying human rates, and human attention, for 'what time do you close?' That is how Aspen is configured at AI Hidden Leads: she answers, books and qualifies, and a caller who needs you gets you.",
      },
      { type: "h2", text: "What about cost?" },
      {
        type: "p",
        text: "The answering service's meter means your bill grows with every minute of talk; the AI plan is flat with a block of minutes included. Which is cheaper depends entirely on your volume — we did the full math, with published prices from the main providers, in our [2026 AI receptionist price guide](/articles/ai-receptionist-cost).",
      },
      {
        type: "p",
        text: "If you want to hear the difference instead of reading about it, watch Aspen work on your own website in the [free live demo](/demo) — about 2 minutes, nothing installed — or read about the version of her visitors can actually see in [What is an AI receptionist with a video avatar?](/articles/ai-receptionist-with-video-avatar)",
      },
    ],
    faq: [
      {
        q: "What is the difference between an AI receptionist and an answering service?",
        a: "An answering service has people at a call center take your calls and pass you messages, billed as a base fee plus a per-minute or per-call meter. An AI receptionist is software that answers instantly, 24/7, and does the work during the call — answering questions from your own business knowledge, booking the appointment into your calendar, and sending you a summary with the transcript — for one flat monthly plan with minutes included.",
      },
      {
        q: "Can an AI receptionist book appointments, or does it just take messages?",
        a: "It books. An AI receptionist like Aspen checks your real calendar availability during the call, books the appointment, and sends the confirmation and reminders — the caller hangs up with the appointment made, not with a promise that someone will call back. Taking a message is what it does only when a caller asks for a callback instead.",
      },
      {
        q: "Will callers know they are talking to an AI?",
        a: "Yes — Aspen is presented as your AI assistant, never as a human employee. The conversation itself is a normal spoken conversation: callers ask their questions, get real answers drawn from your business's own information, and get their appointment booked. Her identity is never hidden; it is also rarely the point, because the caller's problem got solved.",
      },
      {
        q: "Is an answering service better for sensitive calls?",
        a: "It can be. Distressed callers and matters needing real human judgment are where people shine, and an honest provider will say so. Most businesses handle this with a hybrid: the AI receptionist answers first and handles the routine calls end to end, and transfers sensitive or complex calls to a human — at AI Hidden Leads, straight to your phone, with a summary first.",
      },
      {
        q: "Which is cheaper, an AI receptionist or an answering service?",
        a: "It depends on call volume. An answering service's base-plus-meter pricing can be cheaper if you receive very few calls; the meter grows with every busy month. An AI receptionist is a flat plan — at AI Hidden Leads, $99/mo with 400 minutes included — so heavy months cost the same as quiet ones. Our price guide works through the math with published provider prices.",
      },
    ],
  },
  {
    slug: "ai-receptionist-with-video-avatar",
    path: "/articles/ai-receptionist-with-video-avatar",
    headline: "What Is an AI Receptionist With a Video Avatar?",
    seoTitle: "What Is an AI Receptionist With a Video Avatar? | AI Hidden Leads",
    description:
      "An AI receptionist with a video avatar answers your phone and appears live on your website as a talking, lip-synced person visitors can speak with. How it works, who it's for, and what to check before buying.",
    excerpt:
      "It's an AI receptionist you can see: the same AI that answers your phone appears live on your website as a talking person your visitors can speak with. Here's how it works.",
    targetKeyword: "ai receptionist with video avatar",
    datePublished: "2026-11-23",
    dateModified: "2026-11-23",
    body: [
      {
        type: "lead",
        text: "An AI receptionist with a video avatar is an AI receptionist you can see. The same AI that answers your business phone also appears on your website as a live, lip-synced video person — at AI Hidden Leads, she's called Aspen — who greets visitors by voice and chat, answers questions about your business, and books appointments. Instead of reading your pages and leaving, visitors have a conversation, and the ones who were never going to fill out a form become leads.",
      },
      { type: "h2", text: "How it works on your website" },
      {
        type: "p",
        text: "Nothing is installed by the visitor; the avatar runs right in the browser, on a phone or a computer. The flow is simple:",
      },
      {
        type: "list",
        items: [
          "A visitor lands on your website and taps to talk — or just starts chatting, if they'd rather type.",
          "The avatar greets them by voice, face to face, and asks what they need.",
          "It answers from your own business's knowledge — your services, your prices, your hours, your way of doing things — because it was trained on your website and the details you give it.",
          "It books the appointment into your calendar, or captures the inquiry with the visitor's details.",
          "You get a summary of the conversation, and the lead, without having been anywhere near your phone.",
        ],
      },
      {
        type: "p",
        text: "That matters because most website visitors never call and never submit a form — they look, and they leave. 78% of customers abandon a business after just one unanswered call; the website version of the same problem is the silent exit. A face that greets people in the first seconds gives them someone to ask, in the moment they were deciding.",
      },
      { type: "h2", text: "How it works on your phone" },
      {
        type: "p",
        text: "The avatar is the visible half of one AI receptionist, not a separate gadget. The same AI answers your business line around the clock — voice only, as any phone call is — with the same knowledge of your business. She answers questions, books appointments, sends you a summary and transcript after every call, and can transfer a caller straight to you when a human is needed. One system learns your business once and covers both front doors: the website and the phone.",
      },
      { type: "h2", text: "Not a chatbot, and not a recorded video" },
      {
        type: "p",
        text: "A chatbot is a text box: the visitor types, and too often gets a decision tree that ends at 'please call us.' A recorded video is a one-way presentation — polished, but it can't hear a question, let alone answer one about your prices. A live video avatar is a real-time conversation. Visitors can interrupt, ask follow-ups, and get answers drawn from your business's own information, spoken naturally by a person they can see. The face is not decoration; it's what makes people actually start the conversation.",
      },
      { type: "h2", text: "Who it's for" },
      {
        type: "list",
        items: [
          "Service businesses that live on booked appointments — home services, clinics, salons, professional firms — where a website visitor is one question away from booking.",
          "Owners and small teams who can't answer while they're doing the work, and whose website gets visits they never hear about.",
          "Businesses with after-hours demand: the visitor at 9 PM gets a conversation, not a contact form.",
          "Anyone whose competitors' websites talk back — and whose own still sits silent.",
        ],
      },
      { type: "h2", text: "What to check before you buy one" },
      {
        type: "list",
        items: [
          "Does it learn YOUR business — your site, services and prices — or give generic answers with your logo on top?",
          "Does it book real appointments into your calendar, or does it just chat and take messages?",
          "Does the same AI answer your phone line, or is the avatar website-only, leaving your calls uncovered?",
          "Can visitors speak, or must they type? Does it work in a phone browser with nothing to install?",
          "What does the avatar cost on top of the voice plan — some providers bundle it, others charge it as an add-on — and can you switch it off?",
          "Can you try it on your own website, with your own content, before you pay anything?",
        ],
      },
      { type: "h2", text: "What it costs" },
      {
        type: "p",
        text: "At AI Hidden Leads the voice receptionist comes first: Premium is $99/mo with 400 voice minutes included. The live video avatar is an optional add-on at $79/mo on any plan, and its first month is free — so you can run Aspen with her face on your website for a month and keep her only if she's earning it. The standard setup fee is waived this month. Our [2026 price guide](/articles/ai-receptionist-cost) compares the whole market, and the [comparison with a traditional answering service](/articles/ai-receptionist-vs-answering-service) covers the phone side in depth.",
      },
      {
        type: "p",
        text: "The honest test is your own website: in the [free live demo](/demo), Aspen builds a simulation on a preview of your actual site — your pages, your services — in about 2 minutes. Nothing is installed and nothing on your site changes. Watch her greet a visitor the way she would greet yours, then decide.",
      },
    ],
    faq: [
      {
        q: "Is the video avatar a real person?",
        a: "No. Aspen is a live, lip-synced AI video avatar — a generated person who speaks and responds in real time. She is presented as your AI assistant, never as a human employee, and visitors are talking with an AI that has been trained on your business's own information.",
      },
      {
        q: "Do website visitors have to type, or can they talk?",
        a: "They can talk. Visitors speak by voice, face to face with the avatar, or use text chat if they prefer — both run right in the browser on a phone or computer, with nothing to install or download.",
      },
      {
        q: "Does the avatar also answer my business phone calls?",
        a: "Yes. The avatar is the website face of the same AI receptionist: she answers your business line 24/7 by voice, answers questions from your business's knowledge, books appointments into your calendar, sends you a summary and transcript after every call, and can transfer a caller straight to you.",
      },
      {
        q: "What does an AI receptionist with a video avatar cost?",
        a: "At AI Hidden Leads, the AI receptionist is $99/mo for Premium with 400 voice minutes included, and the live video avatar is an optional add-on at $79/mo whose first month is free — the voice receptionist works fully without it. The standard setup fee is waived this month. Other providers price the avatar differently; our price guide compares the published plans.",
      },
      {
        q: "Can I see it working on my own website before I pay?",
        a: "Yes. The free live demo builds a simulation of Aspen on a preview of your actual website — your pages and services — in about 2 minutes. Nothing is installed and nothing on your live site changes; it is a mock-up built from your public pages so you can judge the real thing before spending anything.",
      },
    ],
  },
);

export function articleForSlug(slug) {
  return ARTICLES.find((a) => a.slug === slug) || null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-11-23" → "November 23, 2026" (shared by the fallback + client). */
export function formatArticleDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${MONTH_NAMES[(m || 1) - 1]} ${d}, ${y}`;
}

/** Rough reading time for the byline, from the article's own words. */
export function articleWordCount(article) {
  const textOf = (block) => {
    if (block.type === "table") return [...block.head, ...block.rows.flat()].join(" ");
    if (block.type === "list") return block.items.join(" ");
    return block.text || "";
  };
  const words = [
    article.headline,
    ...article.body.map(textOf),
    ...article.faq.flatMap((f) => [f.q, f.a]),
  ]
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .split(/\s+/)
    .filter(Boolean).length;
  return words;
}
