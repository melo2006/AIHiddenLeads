// Problem-first detail content for each homepage service; status is shown honestly on cards and pages.
export type ServiceDetail = {
  id: string;
  name: string;
  status: "available" | "preorder";
  problem: string;
  today: string;
  solution: string;
  details: string[];
};

export const SERVICE_DETAILS: ServiceDetail[] = [
  {
    id: "voice", name: "AI Phone Receptionist — No Website Needed", status: "available",
    problem: "85% of callers who hit voicemail don't call back — most move on to the next name on the list.",
    today: "Most small and mid-sized teams can't pick up every call while they're serving customers — and after hours, nobody picks up at all.",
    solution: "Aspen answers every call 24/7, books the appointment and takes the message properly — even if you have no website at all.",
    details: [
      "Phone forwarding: keep your existing number and forward it after hours, during busy times or all day — no porting.",
      "Review business hours, service area, approved prices and emergency escalation rules before answering real callers. No invented quotes or arrival times.",
      "Warm transfer to a manager on Professional and Platinum, plus a private AI summary of each conversation.",
      "Phone minutes are billed separately at the published per-minute rate.",
    ],
  },
  {
    id: "video", name: "Live Video Receptionist on Your Website", status: "available",
    problem: "Visitors land on your site, find no one to talk to, and leave without a trace.",
    today: "Most website visitors never call or fill in a form — if nobody greets them in the first seconds, they're gone.",
    solution: "Aspen greets them face-to-face in live video — answers questions, qualifies them and captures their details while they're still interested. Try her free on your own website and watch it come alive.",
    details: [
      "Live, lip-synced video with a real face and a natural voice: visitors talk to Aspen in two-way voice or chat — not a chat box.",
      "She answers from your site's readable public pages; production knowledge can include reviewed FAQs, vendor information and manuals. Your original website stays unchanged.",
      "She collects the reason for the inquiry and appointment requests, and captures the visitor's details for follow-up.",
      "Prefer your own face? You can create your own streaming avatar spokesperson instead of using Aspen.",
    ],
  },
  {
    id: "leads", name: "Fresh B2B Prospects, Delivered Weekly", status: "available",
    problem: "Referrals dry up, and you have no pipeline of your own.",
    today: "Bought lists are often outdated and generic, and your team wastes hours chasing the wrong contacts.",
    solution: "We research and deliver up to 50 fresh B2B prospects a month, matched to the customers you actually want — ready for outreach, week after week.",
    details: ["Up to 50 prospects a month included on Premium — no specific count is guaranteed.", "Follow up yourself, or add approved outreach and reactivation of your existing customer list.", "Every outbound message includes opt-out instructions."],
  },
  {
    id: "b2c", name: "Consumer leads: ads & inquiry follow-up", status: "preorder",
    problem: "Your customers are homeowners or consumers, not businesses?",
    today: "Ad clicks and form fills often go cold because nobody replies fast enough.",
    solution: "We help you plan ads and landing pages, and Aspen answers the inquiries those ads bring in, from your website and phone.",
    details: ["We don't buy or scrape private consumer contact lists.", "You pay the ad platform directly; we help with creative and follow-up.", "Results depend on your budget, offer and market. Nothing is guaranteed."],
  },
  {
    id: "search", name: "Google Maps & AI Search Visibility", status: "available",
    problem: "Customers now ask Google Maps — and ChatGPT, Gemini and Claude — who to call. If you're not in the answer, you don't exist.",
    today: "Your ranking changes from one neighborhood to the next, and most owners only ever check from their own office.",
    solution: "We optimize your presence so those tools find you, rank you and recommend you by name.",
    details: ["A 25-point map grid shows where you're visible, with priority fixes for your profile and website.", "Free sample audit in the demo.", "Monthly Maps and AI Search packages, or both together as a bundle.", "No ranking guarantees."],
  },
  {
    id: "reputation", name: "Reviews & Reputation Management", status: "preorder",
    problem: "Your happy customers stay silent while one unhappy voice defines you online — and your search ranking suffers for it.",
    today: "Review requests go out inconsistently, and replies to customers get delayed.",
    solution: "We systematically gather fresh reviews, respond to every one, and turn your reputation into the reason strangers choose you.",
    details: ["No incentives or review gating.", "AI-assisted response drafts save writing time; your team approves anything sensitive before it's posted.", "Scope is agreed during setup."],
  },
  {
    id: "social", name: "Social Media, Handled", status: "preorder",
    problem: "You know you should post, but creating content and replying to comments is a second job you don't have time for.",
    today: "Social accounts go quiet for weeks while the business stays busy.",
    solution: "We create and publish your content — posts, slides and videos — and automate replies, so your business looks active and responsive every day.",
    details: ["We plan posts, ad creative and AI video concepts for your business, and nothing goes out without your approval.", "Daily or weekly schedule agreed once your accounts are connected.", "Platinum plan or quoted scope."],
  },
  {
    id: "website", name: "Website Revamp or a Brand-New Site", status: "preorder",
    problem: "An outdated, slow site quietly kills the trust every other service works to build.",
    today: "Visitors judge your business in seconds — a dated site sends them to a competitor before Aspen ever gets to say hello.",
    solution: "We rebuild it — modern, fast, and wired from day one for your video receptionist, your reviews and your lead capture.",
    details: ["A modern, fast site designed to turn visitors into calls, chats and quote requests.", "Already have a site you like? Keep it — every other service here works on the site you have.", "Scope and price are quoted after a quick review of your current site."],
  },
];

export const findServiceDetail = (id?: string) => SERVICE_DETAILS.find((s) => s.id === id);
