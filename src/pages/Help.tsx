import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck, Code, Database, LifeBuoy, Phone, Rocket, Search, Wrench, Zap,
} from "lucide-react";
import CustomerPageLayout from "@/components/CustomerPageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarrierGuideView } from "@/components/setup-wizard/PhoneSetupPanel";
import SupportTicketForm from "@/components/help/SupportTicketForm";
import GeminiAgentWidget from "@/components/GeminiAgentWidget";
import { supabase } from "@/integrations/supabase/client";
import { SIMLI_FACE_CATALOG } from "@/lib/simliFaceCatalog";
import { ALEX_FACE_ID } from "../../supabase/functions/_shared/alex-guide";
import { CARRIER_GUIDES, carrierGuide } from "../../supabase/functions/_shared/carrier-guides";

/** Onboarding FAQs shown on /help. (Deliberately NOT in scripts/seo-routes
 *  .mjs: that table is pinned to the four sitemap routes.) */
export const HELP_FAQS: { q: string; a: string }[] = [
  {
    q: "How do I log in for the first time?",
    a: "After checkout you get a welcome email with a Set my password button. That link signs you in and lets you choose your own password — we never invent one or email one to you. From then on you sign in with your email and that password, and you can request a fresh reset link from the sign-in page any time.",
  },
  {
    q: "How does Aspen answer my business calls without taking my number?",
    a: "You keep your number and your carrier. In the setup wizard you choose \"forward my existing number\", pick how many rings your phone gets first (2, 3, 4 or 5), and set conditional (no-answer) call forwarding on your carrier to your Aspen number. Your phone rings first; only calls you don't answer reach Aspen. Turning it off is one code or menu tap on the same carrier.",
  },
  {
    q: "What if my carrier doesn't offer no-answer forwarding?",
    a: "Some carriers — Google Fi is one — have no no-answer forwarding at all, and some prepaid brands don't publish steps. The wizard offers two other routes: port (bring) your number to us, which takes several business days while we handle the paperwork, or get a brand-new Aspen number in your area code. Either way Aspen ends up answering your calls.",
  },
  {
    q: "How long does porting my number take?",
    a: "Usually several business days — your current carrier has to release the number, and timing is theirs, not ours. Keep your old line active until we confirm the port is complete, or callers won't reach you. Saving the port step in the wizard records your request with our team; it does not move the number instantly.",
  },
  {
    q: "What are the setup steps after I pay?",
    a: "Five first steps, tracked on a checklist in your dashboard: your bookings calendar (nothing to connect — Aspen books and emails you every appointment), set up your phone number, teach Aspen your business from your website and FAQs, make a test call, and go live by publishing and adding one small snippet to your website. Most people finish in about 20–30 minutes. Alex, the setup guide inside the wizard, can walk you through it live.",
  },
  {
    q: "Can Aspen connect to our phone system or SIP trunk directly?",
    a: "That's an advanced integration, not part of the self-service wizard. Most businesses — including brokerages with a trunk of numbers — simply forward their main number to Aspen, which needs no phone-system changes. If you need a direct SIP-trunk integration, talk to us at (877) 862-4949 before choosing a setup route.",
  },
];

type Guide = {
  id: string;
  icon: typeof Code;
  title: string;
  blurb: string;
  searchText: string;
  body: ReactNode;
};

const steps = (items: ReactNode[]) => (
  <ol className="list-decimal space-y-2 pl-5">{items.map((s, i) => <li key={i}>{s}</li>)}</ol>
);
const bullets = (items: ReactNode[]) => (
  <ul className="list-disc space-y-2 pl-5">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
);

/** The written help guides (Help & Support page, portion one —
 *  2026-11-21). Every claim here is checked against how the product
 *  works today: the install is the iframe embed from the installation
 *  guide, CRM connections are guided paths (Zapier / n8n / API) and
 *  are never described as native connectors, and Alex's server-side
 *  knowledge (_shared/alex-guide.ts) teaches from the same facts. */
