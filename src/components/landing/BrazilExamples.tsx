import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";
import { BRAZIL_EXAMPLES } from "@/data/brazilExamplePinnedLeads";

/**
 * The six ready-made Brazilian example demos on /demo/br (Publish #71).
 *
 * One tap opens the example's demo through the same sample flow the
 * realtor gallery uses (AgentLandingTemplate): /demo/br?sample=1 with
 * the business URL and the generic visitor name — TryDemo forwards it to
 * /demo-site untouched, carrying the pinned leadId when the example has
 * one (the ready demo, no scan wait) and letting /demo-site run the
 * standard scan when it does not. Every label comes from the pt-BR
 * catalog; the section only ever renders on the Portuguese route.
 */
export default function BrazilExamples() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const openExample = (slug: string) => {
    const example = BRAZIL_EXAMPLES.find((e) => e.slug === slug);
    if (!example) return;
    const params = new URLSearchParams({
      url: example.url,
      callerName: t("tryDemo.brVisitorName"),
      sample: "1",
    });
    if (example.leadId) params.set("leadId", example.leadId);
    navigate(`/demo/br?${params.toString()}`);
  };

  return (
    <section aria-labelledby="br-examples-title" className="mb-3 text-left sm:mb-4">
      <h2
        id="br-examples-title"
        className="flex items-center gap-2 text-sm font-bold text-foreground sm:text-base"
      >
        <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        {t("tryDemo.brExamplesTitle")}
      </h2>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">
        {t("tryDemo.brExamplesHint")}
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {BRAZIL_EXAMPLES.map((example) => (
          <button
            key={example.slug}
            type="button"
            onClick={() => openExample(example.slug)}
            className="flex min-h-14 flex-col items-start justify-center rounded-xl border border-border bg-card/60 px-3 py-2 text-left backdrop-blur-sm transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
              {t(`tryDemo.brTypes.${example.typeKey}`)}
            </span>
            <span className="mt-0.5 text-xs font-semibold leading-tight text-foreground">
              {example.business}
            </span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">{example.city}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
