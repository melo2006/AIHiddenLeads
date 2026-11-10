/**
 * Agent vertical landing pages — shared-template data.
 *
 * One template (AgentLandingTemplate) renders every vertical; only this
 * data swaps (~20%): headline naming the job, the vertical's 3 pains, a
 * sample Aspen call from their world, their later add-on menu, and their
 * FAQ. Realtors ship first; mortgage and insurance clone by adding an
 * entry here — no new page code.
 *
 * Copy rules (owner-approved 2026-11-11): honest copy only — "built for
 * realtors" yes, "we only serve realtors" never. Entry price is $99,
 * never presented as a combined price with the $79 avatar add-on. No
 * fabricated testimonials.
 */

export interface AgentVertical {
  slug: string;
  route: string;
  /** Short job label used in the hero badge, e.g. "Built for realtors". */
  builtFor: string;
  headline: string;
  sub: string;
  pains: { title: string; body: string }[];
  sampleCall: {
    buyerTitle: string;
    buyerSteps: string[];
    sellerTitle: string;
    sellerBody: string;
  };
  /** "You stay in control" flow — the agent's own phone rings first. */
  controlSteps: { title: string; body: string }[];
  /** What the agent sees in their dashboard for every lead. */
  dashboardPoints: string[];
  /** Verified evidence figures — only the owner-supplied verified set. */
  stats: { value: string; label: string; source: string }[];
  /** "Sound familiar?" buyer scenario (generalized, no names). */
  scenario: string;
  /** Worked money-math example — labelled an example, not a promise. */
  moneyMath: { lines: string[]; punchline: string; source: string };
  /** Calendar section: bookings on the agent's own connected calendar. */
  calendar: { points: string[]; example: string; framing: string };
  /** Sold LATER as add-ons — listed on the page as later options only. */
  laterAddOns: { title: string; body: string }[];
  faq: { q: string; a: string }[];
}

