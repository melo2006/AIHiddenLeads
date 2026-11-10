// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGENT_VERTICALS,
  REALTOR_VERTICAL,
  findAgentVertical,
} from "@/data/agentVerticals";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const appSource = read("../App.tsx");
const templateSource = read("../components/landing/AgentLandingTemplate.tsx");
const pageSource = read("../pages/Realtors.tsx");

describe("realtor landing page — route", () => {
  it("is registered at /agents/realtors in App.tsx", () => {
    expect(appSource).toContain('path="/agents/realtors"');
    expect(appSource).toContain("Realtors");
    expect(pageSource).toContain("REALTOR_VERTICAL");
    expect(pageSource).toContain("AgentLandingTemplate");
  });

  it("realtor vertical resolves by slug and route", () => {
    expect(REALTOR_VERTICAL.route).toBe("/agents/realtors");
    expect(findAgentVertical("realtors")).toBe(REALTOR_VERTICAL);
    expect(AGENT_VERTICALS).toContain(REALTOR_VERTICAL);
  });
});

describe("realtor landing page — approved copy", () => {
  it("carries the exact approved headline and sub", () => {
    expect(REALTOR_VERTICAL.headline).toBe(
      "Realtors: Never Miss a Buyer or Seller Call Again — Even at a Showing",
    );
    expect(REALTOR_VERTICAL.sub).toContain(
      "Aspen answers calls and website visitors 24/7, books the appointment, sends the summary",
    );
    expect(REALTOR_VERTICAL.builtFor).toBe("Built for realtors");
  });

  it("carries all 3 approved pains", () => {
    expect(REALTOR_VERTICAL.pains).toHaveLength(3);
    const pains = REALTOR_VERTICAL.pains
      .map((p) => `${p.title} ${p.body}`)
      .join("\n");
    // (1) at a showing/closing/driving, buyer goes to voicemail, moves on
    expect(pains).toMatch(/showing/);
    expect(pains).toMatch(/closing/);
    expect(pains).toMatch(/voicemail/);
    expect(pains).toMatch(/next agent/);
    // (2) website/portal inquiries nights & weekends wait hours
    expect(pains).toMatch(/portal/);
    expect(pains).toMatch(/nights and weekends/);
    expect(pains).toMatch(/hours/);
    // (3) paying for ads/portals, still own answering service
    expect(pains).toMatch(/paying for ads/);
    expect(pains).toMatch(/own answering service/);
  });

  it("sample call covers the full buyer flow and the seller flow", () => {
    const steps = REALTOR_VERTICAL.sampleCall.buyerSteps.join("\n");
    expect(steps).toMatch(/in your name/);
    expect(steps).toMatch(/listing questions/);
    expect(steps).toMatch(/pre-approval/);
    expect(steps).toMatch(/timeline/);
    expect(steps).toMatch(/2–3 spaced/);
    expect(steps).toMatch(/15–20 minutes/);
    expect(steps).toMatch(/30-minute/);
    expect(steps).toMatch(/name, phone, and email/);
    expect(steps).toMatch(/permission to text/);
    expect(steps).toMatch(/summary instantly/);
    expect(REALTOR_VERTICAL.sampleCall.sellerBody).toMatch(
      /valuation consultation/,
    );
  });

  it("later add-ons are exactly the approved realtor menu", () => {
    expect(REALTOR_VERTICAL.laterAddOns.map((a) => a.title)).toEqual([
      "Dead-database revival",
      "Review generation",
      "Open-house follow-up",
      "Social content",
    ]);
    expect(templateSource).toContain("Later add-ons");
    expect(templateSource).toContain("never required");
  });
});

