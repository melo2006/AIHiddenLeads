// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectContentLanguage } from "../../supabase/functions/_shared/content-language";
import {
  LANGUAGE_LOCK,
  languageLockFor,
  resolveDemoStartLocale,
} from "../../supabase/functions/_shared/conversation-language";
import {
  LOCALE_VOICE_SETS,
  PERSONA_LOCALE_VOICES,
  VOICE_GENDERS,
  voiceForLocaleSession,
} from "../../supabase/functions/_shared/locale-voices";
import { VOICES } from "../../supabase/functions/_shared/voice-config";
import { PERSONAS } from "../../supabase/functions/_shared/personas";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const scanWebsite = read("../../supabase/functions/scan-website/index.ts");
const geminiSession = read("../../supabase/functions/gemini-session/index.ts");
const demoSite = read("../pages/DemoSite.tsx");
const scanningAnimation = read("../components/landing/ScanningAnimation.tsx");
const migration = read("../../supabase/migrations/20261115120000_leads_website_language.sql");

// Real captured homepage text (fetched 2026-11-15): Lopes, Brazil's
// largest real-estate brokerage (pt-BR); Compass (en); gob.mx (es).
const lopesText = read("./fixtures/site-lopes-com-br.txt");
const compassText = read("./fixtures/site-compass-com.txt");
const gobMxText = read("./fixtures/site-gob-mx.txt");

/**
 * Publish #66 guards for Ron's 2026-11-15 direction: a demo runs in the
 * language the visitor's OWN website is published in when the visitor
 * made no explicit language-switch pick — priority explicit pick >
 * detected site language > English — and Portuguese is ALWAYS Brazilian
 * (pt-BR), never European.
 */
