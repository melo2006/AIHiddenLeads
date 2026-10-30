import { Check, Minus } from "lucide-react";

type Cell = string | boolean;

// Competitor facts come from each vendor's public pricing page (checked Oct 2026).
// "Not listed" means the feature is not on their public plan page, not that it never exists.
const COLUMNS = ["AI Hidden Leads Premium", "Goodcall Starter", "Smith.ai AI Pro", "Ruby Call Ruby 50"];

const ROWS: { label: string; cells: Cell[] }[] = [
  { label: "Compared monthly plan", cells: ["$99", "$79", "$150 · free 25-call tier also available", "$250"] },
  { label: "Included usage · different billing units", cells: ["400 website voice minutes", "100 unique customers", "75 calls", "50 receptionist minutes"] },
  { label: "Primary way to engage", cells: ["Website voice + chat", "AI telephone answering", "AI telephone answering", "Human telephone answering"] },
  { label: "Website chat", cells: ["Included", "Not verified", "Not verified for AI Pro", "Separate service / bundle"] },
  { label: "Live talking video on your website", cells: ["Optional +$79/mo · 400 video minutes", "Not verified", "Not verified", "Not verified"] },
  { label: "Fresh B2B prospects", cells: ["50/month included", "Not listed in Starter", "Not listed in AI Pro", "Not listed in Call Ruby 50"] },
  { label: "Calendar booking", cells: ["Our sales calendar live; customer connection rollout", "Available", "Available", "Available"] },
  { label: "Conversation records", cells: ["Private browser transcripts, AI summaries & audio segments", "Check selected plan", "Recordings, transcripts & summaries", "Receptionist messages"] },
  { label: "Reporting / CRM", cells: ["Admin CSV + reviewed webhook send; customer automation pending", "Zapier", "Native integrations", "Check selected plan"] },
  { label: "Customer telephone answering & transfer", cells: ["Separate rollout · not activated", "Available", "Available", "Available"] },
  { label: "SMS updates", cells: ["Coming soon", "Check selected plan", "Check selected plan", "Check selected plan"] },
  { label: "Money-back terms", cells: ["14 days on monthly plan fee", "Check vendor terms", "Check vendor terms", "Check vendor terms"] },
];

const render = (c: Cell) =>
  c === true ? <Check className="w-4 h-4 text-primary mx-auto" aria-label="Yes" /> :
  c === false ? <Minus className="w-4 h-4 text-muted-foreground mx-auto" aria-label="No" /> :
  <span>{c}</span>;

const CompetitorComparison = () => (
  <div className="border-y border-border py-5">
    <h3 className="text-lg font-bold text-center mb-1">Choose the right way to capture opportunities</h3>
    <p className="text-xs text-center text-muted-foreground mb-4">
      Public offers checked October 30, 2026. Website minutes, unique customers, calls and human receptionist minutes are not interchangeable. Smith.ai also offers a free 25-call tier; extra usage and vendor terms apply.
    </p>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-xs border-collapse">
        <caption className="sr-only">Website engagement and telephone receptionist plan comparison</caption>
        <thead>
          <tr>
            <th className="text-left p-2 font-semibold text-muted-foreground">Feature</th>
            {COLUMNS.map((c, i) => (
              <th key={c} className={`p-2 font-semibold text-center ${i === 0 ? "text-primary bg-primary/10 rounded-t-lg" : "text-foreground"}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="p-2 text-foreground">{r.label}</td>
              {r.cells.map((c, i) => (
                <td key={i} className={`p-3 text-center leading-relaxed ${i === 0 ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground"}`}>{render(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Sources: <a className="text-primary underline" href="https://www.goodcall.com/pricing" target="_blank" rel="noopener noreferrer">Goodcall</a> · <a className="text-primary underline" href="https://smith.ai/pricing/ai-receptionist" target="_blank" rel="noopener noreferrer">Smith.ai</a> · <a className="text-primary underline" href="https://rubyhelpcenter.helpjuice.com/en_US/billing-plans/am-i-on-the-right-billing-plan" target="_blank" rel="noopener noreferrer">Ruby</a>. “Not verified” is not a claim that a provider lacks a feature. Website video alternatives also exist, including <a className="text-primary underline" href="https://docs.d-id.com/docs/embed-overview" target="_blank" rel="noopener noreferrer">D-ID</a> and <a className="text-primary underline" href="https://www.tavus.io/pricing" target="_blank" rel="noopener noreferrer">Tavus</a>; developer platforms are not equivalent managed-service packages.</p>
  </div>
);

export default CompetitorComparison;
