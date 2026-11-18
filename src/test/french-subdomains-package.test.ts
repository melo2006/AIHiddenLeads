// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fr from "../i18n/locales/fr.json";
import en from "../i18n/locales/en.json";
import {
  normalizeUiLocale as normalizeUiLocaleClient,
  uiLocaleLanguage,
} from "../lib/uiLocale";
import { parseTenantSlug } from "../lib/tenantHost";
import { resolveTenantBrand } from "../lib/clients";
import {
  languageLockFor,
  normalizeUiLocale,
  requestedConversationLanguage,
  startingLanguageForUiLocale,
  SUPPORTED_UI_LOCALES,
} from "../../supabase/functions/_shared/conversation-language";
import { detectContentLanguage } from "../../supabase/functions/_shared/content-language";
import {
  CATALOG_LANGUAGES,
  LANGUAGE_LABELS,
  normalizeCatalogSelection,
} from "../../supabase/functions/_shared/catalog-selection";
import { voiceForLocaleSession } from "../../supabase/functions/_shared/locale-voices";
import {
  briefingLanguageFrom,
  briefingSayLanguage,
  handoffConnectingLine,
  handoffStayLine,
  managerBriefingText,
} from "../../supabase/functions/_shared/handoff-briefing-voice";
import {
  phoneConnectLine,
  phoneFollowUpLine,
  phoneLanguageFromSignal,
  phoneTransferTarget,
  phoneTransferUnavailableLine,
  phoneWhisperText,
} from "../../supabase/functions/_shared/telephony-transfer-lines";
import {
  isReservedSubdomain,
  normalizeSubdomain,
  validateSubdomain,
} from "../../supabase/functions/_shared/tenancy";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const quebecSite = read("./fixtures/site-quebec-fr.txt");
const voiceAgents = read("../../supabase/functions/voice-agents/index.ts");
const switcher = read("../components/LanguageSwitcher.tsx");

/**
 * French (fr-CA) + reseller subdomains package (design §12 items 2 + 6,
 * 2026-11-18). French is a full site language: switcher pick or a
 * French browser lands in fr-CA, gemini-session stamps French, and the
 * persona's own Gemini voice speaks it (no separate French voice set —
 * Gemini Live voices are multilingual and none has been ear-tested for
 * French, so no remap is invented). Phone sessions still START in
 * English; the French transfer/briefing lines exist for sessions that
 * are already in French. Subdomains resolve a reseller's PUBLIC brand
 * only — the pre-auth peek's exposure is pinned below.
 */
describe("French package — locale plumbing", () => {
  it("fr-CA is a supported UI locale on both sides of the wire", () => {
    expect(SUPPORTED_UI_LOCALES).toContain("fr-CA");
    expect(normalizeUiLocale("fr")).toBe("fr-CA");
    expect(normalizeUiLocale("fr-CA")).toBe("fr-CA");
    // Server validation is strict-canonical, exactly like pt: a raw
    // regional tag is not a validated locale — the CLIENT canonicalizes
    // fr* → fr-CA before anything is sent (see ui-locale-initial tests).
    expect(normalizeUiLocale("fr-FR")).toBeNull();
    expect(normalizeUiLocaleClient("fr")).toBe("fr-CA");
    expect(uiLocaleLanguage("fr-CA")).toBe("French");
  });

  it("a French session starts in French with a French language lock", () => {
    expect(startingLanguageForUiLocale("fr-CA")).toBe("French");
    const lock = languageLockFor("French");
    expect(lock).toContain("MANDATORY LANGUAGE LOCK");
    expect(lock).toContain("starts as French");
  });

  it("an in-session request to switch to French is recognized", () => {
    // The recognizer is verb-driven and language-list based (the same
    // grammar every language uses): English direction verbs, or the
    // target language's own imperative / first-person forms.
    expect(requestedConversationLanguage("Can we switch to French please?")).toBe("French");
    expect(requestedConversationLanguage("Parlez français, s'il vous plaît")).toBe("French");
    expect(requestedConversationLanguage("Je parle français")).toBe("French");
  });

  it("the persona voice is NOT remapped for French (documented decision)", () => {
    // es/pt-BR sessions may remap to an ear-tested voice; French keeps
    // the persona's own voice because Gemini Live voices are
    // multilingual and no French set has been curated yet.
    expect(voiceForLocaleSession("Kore", "aspen", "fr-CA")).toBe("Kore");
    expect(voiceForLocaleSession("Charon", "frank", "fr-CA")).toBe("Charon");
  });

  it("the language switcher offers Français (Canada)", () => {
    expect(switcher).toContain('"fr-CA"');
    // Menu names render from the locale files' lang.* endonyms.
    expect(switcher).toContain("lang.${lang.code}");
    expect((fr as unknown as { lang: Record<string, string> }).lang["fr-CA"]).toBe("Français (Canada)");
  });

  it("French is a selectable agent/catalog language, labelled by endonym", () => {
    expect(CATALOG_LANGUAGES).toContain("fr-CA");
    expect(LANGUAGE_LABELS["fr-CA"]).toBe("Français (Canada)");
    const sel = normalizeCatalogSelection({ languages: ["fr-CA", "en"] });
    expect(sel.languages).toContain("fr-CA");
    expect(sel.languages).toContain("en");
  });
});

