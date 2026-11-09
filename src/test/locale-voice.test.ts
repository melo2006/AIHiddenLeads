// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";
import {
  LANGUAGE_LOCK,
  languageLockFor,
  normalizeUiLocale,
  requestedConversationLanguage,
  startingLanguageForUiLocale,
  SUPPORTED_UI_LOCALES,
} from "../../supabase/functions/_shared/conversation-language";
import {
  LANGUAGE_POLICY,
  languagePolicyFor,
  resumeInstruction,
} from "../../supabase/functions/_shared/voice-config";
import { openingText } from "../../supabase/functions/_shared/session-opening";
import {
  explicitUiLocale,
  normalizeUiLocale as normalizeClientUiLocale,
  uiLocaleLanguage,
} from "../lib/uiLocale";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const geminiSession = read("../../supabase/functions/gemini-session/index.ts");
const proxy = read("../../supabase/functions/gemini-live-proxy/index.ts");
const telephonyStream = read("../../supabase/functions/telephony-stream/index.ts");
const telephonyVoice = read("../../supabase/functions/telephony-voice/index.ts");
const conversation = read("../components/GeminiConversation.tsx");
const chatWidget = read("../components/landing/demo-results/ChatWidget.tsx");
const chatFn = read("../../supabase/functions/retell-web-call/index.ts");

/**
 * Guards for Ron's 2026-11-09 decision: WEBSITE sessions start in the
 * language the visitor explicitly picked with the site's language switch
 * (voice, greeting, chat panel, chat replies). The phone path keeps the
 * English start. Mid-conversation switches still require an explicit
 * transcribed request, in either direction. Detection never authorizes.
 */
