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
  /**
   * Optional slogan line for the hero badge pill; when present it
   * replaces builtFor in the pill (builtFor stays the short label).
   */
  badgeLine?: string;
  /**
   * Optional hero slideshow — a full-bleed photo band at the top of
   * the hero. Each slide pairs a panoramic photo with the slogan
   * overlaid on it; photo + slogan crossfade together. `key` selects
   * the image in the template's slide map, so a vertical only ever
   * shows its own photos; omit the field and no band renders (and the
   * badge pill shows instead). `focusClass` carries the Tailwind
   * object-position classes that keep each photo's subject in frame
   * under the portrait-mobile and landscape-desktop crops.
   */
  heroSlides?: {
    key: string;
    alt: string;
    caption: string;
    slogan: string;
    focusClass: string;
  }[];
  /** Attribution line for heroSlides (source + licence), tiny print. */
  heroSlidesCredit?: string;
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
  /** Verified evidence figures — only the owner-supplied verified set.
   *  `value`/`label` are the canonical figure + wording (evidence
   *  section, sources). Optional barValue/barLabel override ONLY how
   *  the entry renders in the big hero stat bar. */
  stats: {
    value: string;
    label: string;
    source: string;
    barValue?: string;
    barLabel?: string;
  }[];
  /** "Sound familiar?" buyer scenario (generalized, no names). */
  scenario: string;
  /** One-line follow-up rendered under the scenario card. */
  scenarioPunchline: string;
  /**
   * The full AiHiddenLeads services list (same names as the homepage
   * hero list), rendered as a balanced checklist when present.
   */
  services?: string[];
  /**
   * "Areas we serve" strip — a visible locality list grouped by
   * county, rendered near the bottom of the page when present.
   * Honest, visible copy only: the real service area in real text —
   * no hidden text, no zip-code lists.
   */
  serviceAreas?: {
    heading: string;
    framing: string;
    /** Small label above the county groups — the home base, framed
     *  as local proof, never as the limit of service. */
    homeTurfLabel: string;
    counties: { county: string; cities: string[] }[];
  };
  /**
   * One-click example demos for the hero form — real agents' public
   * websites, grouped by area. Picking one launches the live demo on
   * that site immediately (no typing) under a generic visitor name.
   * Only verticals that carry this field render the dropdown.
   */
  demoExamples?: {
    /** Label/intro line rendered above the select. */
    intro: string;
    /** Disabled placeholder option. */
    placeholder: string;
    /** Generic visitor name a sample session is authorized with. */
    visitorName: string;
    groups: {
      area: string;
      options: { agent: string; city: string; url: string; slug: string }[];
    }[];
  };
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
  badgeLine:
    "Buyers and sellers won't wait · The first agent to answer wins the client · Aspen answers in seconds, 24/7",
  heroSlides: [
    {
      key: "sold",
      alt: "A real estate agent handing the keys to a smiling couple in front of their new Florida home, a red SOLD sign in the front yard",
      caption: "The closing moment",
      slogan: "The first agent to answer wins the client.",
      focusClass: "object-[42%_30%] sm:object-[45%_32%]",
    },
    {
      key: "condo",
      alt: "A realtor holding up the keys with two happy condo buyers in front of a modern condo tower",
      caption: "Condo buyers, answered",
      slogan: "Buyers and sellers won't wait.",
      focusClass: "object-[50%_35%]",
    },
    {
      key: "keys",
      alt: "A real estate agent shaking hands with a couple holding their new keys at the front door of their townhouse",
      caption: "At the front door",
      slogan: "Never miss a showing, a closing, or a call.",
      focusClass: "object-[50%_30%]",
    },
    {
      key: "house",
      alt: "A real estate agent handing the keys to a couple in the driveway of their new home, a SOLD sign with the agent's photo and a QR code in the front yard",
      caption: "The SOLD sign goes up",
      slogan: "Your next closing starts with one answered call.",
      focusClass: "object-[40%_35%] sm:object-[42%_35%]",
    },
    {
      key: "couple",
      alt: "An older couple receiving the keys to their brick townhouse from their realtor",
      caption: "Every generation of buyer",
      slogan: "Every buyer. Every seller. Answered.",
      focusClass: "object-[35%_30%] sm:object-[38%_32%]",
    },
    {
      key: "aerial",
      alt: "Aerial view of Fort Lauderdale — the Intracoastal Waterway, the Las Olas finger canals, the 17th Street Causeway, and the beachfront condo strip",
      caption: "Fort Lauderdale from above",
      slogan: "Aspen answers in seconds, 24/7.",
      focusClass: "object-[50%_45%]",
    },
    {
      key: "beach",
      alt: "Fort Lauderdale Beach — white sand and turquoise ocean along the beachfront condo and hotel strip, including the curved W Fort Lauderdale towers",
      caption: "Fort Lauderdale Beach",
      slogan: "Voicemail? Your buyer just called the next agent on the list.",
      focusClass: "object-[50%_55%]",
    },
    {
      key: "dallas",
      alt: "Downtown Dallas skyline panorama — glass towers over Klyde Warren Park and the Arts District",
      caption: "Downtown Dallas",
      slogan: "Serving realtors nationwide — coast to coast.",
      focusClass: "object-[50%_40%]",
    },
  ],
  heroSlidesCredit:
    "Real photographs via Wikimedia Commons: Fort Lauderdale aerial by Yanjipy, CC BY-SA 4.0 · Downtown Dallas skyline by Gattacal, CC BY-SA 4.0. All other hero imagery created for or provided to AiHiddenLeads.",
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
      body: "Website and portal inquiries arrive nights and weekends, when buyers and sellers are actually looking. Left waiting for hours, that inquiry goes cold — or gets answered first by another agent at another brokerage.",
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
      // Ron (2026-11-11): "917 min" is too number-heavy as the big stat —
      // the bar leads with the human version; the exact figure stays in
      // the subline and in the evidence/sources section.
      barValue: "15+ hours",
      barLabel: "Average agent response time to a new inquiry (917 minutes)",
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
      // Ron (2026-11-11): bare "21x" is not self-explanatory up front —
      // the bar carries "more likely" in the big line, so big line +
      // subline read as one sentence with no duplication.
      barValue: "21x more likely",
      barLabel:
        "To qualify a lead when you respond in 5 minutes instead of 30 minutes",
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
  scenarioPunchline:
    "That is what your buyers do, too. Answer now — or lose them to the next brokerage.",
  services: [
    "Live Video Receptionist on Your Website",
    "AI Phone Receptionist — No Website Needed",
    "Fresh B2B Prospects, Delivered Weekly",
    "Google Maps & AI Search Visibility",
    "Reviews & Reputation Management",
    "Social Media, Handled",
    "Comments & Reviews, Answered",
    "Website Revamp or a Brand-New Site",
  ],
  demoExamples: {
    intro:
      "No typing needed — pick an example realtor website and watch the demo run on it live:",
    placeholder: "Pick an example realtor website…",
    visitorName: "John Doe",
    groups: [
      {
        area: "Broward County, FL",
        options: [
          {
            agent: "Aurelia Perez",
            city: "Fort Lauderdale",
            url: "https://www.aureliaperez.com/",
            slug: "aurelia-perez",
          },
          {
            agent: "Ann Chamberlain",
            city: "Fort Lauderdale",
            url: "https://www.annchamberlain.com/",
            slug: "ann-chamberlain",
          },
        ],
      },
      {
        area: "Miami-Dade County, FL",
        options: [
          {
            agent: "Ashley Cusack",
            city: "Coral Gables",
            url: "https://ashleycusack.com/",
            slug: "ashley-cusack",
          },
          {
            agent: "Mauricio J. Barba",
            city: "Coral Gables",
            url: "https://miamisignaturehomes.com/",
            slug: "mauricio-barba",
          },
          {
            agent: "Michael Martinez",
            city: "Coral Gables",
            url: "https://michaelmartinezrealtor.com/",
            slug: "michael-martinez",
          },
        ],
      },
      {
        area: "Palm Beach County, FL",
        options: [
          {
            agent: "Alexa Scalone",
            city: "Delray Beach",
            url: "https://alexascalone.com/",
            slug: "alexa-scalone",
          },
          {
            agent: "Jean-Luc Andriot",
            city: "Boca Raton",
            url: "https://jeanlucandriot.com/",
            slug: "jean-luc-andriot",
          },
          {
            agent: "Paul Saperstein",
            city: "Delray Beach",
            url: "https://paulsapersteinhomes.com/",
            slug: "paul-saperstein",
          },
        ],
      },
      {
        area: "Dallas, TX",
        options: [
          {
            agent: "Baldemar De Leon",
            city: "Dallas",
            url: "https://www.baldemardeleon.com/",
            slug: "baldemar-deleon",
          },
          {
            agent: "Logan Walter",
            city: "Dallas",
            url: "https://loganwalter.com/",
            slug: "logan-walter",
          },
        ],
      },
      {
        area: "Los Angeles, CA",
        options: [
          {
            agent: "Ray Miramontes",
            city: "Long Beach",
            url: "https://mira-realestate.com/",
            slug: "ray-miramontes",
          },
        ],
      },
      {
        area: "San Francisco, CA",
        options: [
          {
            agent: "Danielle Lazier",
            city: "San Francisco",
            url: "https://daniellelazier.com/",
            slug: "danielle-lazier",
          },
        ],
      },
      {
        area: "New York, NY",
        options: [
          {
            agent: "Richard Steinberg Team",
            city: "New York",
            url: "https://www.therichardsteinbergteam.com/",
            slug: "richard-steinberg",
          },
        ],
      },
      {
        area: "Salt Lake City, UT",
        options: [
          {
            agent: "Gian Sexsmith",
            city: "Salt Lake City",
            url: "https://sexsmithrealty.com/",
            slug: "gian-sexsmith",
          },
        ],
      },
    ],
  },
  serviceAreas: {
    heading: "Serving realtors nationwide",
    framing:
      "Aspen answers wherever your buyers and sellers call from. Our home base is South Florida — our agents' markets are everywhere. Coast to coast: if the phone rings, she picks up.",
    homeTurfLabel: "Home turf — South Florida",
    counties: [
      {
        county: "Broward County",
        cities: [
          "Fort Lauderdale",
          "Pompano Beach",
          "Coral Springs",
          "Plantation",
          "Weston",
          "Davie",
          "Hollywood",
          "Deerfield Beach",
          "Lauderdale-by-the-Sea",
        ],
      },
      {
        county: "Miami-Dade County",
        cities: [
          "Miami",
          "Coral Gables",
          "Aventura",
          "Miami Beach",
          "Doral",
          "Hialeah",
          "Homestead",
        ],
      },
      {
        county: "Palm Beach County",
        cities: [
          "Boca Raton",
          "Delray Beach",
          "West Palm Beach",
          "Boynton Beach",
          "Jupiter",
          "Palm Beach Gardens",
        ],
      },
    ],
  },
  moneyMath: {
    lines: [
      "Average total commission in 2025: about 5.44%. One agent's side, at about 2.5%, is about $10,000 on a $400,000 home — and about $25,000 on a $1,000,000 home or condo.",
      "Miss just 1 closing a month at the $400,000 level and that is about $120,000 a year walking to the next agent — or straight to the brokerage down the street.",
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
      q: "How much does an AI receptionist for real estate agents cost?",
      a: "Premium is $99/mo with 400 minutes included. The live video avatar — Aspen with a real, lip-synced video face on your website — is an optional add-on at $79/mo, and its first month is free. You choose it or skip it; the $99 plan works on its own.",
    },
    {
      q: "Can I see it on my own website first?",
      a: "Yes — that's the free demo. Enter your website and see your website come alive with Aspen on it, in about 2 minutes. No signup, no card.",
    },
    {
      q: "What happens when I'm at a showing?",
      a: "Your phone rings first — 2–3 rings, a setting you choose. If you don't pick up, Aspen answers in your name, qualifies the caller, and books the showing or consultation on your calendar. If the lead is hot, she warm-transfers them straight back to you with a short summary first — and after every call you get the summary and the transcript.",
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
    {
      q: "Do I get recordings?",
      a: "Not yet — recordings are not part of the service today. What you do get, in your dashboard after every call, is the lead's name and contact details, the AI summary, and the full transcript of the conversation, plus the appointment that was booked.",
    },
    {
      q: "Can it book showings and consultations?",
      a: "Yes. Aspen books showings, buyer consultations, and seller valuation appointments as 30-minute bookings, against your real availability once your calendar is connected in setup. Each booking sends a confirmation with a calendar invite, and reminders go out before the appointment.",
    },
  ],
};

export const AGENT_VERTICALS: AgentVertical[] = [REALTOR_VERTICAL];

export const findAgentVertical = (slug?: string | null) =>
  AGENT_VERTICALS.find((v) => v.slug === slug) ?? null;
