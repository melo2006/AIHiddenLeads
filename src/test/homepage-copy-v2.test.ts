// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { homepageSalesCopy } from "@/data/homepageSalesCopy";
import { SERVICE_DETAILS } from "@/data/serviceDetails";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const servicesGridSource = read("../components/landing/ServicesGrid.tsx");
const heroSource = read("../components/landing/HeroSection.tsx");

const en = homepageSalesCopy("en");
const es = homepageSalesCopy("es");
const pt = homepageSalesCopy("pt-BR");

test("hero badge is the approved three-beat line in every locale", () => {
  expect(en.badge).toBe(
    "A live video avatar on your website — not just a voice · Never miss a call — or a lead — again · Find the leads you're already losing",
  );
  for (const badge of [en.badge, es.badge, pt.badge]) {
    expect(badge.split("·")).toHaveLength(3);
    expect(badge).not.toContain("More lead opportunities");
    expect(badge).not.toContain("Phone inquiries");
  }
});

test("the rotating hero headlines are untouched by the badge change", () => {
  expect(heroSource).toContain("HeroRotatingHeadline");
  expect(heroSource).toContain("{copy.badge}");
});

test("services section title, intro and closing line carry the approved v2 copy", () => {
  expect(en.title).toBe("We find the leads you're already losing — and bring you new ones.");
  expect(en.description).toContain("Get answered. Get found. Get chosen.");
  expect(en.description).toContain("growth partner");
  expect(en.servicesClosing).toContain("$99/mo");
  expect(en.servicesClosing).toContain("50% off your first 3 months");
  expect(en.servicesClosing).toContain("no more hidden leads");
  for (const copy of [es, pt]) {
    expect(copy.title.length).toBeGreaterThan(10);
    expect(copy.servicesClosing).toContain("99");
    expect(copy.servicesClosing).toContain("50%");
  }
});

test("the eight services lead, in order, in the copy data and the details", () => {
  // 2026-11-11: "Social Media, Handled" split in two — social keeps
  // content creation + publishing; the new "comments" entry carries
  // reading + responding to comments and reviews (7 -> 8, grid 4+4).
  const approvedIds = ["video", "voice", "leads", "search", "reputation", "social", "comments", "website"];
  for (const copy of [en, es, pt]) {
    expect(copy.services.map((s) => s.id)).toEqual(approvedIds);
    for (const service of copy.services) {
      expect(service.problem, `${service.id} problem`).toBeTruthy();
      expect(service.solution, `${service.id} solution`).toBeTruthy();
    }
  }
  expect(en.services.find((s) => s.id === "comments")?.name).toBe("Comments & Reviews, Answered");
  expect(en.services.find((s) => s.id === "social")?.name).toBe("Social Media, Handled");
  // The split is real: social no longer claims replying/responding.
  const social = en.services.find((s) => s.id === "social");
  expect(`${social?.problem} ${social?.solution}`).not.toMatch(/replying|responds|automate replies/i);
  const comments = en.services.find((s) => s.id === "comments");
  expect(comments?.solution).toMatch(/reads and responds to comments and reviews/);
  expect(comments?.solution).toMatch(/Google reviews/);
  // Details order: the canonical eight detail cards, with the retained "b2c"
  // entry after "leads".
  // The two receptionist entries keep their pre-v2 order (phone "voice" first): the
  // services grid renders the canonical details order, while the hero name list
  // follows the approved video-first copy order pinned above.
  expect(SERVICE_DETAILS.map((s) => s.id)).toEqual(["voice", "video", "leads", "b2c", "search", "reputation", "social", "website"]);
  expect(SERVICE_DETAILS[1].name).toBe("Live Video Receptionist on Your Website");
  expect(SERVICE_DETAILS[0].name).toBe("AI Phone Receptionist — No Website Needed");
  for (const detail of SERVICE_DETAILS) {
    expect(detail.problem.length, detail.id).toBeGreaterThan(10);
    expect(detail.solution.length, detail.id).toBeGreaterThan(10);
  }
});

test("phone card uses the approved softened 85% framing", () => {
  const phone = SERVICE_DETAILS.find((s) => s.id === "voice");
  expect(phone?.problem).toBe(
    "85% of callers who hit voicemail don't call back — most move on to the next name on the list.",
  );
});

test("standing pricing rules hold across the new copy", () => {
  const surfaces = [
    en.badge, en.title, en.description, en.servicesClosing,
    ...en.services.flatMap((s) => [s.name, s.scope, s.problem ?? "", s.solution ?? "", ...s.benefits]),
    ...SERVICE_DETAILS.flatMap((s) => [s.name, s.problem, s.today, s.solution, ...s.details]),
  ].join("\n");
  expect(surfaces).not.toContain("$99 + $79");
  expect(surfaces).not.toContain("99 + 79");
  expect(surfaces).not.toMatch(/the only one/i);
  expect(surfaces).not.toMatch(/november|nov 30|december 31/i);
  expect(surfaces).toContain("up to 50 fresh B2B prospects");
  expect(en.services.find((s) => s.id === "leads")?.scope).toContain("Up to 50");
});

test("ServicesGrid renders the v2 structure in both locale branches", () => {
  // English cards render the details-led problem → solution structure…
  expect(servicesGridSource).toContain("SERVICE_DETAILS.map");
  expect(servicesGridSource).toContain("{s.problem}");
  expect(servicesGridSource).toContain("{s.solution}");
  // …and localized cards now render the same structure from the copy data.
  expect(servicesGridSource).toContain("{service.problem}");
  expect(servicesGridSource).toContain("{service.solution}");
  expect(servicesGridSource).toContain("{copy.title}");
  expect(servicesGridSource).toContain("{copy.description}");
  expect(servicesGridSource).toContain("{copy.servicesClosing}");
});
