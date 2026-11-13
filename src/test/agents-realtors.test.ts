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
const tryDemoSource = read("../pages/TryDemo.tsx");

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
  it("slim top contact bar carries the Aspen bridge numbers as tel: links with vanity tags, above the navbar", () => {
    expect(templateSource).toContain("data-agent-contact-bar");
    expect(templateSource).toContain('href="tel:+18778624949"');
    expect(templateSource).toContain("1-877-862-4949 · AIWIZ");
    expect(templateSource).toContain('href="tel:+17723624949"');
    expect(templateSource).toContain("1-772-362-4949 · AIWIZ");
    // The realtor line joins the bar on the realtors vertical only, and
    // the full dual displays land in the realtors-only contact strip.
    expect(templateSource).toContain('href="tel:+17862449688"');
    expect(templateSource).toContain("786-244-9688 · AI-4ALL");
    expect(templateSource).toContain("data-agent-contact-strip");
    expect(templateSource).toContain("(realtor line)");
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

describe("realtor landing page — one-click example demos (2026-11-12)", () => {
  it("realtors data carries thirteen example sites in eight area groups", () => {
    const examples = REALTOR_VERTICAL.demoExamples;
    expect(examples).toBeDefined();
    expect(examples?.intro).toBe(
      "No typing needed — pick an example realtor website and watch the demo run on it live:",
    );
    expect(examples?.placeholder).toBe("Pick an example realtor website…");
    expect(examples?.visitorName).toBe("John Doe");
    expect(examples?.groups.map((group) => group.area)).toEqual([
      "Broward County, FL",
      "Miami-Dade County, FL",
      "Palm Beach County, FL",
      "Dallas, TX",
      "Los Angeles, CA",
      "San Francisco, CA",
      "New York, NY",
      "Salt Lake City, UT",
    ]);
    expect(
      examples?.groups.flatMap((group) =>
        group.options.map(
          (option) => `${option.agent} — ${option.city}|${option.url}`,
        ),
      ),
    ).toEqual([
      "Aurelia Perez — Fort Lauderdale|https://www.aureliaperez.com/",
      "Ann Chamberlain — Fort Lauderdale|https://www.annchamberlain.com/",
      "Ashley Cusack — Coral Gables|https://ashleycusack.com/",
      "Mauricio J. Barba — Coral Gables|https://miamisignaturehomes.com/",
      "Michael Martinez — Coral Gables|https://michaelmartinezrealtor.com/",
      "Jean-Luc Andriot — Boca Raton|https://jeanlucandriot.com/",
      "Paul Saperstein — Delray Beach|https://paulsapersteinhomes.com/",
      "Baldemar De Leon — Dallas|https://www.baldemardeleon.com/",
      "Logan Walter — Dallas|https://loganwalter.com/",
      "Ray Miramontes — Long Beach|https://mira-realestate.com/",
      "Danielle Lazier — San Francisco|https://daniellelazier.com/",
      "Richard Steinberg Team — New York|https://www.therichardsteinbergteam.com/",
      "Gian Sexsmith — Salt Lake City|https://sexsmithrealty.com/",
    ]);
    // Examples are a realtors-only data addition, not a shared default.
    for (const vertical of AGENT_VERTICALS) {
      if (vertical.slug !== "realtors") {
        expect(vertical.demoExamples).toBeUndefined();
      }
    }
  });

  it("hero form renders a labelled grouped select without changing its two text inputs", () => {
    expect(templateSource).toContain("data-agent-demo-examples");
    expect(templateSource).toContain('htmlFor="agent-hero-example"');
    expect(templateSource).toContain("{vertical.demoExamples.intro}");
    expect(templateSource).toContain('id="agent-hero-example"');
    expect(templateSource).toContain('defaultValue=""');
    expect(templateSource).toContain("onChange={handleExampleSelect}");
    expect(templateSource).toContain("{vertical.demoExamples.placeholder}");
    expect(templateSource).toContain(
      "vertical.demoExamples.groups.map((group)",
    );
    expect(templateSource).toContain("<optgroup key={group.area} label={group.area}>");
    expect(templateSource).toContain("<option key={option.url} value={option.url}>");
    expect(templateSource).toContain("{option.agent} — {option.city}");
  });

  it("selecting an example uses the /demo handoff with the sample flag and generic visitor name", () => {
    // Pinned examples (pre-scanned leads, refreshed weekly) enter via
    // leadId so /demo-site reuses the stored scan; the URL, sample flag
    // and generic visitor name ride along exactly as before. An example
    // without a pinned lead keeps the original URL-only launch.
    expect(templateSource).toContain("pinnedLeadIdForExampleUrl(exampleUrl)");
    expect(templateSource).toContain(
      "`/demo?leadId=${pinnedLeadId}&url=${encodeURIComponent(exampleUrl)}&sample=1&callerName=${visitorName}`",
    );
    expect(templateSource).toContain(
      "`/demo?url=${encodeURIComponent(exampleUrl)}&sample=1&callerName=${visitorName}`",
    );
    // /demo forwards a marked sample straight to /demo-site, where the
    // callerName param is the existing channel into visitorName — and
    // the forwarder must carry a pinned leadId through untouched, or
    // /demo-site would fall back to a fresh scan.
    expect(tryDemoSource).toContain('searchParams.get("sample") !== "1"');
    expect(tryDemoSource).toContain('searchParams.get("callerName")');
    expect(tryDemoSource).toContain("callerName: sampleCallerName");
    expect(tryDemoSource).toContain('sample: "1"');
    expect(tryDemoSource).toContain('searchParams.get("leadId")');
    expect(tryDemoSource).toContain('params.set("leadId", pinnedLeadId)');
    expect(tryDemoSource).toContain(
      "navigate(`/demo-site?${params.toString()}`, { replace: true })",
    );
  });

  it("uses coast-to-coast nationwide wording in the realtor data", () => {
    const serialized = JSON.stringify(REALTOR_VERTICAL);
    expect(serialized).toContain("Serving realtors nationwide — coast to coast.");
    expect(serialized).toContain("Coast to coast: if the phone rings, she picks up.");
    expect(serialized).not.toMatch(/Dallas to (Miami|Florida)/);
  });
});

describe("realtor landing page — v3 real-estate batch (2026-11-11)", () => {
  it("hero badge pill carries the realtor slogan line, data-driven", () => {
    expect(REALTOR_VERTICAL.badgeLine).toBe(
      "Buyers and sellers won't wait · The first agent to answer wins the client · Aspen answers in seconds, 24/7",
    );
    expect(templateSource).toContain("vertical.badgeLine ?? vertical.builtFor");
  });

  it("photo banner (v3 shape, superseded by the v4 hero slideshow below): data moved to heroSlides", () => {
    // The v3 floating-cards banner was replaced in v4 by the hero
    // slideshow (see the v4 hero-carousel describe). The old fields
    // are gone from the data and the template.
    expect(
      (REALTOR_VERTICAL as Record<string, unknown>).heroPhotos,
    ).toBeUndefined();
    expect(templateSource).not.toContain("data-agent-hero-photos");
    expect(templateSource).not.toContain("heroPhotoImages");
  });

  it("services list on the page is the split 8, matching the homepage hero names", () => {
    expect(REALTOR_VERTICAL.services).toEqual([
      "Live Video Receptionist on Your Website",
      "AI Phone Receptionist — No Website Needed",
      "Fresh B2B Prospects, Delivered Weekly",
      "Google Maps & AI Search Visibility",
      "Reviews & Reputation Management",
      "Social Media, Handled",
      "Comments & Reviews, Answered",
      "Website Revamp or a Brand-New Site",
    ]);
    expect(templateSource).toContain("data-agent-services");
    expect(templateSource).toContain("vertical.services.map");
    expect(templateSource).toContain("sm:grid-cols-2");
  });

  it("lingo pass: brokerage language lands in pains, scenario and money math", () => {
    const pains = REALTOR_VERTICAL.pains.map((p) => p.body).join("\n");
    expect(pains).toMatch(/another agent at another brokerage/);
    expect(REALTOR_VERTICAL.scenarioPunchline).toBe(
      "That is what your buyers do, too. Answer now — or lose them to the next brokerage.",
    );
    expect(templateSource).toContain("vertical.scenarioPunchline");
    expect(templateSource).not.toContain("to the agent who doesn't");
    const math = REALTOR_VERTICAL.moneyMath.lines.join("\n");
    expect(math).toMatch(/brokerage down the street/);
  });

  it("stat bar display: 15+ hours and 21x more likely lead, canonical figures untouched", () => {
    const byValue = Object.fromEntries(
      REALTOR_VERTICAL.stats.map((s) => [s.value, s]),
    );
    // Canonical data (evidence section + sources) keeps the exact figures.
    expect(byValue["917 min"].label).toMatch(/over 15 hours/);
    expect(byValue["917 min"].source).toMatch(/WAV Group/);
    expect(byValue["21x"].label).toMatch(/^More likely to qualify a lead/);
    // The hero stat bar renders the plain-language display overrides.
    expect(byValue["917 min"].barValue).toBe("15+ hours");
    expect(byValue["917 min"].barLabel).toBe(
      "Average agent response time to a new inquiry (917 minutes)",
    );
    expect(byValue["21x"].barValue).toBe("21x more likely");
    expect(byValue["21x"].barLabel).toBe(
      "To qualify a lead when you respond in 5 minutes instead of 30 minutes",
    );
    // Big line + subline read as one sentence, no duplicated wording.
    expect(byValue["21x"].barLabel).not.toMatch(/more likely/i);
    expect(templateSource).toContain("stat.barValue ?? stat.value");
    expect(templateSource).toContain("stat.barLabel ?? stat.label");
  });

  it("pain cards: icon chip and headline share one header row, body below", () => {
    // The old stacked layout (icon tile alone on its own row) is gone.
    expect(templateSource).not.toContain("w-14 h-14");
    const painsAt = templateSource.indexOf("vertical.pains.map");
    const painsBlock = templateSource.slice(painsAt, painsAt + 1800);
    expect(painsBlock).toContain("flex items-center gap-4 mb-4");
    expect(painsBlock).toContain("shrink-0");
    const headerAt = painsBlock.indexOf("flex items-center gap-4 mb-4");
    const titleAt = painsBlock.indexOf("{pain.title}", headerAt);
    const bodyAt = painsBlock.indexOf("{pain.body}", headerAt);
    expect(titleAt).toBeGreaterThan(headerAt);
    expect(bodyAt).toBeGreaterThan(titleAt);
  });
});

describe("realtor landing page — v4 card layout consistency (2026-11-11)", () => {
  it("seller sample-call card: icon chip and headline share one header row, body below", () => {
    const titleAt = templateSource.indexOf("vertical.sampleCall.sellerTitle");
    expect(titleAt).toBeGreaterThan(-1);
    const card = templateSource.slice(titleAt - 800, titleAt + 400);
    // Calendar icon chip sits in the same flex header row as the headline.
    const headerAt = card.indexOf("flex items-center gap-4 mb-3");
    expect(headerAt).toBeGreaterThan(-1);
    expect(card.indexOf("CalendarCheck", headerAt)).toBeGreaterThan(headerAt);
    expect(card.indexOf("shrink-0", headerAt)).toBeGreaterThan(headerAt);
    // Headline follows the header row start; body follows the headline.
    const titleInCard = card.indexOf("vertical.sampleCall.sellerTitle", headerAt);
    expect(titleInCard).toBeGreaterThan(headerAt);
    expect(card.indexOf("vertical.sampleCall.sellerBody")).toBeGreaterThan(
      titleInCard,
    );
    // The old stacked tile (icon alone on its own row above the headline) is gone.
    expect(templateSource).not.toContain("justify-center mb-4");
  });

  it("control step cards: icon chip and headline share one header row, numbered badge on the chip corner", () => {
    const stepsAt = templateSource.indexOf("vertical.controlSteps.map");
    expect(stepsAt).toBeGreaterThan(-1);
    const block = templateSource.slice(stepsAt, stepsAt + 2200);
    const headerAt = block.indexOf("flex items-center gap-4 mb-4");
    expect(headerAt).toBeGreaterThan(-1);
    // Big icon tile kept (v2 design pin) inside a shrink-0 relative wrapper.
    expect(block).toContain("w-16 h-16");
    expect(block).toContain("w-8 h-8 text-primary");
    expect(block.indexOf("relative shrink-0", headerAt)).toBeGreaterThan(headerAt);
    // Step-number badge rides the chip's top-right corner, inside the row.
    const badgeAt = block.indexOf("-top-2 -right-2", headerAt);
    expect(badgeAt).toBeGreaterThan(headerAt);
    expect(block.indexOf("{i + 1}", badgeAt)).toBeGreaterThan(badgeAt);
    // Headline shares the row; body sits below it.
    const titleAt = block.indexOf("{step.title}", headerAt);
    const bodyAt = block.indexOf("{step.body}", headerAt);
    expect(titleAt).toBeGreaterThan(headerAt);
    expect(bodyAt).toBeGreaterThan(titleAt);
    // The old stacked wrapper + off-tile badge offset are gone.
    expect(templateSource).not.toContain("relative mb-4");
    expect(templateSource).not.toContain("left-14");
  });
});

describe("realtor landing page — v4 hero photo carousel (2026-11-11 addenda)", () => {
  it("hero slides: 8 photo + slogan pairs in the approved order (realtors only)", () => {
    const slides = REALTOR_VERTICAL.heroSlides ?? [];
    expect(slides).toHaveLength(8);
    expect(slides.map((s) => s.key)).toEqual([
      "sold",
      "condo",
      "keys",
      "house",
      "couple",
      "aerial",
      "beach",
      "dallas",
    ]);
    expect(slides.map((s) => s.slogan)).toEqual([
      "The first agent to answer wins the client.",
      "Buyers and sellers won't wait.",
      "Never miss a showing, a closing, or a call.",
      "Your next closing starts with one answered call.",
      "Every buyer. Every seller. Answered.",
      "Aspen answers in seconds, 24/7.",
      "Voicemail? Your buyer just called the next agent on the list.",
      "Serving realtors nationwide — coast to coast.",
    ]);
    // Every slide names its subject in alt text and carries a focal
    // crop class so the subject survives the mobile/desktop crops.
    for (const slide of slides) {
      expect(slide.alt.length).toBeGreaterThan(20);
      expect(slide.caption.length).toBeGreaterThan(3);
      expect(slide.focusClass).toContain("object-[");
    }
    const alts = slides.map((s) => s.alt).join("\n");
    expect(alts).toMatch(/SOLD sign/);
    expect(alts).toMatch(/condo buyers/);
    expect(alts).toMatch(/townhouse/);
    expect(alts).toMatch(/QR code/);
    expect(alts).toMatch(/older couple/);
    expect(alts).toMatch(/Aerial view of Fort Lauderdale/);
    expect(alts).toMatch(/Intracoastal/);
    expect(alts).toMatch(/Fort Lauderdale Beach/);
    expect(alts).toMatch(/W Fort Lauderdale/);
    expect(alts).toMatch(/Downtown Dallas skyline/);
    // No placeholder language survives anywhere in the slide data.
    expect(alts).not.toMatch(/placeholder/i);
    // Credit line: slides 6 + 8 are real Wikimedia Commons photographs
    // (CC BY-SA 4.0, each credited to its author); the rest of the
    // hero imagery was created for — or provided to — AiHiddenLeads
    // (slide 7 is Ron's own Fort Lauderdale Beach photo).
    expect(REALTOR_VERTICAL.heroSlidesCredit).toMatch(/Yanjipy/);
    expect(REALTOR_VERTICAL.heroSlidesCredit).toMatch(/Gattacal/);
    expect(REALTOR_VERTICAL.heroSlidesCredit).toMatch(/CC BY-SA 4\.0/);
    expect(REALTOR_VERTICAL.heroSlidesCredit).toMatch(/Wikimedia Commons/);
    expect(REALTOR_VERTICAL.heroSlidesCredit).toMatch(
      /created for or provided to AiHiddenLeads/,
    );
    expect(REALTOR_VERTICAL.heroSlidesCredit).not.toMatch(/placeholder/i);
    // No other vertical carries slides — no carousel renders for them.
    for (const vertical of AGENT_VERTICALS) {
      if (vertical.slug !== "realtors") {
        expect(vertical.heroSlides).toBeUndefined();
      }
    }
  });

  it("template: full-bleed slideshow band at the top of the hero, all 8 assets wired", () => {
    expect(templateSource).toContain("data-agent-hero-slides");
    expect(templateSource).toContain("heroSlideImages");
    // The final approved set (Ron, 2026-11-11) — no placeholder files.
    expect(templateSource).toContain("@/assets/realtor-hero-sold.jpg");
    expect(templateSource).toContain("@/assets/realtor-hero-condo.jpg");
    expect(templateSource).toContain("@/assets/realtor-hero-keys.jpg");
    expect(templateSource).toContain("@/assets/realtor-hero-house-qr.jpg");
    expect(templateSource).toContain("@/assets/realtor-hero-couple.jpg");
    expect(templateSource).toContain("@/assets/realtor-hero-fll-aerial.jpg");
    expect(templateSource).toContain("@/assets/realtor-hero-fll-beach.jpg");
    expect(templateSource).toContain("@/assets/realtor-hero-dallas.jpg");
    expect(templateSource).not.toContain("realtor-slide-placeholder");
    expect(templateSource).toContain("vertical.heroSlidesCredit");
    // The band renders above the H1 block in the hero section.
    const bandAt = templateSource.indexOf("data-agent-hero-slides");
    const h1At = templateSource.indexOf("vertical.headline");
    expect(bandAt).toBeGreaterThan(-1);
    expect(h1At).toBeGreaterThan(bandAt);
    // Panoramic background treatment: skinnier fixed band heights
    // (v4.1, Ron's live-test feedback: the v4 band ate too much page)
    // + object-cover, and the hero section's top padding is tight so
    // the band lifts up close to the header (Batch 1, 2026-11-12:
    // pt-2/sm:pt-3 shrunk to pt-1/sm:pt-2 — see the black-band describe).
    expect(templateSource).toContain("h-[250px]");
    expect(templateSource).toContain("lg:h-[430px]");
    expect(templateSource).not.toContain("h-[340px]");
    expect(templateSource).not.toContain("lg:h-[520px]");
    expect(templateSource).toContain("object-cover");
    expect(templateSource).toContain("pt-1 sm:pt-2");
    // Slogan type steps down on mobile (text-2xl) so the longest
    // slogan fits the skinnier band without clipping; the text block
    // also carries extra side padding so no letter slides under the
    // prev/next arrow buttons.
    expect(templateSource).toContain("text-2xl font-bold leading-tight");
    expect(templateSource).toContain("sm:text-5xl");
    expect(templateSource).toContain("px-14");
  });

  it("slogan pill is removed from the realtor hero — its phrases live as slide slogans", () => {
    // The pill only renders for verticals WITHOUT slides.
    expect(templateSource).toContain("{!vertical.heroSlides?.length && (");
    // The fallback chain itself stays for the other verticals.
    expect(templateSource).toContain("vertical.badgeLine ?? vertical.builtFor");
  });

  it("rotation: ~5.6s crossfade pairs, dots, pause on interaction, reduced motion = static slide 1", () => {
    expect(templateSource).toContain("HERO_SLIDE_ROTATE_MS = 5600");
    expect(templateSource).toContain("setInterval");
    expect(templateSource).toContain("transition-opacity duration-1000");
    // The rotation effect refuses to run under reduced motion or while
    // paused — so reduced-motion visitors keep slide 1, static (the
    // manual controls below still move between slides for them).
    expect(templateSource).toContain(
      "if (reduceMotion || hoverPaused || userPaused",
    );
    // Transient pause hooks on hover / focus / tap, resume on leave.
    expect(templateSource).toContain(
      "onMouseEnter={() => setHoverPaused(true)}",
    );
    expect(templateSource).toContain(
      "onMouseLeave={() => setHoverPaused(false)}",
    );
    expect(templateSource).toContain("onFocus={() => setHoverPaused(true)}");
    expect(templateSource).toContain(
      "onPointerDown={() => setHoverPaused(true)}",
    );
    // Clickable dot indicators, one per slide, labelled per slide.
    expect(templateSource).toContain("aria-label={`Show slide ${i + 1}: ${slide.caption}`}");
    expect(templateSource).toContain('aria-roledescription="carousel"');
    // Slide 1 preloads (eager); the rest lazy-load.
    expect(templateSource).toContain('loading={i === 0 ? "eager" : "lazy"}');
  });

  it("controls: swipe, prev/next arrows and a pause/play toggle (v4.1)", () => {
    // Touch swipe: the band records the touch start X and, past the
    // threshold, a left swipe goes next and a right swipe goes prev;
    // swiping counts as manual control, so it pauses the rotation.
    expect(templateSource).toContain("HERO_SWIPE_MIN_PX = 40");
    expect(templateSource).toContain("onTouchStart");
    expect(templateSource).toContain("onTouchEnd");
    expect(templateSource).toContain("touchStartX");
    expect(templateSource).toContain("if (deltaX < 0) goNext();");
    // Prev / next chevron buttons: labelled, real buttons (keyboard
    // focusable), full 44px tap targets.
    expect(templateSource).toContain('aria-label="Previous slide"');
    expect(templateSource).toContain('aria-label="Next slide"');
    expect(templateSource).toContain("ChevronLeft");
    expect(templateSource).toContain("ChevronRight");
    expect(templateSource).toContain("h-11 w-11");
    // Pause / play toggle: aria-pressed state, label + icon swap.
    expect(templateSource).toContain("aria-pressed={userPaused}");
    expect(templateSource).toContain(
      'userPaused ? "Play slideshow" : "Pause slideshow"',
    );
    expect(templateSource).toContain("<Pause");
    expect(templateSource).toContain("<Play");
    // Manual navigation routes through goTo, which pauses rotation
    // until the visitor presses play again.
    expect(templateSource).toContain("setUserPaused(true)");
    expect(templateSource).toContain("const goPrev = () => goTo(active - 1);");
    expect(templateSource).toContain("const goNext = () => goTo(active + 1);");
  });
});

describe("realtor landing page — Batch 1 black band shrink (2026-11-12)", () => {
  it("the fixed-bar clearance stack is untouched: contact spacer, navbar offset and navbar stay", () => {
    // The h-10 spacer exactly matches the fixed h-10 contact bar and the
    // navbar (offset to top-10 inside its wrapper) carries its own
    // spacer — shrinking either would slide content under a fixed bar.
    expect(templateSource).toContain('<div aria-hidden className="h-10" />');
    expect(templateSource).toContain('<div className="[&>nav]:top-10">');
    expect(templateSource).toContain('className="fixed top-0 inset-x-0 z-[100] h-10 bg-primary text-primary-foreground"');
  });

  it("the reducible empty space shrank: hero top padding and the under-slideshow gap", () => {
    expect(templateSource).toContain("pt-1 sm:pt-2");
    expect(templateSource).not.toContain("pt-2 sm:pt-3");
    expect(templateSource).toContain('vertical.heroSlides?.length ? "mt-4 sm:mt-6" : ""');
    expect(templateSource).not.toContain("mt-10 sm:mt-12");
  });

  it("verticals without hero slides keep the no-margin layout (the ternary's empty branch)", () => {
    // The margin only ever applied when heroSlides exist; mortgage /
    // insurance share this template and must not gain or lose spacing.
    expect(templateSource).toContain('vertical.heroSlides?.length ? "mt-4 sm:mt-6" : ""');
  });
});

describe("realtor landing page — areas we serve strip (2026-11-11)", () => {
  it("realtors data carries the nationwide framing with the South Florida home turf", () => {
    const areas = REALTOR_VERTICAL.serviceAreas;
    expect(areas).toBeDefined();
    // AiHiddenLeads serves nationwide — South Florida is the home
    // base, never presented as the limit of service.
    expect(areas?.heading).toBe("Serving realtors nationwide");
    expect(areas?.framing).toMatch(/wherever your buyers and sellers call from/);
    expect(areas?.framing).toMatch(/home base is South Florida/);
    expect(areas?.framing).toMatch(/our agents' markets are everywhere/);
    expect(areas?.framing).toMatch(/Coast to coast/);
    expect(areas?.framing).toMatch(/if the phone rings, she picks up/);
    expect(areas?.framing).not.toMatch(/\bonly\b/i);
    expect(areas?.homeTurfLabel).toBe("Home turf — South Florida");
    expect(areas?.counties.map((c) => c.county)).toEqual([
      "Broward County",
      "Miami-Dade County",
      "Palm Beach County",
    ]);
    const byCounty = Object.fromEntries(
      (areas?.counties ?? []).map((c) => [c.county, c.cities]),
    );
    expect(byCounty["Broward County"]).toEqual([
      "Fort Lauderdale",
      "Pompano Beach",
      "Coral Springs",
      "Plantation",
      "Weston",
      "Davie",
      "Hollywood",
      "Deerfield Beach",
      "Lauderdale-by-the-Sea",
    ]);
    expect(byCounty["Miami-Dade County"]).toEqual([
      "Miami",
      "Coral Gables",
      "Aventura",
      "Miami Beach",
      "Doral",
      "Hialeah",
      "Homestead",
    ]);
    expect(byCounty["Palm Beach County"]).toEqual([
      "Boca Raton",
      "Delray Beach",
      "West Palm Beach",
      "Boynton Beach",
      "Jupiter",
      "Palm Beach Gardens",
    ]);
  });

  it("stays honest: visible copy only — no zip codes, no stuffed lists", () => {
    const serialized = JSON.stringify(REALTOR_VERTICAL.serviceAreas);
    // No 5-digit zip codes anywhere in the strip's data.
    expect(serialized).not.toMatch(/\b\d{5}\b/);
    // And the rendered section uses plain visible text — no visually
    // hidden / off-screen / zero-size utility classes in the template.
    const areasAt = templateSource.indexOf("data-agent-service-areas");
    const block = templateSource.slice(areasAt - 200, areasAt + 1800);
    expect(block).not.toMatch(/sr-only|hidden|invisible|opacity-0|text-\[0px\]/);
  });

  it("template renders the strip from data, guarded, before the FAQ", () => {
    expect(templateSource).toContain("{vertical.serviceAreas && (");
    expect(templateSource).toContain("data-agent-service-areas");
    expect(templateSource).toContain("vertical.serviceAreas.counties.map");
    expect(templateSource).toContain("vertical.serviceAreas.heading");
    expect(templateSource).toContain("vertical.serviceAreas.framing");
    expect(templateSource).toContain("vertical.serviceAreas.homeTurfLabel");
    const areasAt = templateSource.indexOf("data-agent-service-areas");
    expect(areasAt).toBeGreaterThan(-1);
    // Placement: after the calendar section, before the FAQ / final CTA.
    expect(areasAt).toBeGreaterThan(
      templateSource.indexOf("Booked straight onto your calendar"),
    );
    expect(areasAt).toBeLessThan(
      templateSource.indexOf("Questions realtors ask us"),
    );
    // Realtors-only: no other vertical carries the field.
    for (const vertical of AGENT_VERTICALS) {
      if (vertical.slug !== "realtors") {
        expect(vertical.serviceAreas).toBeUndefined();
      }
    }
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

  it("cater-to framing, not page-centric (owner-directed 2026-11-12)", () => {
    const only = REALTOR_VERTICAL.faq.find(
      (f) => f.q === "Do you only serve realtors?",
    );
    expect(only?.a).toContain("we cater to realtors");
    expect(only?.a).not.toContain("This page is");
  });

  it("prospects truth for realtors: referral partners, never buyer leads (owner-directed 2026-11-12)", () => {
    const buyers = REALTOR_VERTICAL.faq.find(
      (f) => f.q === "Will you send me buyer leads?",
    );
    expect(buyers).toBeDefined();
    expect(buyers?.a).toMatch(/^No /);
    expect(buyers?.a).toContain("no list of ready home buyers");
    expect(buyers?.a).toContain("referral partners");
    expect(buyers?.a).toContain("mortgage brokers, insurance agents, home inspectors, stagers and contractors");
    expect(buyers?.a).toContain("captured, nurtured leads");
    expect(buyers?.a).toContain("no specific count guaranteed");
    // Services checklist keeps the shared B2B service name; the vertical
    // note + the Premium bullet translate it for realtors, gated in the
    // template on the data fields.
    expect(REALTOR_VERTICAL.prospectsNote).toContain("not buyers");
    expect(REALTOR_VERTICAL.prospectsNote).toContain("referral partners");
    expect(REALTOR_VERTICAL.prospectsNote).toContain("no specific count guaranteed");
    expect(REALTOR_VERTICAL.premiumProspectsBullet).toContain("Referral-partner prospects included");
    expect(REALTOR_VERTICAL.premiumProspectsBullet).toContain("not buyer leads");
    expect(templateSource).toContain("vertical.prospectsNote");
    expect(templateSource).toContain("vertical.premiumProspectsBullet");
    expect(templateSource).toContain("*Up to 50/month — no specific count guaranteed.");
  });
});

describe("realtor landing page — spend-hook package (owner-approved verbatim 2026-11-12)", () => {
  it("hero tagline + subline are the exact approved lines, rendered under the hero sub", () => {
    expect(REALTOR_VERTICAL.heroTagline).toBe(
      "You pay to be found. We make sure you're answered.",
    );
    expect(REALTOR_VERTICAL.heroTaglineSub).toBe(
      "Your bench ad, your billboard, your Zillow Premier profile — they all end at a ringing phone or a website visit. Aspen is there for that moment, 24/7.",
    );
    expect(templateSource).toContain("data-agent-hero-tagline");
    expect(templateSource).toContain("vertical.heroTagline");
    expect(templateSource).toContain("vertical.heroTaglineSub");
    // Placement: under the hero headline/sub, before the demo CTA row.
    const taglineAt = templateSource.indexOf("data-agent-hero-tagline");
    expect(taglineAt).toBeGreaterThan(templateSource.indexOf("vertical.sub"));
    expect(taglineAt).toBeLessThan(
      templateSource.indexOf("Try it free on your own website"),
    );
  });

  it("attention section: heading + the three approved tiles, in order", () => {
    const attention = REALTOR_VERTICAL.attention;
    expect(attention).toBeDefined();
    expect(attention?.heading).toBe("You already bought the attention");
    expect(attention?.tiles.map((t) => t.title)).toEqual([
      "Your farming",
      "Your placement",
      "Your answer",
    ]);
    const tiles = (attention?.tiles ?? [])
      .map((t) => `${t.title} ${t.body}`)
      .join("\n");
    // (a) farming channels
    expect(tiles).toMatch(/Benches, bus sides, billboards, mailers/);
    // (b) placement channels + paying for the top of the list
    expect(tiles).toMatch(/Zillow, Realtor\.com, Google, Facebook/);
    expect(tiles).toMatch(/top of the list/);
    // (c) the answer: seconds, nights, weekends, mid-showing
    expect(tiles).toMatch(/answered in seconds/);
    expect(tiles).toMatch(/nights, weekends, mid-showing/);
    expect(templateSource).toContain("data-agent-attention");
    expect(templateSource).toContain("vertical.attention.heading");
    expect(templateSource).toContain("vertical.attention.tiles.map");
  });

  it("attention section sits between the examples grid and the stats band", () => {
    const gridAt = templateSource.indexOf("data-agent-example-grid");
    const attentionAt = templateSource.indexOf("data-agent-attention");
    const statBarAt = templateSource.indexOf("Stat bar — the verified headline figures");
    expect(gridAt).toBeGreaterThan(-1);
    expect(attentionAt).toBeGreaterThan(gridAt);
    expect(statBarAt).toBeGreaterThan(attentionAt);
  });

  it("the sting is the verified 48% stat, rendered from the stats data with its source", () => {
    expect(templateSource).toContain("attentionStat");
    expect(templateSource).toContain('stat.value === "48%"');
    expect(templateSource).toContain("attentionStat.label");
    expect(templateSource).toContain("attentionStat.source");
    const sting = REALTOR_VERTICAL.stats.find((s) => s.value === "48%");
    expect(sting?.label).toBe("Of buyer inquiries never get a response at all");
    expect(sting?.source).toBe("WAV Group");
  });

  it("social strip is the approved line, framed as an available add-on only", () => {
    expect(REALTOR_VERTICAL.attention?.socialStrip).toBe(
      "Want the funnel fuller? Add social media management — we create, post, and reply for you, so there's more of the right attention for Aspen to answer.",
    );
    expect(templateSource).toContain("vertical.attention.socialStrip");
    expect(templateSource).toContain(
      "Social media management is an available add-on",
    );
  });
});
