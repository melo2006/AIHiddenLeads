import { afterEach, describe, expect, it } from "vitest";
import { browserUiLocale, explicitUiLocale, initialUiLocale, sessionUiLocale } from "../lib/uiLocale";

/**
 * Default language = the BROWSER's language (Ron, 2026-11-16,
 * chat-fix3). Ron's phone had localStorage "lang" = pt-BR left over
 * from an earlier Portuguese test; the old initial-language rule
 * let that stored pick override his English browser forever, so
 * the site — and Aspen's greeting — kept opening in Portuguese.
 * The revised rule: an explicit pick speaks only for the session
 * that made it (sessionStorage); a fresh browser session starts
 * in the browser's language; localStorage never drives the
 * initial language again.
 */
const setBrowserLanguage = (language: string, languages?: string[]) => {
  Object.defineProperty(window.navigator, "language", { value: language, configurable: true });
  Object.defineProperty(window.navigator, "languages", { value: languages ?? [language], configurable: true });
};

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  setBrowserLanguage("en-US");
});

describe("initial UI language — in-session pick, else browser, else English", () => {
  it("a stale localStorage pick does NOT drive a fresh session (Ron's bug)", () => {
    localStorage.setItem("lang", "pt-BR");
    setBrowserLanguage("en-US");
    expect(initialUiLocale()).toBe("en");
    expect(explicitUiLocale()).toBeUndefined();
  });

  it("the in-session explicit choice wins over the browser language", () => {
    sessionStorage.setItem("lang", "pt-BR");
    setBrowserLanguage("en-US");
    expect(sessionUiLocale()).toBe("pt-BR");
    expect(initialUiLocale()).toBe("pt-BR");
    expect(explicitUiLocale()).toBe("pt-BR");
  });

  it("a path pin (sessionStorage written by /demo/br) counts as the in-session choice", () => {
    sessionStorage.setItem("lang", "pt-BR");
    localStorage.setItem("lang", "pt-BR");
    setBrowserLanguage("en-US");
    expect(initialUiLocale()).toBe("pt-BR");
  });

  it("browser Portuguese (any region) resolves to pt-BR", () => {
    setBrowserLanguage("pt-PT");
    expect(browserUiLocale()).toBe("pt-BR");
    expect(initialUiLocale()).toBe("pt-BR");
    setBrowserLanguage("pt-BR");
    expect(browserUiLocale()).toBe("pt-BR");
  });

  it("browser Spanish resolves to es; anything else falls back to English", () => {
    setBrowserLanguage("es-MX");
    expect(browserUiLocale()).toBe("es");
    setBrowserLanguage("de-DE");
    expect(initialUiLocale()).toBe("en");
  });

  // French package (2026-11-18): fr-CA is a shipped site language, so
  // a French browser now lands in French (Canadian) instead of
  // falling through to English, and a stored bare 'fr' canonicalizes
  // exactly like bare 'pt' does.
  it("browser French (any region) resolves to fr-CA", () => {
    setBrowserLanguage("fr-FR");
    expect(browserUiLocale()).toBe("fr-CA");
    expect(initialUiLocale()).toBe("fr-CA");
    setBrowserLanguage("fr-CA");
    expect(browserUiLocale()).toBe("fr-CA");
  });

  it("an unsupported stored value is ignored, never trusted", () => {
    sessionStorage.setItem("lang", "de");
    setBrowserLanguage("es-ES");
    expect(sessionUiLocale()).toBeUndefined();
    expect(initialUiLocale()).toBe("es");
  });

  it("the bare 'pt' stored form canonicalizes to pt-BR", () => {
    sessionStorage.setItem("lang", "pt");
    expect(sessionUiLocale()).toBe("pt-BR");
  });

  it("the bare 'fr' stored form canonicalizes to fr-CA", () => {
    sessionStorage.setItem("lang", "fr");
    expect(sessionUiLocale()).toBe("fr-CA");
    expect(explicitUiLocale()).toBe("fr-CA");
  });

  it("browserUiLocale accepts an explicit navigator shape (no globals needed)", () => {
    expect(browserUiLocale({ language: "pt-BR" })).toBe("pt-BR");
    expect(browserUiLocale({ language: "es" })).toBe("es");
    expect(browserUiLocale({ language: "fr-CA" })).toBe("fr-CA");
    expect(browserUiLocale({ language: "ja-JP" })).toBe("en");
    expect(browserUiLocale({})).toBe("en");
    expect(browserUiLocale({ languages: ["de-DE", "pt-BR"] })).toBe("pt-BR");
    expect(browserUiLocale({ languages: ["fr-FR", "pt-BR"] })).toBe("fr-CA");
  });
});
