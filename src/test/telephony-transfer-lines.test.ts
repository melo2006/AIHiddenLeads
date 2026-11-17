// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  phoneConnectLine,
  phoneFollowUpLine,
  phoneLanguageFromSignal,
  phoneTransferLanguageFromRow,
  phoneTransferTarget,
  phoneTransferUnavailableLine,
  phoneWhisperText,
} from "../../supabase/functions/_shared/telephony-transfer-lines";
import { chirpVoice, chirpVoiceForLanguage } from "../../supabase/functions/_shared/telephony-rules";
import { briefingSayLanguage } from "../../supabase/functions/_shared/handoff-briefing-voice";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const telephonyVoice = read("../../supabase/functions/telephony-voice/index.ts");
const telephonyStream = read("../../supabase/functions/telephony-stream/index.ts");

/**
 * Phone-path transfer localization (2026-11-17): the Twilio phone
 * paths composed their whisper frame and caller-side transfer lines
 * as fixed English and spoke the configured transfer_name verbatim
 * (personal name included). The website path's policy — session
 * language, title never a personal name on platform lines, one
 * approved wording set — now applies via _shared/telephony-transfer-lines.
 */
describe("phone transfer language signals", () => {
  it("normalizes machine and human language signals, defaulting to English", () => {
    expect(phoneLanguageFromSignal("es")).toBe("es");
    expect(phoneLanguageFromSignal("es-ES")).toBe("es");
    expect(phoneLanguageFromSignal("Spanish")).toBe("es");
    expect(phoneLanguageFromSignal("pt")).toBe("pt");
    expect(phoneLanguageFromSignal("pt-BR")).toBe("pt");
    expect(phoneLanguageFromSignal("Portuguese")).toBe("pt");
    expect(phoneLanguageFromSignal("en")).toBe("en");
    expect(phoneLanguageFromSignal("English")).toBe("en");
    for (const bad of ["fr", "de", "", null, undefined, 42, {}]) {
      expect(phoneLanguageFromSignal(bad)).toBe("en");
    }
  });

  it("reads the stamped language back off the call row, defaulting to English", () => {
    expect(phoneTransferLanguageFromRow({ transfer_language: "pt" })).toBe("pt");
    expect(phoneTransferLanguageFromRow({ transfer_language: "es" })).toBe("es");
    expect(phoneTransferLanguageFromRow({})).toBe("en");
    expect(phoneTransferLanguageFromRow(null)).toBe("en");
    expect(phoneTransferLanguageFromRow(undefined)).toBe("en");
    expect(phoneTransferLanguageFromRow("pt")).toBe("en");
  });

  it("maps the phone languages to the same BCP-47 Say tags as the web briefing", () => {
    expect(briefingSayLanguage(phoneLanguageFromSignal("pt"))).toBe("pt-BR");
    expect(briefingSayLanguage(phoneLanguageFromSignal("es"))).toBe("es-ES");
    expect(briefingSayLanguage(phoneLanguageFromSignal("en"))).toBe("en-US");
  });
});

describe("phone transfer target — title, never a personal name, on platform lines", () => {
  it("names the sales-director TITLE on platform lines in all three languages, even when a personal name is configured", () => {
    const platform = { platformSales: true, configuredName: "Ron" };
    expect(phoneTransferTarget(platform, "en")).toBe("our sales director");
    expect(phoneTransferTarget(platform, "pt")).toBe("nosso diretor de vendas");
    expect(phoneTransferTarget(platform, "es")).toBe("nuestro director de ventas");
    for (const lang of ["en", "pt", "es"] as const) {
      expect(phoneTransferTarget(platform, lang)).not.toContain("Ron");
    }
  });

  it("lets a configured role win over everything, as the website announcement does", () => {
    expect(phoneTransferTarget({ transferRole: "the owner", platformSales: true, configuredName: "Ron" }, "en")).toBe("the owner");
  });

  it("keeps a tenant line's own configured manager name (their business fact)", () => {
    expect(phoneTransferTarget({ platformSales: false, configuredName: "Dr. Patel" }, "en")).toBe("Dr. Patel");
    expect(phoneTransferTarget({ configuredName: "Maria" }, "pt")).toBe("Maria");
  });

  it("falls back to the generic manager, localized, when nothing real is configured", () => {
    expect(phoneTransferTarget({ configuredName: "the manager" }, "en")).toBe("the manager");
    expect(phoneTransferTarget({ configuredName: "" }, "pt")).toBe("o gerente");
    expect(phoneTransferTarget({}, "es")).toBe("el gerente");
  });
});