export const HELP_GUIDES: Guide[] = [
  {
    id: "install",
    icon: Code,
    title: "Install the code on your website",
    blurb: "One small embed snippet puts your assistant on your site — WordPress, Wix, Squarespace and plain HTML.",
    searchText: "install code snippet embed iframe wordpress wix squarespace html publish website bubble microphone https",
    body: (
      <div className="space-y-3">
        <p>After you publish in the setup wizard, you get one small piece of code — an embed snippet that is unique to your assistant. Adding it is the only change to your website: no pages are edited, nothing is removed, and you can take it out any time by deleting that one snippet.</p>
        {steps([
          <>Finish the <Link className="font-medium text-primary underline" to="/setup">setup wizard</Link> and press <strong>Publish</strong> on step 6 — the install code only appears after publishing.</>,
          <>Open the <strong>installation guide</strong> (it appears under the wizard, and on your dashboard) and copy your code. It draws a window up to 420px wide and 620px tall, and it carries the microphone permission your visitors need for voice — keep the code exactly as given.</>,
          <>Paste it where you want the assistant, using your site builder below, then publish your site and test on its <strong>live HTTPS address</strong> — not only inside the editor.</>,
          <>Open your site, tap the assistant, and try both <strong>Voice</strong> and <strong>Chat</strong>. Check it on a phone too.</>,
        ])}
        <p><strong>WordPress:</strong> edit the page, add a <strong>Custom HTML</strong> block, paste the code, and Update. If WordPress strips the code, do it with an administrator account.</p>
        <p><strong>Wix:</strong> in the editor choose <strong>Add Elements → Embed Code → Embed HTML</strong>, paste the code, resize the element so the whole assistant shows, and Publish.</p>
        <p><strong>Squarespace:</strong> add a <strong>Code block</strong> (an Embed block on some plans) where your plan allows custom HTML, paste the code, save, and test the live page.</p>
        <p><strong>Any other website:</strong> paste the snippet into the page&apos;s HTML with your website editor, or hand it to your web developer — it goes anywhere in the page body.</p>
        <p>Good to know: when you later change your assistant — new knowledge, a new greeting — the changes appear after you re-publish in the wizard. You never replace the code. If your site blocks the microphone inside embedded frames, the installation guide also gives you a direct link to your published assistant page that a button can point to instead.</p>
      </div>
    ),
  },
  {
    id: "setup",
    icon: Rocket,
    title: "Set up your agent",
    blurb: "The 6-step setup wizard, step by step — most people are live in about 20–30 minutes.",
    searchText: "setup wizard steps business learn face voice review draft look on your site test go live publish checklist password welcome email",
    body: (
      <div className="space-y-3">
        <p>Setup lives in the <Link className="font-medium text-primary underline" to="/setup">setup wizard</Link>. It starts with your welcome email: click <strong>Set my password</strong>, choose your own password (we never invent one or email one to you), and sign in. Alex can walk beside you live inside the wizard — and on this page below.</p>
        {steps([
          <><strong>Your business.</strong> Business name, website address if you have one, industry, and short notes about what you do. No website yet is fine — describe the business in the notes instead.</>,
          <><strong>Learn.</strong> Teach your assistant: learn your whole website in one tap, or pick only the pages that matter (services, about, pricing, FAQ), add extra links, upload documents like a price list, and write quick answers to your most common questions. Done looks like at least one source marked Learned. There is a limit of 12 sources, and everything can be edited later.</>,
          <><strong>Face &amp; voice.</strong> Name your assistant, choose whether it appears as a talking video face, and pick a voice — every voice card has a play button so you can hear it first. This step is optional: voice-only works fully.</>,
          <><strong>Review the draft.</strong> Check the greeting, the knowledge draft, suggested services, guardrails and your service area. Suggestions are drafts, never facts — untick or edit anything that is not true for your business. Leave the greeting&apos;s placeholders ({`{timeGreeting}`}, {`{agentName}`}, {`{businessName}`}) in place; they fill in automatically when your assistant speaks.</>,
          <><strong>Look on your site.</strong> Accent color, the words on the button, and which bottom corner the bubble sits in. Nothing here is permanent — it can all change later.</>,
          <><strong>Test &amp; go live.</strong> Run a test conversation against the saved draft (save edits first). If an answer is wrong, the fix is almost always better teaching material back on step 2. Then press <strong>Publish</strong> — and only then do the install steps appear (see the install guide above).</>,
        ])}
        <p>Your dashboard keeps a <strong>first-steps checklist</strong> that ticks itself off from real progress: bookings calendar, phone number, teaching, a test call, and going live. The phone-number step has three routes — forward your existing number, port it to us, or take a new number — covered in the phone forwarding section below.</p>
      </div>
    ),
  },
  {
    id: "crm",
    icon: Database,
    title: "Connect your CRM",
    blurb: "No native connector — here are the working paths: reviewed Zapier sends, CSV export, and guided integrations.",
    searchText: "crm connect integration salesforce hubspot zoho pipedrive export csv sync leads calls zapier n8n api webhook consultation",
    body: (
      <div className="space-y-3">
        <p><strong>The honest version first:</strong> AiHiddenLeads does not plug into your CRM with a built-in native connector, and there is no automatic two-way sync today. Here is how your call data actually reaches your CRM — three working paths, from self-service to done-with-you:</p>
        {bullets([
          <><strong>Reviewed Zapier sends (self-service, working today).</strong> From a call report in your dashboard you can send that one report to a Zapier Catch Hook — after reviewing it on screen — and your Zap files it into your CRM. Full steps are in the Zapier guide below.</>,
          <><strong>CSV export.</strong> Call History in your dashboard exports call reports as CSV, which imports into any CRM.</>,
          <><strong>Guided integrations — n8n, webhooks, API.</strong> If you want data flowing on its own, our team sets that up with you as an expert consultation: tell us your CRM and what should happen when a call ends, using the ticket form below (topic: <em>CRM &amp; integrations</em>), and we will map the route with you.</>,
        ])}
        <p>Your calendar is similar: Aspen&apos;s built-in booking calendar needs no connection at all (see the booking guide). Connecting your own external calendar requires an authorized, verified connection that our team sets up with you.</p>
      </div>
    ),
  },
  {
    id: "zapier",
    icon: Zap,
    title: "How to use Zapier with AiHiddenLeads",
    blurb: "Send a reviewed call report into any app Zapier knows — your CRM included — in about five minutes.",
    searchText: "zapier catch hook webhooks zap call report send crm automation trigger action map fields run history",
    body: (
      <div className="space-y-3">
        <p>Zapier is how a call report leaves AiHiddenLeads and lands in your other tools. The send is <strong>reviewed</strong>: a person opens the report, checks it, and presses send — nothing goes automatically.</p>
        {steps([
          <>In Zapier, choose <strong>Create Zap</strong> and set the trigger to <strong>Webhooks by Zapier → Catch Hook</strong>. Zapier gives you a Catch Hook URL — copy it.</>,
          <>In your AiHiddenLeads dashboard, open <strong>Call History</strong>, open <strong>one call report</strong>, and choose <strong>Send to Zapier</strong>. Paste the Catch Hook URL, review the report on screen, and send it.</>,
          <>Back in Zapier, that report arrives as your test data. Add your action app — your CRM, Google Sheets, email, almost anything Zapier knows — map the fields (caller, summary, outcome, contact details), test the step, then name your Zap and turn it on.</>,
          <>Day to day: when a call should land in your CRM, open its report and send it the same way. Confirm delivery in <strong>Zapier&apos;s run history</strong> — that is the record it arrived.</>,
        ])}
        <p>Automatic per-call sync is not live yet, on purpose: the reviewed send means a wrong or half-finished report never lands in your CRM unnoticed. If your volume outgrows one-by-one sends, ask us about a guided integration (see the CRM guide above).</p>
      </div>
    ),
  },
  {
    id: "booking",
    icon: CalendarCheck,
    title: "Booking & calendar setup",
    blurb: "Aspen books on a built-in calendar — nothing to connect — and emails you every appointment.",
    searchText: "booking calendar appointment schedule hours availability email google calendar book a call implementation",
    body: (
      <div className="space-y-3">
        <p>For your customers&apos; appointments, there is <strong>nothing to connect</strong>: your assistant books on the built-in AiHiddenLeads calendar, and <strong>every booking is emailed to you</strong> with the appointment and the caller&apos;s details. Bookings and their call summaries also live in your dashboard&apos;s Call History, so your inbox and your dashboard are the two records.</p>
        {bullets([
          <><strong>Your hours.</strong> Aspen books inside the business hours and rules she learned in setup — your hours on step 2&apos;s knowledge and the guardrails on step 4. If she offers a time she should not, correct the hours in setup and re-publish; the fix is the teaching, not a calendar setting.</>,
          <><strong>Your own calendar.</strong> Working against your own Google Calendar (or another external calendar) requires an authorized, verified connection — our team sets that up with you. Send a ticket below (topic: <em>Setup</em>) and we will walk it through.</>,
          <><strong>Booking a call with our team.</strong> For implementation help from a human, book at <Link className="font-medium text-primary underline" to="/book">/book</Link> — that calendar is ours, and a confirmation lands in your inbox.</>,
        ])}
      </div>
    ),
  },
  {
    id: "troubleshooting",
    icon: Wrench,
    title: "Troubleshooting basics",
    blurb: "The five things that fix almost everything: publishing, the snippet, permissions, teaching, and forwarding.",
    searchText: "troubleshooting not answering not appearing audio microphone sound wrong answers website changed redesigned cache publish snippet forwarding voicemail",
    body: (
      <div className="space-y-3">
        <p><strong>The assistant does not appear on my website.</strong> Work down this list: (1) you pressed <strong>Publish</strong> on step 6 — a saved draft is not live; (2) the embed code is still on the live page — site edits, theme changes and page rebuilds can remove it, so re-paste it from the installation guide; (3) you are looking at the <strong>live HTTPS page</strong>, not the editor preview; (4) hard-refresh once — browsers cache old pages.</p>
        <p><strong>She says something wrong.</strong> It is almost always the teaching material, not the technology. Fix the source or quick answer on step 2, or the draft wording on step 4, then test and re-publish. The install code never changes.</p>
        <p><strong>Audio or microphone trouble.</strong> Allow the microphone permission for the site when the browser asks; on phones, sound only starts after a tap, so tap the assistant rather than waiting; check the device is not muted and no other app is holding the microphone; and try Chrome if another browser misbehaves.</p>
        <p><strong>My website changed or was redesigned.</strong> Re-teach from step 2 (Learn) so she learns the new pages — the old scan does not update itself. Your install code stays exactly the same.</p>
        <p><strong>Phone calls are not reaching Aspen.</strong> Forwarding is set on <strong>your carrier</strong>, not in our wizard — use the carrier guides below, then test by calling your own number from a different phone and letting it ring unanswered. On some carriers your old voicemail can fight the forwarding; the carrier&apos;s guide says so where that is true.</p>
        <p>Still stuck? Talk to Alex below if you are signed in, send a ticket with the form on this page, or call <a className="font-medium text-primary underline" href="tel:+18778624949">1-877-862-4949</a>.</p>
      </div>
    ),
  },
];