describe("realtor landing page — you stay in control (2026-11-11 additions)", () => {
  it("carries the 4-step control flow in order", () => {
    expect(REALTOR_VERTICAL.controlSteps).toHaveLength(4);
    const steps = REALTOR_VERTICAL.controlSteps
      .map((s) => `${s.title} ${s.body}`)
      .join("\n");
    // 1: own phone rings first, 2–3 rings, their setting, no new phone/number
    expect(steps).toMatch(/rings first/);
    expect(steps).toMatch(/2–3 rings/);
    expect(steps).toMatch(/No new phone and no new number/);
    // 2: unanswered -> Aspen answers in your name
    expect(steps).toMatch(/Aspen answers in your name/);
    // 3: qualifies, hot lead warm-transferred back, whisper summary first
    expect(steps).toMatch(/qualifies/);
    expect(steps).toMatch(/pre-approval/);
    expect(steps).toMatch(/warm-transfers them straight back to your phone/);
    expect(steps).toMatch(/short AI summary of the conversation first/);
    expect(steps).toMatch(/already knowing who it is and what they want/);
    // 4: not hot / after hours -> books + captures
    expect(steps).toMatch(/after hours/);
    expect(steps).toMatch(/books the appointment/);
    expect(templateSource).toContain("You stay in control");
    expect(templateSource).toContain("You're never out of the loop");
  });

  it("dashboard shows every lead with summary and transcript — no recordings claim", () => {
    const points = REALTOR_VERTICAL.dashboardPoints.join("\n");
    expect(points).toMatch(/Name and contact details/);
    expect(points).toMatch(/call or website/);
    expect(points).toMatch(/What they wanted/);
    expect(points).toMatch(/AI summary and transcript/);
    expect(points).toMatch(/appointment booked/);
    // The public site only promises transcripts, AI summaries and audio
    // segments — it explicitly says browser calls are NOT a continuous
    // mixed telephone recording (en.json FAQ). So the realtor page must
    // not promise call recordings.
    const surfaces = [
      templateSource,
      points,
      ...REALTOR_VERTICAL.controlSteps.map((s) => `${s.title} ${s.body}`),
      ...REALTOR_VERTICAL.faq.map((f) => `${f.q} ${f.a}`),
    ].join("\n");
    expect(surfaces).not.toMatch(/call recordings/i);
    expect(surfaces).not.toMatch(/listen to the recording/i);
  });

  it("adds the 4 control FAQs", () => {
    const questions = REALTOR_VERTICAL.faq.map((f) => f.q);
    expect(questions).toContain("Do I need a new phone number?");
    expect(questions).toContain("What if I want to answer first myself?");
    expect(questions).toContain("What happens when a lead is hot?");
    expect(questions).toContain("Can I see what Aspen said to a caller?");
    const seeAnswer = REALTOR_VERTICAL.faq.find(
      (f) => f.q === "Can I see what Aspen said to a caller?",
    );
    expect(seeAnswer?.a).toMatch(/dashboard/);
    expect(seeAnswer?.a).toMatch(/summary and transcript/);
  });

  it("reuses the homepage Meet the Team section verbatim, before pricing", () => {
    expect(templateSource).toContain('from "@/components/landing/TeamSection"');
    expect(templateSource).toContain("<TeamSection />");
    expect(templateSource.indexOf("<TeamSection />")).toBeLessThan(
      templateSource.indexOf("<PricingSection />"),
    );
  });
});