describe("locale → voice (Ron, 2026-11-09)", () => {
  it("validates the UI locale against the supported set only", () => {
    expect([...SUPPORTED_UI_LOCALES]).toEqual(["en", "es", "pt-BR"]);
    expect(normalizeUiLocale("en")).toBe("en");
    expect(normalizeUiLocale("es")).toBe("es");
    expect(normalizeUiLocale("pt-BR")).toBe("pt-BR");
    expect(normalizeUiLocale("pt")).toBe("pt-BR"); // i18n alias
    for (const bad of ["fr", "de", "en-US", "pt-PT", "", "EN", null, undefined, 42, {}]) {
      expect(normalizeUiLocale(bad)).toBeNull();
    }
    // The client helper mirrors the server rule exactly.
    for (const v of ["en", "es", "pt-BR", "pt", "fr", "", null]) {
      expect(normalizeClientUiLocale(v)).toBe(normalizeUiLocale(v));
    }
    expect(uiLocaleLanguage("pt-BR")).toBe("Portuguese");
    expect(uiLocaleLanguage(undefined)).toBe("English");
    expect(typeof explicitUiLocale).toBe("function");
  });

  it("maps a validated locale to its starting language, defaulting to English", () => {
    expect(startingLanguageForUiLocale("en")).toBe("English");
    expect(startingLanguageForUiLocale("es")).toBe("Spanish");
    expect(startingLanguageForUiLocale("pt-BR")).toBe("Portuguese");
    expect(startingLanguageForUiLocale("pt")).toBe("Portuguese");
    expect(startingLanguageForUiLocale(undefined)).toBe("English");
    expect(startingLanguageForUiLocale("fr")).toBe("English");
    expect(startingLanguageForUiLocale(null)).toBe("English");
  });

  it("keeps the English lock/policy byte-identical when no locale applies", () => {
    expect(languageLockFor("English")).toBe(LANGUAGE_LOCK);
    expect(languageLockFor("")).toBe(LANGUAGE_LOCK);
    expect(languagePolicyFor("English")).toBe(LANGUAGE_POLICY);
    expect(LANGUAGE_LOCK).toContain("starts as English");
    expect(LANGUAGE_POLICY.startsWith("Start in English.")).toBe(true);
  });

  it("parameterizes the lock and policy for a UI-selected start language", () => {
    const lock = languageLockFor("Portuguese");
    expect(lock).toContain("starts as Portuguese");
    expect(lock).toContain("ENTIRE greeting");
    expect(lock).toContain("explicitly selected Portuguese with this website's language switch");
    expect(lock).toContain("call select_conversation_language");
    expect(lock).toContain("speak Portuguese only");
    expect(lock).not.toContain("speak English only");
    const policy = languagePolicyFor("Spanish");
    expect(policy.startsWith("Start in Spanish.")).toBe(true);
    expect(policy).toContain("unless the caller explicitly asks to change");
    expect(policy).not.toContain("Start in English");
  });

  it("directs the opening greeting in the starting language; English stays byte-identical", () => {
    const legacyDefault = openingText({ preview: false, opening: "G" });
    expect(legacyDefault).toBe(
      "The caller just connected. Deliver this ENTIRE opening and any overview in English only, with no foreign phrases. The caller has not requested another language. Say this greeting now in English: G That greeting is your entire first turn: after it, stop and wait for their reply. Do not ask anything else yet.",
    );
    const ptDefault = openingText({ preview: false, opening: "G", startLanguage: "Portuguese" });
    expect(ptDefault).toContain("Deliver this ENTIRE opening and any overview in Portuguese only");
    expect(ptDefault).toContain("Say this greeting now in Portuguese: G");
    expect(ptDefault).not.toContain("in English only");
    const ptSim = openingText({ preview: false, opening: "G", simulation: true, startLanguage: "Portuguese" });
    expect(ptSim).toContain("in Portuguese only");
    expect(ptSim).toContain("run the SIMULATION ENTRY sequence");
    const esHost = openingText({ preview: false, opening: "G", simulation: true, verificationGate: true, startLanguage: "Spanish" });
    expect(esHost).toContain("in Spanish only");
    expect(esHost).toContain("a host phase comes first");
    // Resume/drop continuity: unchanged without a locale, directed with one.
    expect(openingText({ preview: false, resumeContext: "RECAP" })).toBe(resumeInstruction("RECAP"));
    expect(openingText({ preview: false, resumeContext: "RECAP", startLanguage: "Portuguese" })).toContain("Deliver that resume line in Portuguese");
  });

  it("honors explicit switch requests in BOTH directions, and nothing else", () => {
    // English start → Portuguese (the pre-existing direction).
    expect(requestedConversationLanguage("Please switch the conversation to Portuguese")).toBe("Portuguese");
    expect(requestedConversationLanguage("Please speak Spanish")).toBe("Spanish");
    // Portuguese start → English (Ron's reverse case).
    expect(requestedConversationLanguage("Fale inglês, por favor")).toBe("English");
    expect(requestedConversationLanguage("Pode falar inglês?")).toBe("English");
    expect(requestedConversationLanguage("Por favor, habla inglés")).toBe("English");
    // Detection / questions / background talk still authorize nothing.
    expect(requestedConversationLanguage("Hola. Bonjour.")).toBeNull();
    expect(requestedConversationLanguage("Do you speak Portuguese?")).toBeNull();
    expect(requestedConversationLanguage("Someone on the television said speak Portuguese")).toBeNull();
    expect(requestedConversationLanguage("Não quero falar inglês")).toBeNull();
  });

  it("stamps the locale server-side: gemini-session validates, the proxy consumes, segments inherit", () => {
    expect(geminiSession).toContain("normalizeUiLocale(b.locale)");
    expect(geminiSession).toContain("startingLanguageForUiLocale(uiLocale)");
    expect(geminiSession).toContain("uiLocale, startLanguage");
    expect(proxy).toContain("startingLanguageForUiLocale(config.uiLocale)");
    expect(proxy).toContain("languageLockFor(startLanguage)");
    expect(proxy).toContain("languagePolicyFor(startLanguage)");
    expect(proxy).toContain("let conversationLanguage = startLanguage");
    expect(proxy).toContain("startLanguage,");
  });

  it("never leaks the UI locale into the phone/telephony path", () => {
    expect(telephonyStream).not.toContain("uiLocale");
    expect(telephonyStream).not.toContain("startLanguage");
    expect(telephonyVoice).not.toContain("uiLocale");
    expect(telephonyVoice).not.toContain("startLanguage");
    // Telephony still builds its instructions from the English LANGUAGE_POLICY.
    expect(telephonyStream).toContain("LANGUAGE_POLICY");
    expect(telephonyVoice).toContain("LANGUAGE_POLICY");
  });

  it("sends only the explicit UI selection from the client", () => {
    expect(conversation).toContain("locale: explicitUiLocale()");
    expect(conversation).toContain('from "@/lib/uiLocale"');
    // No browser-locale detection anywhere in the helper.
    const helper = read("../lib/uiLocale.ts");
    expect(helper).toContain('localStorage.getItem("lang")');
    expect(helper).not.toContain("navigator.language");
    expect(helper).not.toContain("navigator.languages");
  });

  it("localizes the voice panel chrome and the chat panel through i18n", () => {
    expect(conversation).toContain("useTranslation");
    expect(conversation).toContain('t("voice.consentTitle"');
    expect(conversation).toContain('t("voice.consentBody")');
    expect(conversation).toContain('t("voice.readyToTalk")');
    expect(chatWidget).toContain('t("chat.consentTitle")');
    expect(chatWidget).toContain('t("chat.greetingBody"');
    expect(chatWidget).toContain("locale: explicitUiLocale()");
    // The chat edge function validates + enforces the reply language too.
    expect(chatFn).toContain("chatLocale");
    expect(chatFn).toContain("RESPONSE LANGUAGE (server directive)");
    expect(chatFn).toContain("effectiveSystemPrompt");
  });

  it("keeps voice.* and chat.* key parity across en / es / pt-BR with real translations", () => {
    const flat = (o: Record<string, unknown>, prefix = ""): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(o)) {
        if (v && typeof v === "object") Object.assign(out, flat(v as Record<string, unknown>, `${prefix}${k}.`));
        else out[`${prefix}${k}`] = String(v);
      }
      return out;
    };
    for (const ns of ["voice", "chat"] as const) {
      const enKeys = Object.keys(flat(en[ns] as Record<string, unknown>)).sort();
      expect(enKeys.length).toBeGreaterThan(20);
      for (const locale of [es, pt]) {
        const keys = Object.keys(flat(locale[ns] as Record<string, unknown>)).sort();
        expect(keys).toEqual(enKeys);
        for (const k of enKeys) {
          expect(flat(locale[ns] as Record<string, unknown>)[k].trim().length).toBeGreaterThan(0);
        }
      }
    }
    // The strings a visitor actually reads first are genuinely translated.
    expect(es.voice.consentTitle).not.toBe(en.voice.consentTitle);
    expect(pt.voice.consentTitle).not.toBe(en.voice.consentTitle);
    expect(es.chat.greetingBody).not.toBe(en.chat.greetingBody);
    expect(pt.chat.greetingBody).not.toBe(en.chat.greetingBody);
    expect(pt.voice.consentStart).toBe("Começar e concordar");
    expect(es.chat.consentStart).toBe("Iniciar el chat y aceptar");
  });
});