export const REALTOR_VERTICAL: AgentVertical = {
  slug: "realtors",
  route: "/agents/realtors",
  builtFor: "Built for realtors",
  headline:
    "Realtors: Never Miss a Buyer or Seller Call Again — Even at a Showing",
  sub: "Aspen answers calls and website visitors 24/7, books the appointment, sends the summary.",
  pains: [
    {
      title: "You're at a showing — and the ready buyer hangs up",
      body: "You're at a showing, a closing, or driving between them when a ready buyer calls. It goes to voicemail, and most callers don't leave a message or call back — they move on to the next agent on the list.",
    },
    {
      title: "Inquiries arrive at night — and wait hours",
      body: "Website and portal inquiries arrive nights and weekends, when buyers and sellers are actually looking. Left waiting for hours, that inquiry goes cold — or gets answered first by another agent.",
    },
    {
      title: "You pay for ads — then answer every call yourself",
      body: "You're paying for ads and portals to make the phone ring, but you're still your own answering service. Every call you can't pick up is ad spend that never had a chance to turn into a showing.",
    },
  ],
  sampleCall: {
    buyerTitle: "A buyer calls about a listing",
    buyerSteps: [
      "Greets the caller in your name — Aspen answers as your receptionist, not a generic call center.",
      "Answers basic listing questions — price, beds, baths, and the details you give her.",
      "Checks pre-approval and timeline, so you know how ready this buyer is before you call back.",
      "Offers 2–3 spaced showing or consultation times — all she asks for is 15–20 minutes, held as a 30-minute block on your calendar.",
      "Captures name, phone, and email, and asks permission to text the confirmation.",
      "Sends you the summary instantly — who called, what they want, and when they're booked.",
    ],
    sellerTitle: "A seller calls instead?",
    sellerBody:
      "Same coverage, different booking: Aspen books a valuation consultation — a time for you to walk through what their home could sell for — captures the same contact details, asks permission to text the confirmation, and sends you the summary instantly.",
  },
  controlSteps: [
    {
      title: "Your phone rings first",
      body: "Your own phone rings first — 2–3 rings, a setting you choose. No new phone and no new number needed; you keep using the phone and number you already have.",
    },
    {
      title: "No answer? Aspen picks up",
      body: "If you don't pick up — you're at a showing, a closing, or driving — Aspen answers in your name instead of sending the caller to voicemail.",
    },
    {
      title: "A hot lead comes straight back to you",
      body: "Aspen qualifies the caller — buyer or seller, pre-approval, timeline. If it's a hot, qualified lead, she warm-transfers them straight back to your phone, and you hear a short AI summary of the conversation first, so you pick up already knowing who it is and what they want.",
    },
    {
      title: "Not hot, or after hours? She books it",
      body: "If it's not hot, or it's after hours, she books the appointment and captures everything — no lead left sitting in voicemail.",
    },
  ],
  dashboardPoints: [
    "Name and contact details for every lead",
    "Where they came from — call or website",
    "What they wanted",
    "The AI summary and transcript of the conversation",
    "The appointment booked for you",
  ],
  stats: [
    {
      value: "917 min",
      label:
        "Average agent response time to a new inquiry — over 15 hours",
      source: "WAV Group Agent Responsiveness Study, via Inman",
    },
    {
      value: "48%",
      label: "Of buyer inquiries never get a response at all",
      source: "WAV Group",
    },
    {
      value: "78%",
      label: "Of buyers work with the first agent who responds",
      source: "NAR 2025",
    },
    {
      value: "21x",
      label:
        "More likely to qualify a lead when you respond in 5 minutes instead of 30 minutes",
      source: "MIT / InsideSales Lead Response Management Study",
    },
    {
      value: "33%",
      label:
        "Only 1 in 3 callers to a real estate office actually got to speak with an agent",
      source:
        "Pied Piper Lead Handling Effectiveness Study 2026 — 2,198 inquiries",
    },
    {
      value: "73%",
      label: "Of phone inquiries got no follow-up within 24 hours",
      source: "Pied Piper Lead Handling Effectiveness Study 2026",
    },
    {
      value: "85%",
      label: "Of callers who don't reach a live person never call back",
      source: "",
    },
  ],
  scenario:
    "You drive past a home and call the number on the sign. No answer. You don't leave a voicemail — you call the next agent. When the first agent calls back 2 days later, you've already forgotten which house it was.",
  moneyMath: {
    lines: [
      "Average total commission in 2025: about 5.44%. One agent's side, at about 2.5%, is about $10,000 on a $400,000 home — and about $25,000 on a $1,000,000 home or condo.",
      "Miss just 1 closing a month at the $400,000 level and that is about $120,000 a year walking to the next agent.",
    ],
    punchline: "Aspen is $99/mo.",
    source: "Commission example: Redfin / Clever data, 2025",
  },
  calendar: {
    points: [
      "Bookings land directly on your calendar — showings, buyer consultations, and seller valuation appointments, booked against your real availability once your calendar is connected in setup.",
      "Every booking sends a confirmation with a calendar invite, then reminders — an email 24 hours before and a text 1 hour before, where text consent was given.",
      "No-shows get a follow-up, so a missed appointment becomes a rebooking conversation instead of a dead end.",
    ],
    example:
      "A caller rings back: “My Thursday 2 pm showing needs to move to Friday morning.” Aspen finds the booking, checks your calendar, and moves it on that one call — new confirmation sent. Cancels and rebooks work the same way. No phone tag.",
    framing:
      "Aspen does not replace you. She facilitates — she answers, qualifies, books, and reminds, so you never miss the call. You do the relationship, the negotiation, and the closing.",
  },
  laterAddOns: [
    {
      title: "Dead-database revival",
      body: "A campaign that re-contacts the past leads and old contacts already sitting in your database.",
    },
    {
      title: "Review generation",
      body: "Help asking happy clients for Google reviews, so the next buyer or seller finds proof first.",
    },
    {
      title: "Open-house follow-up",
      body: "Follow-up for open-house visitors after the event, while the showing is still fresh.",
    },
    {
      title: "Social content",
      body: "Content created and published for your channels, with inquiries answered for you.",
    },
  ],
  faq: [
    {
      q: "Do you only serve realtors?",
      a: "No. AiHiddenLeads serves small and midsize businesses of many kinds. This page is built for realtors — the examples, the sample call, and the add-ons speak your language — on the same Premium plan every customer gets.",
    },
    {
      q: "What does Aspen actually do on a call?",
      a: "She answers in your name, answers basic listing questions from the details you give her, checks pre-approval and timeline, offers spaced showing or consultation times, captures name, phone, and email, asks permission to text a confirmation, and sends you the summary instantly. For a seller, she books a valuation consultation instead.",
    },
    {
      q: "What does it cost?",
      a: "Premium is $99/mo with 400 minutes included. The live video avatar — Aspen with a real, lip-synced video face on your website — is an optional add-on at $79/mo. You choose it or skip it; the $99 plan works on its own.",
    },
    {
      q: "Can I see it on my own website first?",
      a: "Yes — that's the free demo. Enter your website and see your website come alive with Aspen on it, in about 2 minutes. No signup, no card.",
    },
    {
      q: "What happens when I'm with a client?",
      a: "Nothing changes for you. Aspen keeps answering calls and website visitors, books the appointment, and sends you the summary — you read it when you're free, with the appointment already on your calendar.",
    },
    {
      q: "Do I need a new phone number?",
      a: "No. You keep using your current phone and your current number. Your phone rings first, and Aspen only picks up when you don't.",
    },
    {
      q: "What if I want to answer first myself?",
      a: "That's exactly how it works. Your own phone rings first — 2–3 rings, a setting you choose. If you pick up, it's your call as always. If you don't, Aspen answers in your name.",
    },
    {
      q: "What happens when a lead is hot?",
      a: "Aspen qualifies the caller first — buyer or seller, pre-approval, timeline. If it's a hot, qualified lead, she warm-transfers them straight back to your phone, and you hear a short AI summary first, so you pick up already knowing who it is and what they want. If it's not hot, or it's after hours, she books the appointment instead.",
    },
    {
      q: "Can I see what Aspen said to a caller?",
      a: "Yes. In your dashboard you see every lead that came through — their name and contact details, where they came from (call or website), what they wanted, the AI summary and transcript of the conversation, and the appointment booked.",
    },
  ],
};

export const AGENT_VERTICALS: AgentVertical[] = [REALTOR_VERTICAL];

export const findAgentVertical = (slug?: string | null) =>
  AGENT_VERTICALS.find((v) => v.slug === slug) ?? null;