describe("Publish #66 — detected site language drives the demo", () => {
  describe("content-language detector", () => {
    it("classifies a real Brazilian business site as pt-BR", () => {
      expect(lopesText.length).toBeGreaterThan(2000);
      expect(detectContentLanguage(lopesText)).toBe("pt-BR");
    });

    it("classifies a real English business site as en", () => {
      expect(detectContentLanguage(compassText)).toBe("en");
    });

    it("classifies a real Spanish site as es", () => {
      expect(detectContentLanguage(gobMxText)).toBe("es");
    });

    it("classifies European Portuguese text as pt-BR — never pt-PT", () => {
      const europeanPortuguese =
        "Bem-vindo à nossa agência imobiliária em Lisboa. Temos apartamentos para arrendamento e venda em todo o país. " +
        "O telemóvel é a forma mais rápida de nos contactar. Estamos a trabalhar para si desde 1998, com escritórios no Porto e em Coimbra. " +
        "Consulte o nosso ecrã de oportunidades, casas de banho renovadas, e fale com a nossa equipa para mais informações sobre cada imóvel disponível na nossa página. Obrigado pela sua visita.";
      expect(detectContentLanguage(europeanPortuguese)).toBe("pt-BR");
    });

    it("stays pt-BR when an English cookie banner rides on top of a Brazilian site", () => {
      const cookieBanner =
        "We use cookies to improve your experience. By clicking Accept All you agree to our privacy policy and terms of service. ";
      expect(detectContentLanguage(cookieBanner + lopesText)).toBe("pt-BR");
    });

    it("returns null for thin or empty samples instead of guessing", () => {
      expect(detectContentLanguage("")).toBeNull();
      expect(detectContentLanguage("Bem-vindo")).toBeNull();
      expect(detectContentLanguage(null)).toBeNull();
      expect(detectContentLanguage(undefined)).toBeNull();
      expect(detectContentLanguage(42)).toBeNull();
    });

    it("returns null when the sample is too mixed to trust", () => {
      const mixed =
        "Welcome to our real estate agency, the best homes for sale and rent in the city, contact our team today for more information about your new home and our services. " +
        "Bem-vindo à nossa imobiliária, os melhores imóveis para venda e aluguel na cidade, entre em contato com nossa equipe hoje para mais informações sobre sua nova casa e nossos serviços.";
      expect(detectContentLanguage(mixed)).toBeNull();
    });
  });

  describe("demo start locale priority", () => {
    it("explicit pick beats the detected site language — in both directions", () => {
      expect(resolveDemoStartLocale("es", "pt-BR")).toEqual({ locale: "es", source: "explicit" });
      expect(resolveDemoStartLocale("pt-BR", "es")).toEqual({ locale: "pt-BR", source: "explicit" });
      expect(resolveDemoStartLocale("en", "pt-BR")).toEqual({ locale: "en", source: "explicit" });
    });

    it("detected language applies when there is no pick", () => {
      expect(resolveDemoStartLocale(undefined, "pt-BR")).toEqual({ locale: "pt-BR", source: "detected" });
      expect(resolveDemoStartLocale(null, "es")).toEqual({ locale: "es", source: "detected" });
      expect(resolveDemoStartLocale("", "pt")).toEqual({ locale: "pt-BR", source: "detected" });
    });

    it("a detected English site stamps nothing (English is the default)", () => {
      expect(resolveDemoStartLocale(undefined, "en")).toBeNull();
      expect(resolveDemoStartLocale(undefined, null)).toBeNull();
      expect(resolveDemoStartLocale(undefined, undefined)).toBeNull();
    });

    it("never trusts an unsupported stored value", () => {
      expect(resolveDemoStartLocale(undefined, "pt-PT")).toBeNull();
      expect(resolveDemoStartLocale(undefined, "fr")).toBeNull();
      expect(resolveDemoStartLocale(undefined, "Portuguese")).toBeNull();
    });
  });

  describe("language lock wording stays honest about the source", () => {
    it("the detected lock never claims a language-switch selection", () => {
      const lock = languageLockFor("Portuguese", "detected");
      expect(lock).toContain("starts as Portuguese");
      expect(lock).toContain("published in Portuguese");
      expect(lock).not.toContain("explicitly selected Portuguese with this website's language switch");
      expect(lock).toContain("speak Portuguese only");
    });

    it("the selected lock and the English lock are unchanged", () => {
      expect(languageLockFor("Portuguese")).toContain(
        "the visitor explicitly selected Portuguese with this website's language switch",
      );
      expect(languageLockFor("Portuguese", "selected")).toBe(languageLockFor("Portuguese"));
      expect(languageLockFor("English")).toBe(LANGUAGE_LOCK);
      expect(languageLockFor("English", "detected")).toBe(LANGUAGE_LOCK);
    });
  });

  describe("per-language persona voices", () => {
    it("maps every demo persona into the pt-BR and es sets, gender-consistent", () => {
      for (const [personaId, byLocale] of Object.entries(PERSONA_LOCALE_VOICES)) {
        const persona = PERSONAS[personaId as keyof typeof PERSONAS];
        expect(persona, personaId).toBeTruthy();
        const gender = VOICE_GENDERS[persona.voiceName];
        for (const locale of ["pt-BR", "es"] as const) {
          const mapped = byLocale[locale];
          expect(mapped, `${personaId}/${locale}`).toBeTruthy();
          expect((VOICES as readonly string[]).includes(mapped!)).toBe(true);
          expect(LOCALE_VOICE_SETS[locale][gender]).toContain(mapped);
        }
      }
    });

    it("gives the headline personas their Brazilian voices", () => {
      expect(voiceForLocaleSession("Kore", "aspen", "pt-BR")).toBe("Despina");
      expect(voiceForLocaleSession("Leda", "sara", "pt-BR")).toBe("Zephyr");
      expect(voiceForLocaleSession("Puck", "alex", "pt-BR")).toBe("Fenrir");
      expect(voiceForLocaleSession("Schedar", "frank", "pt-BR")).toBe("Alnilam");
      expect(voiceForLocaleSession("Sulafat", "latina", "pt-BR")).toBe("Callirrhoe");
      expect(voiceForLocaleSession("Despina", "black-professional-lady", "pt-BR")).toBe("Despina");
    });

    it("keeps a voice that already belongs to the locale set", () => {
      expect(voiceForLocaleSession("Kore", "aspen", "es")).toBe("Kore");
      expect(voiceForLocaleSession("Sulafat", "latina", "es")).toBe("Sulafat");
      // An admin override already inside the set survives the remap.
      expect(voiceForLocaleSession("Callirrhoe", "aspen", "pt-BR")).toBe("Callirrhoe");
    });

    it("falls back to a same-gender set voice for unmapped personas/voices", () => {
      const fallback = voiceForLocaleSession("Schedar", "executive", "pt-BR");
      expect(LOCALE_VOICE_SETS["pt-BR"].male).toContain(fallback);
      const fallbackEs = voiceForLocaleSession("Leda", undefined, "es");
      expect(LOCALE_VOICE_SETS.es.female).toContain(fallbackEs);
    });

    it("never remaps English sessions", () => {
      expect(voiceForLocaleSession("Kore", "aspen", "en")).toBe("Kore");
      expect(voiceForLocaleSession("Kore", "aspen", null)).toBe("Kore");
      expect(voiceForLocaleSession("Kore", "aspen", undefined)).toBe("Kore");
    });
  });

  describe("wiring pins", () => {
    it("scan-website detects and stores the language twice, best-effort", () => {
      expect(scanWebsite).toContain("detectContentLanguage");
      expect(scanWebsite).toContain("website_language: earlyDetectedLanguage");
      expect(scanWebsite).toContain("website_language: detectedLanguage");
      expect(scanWebsite).toContain("column may not be applied yet");
    });

    it("the migration adds the column and returns it from get_demo_lead, last", () => {
      expect(migration).toContain("ADD COLUMN IF NOT EXISTS website_language text");
      const returnsTail = migration.slice(migration.indexOf("RETURNS TABLE"));
      expect(returnsTail.indexOf("website_language")).toBeGreaterThan(
        returnsTail.indexOf("consent_banner_dismissed"),
      );
    });

    it("gemini-session resolves the detected start below the explicit pick", () => {
      expect(geminiSession).toContain("resolveDemoStartLocale(b.locale, leadWebsiteLanguage)");
      expect(geminiSession).toContain("languageSource: 'detected'");
      expect(geminiSession).toContain("voiceForLocaleSession");
      // The lead's language is read in its OWN fail-safe query, never in
      // the main lead select (a missing column must not break demos).
      expect(geminiSession).toContain("select('website_language')");
      expect(geminiSession).not.toContain("invite_arrived_at,website_language");
    });

    it("the demo page threads the detected language to the loading messages and the chat", () => {
      expect(demoSite).toContain("website_language: string | null");
      expect(demoSite).toContain("websiteLanguage: record.website_language || current.websiteLanguage");
      expect(demoSite).toContain("!explicitUiLocale() ? normalizeUiLocale(leadData.websiteLanguage) : null");
      expect(demoSite).toContain("detectedSiteLanguage={detectedSiteLocale ?? undefined}");
      expect(scanningAnimation).toContain("lng: language");
    });
  });
});
