import { Check, Minus } from "lucide-react";

type Cell = string | boolean;

// Competitor facts come from each vendor's public pricing page (checked Oct 2026).
// "Not listed" means the feature is not on their public plan page, not that it never exists.
const COLUMNS = ["AI Hidden Leads Premium", "Goodcall Starter", "Smith.ai AI Receptionist", "Ruby live receptionists"];

const ROWS: { label: string; cells: Cell[] }[] = [
  { label: "Starting price", cells: ["$99/mo", "$79/mo", "$150/mo", "$250/mo"] },
  { label: "Included usage", cells: ["400 voice minutes", "100 unique callers", "75 calls", "50 minutes"] },
  { label: "Natural two-way voice on your website", cells: [true, false, false, false] },
  { label: "Website chat widget", cells: [true, false, "Not listed", "Not listed"] },
  { label: "Live talking video avatar", cells: ["Add-on", false, false, false] },
  { label: "New B2B leads every month", cells: ["50 included", false, false, false] },
  { label: "Calendar booking", cells: [true, true, true, true] },
  { label: "Call summaries emailed", cells: ["Per call, daily or weekly", "Not listed", true, true] },
  { label: "CSV export / Zapier", cells: ["CSV + Zapier (coming soon)", "Zapier", true, "Not listed"] },
  { label: "Live transfer to your phone", cells: ["Professional & up", true, true, true] },
  { label: "SMS after each call", cells: ["Coming soon", "Not listed", "Not listed", "Not listed"] },
  { label: "14-day money-back guarantee", cells: [true, false, "Not listed", "Not listed"] },
];

const render = (c: Cell) =>
  c === true ? <Check className="w-4 h-4 text-primary mx-auto" aria-label="Yes" /> :
  c === false ? <Minus className="w-4 h-4 text-muted-foreground mx-auto" aria-label="No" /> :
  <span>{c}</span>;

const CompetitorComparison = () => (
  <div className="rounded-xl border border-border bg-card/50 p-4 sm:p-5">
    <h3 className="text-base font-bold text-center mb-1">How we compare</h3>
    <p className="text-xs text-center text-muted-foreground mb-4">
      Entry plans from public pricing pages, October 2026. Competitors answer phone calls; we focus on website visitors plus new leads, so pick what fits your business.
    </p>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs border-collapse">
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
                <td key={i} className={`p-2 text-center ${i === 0 ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground"}`}>{render(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default CompetitorComparison;