describe("French package — content detection and spoken lines", () => {
  it("detects a Québec French business site as fr-CA", () => {
    expect(quebecSite.length).toBeGreaterThan(200);
    expect(detectContentLanguage(quebecSite)).toBe("fr-CA");
  });

  it("detects a short French paragraph as fr-CA", () => {
    expect(
      detectContentLanguage(
        "Bienvenue chez nous, et merci de votre visite. Nous sommes une entreprise d'ici, au Québec, et nous aidons votre entreprise à grandir avec des solutions pour vos clients. Découvrez nos forfaits pour votre accueil téléphonique et votre boîte vocale. Écrivez-nous par courriel dès aujourd'hui : nous serons heureux de vous aider, chez vous comme chez nous, avec votre projet. Tous droits réservés — politique de confidentialité.",
      ),
    ).toBe("fr-CA");
  });

  it("handoff briefing resolves French and speaks fr-CA", () => {
    expect(briefingLanguageFrom({ uiLocale: "fr-CA" })).toBe("fr");
    expect(briefingLanguageFrom({ startLanguage: "French" })).toBe("fr");
    expect(briefingSayLanguage("fr")).toBe("fr-CA");
    const text = managerBriefingText({ summary: "Le visiteur veut un prix." }, "fr");
    expect(text).toContain("Bonjour");
    expect(text).toContain("transfert automatique");
    expect(text).toContain("Le visiteur veut un prix.");
    expect(handoffStayLine("fr")).toContain("rester en ligne");
    expect(handoffConnectingLine("fr")).toContain("connecte");
  });

  it("telephony transfer lines exist in French for in-French sessions", () => {
    expect(phoneLanguageFromSignal("fr-CA")).toBe("fr");
    expect(phoneLanguageFromSignal("french")).toBe("fr");
    expect(phoneTransferTarget({ platformSales: true }, "fr")).toBe("notre directeur des ventes");
    expect(phoneTransferTarget({}, "fr")).toBe("le gérant");
    expect(phoneConnectLine("le gérant", "fr")).toContain("Je vous connecte avec le gérant");
    expect(phoneWhisperText("Le visiteur veut un devis.", "fr")).toContain("Transfert d'Aspen");
    expect(phoneWhisperText("", "fr")).toContain("Une personne qui a appelé");
    expect(phoneTransferUnavailableLine("le gérant", "fr")).toContain("pas disponible");
    expect(phoneFollowUpLine("fr")).toContain("recontactera");
  });

  it("phone sessions still start English — no locale leaks into the phone default", () => {
    expect(phoneLanguageFromSignal(undefined)).toBe("en");
    expect(phoneLanguageFromSignal("")).toBe("en");
    expect(phoneTransferTarget({ platformSales: true }, "en")).toBe("our sales director");
  });
});

