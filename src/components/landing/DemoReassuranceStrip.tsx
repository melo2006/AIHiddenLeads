import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Seconds the slimmed reassurance stays fully expanded before it folds
 * itself away (owner's call, 2026-11-09: "10–15 seconds" — the strip was
 * eating the prospect's site on phone screens). Exported for tests.
 */
export const REASSURANCE_AUTO_COLLAPSE_SECONDS = 15;

/**
 * Dennis's rule (2026-11-09): the "we did NOT hack your website" reassurance
 * must be VISIBLE, up front, before the demo starts — not only spoken later
 * inside it. Wording lives in the tryDemo.notTouched i18n key (en/es/pt-BR)
 * so the strip follows the site's language switch like the rest of /demo.
 * Shared by the /demo entry page, the /demo-site simulation header and the
 * invite interstitial so the promise is identical on every entry surface.
 *
 * Slimmed the same day on the owner's order after his Great Gulf phone
 * test: the copy is one line now, and after
 * REASSURANCE_AUTO_COLLAPSE_SECONDS the strip folds to a slim bar (shield +
 * tryDemo.notTouchedShort + chevron) so the prospect's site gets the screen
 * back. Tapping the chevron re-expands it, and a MANUAL expansion is never
 * auto-collapsed — it stays until the visitor folds it again. The fold is
 * a max-height/opacity transition on this box only: the preview below
 * simply gains the freed height, nothing inside it reflows.
 */
export default function DemoReassuranceStrip({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const timer = setTimeout(
      () => setExpanded(false),
      REASSURANCE_AUTO_COLLAPSE_SECONDS * 1000,
    );
    return () => clearTimeout(timer);
    // Mount-only: the countdown runs once per surface. A manual re-expand
    // must not restart it, so `expanded` is deliberately not a dependency.
  }, []);

  const toggleLabel = t(expanded ? "tryDemo.notTouchedHide" : "tryDemo.notTouchedShow");

  return (
    <div
      role="note"
      aria-label="Website safety reassurance"
      data-expanded={expanded}
      className={`overflow-hidden rounded-2xl border border-primary/40 bg-primary/10 text-left text-foreground transition-[max-height] duration-500 ease-in-out ${
        expanded
          ? compact
            ? "max-h-28"
            : "max-h-32"
          : compact
            ? "max-h-9"
            : "max-h-10"
      }`}
    >
      <div
        className={`flex gap-2.5 ${compact ? "px-3 py-2" : "px-4 py-3"} ${
          expanded ? "items-start" : "items-center"
        }`}
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        {expanded ? (
          <p className={compact ? "text-[11px] leading-snug" : "text-xs leading-relaxed sm:text-[13px]"}>
            {t("tryDemo.notTouched")}
          </p>
        ) : (
          <p className="truncate text-[11px] leading-snug">{t("tryDemo.notTouchedShort")}</p>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="-mr-1 ml-auto shrink-0 rounded-md p-1 text-primary transition-colors hover:bg-primary/15"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
