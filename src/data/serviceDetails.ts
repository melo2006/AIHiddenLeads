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
    id: "voice", name: "AI receptionist: voice & website chat", status: "available",
    problem: "Calls going to voicemail? Website visitors leaving with unanswered questions?",
    today: "Most small and mid-sized teams can't pick up every call or reply to every website question while they're serving customers.",
    solution: "Your AI receptionist, with whatever name you choose, answers visitors in natural two-way voice or chat, with optional live video. It collects the reason for the inquiry and appointment requests.",
    details: [
      "Works from your reviewed website pages, FAQs, manuals and documents.",
      "Phone forwarding: keep your existing number and forward it after hours, during busy times or all day.",
      "Warm transfer to a manager on Professional and Platinum, plus a private AI summary of each conversation.",
      "Phone minutes are billed separately at the published per-minute rate.",
    ],
  },
  {
    id: "leads", name: "Fresh B2B prospects", status: "available",
    problem: "Running out of new businesses to sell to?",
    today: "Bought lists are often outdated and generic, and your team wastes hours chasing the wrong contacts.",
    solution: "We find businesses that match your industry and region and deliver them in weekly batches, with the contact details we were able to find.",
    details: ["50 prospects a month included on Premium.", "Follow up yourself, or add approved outreach and reactivation of your existing customer list.", "Every outbound message includes opt-out instructions."],
  },
  {
    id: "b2c", name: "Consumer leads: ads & inquiry follow-up", status: "preorder",
    problem: "Your customers are homeowners or consumers, not businesses?",
    today: "Ad clicks and form fills often go cold because nobody replies fast enough.",
    solution: "We help you plan ads and landing pages, and your AI receptionist answers the inquiries those ads bring in, from your website and phone.",
    details: ["We don't buy or scrape private consumer contact lists.", "You pay the ad platform directly; we help with creative and follow-up.", "Results depend on your budget, offer and market. Nothing is guaranteed."],
  },
  {
    id: "search", name: "Google Maps & AI search", status: "available",
    problem: "Do nearby customers actually find you on Google Maps?",
    today: "Your ranking changes from one neighborhood to the next, and most owners only ever check from their own office.",
    solution: "A 25-point map grid shows where you're visible, with priority fixes for your profile and website.",
    details: ["Free sample audit in the demo.", "Monthly Maps and AI Search packages, or both together as a bundle.", "No ranking guarantees."],
  },
  {
    id: "reputation", name: "Reviews & reputation", status: "preorder",
    problem: "Do happy customers ever leave you a review?",
    today: "Review requests go out inconsistently, and replies to customers get delayed.",
    solution: "We send review requests on a steady schedule and draft replies with AI. Your team approves anything sensitive before it's posted.",
    details: ["No incentives or review gating.", "Scope is agreed during setup."],
  },
  {
    id: "social", name: "Social content & creation", status: "preorder",
    problem: "No time to post on social media consistently?",
    today: "Social accounts go quiet for weeks while the business stays busy.",
    solution: "We plan posts, ad creative and AI video concepts for your business, and nothing goes out without your approval.",
    details: ["Daily or weekly schedule agreed once your accounts are connected.", "Platinum plan or quoted scope."],
  },
];

export const findServiceDetail = (id?: string) => SERVICE_DETAILS.find((s) => s.id === id);