describe("French package — no English leftovers on the checked surfaces", () => {
  const frAny = fr as unknown as Record<string, Record<string, unknown>>;
  const enAny = en as unknown as Record<string, Record<string, unknown>>;
  const get = (root: Record<string, Record<string, unknown>>, path: string) =>
    path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], root);

  it("high-traffic strings are actually French, not copied English", () => {
    const paths = [
      "nav.pricing", "nav.faq", "nav.getFreeDemo", "nav.howItWorks",
      "hero.ctaPrimary", "hero.askAspen", "cta.tryWebsite", "cta.bookCall", "cta.startNow",
      "scan.readyTitle", "scan.eyebrow", "footer.privacy", "footer.rights", "landing.available", "landing.getStarted",
    ];
    for (const p of paths) {
      const frVal = get(frAny, p);
      const enVal = get(enAny, p);
      expect(typeof frVal, p).toBe("string");
      expect(frVal, p).not.toBe(enVal);
    }
    expect(get(frAny, "cta.tryWebsite")).toBe("Essayez votre site Web");
    expect(get(frAny, "footer.rights")).toBe("Tous droits réservés.");
    expect(get(frAny, "lang.fr-CA")).toBe("Français (Canada)");
  });

  it("the rotating scan-wait cards are translated", () => {
    const benefits = get(frAny, "scan.benefits") as Record<string, { headline: string; body: string }>;
    const enBenefits = get(enAny, "scan.benefits") as Record<string, { headline: string }>;
    for (const key of ["videoAvatar", "conversation", "dashboard", "appointments", "warmTransfer", "readyFast"]) {
      expect(benefits[key]?.headline, key).toBeTruthy();
      expect(benefits[key]?.body, key).toBeTruthy();
      expect(benefits[key].headline, key).not.toBe(enBenefits[key].headline);
    }
  });
});

describe("Subdomains — validation", () => {
  // validateSubdomain returns { subdomain } on success, { error } with
  // a human reason on failure (the shape voice-agents consumes).
  const errOf = (v: string) => {
    const r = validateSubdomain(v) as { error?: string };
    return r.error ?? null;
  };

  it("accepts ordinary slugs and normalizes case/space", () => {
    expect(normalizeSubdomain("  NorthPeak ")).toBe("northpeak");
    expect(validateSubdomain("northpeak")).toEqual({ subdomain: "northpeak" });
    expect(validateSubdomain("north-peak-2")).toEqual({ subdomain: "north-peak-2" });
    expect(validateSubdomain("b2technologia")).toEqual({ subdomain: "b2technologia" });
    expect(validateSubdomain(" NorthPeak ")).toEqual({ subdomain: "northpeak" });
  });

  it("blocks every reserved name", () => {
    for (const r of ["www", "stage", "voice-proxy", "app", "api", "mail", "demo", "admin", "support", "aihiddenleads"]) {
      expect(isReservedSubdomain(r), r).toBe(true);
      expect(errOf(r), r).toMatch(/reserved/);
    }
    expect(errOf("WWW")).toMatch(/reserved/);
  });

  it("rejects malformed slugs with a reason", () => {
    expect(errOf("")).toMatch(/required/);
    expect(errOf("ab")).toMatch(/at least/);
    expect(errOf("a".repeat(41))).toMatch(/40 characters or fewer/);
    expect(errOf("-lead")).toMatch(/lowercase/);
    expect(errOf("trail-")).toMatch(/lowercase/);
    expect(errOf("two--hyphens")).toMatch(/lowercase/);
    expect(errOf("under_score")).toMatch(/lowercase/);
    expect(errOf("dot.name")).toMatch(/lowercase/);
  });
});

