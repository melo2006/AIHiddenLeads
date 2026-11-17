import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import TryDemo from "./TryDemo";

/**
 * /demo/br — the fully-Portuguese demo landing (Publish #71, owner's
 * directive 2026-11-15): a Brazilian visitor who receives this link sees
 * Portuguese from the first pixel — page copy, the intake form, the
 * scan/build animation and the demo itself — not an English page that
 * only turns Portuguese when the voice starts.
 *
 * The route FORCES the pt-BR locale before the demo page is allowed to
 * render: it writes the same "lang" pick the site's own
 * LanguageSwitcher writes — sessionStorage (the in-session explicit
 * choice every downstream mechanism reads since chat-fix3: the UI
 * catalog's initial language, DemoSite's explicit-pick rule and the
 * session's locale via explicitUiLocale) plus its localStorage
 * mirror — and switches i18next to pt-BR. Rendering is gated until
 * the switch lands, so no English frame is ever painted. The pick
 * stays set afterwards, exactly like a manual LanguageSwitcher pick:
 * the whole visit — /demo-site included — runs in Portuguese, and
 * the scanned site's detected language can never override the
 * chrome (the explicit pick always wins, Publish #66).
 *
 * The English /demo is untouched: it renders the same TryDemo component
 * without the "br" variant.
 */
const DemoBr = () => {
  const { t, i18n } = useTranslation();
  const [ready, setReady] = useState(
    () => (i18n.resolvedLanguage || i18n.language) === "pt-BR",
  );

  useEffect(() => {
    // The stored pick is what explicitUiLocale() and the session
    // authorize read — set it directly as well as switching i18next,
    // so the force does not depend on the detector's cache timing.
    // sessionStorage carries the in-session choice (chat-fix3);
    // localStorage stays as its mirror for other readers.
    try {
      sessionStorage.setItem("lang", "pt-BR");
      localStorage.setItem("lang", "pt-BR");
    } catch {
      /* storage unavailable — the i18next switch below still applies */
    }
    if ((i18n.resolvedLanguage || i18n.language) === "pt-BR") {
      setReady(true);
      return;
    }
    let cancelled = false;
    void i18n.changeLanguage("pt-BR").then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [i18n]);

  if (!ready) {
    // Pre-render gate: the only thing that can paint before pt-BR is
    // active — itself rendered in pt-BR via the explicit lng override.
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">
          {t("tryDemo.loadingDemo", { lng: "pt-BR" })}
        </p>
      </div>
    );
  }

  return <TryDemo variant="br" />;
};

export default DemoBr;