describe("realtor landing page — calendar, evidence, money math (additions 2)", () => {
  it("calendar section covers bookings, reminders, reschedule and the framing line", () => {
    const cal = [
      ...REALTOR_VERTICAL.calendar.points,
      REALTOR_VERTICAL.calendar.example,
      REALTOR_VERTICAL.calendar.framing,
    ].join("\n");
    expect(cal).toMatch(/your calendar/);
    expect(cal).toMatch(/showings, buyer consultations, and seller valuation appointments/);
    expect(cal).toMatch(/calendar invite/);
    expect(cal).toMatch(/email 24 hours before/);
    expect(cal).toMatch(/text 1 hour before/);
    expect(cal).toMatch(/Thursday 2 pm showing needs to move to Friday morning/);
    expect(cal).toMatch(/moves it on that one call/);
    expect(cal).toMatch(/No phone tag/);
    expect(cal).toMatch(/No-shows get a follow-up/);
    // Framing: facilitates, does NOT replace the agent
    expect(cal).toMatch(/does not replace you/);
    expect(cal).toMatch(/answers, qualifies, books, and reminds/);
    expect(cal).toMatch(/relationship, the negotiation, and the closing/);
    expect(templateSource).toContain("Booked straight onto your calendar");
    expect(templateSource).toContain("Rescheduling, without the phone tag");
  });

  it("evidence uses ONLY the verified figures, with sources, and never 26 hours", () => {
    const byValue = Object.fromEntries(
      REALTOR_VERTICAL.stats.map((s) => [s.value, s]),
    );
    expect(byValue["917 min"].label).toMatch(/over 15 hours/);
    expect(byValue["917 min"].source).toMatch(/WAV Group/);
    expect(byValue["48%"].source).toMatch(/WAV Group/);
    expect(byValue["78%"].source).toMatch(/NAR 2025/);
    expect(byValue["21x"].source).toMatch(/MIT \/ InsideSales/);
    expect(byValue["33%"].source).toMatch(/Pied Piper/);
    expect(byValue["33%"].source).toMatch(/2,198 inquiries/);
    expect(byValue["73%"].label).toMatch(/no follow-up within 24 hours/);
    expect(byValue["85%"].label).toMatch(/never call back/);
    const surfaces = [
      templateSource,
      JSON.stringify(REALTOR_VERTICAL),
    ].join("\n");
    expect(surfaces).not.toMatch(/26 hours|26-hour/);
    expect(templateSource).toContain("Sources: WAV Group");
    expect(templateSource).toContain("Pied Piper Lead Handling Effectiveness Study 2026");
  });

  it("stat bar shows the 4 headline figures under the hero, before the pains", () => {
    expect(REALTOR_VERTICAL.stats.slice(0, 4).map((s) => s.value)).toEqual([
      "917 min",
      "48%",
      "78%",
      "21x",
    ]);
    const statBarAt = templateSource.indexOf("vertical.stats.slice(0, 4)");
    expect(statBarAt).toBeGreaterThan(-1);
    expect(statBarAt).toBeLessThan(
      templateSource.indexOf("The calls you miss are the clients you lose"),
    );
  });

  it("money math is a labelled example with the verified commission figures", () => {
    const math = [
      ...REALTOR_VERTICAL.moneyMath.lines,
      REALTOR_VERTICAL.moneyMath.punchline,
      REALTOR_VERTICAL.moneyMath.source,
    ].join("\n");
    expect(math).toMatch(/5\.44%/);
    expect(math).toMatch(/2\.5%/);
    expect(math).toMatch(/\$10,000 on a \$400,000 home/);
    expect(math).toMatch(/\$25,000 on a \$1,000,000 home/);
    expect(math).toMatch(/\$120,000 a year/);
    expect(math).toMatch(/Redfin \/ Clever/);
    expect(math).toMatch(/Aspen is \$99\/mo/);
    expect(templateSource).toContain("Example math — not a promise");
    expect(templateSource).toMatch(/Commissions are negotiable/);
  });

  it("buyer scenario is the generalized Sound familiar story, no names", () => {
    expect(REALTOR_VERTICAL.scenario).toMatch(/call the number on the sign/);
    expect(REALTOR_VERTICAL.scenario).toMatch(/don't leave a voicemail/);
    expect(REALTOR_VERTICAL.scenario).toMatch(/call the next agent/);
    expect(REALTOR_VERTICAL.scenario).toMatch(/2 days later/);
    expect(REALTOR_VERTICAL.scenario).toMatch(/forgotten which house/);
    expect(templateSource).toContain("Sound familiar?");
  });
});

describe("realtor landing page — v2 polish batch (2026-11-11)", () => {
  it("slim top contact bar carries both Aspen bridge numbers as tel: links, above the navbar", () => {
    expect(templateSource).toContain("data-agent-contact-bar");
    expect(templateSource).toContain('href="tel:+18778624949"');
    expect(templateSource).toContain("1-877-862-4949 (toll-free)");
    expect(templateSource).toContain('href="tel:+17723624949"');
    expect(templateSource).toContain("(772) 362-4949 (local)");
    expect(templateSource).toContain("Aspen answers live right now");
    // Bar renders before the shared navbar, which stays below it.
    expect(templateSource.indexOf("data-agent-contact-bar")).toBeLessThan(
      templateSource.indexOf("<LandingNavbar />"),
    );
  });

  it("hero demo form has exactly the website URL + one optional note entry", () => {
    expect(templateSource).toContain("data-agent-hero-form");
    expect(templateSource).toContain("Your website URL");
    expect(templateSource).toContain("Anything Aspen should know? (optional)");
    expect(templateSource).toContain(
      "See your website come alive — under 2 minutes",
    );
    // Exactly 2 entries in the hero form.
    const formStart = templateSource.indexOf("data-agent-hero-form");
    const formEnd = templateSource.indexOf("</motion.form>", formStart);
    const formSource = templateSource.slice(formStart, formEnd);
    expect(formSource.match(/<Input/g)).toHaveLength(2);
    expect(formSource).toContain("required");
  });

  it("hero form hands off to the existing /demo flow with the URL prefilled", () => {
    // TryDemo (/demo) pre-fills its intake from the ?url= search param;
    // the hero form must use that same handoff, not a new backend field.
    expect(templateSource).toContain("/demo?url=${encodeURIComponent(");
    // The optional note rides client-side in router state only.
    expect(templateSource).toContain("state: { aspenNote: note }");
  });

  it("big friendly lucide icons on the control steps and hero benefits", () => {
    // Control steps: large icon tiles.
    expect(templateSource).toContain("w-16 h-16");
    expect(templateSource).toContain("w-8 h-8 text-primary");
    expect(templateSource).toContain("controlIcons");
    // Hero benefit bullets with icons, from the repo's lucide set.
    expect(templateSource).toContain("heroBenefits");
    expect(templateSource).toContain("Answered in seconds — 24/7");
    expect(templateSource).toContain("Hot leads warm-transferred to your phone");
    expect(templateSource).toContain("Every lead lands in your dashboard");
    expect(templateSource).toContain("w-12 h-12");
    expect(templateSource).toContain("from \"lucide-react\"");
  });

  it("motion polish honours reduced motion and the stat bar stays static", () => {
    expect(templateSource).toContain("useReducedMotion");
    expect(templateSource).toContain("whileInView");
    // No counting/ticker/spring animation anywhere near the stats.
    expect(templateSource).not.toMatch(/CountUp|useSpring|useMotionValue|animate\(/);
    const statBar = templateSource.slice(
      templateSource.indexOf("Stat bar"),
      templateSource.indexOf("The vertical's 3 pains"),
    );
    expect(statBar).not.toContain("motion.");
    expect(statBar).toContain("vertical.stats.slice(0, 4)");
  });
});

describe("realtor landing page — shared template + pricing rules", () => {
  it("reuses the shared homepage blocks instead of a parallel design", () => {
    expect(templateSource).toContain("LandingNavbar");
    expect(templateSource).toContain("TryWebsiteCTA");
    expect(templateSource).toContain("PricingSection");
    expect(templateSource).toContain("Footer");
    // Current approved Aspen portrait asset, same as the homepage hero.
    expect(templateSource).toContain("@/assets/aspen-idle-wave.gif");
  });

  it("leads with the free try-your-website demo CTA", () => {
    expect(templateSource).toContain(
      "Try it free on your own website and see your website come alive",
    );
    expect(templateSource).toContain('navigate("/demo")');
  });

  it("presents $99 Premium, 400 minutes and the optional $79 avatar", () => {
    expect(templateSource).toContain("$99");
    expect(templateSource).toContain(
      "400 minutes — almost nobody gives you",
    );
    expect(templateSource).toContain("this many at $99");
    expect(templateSource).toContain("$79/mo");
    expect(templateSource).toMatch(/Optional live video avatar add-on/);
  });

  it("never presents the entry price combined with the avatar add-on", () => {
    const surfaces = [
      templateSource,
      pageSource,
      REALTOR_VERTICAL.headline,
      REALTOR_VERTICAL.sub,
      ...REALTOR_VERTICAL.pains.map((p) => `${p.title} ${p.body}`),
      ...REALTOR_VERTICAL.sampleCall.buyerSteps,
      REALTOR_VERTICAL.sampleCall.sellerBody,
      ...REALTOR_VERTICAL.laterAddOns.map((a) => `${a.title} ${a.body}`),
      ...REALTOR_VERTICAL.controlSteps.map((s) => `${s.title} ${s.body}`),
      ...REALTOR_VERTICAL.dashboardPoints,
      ...REALTOR_VERTICAL.faq.map((f) => `${f.q} ${f.a}`),
    ].join("\n");
    expect(surfaces).not.toContain("$99 + $79");
    expect(surfaces).not.toContain("99 + 79");
  });

  it("stays honest: no only-serving claim, no fabricated testimonials", () => {
    const faq = REALTOR_VERTICAL.faq.map((f) => `${f.q} ${f.a}`).join("\n");
    expect(faq).toContain("Do you only serve realtors?");
    expect(faq).toMatch(/No\. AiHiddenLeads serves/);
    expect(templateSource).not.toContain("TestimonialSection");
    expect(templateSource.toLowerCase()).not.toMatch(/we only serve realtors/);
  });
});