describe("Subdomains — hostname resolution", () => {
  it("resolves a tenant slug host", () => {
    expect(parseTenantSlug("northpeak.aihiddenleads.com")).toBe("northpeak");
    expect(parseTenantSlug("NorthPeak.AIHiddenLeads.com")).toBe("northpeak");
    expect(parseTenantSlug("northpeak.aihiddenleads.com:443")).toBe("northpeak");
  });

  it("never resolves platform hosts, stage, or foreign hosts", () => {
    expect(parseTenantSlug("aihiddenleads.com")).toBeNull();
    expect(parseTenantSlug("www.aihiddenleads.com")).toBeNull();
    expect(parseTenantSlug("stage.aihiddenleads.com")).toBeNull();
    expect(parseTenantSlug("voice-proxy.aihiddenleads.com")).toBeNull();
    expect(parseTenantSlug("localhost")).toBeNull();
    expect(parseTenantSlug("localhost:5173")).toBeNull();
    expect(parseTenantSlug("northpeak.example.com")).toBeNull();
    expect(parseTenantSlug("127.0.0.1")).toBeNull();
  });

  it("rejects multi-label and malformed subdomains", () => {
    expect(parseTenantSlug("a.b.aihiddenleads.com")).toBeNull();
    expect(parseTenantSlug("bad_slug.aihiddenleads.com")).toBeNull();
    expect(parseTenantSlug("ab.aihiddenleads.com")).toBeNull();
    expect(parseTenantSlug("")).toBeNull();
    expect(parseTenantSlug(undefined)).toBeNull();
  });
});

describe("Subdomains — public branding exposure", () => {
  it("resolveTenantBrand takes over on the company name alone", () => {
    // Claiming the subdomain IS the branding act: a reseller with a
    // name but no logo yet still gets his lockup (initials chip).
    const brand = resolveTenantBrand({ name: "NorthPeak Partners", logoUrl: null, slogan: null, supportEmail: null, brandColor: null });
    expect(brand.source).toBe("org");
    if (brand.source === "org") expect(brand.name).toBe("NorthPeak Partners");
    expect(resolveTenantBrand(null).source).toBe("platform");
    expect(resolveTenantBrand({ name: "  ", logoUrl: null, slogan: null, supportEmail: null, brandColor: null }).source).toBe("platform");
  });

  it("the pre-auth peek returns ONLY the five public brand fields", () => {
    const start = voiceAgents.indexOf("action==='tenantBranding'");
    expect(start).toBeGreaterThan(-1);
    const end = voiceAgents.indexOf("action==='invitePreview'", start);
    expect(end).toBeGreaterThan(start);
    // Comments in the block explain the rule in prose (they name the
    // things that must NOT leak); the pin applies to the code itself.
    const block = voiceAgents.slice(start, end).replace(/\/\/[^\n]*/g, "");
    // The row read is limited to public columns…
    expect(block).toContain("'name,logo_url,slogan,support_email,brand_color,status,type'");
    // …the response carries exactly the public brand shape…
    for (const key of ["name:", "logoUrl:", "slogan:", "supportEmail:", "brandColor:"]) {
      expect(block, key).toContain(key);
    }
    // …and nothing tenant-internal can ride along.
    for (const banned of ["rate_card", "rateCard", "feature_limits", "markup", "demo_profile", "parent_organization_id", "organization_id", "membership"]) {
      expect(block.includes(banned), banned).toBe(false);
    }
  });

  it("setSubdomain is reseller-only and claim-once for non-admins (source pin)", () => {
    const start = voiceAgents.indexOf("action==='setSubdomain'");
    expect(start).toBeGreaterThan(-1);
    const block = voiceAgents.slice(start, start + 4200);
    expect(block).toContain("(org.type || 'client')!=='reseller'");
    expect(block).toContain("already set — contact support to change it");
    expect(block).toContain("validateSubdomain");
    expect(block).toContain("already taken");
  });
});