describe("phone transfer wording set", () => {
  it("whisper frame: English byte-identical to the pre-localization line; PT/ES carry the same words", () => {
    expect(phoneWhisperText("The caller wants a quote.", "en")).toBe("Transfer from Aspen. The caller wants a quote. Connecting now.");
    expect(phoneWhisperText("O chamador quer um orçamento.", "pt")).toBe("Transferência da Aspen. O chamador quer um orçamento. Conectando agora.");
    expect(phoneWhisperText("La persona quiere una cotización.", "es")).toBe("Transferencia de Aspen. La persona quiere una cotización. Conectando ahora.");
  });

  it("whisper falls back to the localized default summary when none was composed", () => {
    expect(phoneWhisperText(null, "en")).toBe("Transfer from Aspen. A caller asked to speak with you. Connecting now.");
    expect(phoneWhisperText("", "pt")).toBe("Transferência da Aspen. Um chamador pediu para falar com você. Conectando agora.");
    expect(phoneWhisperText(undefined, "es")).toBe("Transferencia de Aspen. Una persona que llamó pidió hablar con usted. Conectando ahora.");
  });

  it("connect line in three languages", () => {
    expect(phoneConnectLine("our sales director", "en")).toBe("Let me connect you with our sales director.");
    expect(phoneConnectLine("nosso diretor de vendas", "pt")).toBe("Vou conectar você com nosso diretor de vendas agora.");
    expect(phoneConnectLine("nuestro director de ventas", "es")).toBe("Le conecto ahora con nuestro director de ventas.");
  });

  it("unavailable line in three languages", () => {
    expect(phoneTransferUnavailableLine("the manager", "en")).toBe("Sorry, the manager is not available right now. We'll call you back soon. Goodbye.");
    expect(phoneTransferUnavailableLine("o gerente", "pt")).toBe("Desculpe, o gerente não está disponível no momento. Ligaremos de volta em breve. Adeus.");
    expect(phoneTransferUnavailableLine("el gerente", "es")).toBe("Lo siento, el gerente no está disponible en este momento. Le devolveremos la llamada pronto. Adiós.");
  });

  it("follow-up line (no transfer available) in three languages", () => {
    expect(phoneFollowUpLine("en")).toBe("Thanks for calling. Someone will follow up with you soon. Goodbye.");
    expect(phoneFollowUpLine("pt")).toBe("Obrigado pela ligação. Alguém da nossa equipe entrará em contato em breve. Adeus.");
    expect(phoneFollowUpLine("es")).toBe("Gracias por llamar. Alguien de nuestro equipo se pondrá en contacto con usted pronto. Adiós.");
  });

  it("no composed line ever contains a placeholder or a second language's frame", () => {
    for (const lang of ["en", "pt", "es"] as const) {
      const lines = [phoneWhisperText("S", lang), phoneConnectLine("T", lang), phoneTransferUnavailableLine("T", lang), phoneFollowUpLine(lang)];
      for (const line of lines) expect(line).not.toMatch(/\$\{|undefined|null/);
    }
  });
});

describe("chirp voice follows the session language", () => {
  it("English is byte-identical to the existing chirpVoice", () => {
    expect(chirpVoiceForLanguage("Kore", "en")).toBe(chirpVoice("Kore"));
    expect(chirpVoiceForLanguage("Schedar", "en")).toBe("Google.en-US-Chirp3-HD-Schedar");
  });

  it("Spanish and Portuguese get their locale voices, same voice name", () => {
    expect(chirpVoiceForLanguage("Kore", "es")).toBe("Google.es-ES-Chirp3-HD-Kore");
    expect(chirpVoiceForLanguage("Kore", "pt")).toBe("Google.pt-BR-Chirp3-HD-Kore");
    expect(chirpVoiceForLanguage("bogus", "pt")).toBe("Google.pt-BR-Chirp3-HD-Kore");
  });
});

describe("phone functions are wired to the shared wording set (source pins)", () => {
  it("telephony-voice composes whisper + transfer lines from the module, not fixed English", () => {
    expect(telephonyVoice).toContain("phoneWhisperText(");
    expect(telephonyVoice).toContain("phoneConnectLine(");
    expect(telephonyVoice).toContain("phoneTransferUnavailableLine(");
    expect(telephonyVoice).toContain("phoneFollowUpLine(");
    expect(telephonyVoice).not.toContain("Transfer from Aspen. ${");
    expect(telephonyVoice).not.toContain("Let me connect you with ${transferName}");
    expect(telephonyVoice).not.toContain("is not available right now. We’ll call you back");
    expect(telephonyVoice).not.toContain('voice="Google.en-US-Chirp3-HD-Kore"');
  });

  it("telephony-voice learns the session language from the model's own report and stamps it on the row", () => {
    expect(telephonyVoice).toContain('"language": "en" | "es" | "pt"');
    expect(telephonyVoice).toContain("transfer_language: ai.language");
    expect(telephonyVoice).toContain("phoneTransferLanguageFromRow(call?.ai_usage)");
  });

  it("telephony-stream localizes its no-answer Say and hands the bridge the localized whisper", () => {
    expect(telephonyStream).toContain("phoneTransferUnavailableLine(");
    expect(telephonyStream).toContain("phoneLanguageFromSignal(b.language)");
    expect(telephonyStream).toContain("transfer_language: transferLang");
    expect(telephonyStream).toContain("whisperText: phoneWhisperText(summary, transferLang)");
    expect(telephonyStream).not.toContain("We will call you back soon. Goodbye.</Say>");
  });

  it("both phone functions aim the model's instructions at the resolved spoken target, not the raw configured name", () => {
    expect(telephonyVoice).toContain("Transfers go to ${targetEn}.");
    expect(telephonyVoice).not.toContain("Transfers go to ${transferName}.");
    expect(telephonyStream).toContain("Transfers go to ${spokenTargetEn}.");
  });

  it("the phone language lock is untouched: no UI locale leaks into the phone path", () => {
    for (const src of [telephonyVoice, telephonyStream]) {
      expect(src).toContain("LANGUAGE_POLICY");
      expect(src).not.toContain("uiLocale");
      expect(src).not.toContain("startLanguage");
    }
  });
});
