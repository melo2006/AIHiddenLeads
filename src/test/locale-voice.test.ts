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
  prewarmLocaleMismatch,
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
    expect([...SUPPORTED_UI_LOCALES]).toEqual(["en", "es", "pt-BR", "fr-CA"]);
    expect(normalizeUiLocale("en")).toBe("en");
    expect(normalizeUiLocale("es")).toBe("es");
    expect(normalizeUiLocale("pt-BR")).toBe("pt-BR");
    expect(normalizeUiLocale("pt")).toBe("pt-BR"); // i18n alias
    expect(normalizeUiLocale("fr-CA")).toBe("fr-CA");
    expect(normalizeUiLocale("fr")).toBe("fr-CA"); // i18n alias (French package, 2026-11-18)
    for (const bad of ["de", "en-US", "pt-PT", "", "EN", null, undefined, 42, {}]) {
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
    expect(startingLanguageForUiLocale("fr")).toBe("French");
    expect(startingLanguageForUiLocale("fr-CA")).toBe("French");
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
    // Publish #66: the lock receives the start's SOURCE (explicit pick vs
    // detected site language) so its authorization sentence stays true.
    expect(proxy).toContain("languageLockFor(startLanguage, config.languageSource");
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
    // The invoke reads the pick ONCE into a local (2026-11-18 prewarm
    // fix) so the locale sent and the locale recorded for a warm
    // authorization can never disagree, then sends that local.
    expect(conversation).toContain("const locale = explicitUiLocale()");
    expect(conversation).toContain("locale, visitorName");
    expect(conversation).toContain('from "@/lib/uiLocale"');
    // The session-start locale comes ONLY from the in-session
    // explicit pick (sessionStorage since chat-fix3, 2026-11-16):
    // a stale localStorage pick from an earlier session must never
    // start a session, and browser-locale detection must never
    // reach the session path. Browser language DOES now set the
    // site's initial UI language (Ron's revised rule — his English
    // browser was overridden for days by a stored pt-BR pick), but
    // that resolver (browserUiLocale/initialUiLocale) feeds only
    // i18n's first paint, never explicitUiLocale.
    const helper = read("../lib/uiLocale.ts");
    expect(helper).toContain('sessionStorage.getItem("lang")');
    expect(helper).not.toContain('localStorage.getItem("lang")');
    const sessionStart = helper.indexOf("export function sessionUiLocale");
    const sessionPath = helper.slice(sessionStart, helper.indexOf("\n}\n", sessionStart) + 3);
    expect(sessionPath).not.toContain("navigator");
    expect(helper).toContain("export function initialUiLocale");
    const i18nInit = read("../i18n/index.ts");
    expect(i18nInit).toContain("initialUiLocale()");
    expect(i18nInit).toContain('sessionStorage.setItem("lang", lng)');
  });

  it("localizes the voice panel chrome and the chat panel through i18n", () => {
    expect(conversation).toContain("useTranslation");
    expect(conversation).toContain('t("voice.consentTitle"');
    expect(conversation).toContain('t("voice.consentBody")');
    expect(conversation).toContain('t("voice.readyToTalk")');
    expect(chatWidget).toContain('t("chat.consentTitle", { name: presenterDisplayName })');
    expect(chatWidget).toContain('t("chat.greetingBody"');
    // Publish #66: the chat sends its EFFECTIVE locale — the explicit
    // pick, or below it the demo site's detected language.
    expect(chatWidget).toContain("locale: effectiveChatLocale");
    expect(chatWidget).toContain("explicitLocale ?? normalizeUiLocale(detectedSiteLanguage)");
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

/**
 * Ron's French live test (2026-11-18): the site was switched to
 * Canadian French — the page rendered fully French — but Aspen still
 * greeted, narrated and captioned in English. Root cause: the
 * floating widget PREWARMS one session at mount, authorized in the
 * language picked at that moment (no pick yet → English); switching
 * the site language afterwards never re-authorized it, and the tap
 * activated the held English session. The server chain was never
 * broken (gemini-session validates + stamps the locale, the proxy
 * starts voice/greeting/captions in it) — the drop was the stale
 * prewarm on the client. These pins hold the fix: a held session
 * whose authorization language differs from the visitor's CURRENT
 * pick is discarded and re-authorized, never activated.
 */
describe("prewarm language guard (Ron's French test, 2026-11-18)", () => {
  it("treats no-pick and an explicit English pick as the same effective language", () => {
    expect(prewarmLocaleMismatch(undefined, undefined)).toBe(false);
    expect(prewarmLocaleMismatch(undefined, "en")).toBe(false);
    expect(prewarmLocaleMismatch("en", undefined)).toBe(false);
    expect(prewarmLocaleMismatch("en", "en")).toBe(false);
  });

  it("flags every real language change after the prewarm, in every direction", () => {
    // Ron's exact case: prewarmed with no pick (English), then French picked.
    expect(prewarmLocaleMismatch(undefined, "fr-CA")).toBe(true);
    expect(prewarmLocaleMismatch("en", "fr-CA")).toBe(true);
    // And every other ordered pair of distinct shipped locales.
    const locales = ["en", "es", "pt-BR", "fr-CA"] as const;
    for (const warm of locales) {
      for (const current of locales) {
        expect(prewarmLocaleMismatch(warm, current)).toBe(warm !== current);
      }
      // Switching back to no-pick is impossible in the UI, but a
      // non-English warm session against a cleared pick must still
      // count as stale rather than silently run in the old language.
      if (warm !== "en") expect(prewarmLocaleMismatch(warm, undefined)).toBe(true);
    }
  });

  it("records the warm authorization's locale and guards the tap with it", () => {
    // The warm invoke records the exact locale it sent.
    expect(conversation).toContain("if (warm) warmLocaleRef.current = locale");
    expect(conversation).toContain("const warmLocaleRef = useRef<UiLocale | undefined>(undefined)");
    // The tap compares BEFORE activating, and only for a session that
    // has not already gone live (a live conversation is never discarded).
    expect(conversation).toContain(
      "if (!warmRef.current.activated && prewarmLocaleMismatch(warmLocaleRef.current, explicitUiLocale()))",
    );
    const guardAt = conversation.indexOf("prewarmLocaleMismatch(warmLocaleRef.current");
    const activateAt = conversation.indexOf("await activateWarmRef.current()");
    expect(guardAt).toBeGreaterThan(-1);
    expect(activateAt).toBeGreaterThan(guardAt);
    // The discard tears the held session down, then falls through to a
    // fresh authorization in the current language (no early return).
    const guardBlock = conversation.slice(guardAt, guardAt + 200);
    expect(guardBlock).toContain("stopEverything()");
  });

  it("drives greeting, policy and lock from the SAME stamped language for every shipped locale", () => {
    const cases = [
      ["en", "English"],
      ["es", "Spanish"],
      ["pt-BR", "Portuguese"],
      ["fr-CA", "French"],
    ] as const;
    for (const [locale, language] of cases) {
      expect(startingLanguageForUiLocale(locale)).toBe(language);
      expect(languagePolicyFor(language).startsWith(`Start in ${language}.`)).toBe(true);
      expect(languageLockFor(language)).toContain(`starts as ${language}`);
      const opening = openingText({ preview: false, opening: "G", startLanguage: language });
      expect(opening).toContain(`in ${language} only`);
      expect(opening).toContain(`Say this greeting now in ${language}: G`);
    }
  });
});
