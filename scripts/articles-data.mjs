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
    image: "/articles/ai-receptionist-cost.webp",
    imageAlt: "Aspen, the AI receptionist from AI Hidden Leads, smiling in a navy blazer",
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
      {
        type: "p",
        text: "Deciding between software and a person? [AI receptionist vs hiring a receptionist](/articles/ai-receptionist-vs-hiring-a-receptionist) does that math, [AI receptionist vs virtual receptionist](/articles/ai-receptionist-vs-virtual-receptionist) covers the human remote option, and the [buyer's checklist](/articles/best-ai-receptionist-for-small-business) lists the tests to run before you choose.",
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
    image: "/articles/ai-receptionist-vs-answering-service.webp",
    imageAlt: "Dave, a marina service manager, standing in front of the boats at his marina",
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
      {
        type: "p",
        text: "Two comparisons owners ask about next: [AI receptionist vs hiring a receptionist](/articles/ai-receptionist-vs-hiring-a-receptionist), if the alternative is an employee, and [AI receptionist vs virtual receptionist](/articles/ai-receptionist-vs-virtual-receptionist), if it is a remote human service. Comparing AI providers themselves? The [buyer's checklist](/articles/best-ai-receptionist-for-small-business) lists what to test.",
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
    image: "/articles/ai-receptionist-with-video-avatar.webp",
    imageAlt: "Aspen, the AI receptionist, appearing on screen as a live video avatar",
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
      {
        type: "p",
        text: "Comparing the alternatives first? [AI receptionist vs hiring a receptionist](/articles/ai-receptionist-vs-hiring-a-receptionist) does the employee math, [AI receptionist vs virtual receptionist](/articles/ai-receptionist-vs-virtual-receptionist) covers remote human services, and the [buyer's checklist](/articles/best-ai-receptionist-for-small-business) lists the tests any provider — us included — should pass.",
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

// Batch 2 (2026-11-23): the employee comparison, the human-remote
// comparison, and the buyer's checklist — articles 4–6 of the 24-article
// program. Same discipline as batch 1: published competitor facts only
// (from the articles above), the site's verified plan facts, and the
// homepage's own 85%/78% statistics as the only performance numbers.
ARTICLES.push(
  {
    slug: "ai-receptionist-vs-hiring-a-receptionist",
    path: "/articles/ai-receptionist-vs-hiring-a-receptionist",
    headline: "AI Receptionist vs Hiring a Receptionist: The Real Math",
    seoTitle: "AI Receptionist vs Hiring a Receptionist: The Real Math | AI Hidden Leads",
    description:
      "A full-time receptionist costs $2,800–$3,800/mo in salary alone; an AI receptionist plan is $99/mo. The full cost stack, the coverage math, and an honest account of what a great human hire still does better.",
    excerpt:
      "Salary alone runs $2,800–$3,800 a month for a full-time receptionist — before taxes, benefits and one sick day. Here's the full cost stack next to a $99/mo AI plan, and where each one honestly wins.",
    targetKeyword: "ai receptionist vs hiring a receptionist",
    datePublished: "2026-11-23",
    dateModified: "2026-11-23",
    body: [
      {
        type: "lead",
        text: "A full-time receptionist commonly costs about $2,800–$3,800 a month in salary alone — $33,600–$45,600 a year — before payroll taxes, benefits, equipment, and covering a single sick day. An AI receptionist at AI Hidden Leads costs $99/mo for Premium with 400 voice minutes included. But the sticker gap is not the whole comparison: a great human hire does things no software can, and the AI covers hours and call volumes no single hire can. This is the real math, both ways.",
      },
      { type: "h2", text: "The full cost of hiring a receptionist" },
      {
        type: "p",
        text: "The salary line is the one everyone quotes, and it is only the start of the stack. Payroll taxes and benefits sit on top of it. So do the desk, the computer and the phone. So does the time you spend recruiting, interviewing and training — and the day the person calls in sick, takes a vacation, or resigns and takes everything they learned about your callers with them. During every one of those gaps, your phone goes back to voicemail, and 85% of callers who hit voicemail never call back.",
      },
      {
        type: "table",
        head: ["", "Hiring a receptionist", "AI receptionist (AI Hidden Leads)"],
        rows: [
          ["Monthly cost", "$2,800–$3,800 in salary alone", "Premium $99/mo · Professional $199/mo · Platinum $349/mo"],
          ["Hours covered", "One shift, business hours", "24/7 — nights, weekends and holidays"],
          ["Calls at once", "One conversation at a time", "Several callers at the same moment"],
          ["Sick days and vacation", "Uncovered, or covered by paying twice", "No coverage gaps"],
          ["Turnover", "Rehire and retrain when they leave", "Nothing to rehire"],
          ["Greets walk-ins", "Yes — a real person at your desk", "No"],
          ["Office work between calls", "Yes", "No"],
          ["After every call", "Notes, if they take them", "A summary and the full transcript"],
        ],
      },
      { type: "h2", text: "What the AI plan costs, exactly" },
      {
        type: "p",
        text: "Premium is $99/mo — the permanent price — with 400 voice minutes, website chat, and up to 50 B2B prospects per month included (no specific count is guaranteed). Professional is $199/mo with 1,200 minutes; Platinum is $349/mo with 2,500. That is $1,188 a year for Premium against $33,600–$45,600 a year in salary alone for the hire. Aspen's [live video avatar](/articles/ai-receptionist-with-video-avatar) is an optional add-on at $79/mo on any plan, its first month free; the standard $199 setup fee is waived this month. Our [price guide](/articles/ai-receptionist-cost) puts these numbers next to the rest of the market.",
      },
      { type: "h2", text: "The coverage math nobody puts on the invoice" },
      {
        type: "p",
        text: "A hire buys you one person, in one place, for one shift, having one conversation at a time. Calls that arrive at 7 PM, on a Sunday, during lunch, or while your receptionist is already talking to someone else do not get a worse receptionist — they get voicemail. For many service businesses, those are exactly the calls that matter: the homeowner with a leak searches and dials after dinner, not at 10 AM. The AI answers every one of them, instantly, at the same flat price — and when two people call at once, both get answered.",
      },
      { type: "h2", text: "What a great human hire does better" },
      {
        type: "p",
        text: "Honesty matters here, because a good receptionist is genuinely valuable in ways software is not:",
      },
      {
        type: "list",
        items: [
          "Judgment. A person reads a situation — the upset caller, the odd request, the call that is really three problems in a trench coat — and improvises.",
          "Relationships. Regulars who call every week get a human who knows their name, their history and their preferences.",
          "Physical presence. Greeting walk-ins, receiving packages, keeping an office running — no software does any of this.",
          "Real office work between calls: filing, data entry, chasing paperwork, the hundred small tasks a front desk absorbs.",
        ],
      },
      {
        type: "p",
        text: "If your front desk is mostly that work, hire the person. The AI case rests on a narrower claim: most small-business phone calls are hours, prices, availability and booking — and for those, paying a full salary buys a lot of presence and very little extra call handling.",
      },
      { type: "h2", text: "Where the AI wins" },
      {
        type: "list",
        items: [
          "It answers at 2 AM for the same price as 2 PM. Nights, weekends and holidays are included, not covered by overtime or not covered at all.",
          "It never resigns, never calls in sick, and never needs retraining when your prices change — you update its knowledge once.",
          "It finishes the work in the call: the appointment is booked into your calendar and confirmed before the caller hangs up.",
          "It scales with your busiest day. A rush of calls is just more simultaneous conversations, not a staffing emergency.",
          "The cost is a rounding error next to a salary — which frees the hire you do make to be about the office, not the phone.",
        ],
      },
      { type: "h2", text: "The answer most owners land on" },
      {
        type: "p",
        text: "Both, divided by job. Keep the human for the office — the walk-ins, the regulars, the judgment calls — and let the AI take the phones: first answer, after-hours, overflow when your person is busy, and the routine booking calls end to end. When a call needs a human, Aspen transfers it straight to your phone with a summary of what was said. That is also why the [comparison with an answering service](/articles/ai-receptionist-vs-answering-service) and the [one with a virtual receptionist](/articles/ai-receptionist-vs-virtual-receptionist) are worth reading — the four options divide the work differently.",
      },
      {
        type: "p",
        text: "Run your own math against your own call volume, then watch the AI work before you decide: the [free live demo](/demo) puts Aspen on your own website in about 2 minutes, and the [buyer's checklist](/articles/best-ai-receptionist-for-small-business) lists the tests any provider should pass.",
      },
    ],
    faq: [
      {
        q: "How much cheaper is an AI receptionist than hiring a receptionist?",
        a: "A full-time receptionist commonly costs about $2,800–$3,800 a month in salary alone, before payroll taxes, benefits and time-off coverage. AI Hidden Leads Premium is $99/mo with 400 voice minutes included — $1,188 a year against $33,600–$45,600 a year in salary alone. The AI does not greet walk-ins or do office work, so the honest comparison is about who should answer the phones, not whether the two are the same job.",
      },
      {
        q: "Can an AI receptionist replace my receptionist?",
        a: "It can replace the phone part of the job: answering every call 24/7, answering questions from your business's own information, booking appointments into your calendar, and sending you a summary and transcript after each call. It cannot greet visitors, handle physical office work, or bring human judgment to a sensitive call — which is why many businesses keep a person for the office and let the AI cover the phones, the overflow and the after-hours calls.",
      },
      {
        q: "What happens to callers when a hired receptionist is sick or on vacation?",
        a: "Unless you pay for cover, the phone falls back to voicemail or to whoever is nearest — and 85% of callers who hit voicemail never call back. An AI receptionist has no sick days and no vacations; it answers the fiftieth call of a bad week exactly the way it answered the first.",
      },
      {
        q: "Does the AI get worse over time, or need retraining like a new hire?",
        a: "No. When your prices, hours or services change, you update its knowledge once and every call after that uses the new information. There is no turnover risk: the AI never resigns, so the knowledge your callers depend on never walks out the door.",
      },
      {
        q: "If I keep my receptionist, is there still a case for the AI?",
        a: "Yes — the coverage your hire cannot give you. One person covers one shift and one call at a time. The AI covers nights, weekends, holidays and the second simultaneous call, and transfers anything that needs a human straight to you or your team. At $99/mo with 400 minutes included, it is priced as coverage, not as a replacement.",
      },
    ],
  },
  {
    slug: "ai-receptionist-vs-virtual-receptionist",
    path: "/articles/ai-receptionist-vs-virtual-receptionist",
    headline: "AI Receptionist vs Virtual Receptionist: What's the Difference?",
    seoTitle: "AI Receptionist vs Virtual Receptionist: What's the Difference? | AI Hidden Leads",
    description:
      "A virtual receptionist is a real person working remotely who answers your phone; an AI receptionist is software that answers instantly, 24/7. Hours, knowledge, consistency and cost shapes compared — honestly.",
    excerpt:
      "Same job title, different worker: one is a real person at a remote desk, the other is software. How hours, knowledge, consistency and pricing really differ — and where the human is the right call.",
    targetKeyword: "virtual receptionist ai",
    datePublished: "2026-11-23",
    dateModified: "2026-11-23",
    body: [
      {
        type: "lead",
        text: "A virtual receptionist is a real person, working remotely — usually for a receptionist service — who answers your phone in your business's name. An AI receptionist is software that does the same job: answering instantly, around the clock, trained on your business. The two share a job title and almost nothing else. Here is how they actually differ — in hours, knowledge, consistency and cost — and where each one is the right call.",
      },
      { type: "h2", text: "What a virtual receptionist is" },
      {
        type: "p",
        text: "Virtual receptionist services employ trained people who work from remote desks or call centers and answer for many businesses. You forward your line; a person greets your caller, follows your script and instructions, takes messages, often books appointments, and can patch a caller through to you. Plans are usually sold as a monthly bundle of minutes or calls, with overage billed per minute — the same metered shape as a [traditional answering service](/articles/ai-receptionist-vs-answering-service), with more receptionist skill on top. Business hours are the standard coverage; evenings and round-the-clock coverage exist, at higher tiers. The person answering your 2 PM call is unlikely to be the person who answered yesterday's — the service is a pool, and quality rides on training and turnover you don't control.",
      },
      { type: "h2", text: "What an AI receptionist is" },
      {
        type: "p",
        text: "An AI receptionist answers on the first ring, at any hour, and is trained on your business itself — your website, services, prices and way of working — rather than on a script card. It answers questions, qualifies callers, books the appointment into your calendar during the call, and sends you a summary and the full transcript afterwards. It gives the same answers on every call, handles several callers at the same moment, and transfers anyone who needs a human straight to your phone. At AI Hidden Leads, the same AI also appears on your website as a [live video avatar](/articles/ai-receptionist-with-video-avatar), so visitors can talk to a face instead of hunting for a phone number.",
      },
      { type: "h2", text: "Side by side" },
      {
        type: "table",
        head: ["", "Virtual receptionist", "AI receptionist"],
        rows: [
          ["Who answers", "A real person, remote, shared across many businesses", "Software — at AI Hidden Leads, Aspen, by phone and on your website"],
          ["Speed to answer", "Quick when staffed; queues at peak times", "Instantly, on the first ring"],
          ["Hours", "Business hours standard; 24/7 at higher tiers", "24/7 included in the plan"],
          ["Knowledge of your business", "Your script, notes and FAQs", "Trained on your website, services and prices"],
          ["Consistency", "Varies by person and by day", "The same answers, every call"],
          ["Booking appointments", "Often yes, into a shared calendar", "Into your calendar, during the call"],
          ["Cost shape", "Monthly bundle of minutes or calls; overage per minute", "Flat monthly plan with minutes included"],
          ["Simultaneous calls", "Limited by staffing", "Several callers at once"],
          ["On your website", "At most, a staffed chat widget", "Voice, chat and an optional live video avatar"],
        ],
      },
      { type: "h2", text: "Where the human virtual receptionist is the right call" },
      {
        type: "list",
        items: [
          "Sensitive calls — distressed callers, delicate matters — where a person's judgment and empathy carry the conversation.",
          "Callers who strongly prefer a human and will disengage from anything else; some audiences simply do.",
          "Unusual, multi-party coordination where the 'receptionist' is really doing case management.",
          "Businesses whose calls are mostly exceptions rather than routine questions and bookings.",
        ],
      },
      {
        type: "p",
        text: "If that describes your call mix, hire the humans — a good virtual receptionist service is a real service, and pretending otherwise would be a poor way to sell you software.",
      },
      { type: "h2", text: "Where the AI wins" },
      {
        type: "list",
        items: [
          "The 2 AM call costs the same as the 2 PM call. Round-the-clock coverage is the plan, not a premium tier.",
          "Nobody reaches voicemail while a pool is busy. 85% of callers who hit voicemail never call back; the AI answers every call instantly, several at once.",
          "Its knowledge is your whole business, not a script card — your services, your prices, your service area, in its own words, and updated the moment you change them.",
          "The bill is predictable: one flat plan with minutes included, instead of a bundle that meters your busiest month hardest.",
          "It also works your website — voice, chat and video — where a phone-only service never meets the visitors who never dial.",
        ],
      },
      { type: "h2", text: "A naming trap worth knowing" },
      {
        type: "p",
        text: "The labels are blurring: some services sold as 'virtual receptionists' now quietly use AI for part of the work, and some 'AI receptionists' route hard calls to human backup. Neither is automatically bad — the hybrid is often the sensible design — but you are entitled to know who actually answers your phone. Ask directly, and judge the answer. At AI Hidden Leads the answer is simple: Aspen, our AI, answers — presented as an AI assistant, never disguised as a human employee — and transfers to you when a person is needed.",
      },
      {
        type: "p",
        text: "Comparing the employee option instead? [AI receptionist vs hiring a receptionist](/articles/ai-receptionist-vs-hiring-a-receptionist) does that math. Comparing AI providers against each other? The [buyer's checklist](/articles/best-ai-receptionist-for-small-business) lists the tests to run, and the [2026 price guide](/articles/ai-receptionist-cost) compares published plans. Or skip the reading: the [free live demo](/demo) puts Aspen on your own website in about 2 minutes.",
      },
    ],
    faq: [
      {
        q: "Is a virtual receptionist a real person?",
        a: "Yes. A virtual receptionist is a real person who works remotely — usually for a receptionist service — and answers your phone in your business's name, following your script. An AI receptionist is software doing the same job: at AI Hidden Leads, Aspen answers instantly, 24/7, trained on your website, services and prices, and books appointments into your calendar during the call.",
      },
      {
        q: "Which is cheaper, a virtual receptionist or an AI receptionist?",
        a: "AI plans are usually the flatter, cheaper shape: AI Hidden Leads Premium is $99/mo with 400 voice minutes included, and coverage is 24/7 at that price. Virtual receptionist services sell bundles of minutes or calls with per-minute overage, and round-the-clock human coverage sits at their higher tiers. At very low call volumes the shapes converge; the more calls and the more after-hours calls you get, the further the flat AI plan pulls ahead.",
      },
      {
        q: "Can a virtual receptionist book appointments like an AI can?",
        a: "Often, yes — many human virtual receptionist services book into a shared calendar. The differences are in the edges: the AI books against your real availability during the call itself, sends confirmations and reminders, and does it at any hour, while a human service's booking depends on the person on shift and the instructions they were given. Either way, ask any provider to demonstrate a real booking before you sign up.",
      },
      {
        q: "Will my callers prefer a human virtual receptionist?",
        a: "Some will, and for sensitive calls a human is genuinely better. But most callers judge the call by whether their problem got solved: answered instantly, question answered correctly, appointment booked. An AI that does those three things at 9 PM beats a warm human voice that takes a message for a callback tomorrow — and callers who do need a person can be transferred straight to you.",
      },
      {
        q: "How do I know if a 'virtual receptionist' service is actually AI?",
        a: "Ask who answers your phone, directly, and listen to the answer. The labels blur — some human services use AI for overflow, some AI services use human backup. It matters less than the terms: what is covered, at what hours, at what price, and what happens on a call the first line can't handle. Our own answer: Aspen, our AI assistant, answers — and she is never presented as a human.",
      },
    ],
  },
  {
    slug: "best-ai-receptionist-for-small-business",
    path: "/articles/best-ai-receptionist-for-small-business",
    headline: "Best AI Receptionist for Small Business: A Buyer's Checklist",
    seoTitle: "Best AI Receptionist for Small Business: A Buyer's Checklist | AI Hidden Leads",
    description:
      "There is no universal best AI receptionist — there is the one that passes your tests. The checklist: answer speed, business knowledge, booking, transfers, video presence and pricing traps, with published prices compared.",
    excerpt:
      "Skip the rankings list. The best AI receptionist is the one that passes your tests: a 9 PM call, your own prices, a real booking, a clean transfer. Here's the checklist, and the published prices.",
    targetKeyword: "best ai receptionist for small business",
    datePublished: "2026-11-23",
    dateModified: "2026-11-23",
    body: [
      {
        type: "lead",
        text: "There is no universal 'best' AI receptionist — there is the one that passes your tests, on your calls, at your call volume. So instead of a ranking, here is the checklist small-business owners should run on any provider, us included: answer speed, real business knowledge, booking, transfers, website presence, and the pricing traps that only show up on the second invoice. Published prices from the main providers are compared along the way.",
      },
      { type: "h2", text: "The checklist: eight tests before you pay anyone" },
      {
        type: "list",
        items: [
          "Call it at the worst hour. Ring the provider's demo line at 9 PM on a Sunday. If it doesn't answer instantly then, it won't answer your customers then either — and after-hours is half the point.",
          "Ask it your own prices. A receptionist trained on your business answers from your services and price list. One that gives generic answers, or invents a number it shouldn't have, will do the same to your callers.",
          "Make it book. Have it schedule a real appointment against real availability, then check that the booking, the confirmation and the reminder actually exist.",
          "Make it hand off. Ask for a human mid-call. A good system transfers you cleanly, with a summary — it doesn't trap the caller in the bot to protect its statistics.",
          "Ask it something it shouldn't know. The honest answer is 'I don't know — let me take your number and have them call you.' A system that improvises facts about your business is a liability, not a feature.",
          "Check the website half. Does the same AI greet your website visitors by voice and chat — or is it phone-only while your site sits silent? Can visitors see it? A [live video avatar](/articles/ai-receptionist-with-video-avatar) changes how many visitors start a conversation at all.",
          "Read the pricing like a contract. Per-minute or per-customer? What is the overage rate? Which features are gated to higher tiers — booking and live transfers are the classic ones? Is there a setup fee, and is it waived?",
          "Run it on your own website before paying. A demo on the provider's polished sample site proves little. The honest test is your pages, your services, your prices.",
        ],
      },
      { type: "h2", text: "The shortlist, with published prices" },
      {
        type: "p",
        text: "The main small-business providers, at their published prices (checked November 2026 — confirm on each provider's site before buying):",
      },
      {
        type: "table",
        head: ["Provider", "Entry price", "What's included", "Pricing shape"],
        rows: [
          ["Rosie", "$49/mo", "250 minutes", "Per minute. Booking and live transfers start at the $149/mo tier (1,000 minutes)"],
          ["Goodcall", "$79/mo", "100 unique customers", "Per customer, not per minute — suits short calls"],
          ["Frontdesk", "$99/mo", "200 voice minutes", "Per minute; overage at $0.25/min"],
          ["AI Hidden Leads", "$99/mo", "400 voice minutes, website chat, up to 50 B2B prospects/mo", "Flat plan with minutes included; optional live video avatar add-on"],
        ],
      },
      {
        type: "p",
        text: "On raw per-minute math, Rosie's higher tiers run lower than ours — our [price guide](/articles/ai-receptionist-cost) shows the arithmetic and says so plainly. What differs is the bundle and the shape: whether the entry price already includes booking, whether the same system covers your website by voice and chat, whether a video avatar exists at all, and whether prospect generation is part of the plan. 'Best' depends on which of those your business actually uses.",
      },
      { type: "h2", text: "How to run the whole test in one afternoon" },
      {
        type: "list",
        items: [
          "Pick your real call volume first — calls per week, average length, how many arrive after hours. Every pricing shape looks good at the wrong volume.",
          "Shortlist two or three providers whose shape fits that volume, and run the eight tests on each. The after-hours call and the booking test eliminate most contenders.",
          "Do the per-minute math on the plan you would actually land on — including the tier where booking and transfers switch on — not the headline entry price.",
          "End with the demo on your own website. If a provider won't put its AI on your pages before you pay, that is information too.",
        ],
      },
      { type: "h2", text: "Where we honestly fit" },
      {
        type: "p",
        text: "AI Hidden Leads Premium is $99/mo with 400 voice minutes included — booking and live transfers included, not gated to a higher tier — plus website voice and chat, and up to 50 B2B prospects a month (no specific count is guaranteed). The live video avatar is an optional add-on at $79/mo whose first month is free, and the standard setup fee is waived this month. If your calls are few and simple, a cheaper entry plan elsewhere may honestly serve you better; if your calls need human judgment, a [virtual receptionist](/articles/ai-receptionist-vs-virtual-receptionist) or a [hire](/articles/ai-receptionist-vs-hiring-a-receptionist) is the right tool and no AI belongs on your phone. Where we are built to win is the bundle: phone and website, voice and video, answered instantly at any hour — tested, we hope, with the checklist above.",
      },
      {
        type: "p",
        text: "Start with test eight: the [free live demo](/demo) puts Aspen on your own website — your pages, your services — in about 2 minutes, nothing installed. Then run the other seven tests on her, and on anyone else you're considering, and buy whoever passes. New to the category itself? The [comparison with a traditional answering service](/articles/ai-receptionist-vs-answering-service) explains what an AI receptionist replaces — and what it doesn't.",
      },
    ],
    faq: [
      {
        q: "What is the best AI receptionist for a small business?",
        a: "The one that passes your tests: it answers instantly at any hour, answers questions from your own business's knowledge, books real appointments into your calendar, transfers cleanly to a human, and prices honestly at your call volume. Providers differ mostly in pricing shape and bundle — per-minute vs per-customer, whether booking is gated to a higher tier, and whether the same AI covers your website. AI Hidden Leads Premium is $99/mo with 400 voice minutes, booking and transfers included, and website voice and chat in the same plan.",
      },
      {
        q: "How much should a small business pay for an AI receptionist?",
        a: "Published small-business plans run $49–$299/mo. What matters is the plan you'd actually land on: minutes included, the overage rate, and whether booking and transfers are included at that tier or gated higher. Do the per-minute math at your real call volume — a $49 plan that meters your busiest month can cost more than a $99 flat plan with 400 minutes included.",
      },
      {
        q: "What should I test first when comparing AI receptionists?",
        a: "The after-hours call and the booking test. Call the demo line at 9 PM on a Sunday and see if it answers instantly — 85% of callers who hit voicemail never call back, so the after-hours answer is the product. Then make it book a real appointment and verify the booking, confirmation and reminder exist. Most contenders fail one of those two.",
      },
      {
        q: "Do I need a video avatar, or is voice enough?",
        a: "Voice covers your phone completely. The avatar is for your website: a live, lip-synced face visitors can talk to instead of a silent page and a form. At AI Hidden Leads it is an optional add-on at $79/mo whose first month is free, on any plan — so you can measure whether the face earns its keep on your site and keep it only if it does.",
      },
      {
        q: "Can I try an AI receptionist on my own website before paying?",
        a: "With us, yes — that is the free live demo: Aspen builds a simulation on a preview of your actual website in about 2 minutes, nothing installed, nothing on your site changed. Judge her on your own pages and prices, then run the same tests on any other provider you're considering. A provider that won't demo on your site is asking you to buy on faith.",
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
