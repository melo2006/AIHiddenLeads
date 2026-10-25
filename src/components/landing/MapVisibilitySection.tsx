import { useState } from "react";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { homepageMapComparison } from "@/lib/homepageMapComparison";

export default function MapVisibilitySection() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(12);
  const point = homepageMapComparison[selected];
  return (
    <section id="map-visibility" aria-labelledby="map-visibility-title" className="border-y border-primary/20 bg-secondary/30 py-16 sm:py-20">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="outline" className="mb-5 max-w-full whitespace-normal border-primary/40 bg-primary/10 text-primary">{t("mapVisibility.badge")}</Badge>
          <h2 id="map-visibility-title" className="text-3xl font-bold leading-tight sm:text-4xl">{t("mapVisibility.headlineStart")} <span className="text-primary">{t("mapVisibility.headlineAccent")}</span></h2>
          <p className="mt-5 text-sm text-muted-foreground">{t("mapVisibility.disclaimer")}</p>
        </div>

        <div className="mt-9 grid gap-5 md:grid-cols-2">
          {(["before", "after"] as const).map(mode => (
            <figure key={mode} className={`min-w-0 overflow-hidden rounded-lg border bg-card ${mode === "after" ? "border-primary/50" : "border-border"}`}>
              <figcaption className="flex min-h-24 items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
                <div className="min-w-0"><p className={`mb-1 text-xs font-bold uppercase ${mode === "after" ? "text-primary" : "text-muted-foreground"}`}>{t(`mapVisibility.${mode}Label`)}</p><h3 className="text-base font-semibold sm:text-lg">{t(`mapVisibility.${mode}Title`)}</h3></div>
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </figcaption>
              <div className="visibility-map relative isolate aspect-square p-5 sm:p-7">
                <svg className="pointer-events-none absolute inset-0 h-full w-full text-border" viewBox="0 0 400 400" fill="none" aria-hidden="true">
                  <path d="M0 55H400M0 135H400M0 215H400M0 295H400M0 375H400M55 0V400M135 0V400M215 0V400M295 0V400M375 0V400" stroke="currentColor" strokeWidth="10" />
                  <path d="M-20 340L420 40M-20 360L420 60" stroke="currentColor" strokeWidth="5" />
                </svg>
                <div className="relative grid h-full grid-cols-5 grid-rows-5 gap-3 sm:gap-5">
                  {homepageMapComparison.map(p => {
                    const rank = mode === "before" ? p.beforeRank : p.afterRank;
                    const tone = mode === "before" ? p.beforeTone : p.afterTone;
                    return <Button key={p.index} variant="ghost" aria-pressed={selected === p.index} aria-label={t("mapVisibility.pinLabel", { mode: t(`mapVisibility.${mode}Label`), n: p.index + 1, rank: rank > 20 ? "20+" : rank })} onClick={() => setSelected(p.index)} className={`audit-rank-${tone} h-full min-h-0 w-full min-w-0 rounded-full p-0 text-xs font-bold hover:opacity-90 focus-visible:ring-offset-card ${selected === p.index ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""}`}>
                      {p.index === 12 ? <Building2 className="mr-0.5 hidden h-3 w-3 sm:block" aria-hidden="true" /> : null}#{rank > 20 ? "20+" : rank}
                    </Button>;
                  })}
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t border-border px-5 py-4"><p className="text-sm text-muted-foreground">{t("mapVisibility.topThree")}</p><p className={`text-2xl font-bold ${mode === "after" ? "text-primary" : "text-foreground"}`}>{mode === "before" ? "1" : "22"}<span className="text-sm font-normal text-muted-foreground"> / 25</span></p></div>
            </figure>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          {(["good", "warning", "bad"] as const).map(tone => <span key={tone} className="flex items-center gap-2"><i className={`audit-rank-${tone} h-3 w-3 rounded-full`} aria-hidden="true" />{t(`mapVisibility.legend.${tone}`)}</span>)}
        </div>
        <p aria-live="polite" className="mt-4 min-h-6 text-center text-sm text-muted-foreground">{point && t("mapVisibility.selected", { n: selected + 1, before: point.beforeRank > 20 ? "20+" : point.beforeRank, after: point.afterRank })}{selected === 12 ? ` · ${t("mapVisibility.office")}` : ""}</p>
        <div className="mt-7 text-center">
          <Button size="lg" onClick={() => document.getElementById("demo-form")?.scrollIntoView({ behavior: "smooth" })} className="h-auto min-h-12 max-w-full whitespace-normal px-5 py-3 leading-snug"><MapPin className="mr-2 h-4 w-4 shrink-0" />{t("mapVisibility.cta")}</Button>
          <p className="mx-auto mt-3 max-w-3xl text-xs text-muted-foreground">{t("mapVisibility.auditNote")}</p>
        </div>
      </div>
    </section>
  );
}