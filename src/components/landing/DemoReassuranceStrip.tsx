import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Seconds the reassurance detail stays open before it folds itself away
 * (owner's call, 2026-11-09: "10–15 seconds" — the strip was eating the
 * prospect's site on phone screens). Exported for tests.
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
 * auto-collapsed — it stays until the visitor folds it again.
 *
 * Slimmed once more the same evening (owner's ask): the component is ONE
 * slim row — shield + the short line + chevron — and the full line opens
 * as a small dropdown panel ANCHORED under the row (absolutely
 * positioned), so the layout never grows: on /demo-site the row sits in
 * the header's own meta row, level with the "Your real website is not
 * changed." note, instead of taking a full-width row of its own beneath
 * it. The dropdown overlays the page content below for its few seconds
 * and folds away on the same 15-second timer; the fold transition lives
 * on the dropdown panel only — the row itself never changes size.
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
      className="relative text-left text-foreground"
    >
      <div
        className={`flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 ${
          compact ? "px-2.5 py-1" : "px-3 py-1.5"
        }`}
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <p className="truncate text-[11px] leading-snug">{t("tryDemo.notTouchedShort")}</p>
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
      {/* The full line, as a dropdown anchored under the row: absolutely
          positioned, so opening it never pushes the page (or the demo
          preview) down. Hidden by max-height/opacity when folded. */}
      <div
        aria-hidden={!expanded}
        className={`absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-primary/40 bg-card shadow-lg transition-[max-height,opacity] duration-500 ease-in-out ${
          expanded ? "max-h-28 opacity-100" : "pointer-events-none max-h-0 opacity-0"
        } ${compact ? "w-64 max-w-[80vw]" : "w-72 max-w-[85vw]"}`}
      >
        <p className={`leading-snug ${compact ? "px-3 py-2 text-[11px]" : "px-3.5 py-2.5 text-xs"}`}>
          {t("tryDemo.notTouched")}
        </p>
      </div>
    </div>
  );
}
