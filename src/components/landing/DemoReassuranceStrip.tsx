import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Dennis's rule (2026-11-09): the "we did NOT hack your website" reassurance
 * must be VISIBLE, up front, before the demo starts — not only spoken later
 * inside it. Wording lives in the tryDemo.notTouched i18n key (en/es/pt-BR)
 * so the strip follows the site's language switch like the rest of /demo.
 * Shared by the /demo entry page, the /demo-site simulation header and the
 * invite interstitial so the promise is identical on every entry surface.
 */
export default function DemoReassuranceStrip({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      aria-label="Website safety reassurance"
      className={`flex items-start gap-2.5 rounded-2xl border border-primary/40 bg-primary/10 text-left text-foreground ${compact ? "px-3 py-2" : "px-4 py-3"}`}
    >
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className={compact ? "text-[11px] leading-snug" : "text-xs leading-relaxed sm:text-[13px]"}>
        {t("tryDemo.notTouched")}
      </p>
    </div>
  );
}