const alexPortrait = SIMLI_FACE_CATALOG.find((f) => f.id === ALEX_FACE_ID)?.image;

/** Help & Support (portion one, Ron's order 2026-11-21): a real help
 *  page — searchable guides, Alex the support engineer live for
 *  signed-in customers, the carrier forwarding library, the full FAQ
 *  (the homepage set plus the onboarding set), and a support ticket
 *  form that creates real tickets. It grows from here; the homepage
 *  FAQ section stays where it is. */
export default function Help() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [carrierId, setCarrierId] = useState("verizon");
  const guide = carrierGuide(carrierId);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [alexOpen, setAlexOpen] = useState(false);

  useEffect(() => {
    document.title = "Help & Support · AI Hidden Leads";
  }, []);

  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => { if (live) setSignedIn(!!data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);

  const guideCards = useMemo(() => {
    const cards = HELP_GUIDES.map((g) => ({ id: g.id, icon: g.icon, title: g.title, blurb: g.blurb, text: `${g.title} ${g.blurb} ${g.searchText}` }));
    cards.push({ id: "phone-forwarding", icon: Phone, title: "Forward your number to Aspen", blurb: "Carrier-by-carrier steps for conditional (no-answer) call forwarding.", text: "forward number carrier rings conditional no-answer porting phone verizon t-mobile att" });
    return cards;
  }, []);
  const visibleCards = guideCards.filter((c) => matches(c.text));

  const homepageFaqs = (t("faqSection.items", { returnObjects: true }) as { q: string; a: string }[]) || [];
  const allFaqs = [...homepageFaqs, ...HELP_FAQS];
  const visibleFaqs = allFaqs.filter((f) => matches(`${f.q} ${f.a}`));

  return (
    <CustomerPageLayout>
      <main className="mx-auto w-full max-w-4xl space-y-10 p-4 sm:p-6">
        {/* Hero + search */}
        <div className="space-y-3 pt-2">
          <h1 className="flex items-center gap-2 text-3xl font-bold"><LifeBuoy className="h-7 w-7 text-primary" /> Help &amp; Support</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Guides for installing and running your assistant, answers to the questions everybody asks, Alex — our support
            engineer — live when you are signed in, and a ticket form that reaches a human. In a hurry? Call{" "}
            <a className="font-medium text-primary underline" href="tel:+18778624949">1-877-862-4949 · 1-877-86-AI WIZ</a> or email{" "}
            <a className="font-medium text-primary underline" href="mailto:info@aihiddenleads.com">info@aihiddenleads.com</a>.
          </p>
          <label className="relative block max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the guides and FAQs — try “Zapier”, “install”, “forwarding”…"
              aria-label="Search help guides and FAQs"
              className="pl-9"
            />
          </label>
          {q && (
            <p className="text-xs text-muted-foreground" role="status">
              {visibleCards.length} guide{visibleCards.length === 1 ? "" : "s"} and {visibleFaqs.length} answer{visibleFaqs.length === 1 ? "" : "s"} match “{query.trim()}”.
            </p>
          )}
        </div>

        {/* Alex, support engineer */}
        <section id="alex" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row">
            {alexPortrait && <img src={alexPortrait} alt="Alex, support engineer at AI Hidden Leads" className="h-28 w-28 shrink-0 rounded-2xl object-cover" />}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Alex — Support Engineer</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Alex is our AI support engineer. He answers technical and implementation questions live — installing the code,
                the setup wizard, phone forwarding, CRM and Zapier paths, booking, and the “why is she doing that?” problems —
                teaching from the same guides written below. He is support, not sales: if something is beyond him he will say so
                plainly and point you to the ticket form or a human.
              </p>
              {signedIn === null ? (
                <Button disabled>Checking your sign-in…</Button>
              ) : signedIn ? (
                alexOpen ? (
                  <p className="text-sm text-muted-foreground" role="status">Alex is open in the window on this page — tap his microphone to talk, or type.</p>
                ) : (
                  <Button size="lg" onClick={() => setAlexOpen(true)}>Talk to Alex live</Button>
                )
              ) : (
                <div className="space-y-2">
                  <Button asChild size="lg"><Link to="/account">Sign in to talk to Alex</Link></Button>
                  <p className="text-xs text-muted-foreground">
                    Live Alex help is for customers — sign in with the account from your welcome email, then come back to this
                    page. Not a customer yet, or locked out? Call 1-877-862-4949 or send a ticket below.
                  </p>
                </div>
              )}
            </div>
          </div>
          {signedIn && alexOpen && (
            <div className="relative mt-4 min-h-[480px]">
              <GeminiAgentWidget guide="alex" autoStart onClose={() => setAlexOpen(false)} />
            </div>
          )}
        </section>

        {/* Guide index */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Guides</h2>
          {visibleCards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guide matches that search — try a shorter word, or send a ticket below and we will answer directly.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleCards.map((c) => (
                <a key={c.id} href={`#${c.id}`} className="group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
                  <c.icon className="mb-2 h-5 w-5 text-primary" />
                  <p className="text-sm font-semibold group-hover:text-primary">{c.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{c.blurb}</p>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Guide articles */}
        {HELP_GUIDES.map((g) => (
          <section key={g.id} id={g.id} className="scroll-mt-24 space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><g.icon className="h-5 w-5 text-primary" /> {g.title}</h2>
            <div className="text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">{g.body}</div>
          </section>
        ))}

        {/* Carrier forwarding library (kept from the original /help) */}
        <section id="phone-forwarding" className="scroll-mt-24 space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Phone className="h-5 w-5 text-primary" /> Forward your number to Aspen</h2>
          <p className="text-sm text-muted-foreground">
            The idea: your phone rings first, and only the calls you don&rsquo;t answer forward to Aspen. That setting is called
            <strong> conditional</strong> or <strong>no-answer call forwarding</strong>, and it&rsquo;s set on your own carrier — pick yours for the exact steps.
            Every guide below was checked against the carrier&rsquo;s own support pages; where a carrier doesn&rsquo;t publish verified steps, the guide says so honestly instead of guessing.
          </p>
          <Select value={carrierId} onValueChange={setCarrierId}>
            <SelectTrigger aria-label="Choose your carrier" className="max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{CARRIER_GUIDES.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}{g.country === "CA" ? " (Canada)" : ""}{g.hostNetwork ? ` · on ${g.hostNetwork}` : ""}</SelectItem>)}</SelectContent>
          </Select>
          {guide && <CarrierGuideView guide={guide} />}
          <p className="text-xs text-muted-foreground">
            Don&rsquo;t see your carrier? Any carrier&rsquo;s support line can turn on conditional call forwarding for you — or call us at (877) 862-4949 and we&rsquo;ll walk you through it.
            If your carrier can&rsquo;t do no-answer forwarding, the setup wizard&rsquo;s port and new-number routes will still get Aspen answering your calls.
          </p>
        </section>

        {/* Full FAQ: the homepage set + the onboarding set */}
        <section id="faq" className="scroll-mt-24 space-y-3">
          <h2 className="text-lg font-semibold">Frequently asked questions</h2>
          <p className="text-sm text-muted-foreground">The full set — the same answers from the homepage, plus the setup questions new customers ask us most.</p>
          {visibleFaqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No answer matches that search. Try different words — or ask Alex above, or send a ticket below.</p>
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border">
              {visibleFaqs.map((f) => (
                <div key={f.q}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium" aria-expanded={openFaq === f.q} onClick={() => setOpenFaq(openFaq === f.q ? null : f.q)}>
                    {f.q}<span className="text-muted-foreground">{openFaq === f.q ? "−" : "+"}</span>
                  </button>
                  {openFaq === f.q && <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Support ticket form */}
        <section id="support-ticket" className="scroll-mt-24 space-y-3">
          <h2 className="text-lg font-semibold">Send a support ticket</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The official way to reach the support team in writing. Your ticket is saved with a reference number and emailed to
            our team — keep the reference for follow-ups. Inside the <Link className="font-medium text-primary underline" to="/setup">setup wizard</Link>,
            Alex can also walk you through most of this live.
          </p>
          <div className="rounded-2xl border border-border bg-card p-5">
            <SupportTicketForm />
          </div>
        </section>
      </main>
    </CustomerPageLayout>
  );
}
