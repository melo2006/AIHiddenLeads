// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEO_ROUTES } from "../../scripts/seo-routes.mjs";
import { BRAZIL_EXAMPLES } from "../data/brazilExamplePinnedLeads";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const en = JSON.parse(read("../i18n/locales/en.json"));
const pt = JSON.parse(read("../i18n/locales/pt-BR.json"));

const appSource = read("../App.tsx");
const demoBrSource = read("../pages/DemoBr.tsx");
const tryDemoSource = read("../pages/TryDemo.tsx");

describe("Publish #71 — /demo/br route", () => {
  it("registers /demo/br before the invite-demo slug route", () => {
    const brIdx = appSource.indexOf('<Route path="/demo/br" element={<DemoBr />} />');
    const slugIdx = appSource.indexOf('<Route path="/demo/:slug/:code?"');
    expect(brIdx).toBeGreaterThan(-1);
    expect(slugIdx).toBeGreaterThan(brIdx);
  });

  it("DemoBr forces pt-BR through the same stored pick the LanguageSwitcher writes", () => {
    expect(demoBrSource).toContain('localStorage.setItem("lang", "pt-BR")');
    expect(demoBrSource).toContain('i18n.changeLanguage("pt-BR")');
    // Rendering is gated until pt-BR is active — no English first frame.
    expect(demoBrSource).toContain('if (!ready)');
    expect(demoBrSource).toContain('<TryDemo variant="br" />');
    // The pre-render splash itself is Portuguese (explicit lng override).
    expect(demoBrSource).toContain('t("tryDemo.loadingDemo", { lng: "pt-BR" })');
  });

  it("TryDemo renders the Brazilian examples only on the br variant, above the intake form", () => {
    expect(tryDemoSource).toContain('variant === "br" && <BrazilExamples />');
    const examplesIdx = tryDemoSource.indexOf("<BrazilExamples />");
    const intakeIdx = tryDemoSource.indexOf("<DemoIntakePanel");
    expect(examplesIdx).toBeGreaterThan(-1);
    expect(intakeIdx).toBeGreaterThan(examplesIdx);
    // Publish #73 removed the US examples accordion + US rank grid from
    // BOTH variants (one-screen demo page), so the old `variant !== "br"`
    // gate is gone with them; the Brazil cards above the form are now
    // the br variant's only structural difference.
    expect(tryDemoSource).not.toContain('variant !== "br"');
  });

  it("the sendable link carries a Portuguese prerendered head", () => {
    const head = (SEO_ROUTES as { path: string; title: string; canonical: string }[]).find(
      (r) => r.path === "/demo/br",
    );
    expect(head).toBeDefined();
    expect(head!.canonical).toBe("https://aihiddenleads.com/demo/br");
    expect(head!.title).toContain("Demo ao Vivo");
  });
});

describe("Publish #71 — the six Brazilian examples", () => {
  it("carries exactly the six researched businesses with their verified URLs", () => {
    expect(BRAZIL_EXAMPLES).toHaveLength(6);
    const bySlug = Object.fromEntries(BRAZIL_EXAMPLES.map((e) => [e.slug, e]));
    expect(bySlug["metrica-imoveis"].business).toBe("Métrica Negócios Imobiliários");
    expect(bySlug["metrica-imoveis"].url).toBe("https://www.metricaimoveis.com.br");
    expect(bySlug["rabelo-sena"].business).toBe("Rabelo & Sena Ortodontia");
    expect(bySlug["rabelo-sena"].url).toBe("https://rabeloesenaortodontia.com.br/");
    expect(bySlug["lgomes-advogados"].business).toBe("LGomes Advogados");
    expect(bySlug["lgomes-advogados"].url).toBe("http://www.lgomesadvogados.com/");
    expect(bySlug["ufit-academia"].business).toBe("UFit Academia");
    expect(bySlug["ufit-academia"].url).toBe("https://ufitacademia.com.br/unidade/ufit-corrego-grande/");
    expect(bySlug["acele-idiomas"].business).toBe("Acele Escola de Idiomas");
    expect(bySlug["acele-idiomas"].url).toBe("https://www.acele.com.br/");
    expect(bySlug["marrom-motors"].business).toBe("Marrom Motors");
    expect(bySlug["marrom-motors"].url).toBe("https://marrommotors.com.br/");
    for (const e of BRAZIL_EXAMPLES) {
      expect(e.city).toBeTruthy();
      expect(pt.tryDemo.brTypes[e.typeKey]).toBeTruthy();
    }
  });
});

describe("Publish #71 — pt-BR catalog completeness for the demo flow", () => {
  // Values that are legitimately identical in Brazilian Portuguese
  // (Google Maps' product name is "Maps" in pt-BR too).
  const IDENTICAL_OK = new Set(["rankAudit.liveMaps"]);
  const NAMESPACES = [
    "intake",
    "consent",
    "demoSite",
    "gate",
    "card",
    "panel",
    "frame",
    "rankAudit",
    "geoGrid",
    "showcase",
  ] as const;

  for (const ns of NAMESPACES) {
    it(`${ns}.* exists in pt-BR, non-empty and translated`, () => {
      const enKeys = Object.keys(en[ns] ?? {});
      expect(enKeys.length).toBeGreaterThan(0);
      for (const key of enKeys) {
        const value = pt[ns]?.[key];
        expect(value, `${ns}.${key} missing in pt-BR`).toBeTruthy();
        if (!IDENTICAL_OK.has(`${ns}.${key}`)) {
          expect(value, `${ns}.${key} is still the English string`).not.toBe(en[ns][key]);
        }
      }
    });
  }

  it("the scan/build animation catalog is complete in pt-BR (Portuguese from frame one)", () => {
    const enKeys = Object.keys(en.scan ?? {});
    expect(enKeys.length).toBeGreaterThan(0);
    for (const key of enKeys) {
      expect(pt.scan?.[key], `scan.${key} missing in pt-BR`).toBeTruthy();
    }
  });

  it("the tryDemo additions the BR page renders exist in pt-BR", () => {
    for (const key of [
      "back",
      "home",
      "backToHome",
      "resumeTitle",
      "resumeBody",
      "resumeContinue",
      "resumeDismiss",
      "examplesDisclaimer",
      "aspenPortraitAlt",
      "brExamplesTitle",
      "brExamplesHint",
      "brVisitorName",
      "reassuranceAria",
    ]) {
      expect(pt.tryDemo?.[key], `tryDemo.${key} missing in pt-BR`).toBeTruthy();
    }
    for (const typeKey of ["realEstate", "dental", "law", "gym", "languageSchool", "autoRepair"]) {
      expect(pt.tryDemo?.brTypes?.[typeKey], `tryDemo.brTypes.${typeKey} missing`).toBeTruthy();
    }
  });

  it("no fabricated social proof rides the Portuguese page", () => {
    // The pre-#71 pt-BR (and es) catalog claimed "500+ local businesses"
    // trust the product; AiHiddenLeads has no such customer base. The
    // English source line is the honest one and the translations now
    // match it.
    expect(en.tryDemo.trusted).toBe("Try it before choosing a plan");
    expect(pt.tryDemo.trusted).toBe("Experimente antes de escolher um plano");
    expect(pt.tryDemo.trusted).not.toMatch(/500/);
  });
});
