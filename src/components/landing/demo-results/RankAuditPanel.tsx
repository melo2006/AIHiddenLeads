import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { auditOffers, simulatedRankGrid } from "@/lib/demoRankGrid";

interface Props { businessName: string; city?: string; niche?: string }

export default function RankAuditPanel({ businessName, city = "", niche = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [localCity, setLocalCity] = useState(city);
  const points = useMemo(() => simulatedRankGrid({ businessName, city: localCity, niche }), [businessName, localCity, niche]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal border-primary/40 bg-card text-xs leading-tight" aria-label="View 25-Point Google Maps Rank Grid">
          📍 View 25-Point Google Maps Rank Grid
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-lg">
        <SheetHeader className="pr-7 text-left">
          <p className="text-xs font-semibold uppercase text-primary">Neighborhood visibility</p>
          <SheetTitle>25-Point Google Maps Audit</SheetTitle>
          <SheetDescription>{businessName}{niche && niche !== "general" ? ` · ${niche}` : ""}</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <p><strong className="text-foreground">Simulated preview — not live rankings.</strong> Illustrative neighborhood pins, not actual business locations or measured Google results. A live audit is needed to verify visibility.</p>
          </div>
          <div>
            <label htmlFor="audit-city" className="mb-1 block text-xs font-medium">Business city</label>
            <Input id="audit-city" value={localCity} onChange={e => setLocalCity(e.target.value)} maxLength={100} placeholder="City not supplied — enter a city" />
          </div>
          <figure aria-label="Simulated 5 by 5 neighborhood rank grid" className="space-y-3">
            <figcaption className="text-sm font-semibold">{localCity ? `${localCity} · ` : ""}25 neighborhood checkpoints</figcaption>
            <div className="grid aspect-square grid-cols-5 grid-rows-5 gap-3 rounded-md border border-border bg-muted/40 p-3">
              {points.map(point => (
                <div key={`${point.row}-${point.col}`} data-audit-pin className={`audit-rank-${point.tone} flex min-w-0 flex-col items-center justify-center rounded-full text-xs font-bold`} title={`Simulated row ${point.row + 1}, column ${point.col + 1}: rank ${point.rank}`}>
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  <span>#{point.rank}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><i className="audit-rank-good h-2.5 w-2.5 rounded-full" />1–3 · Visible</span>
              <span className="flex items-center gap-1.5"><i className="audit-rank-warning h-2.5 w-2.5 rounded-full" />4–10 · At risk</span>
              <span className="flex items-center gap-1.5"><i className="audit-rank-bad h-2.5 w-2.5 rounded-full" />11+ · Low visibility</span>
            </div>
          </figure>
          <section className="border-t border-border pt-4">
            <h3 className="text-lg font-bold">14-Day AI Fast-Win Plan</h3>
            <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Days 1–3:</strong> Review and correct Google Business Profile categories with your authorization.</li>
              <li><strong className="text-foreground">Days 4–7:</strong> Document keyword-stuffing competitors and report verified policy violations to Google. Google decides removals.</li>
              <li><strong className="text-foreground">Days 8–14:</strong> Add factual AI Search Schema to eligible website pages and review local visibility.</li>
              <li><strong className="text-foreground">Starting Week 1:</strong> Begin weekly delivery of up to {auditOffers.monthlyLeads} qualified B2B prospects per month with the Founder Plan.</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">A 14-day action plan, not a ranking guarantee. Prospect records are not guaranteed appointments or opt-in buyers. Google Maps Boost is separate from the base plan.</p>
          </section>
          <div className="space-y-2 border-t border-border pt-4">
            <Button asChild className="h-auto min-h-11 w-full whitespace-normal py-3"><Link to="/checkout?plan=essentials">Claim ${auditOffers.founder}/mo Founder Plan</Link></Button>
            <Button asChild variant="outline" className="h-auto min-h-11 w-full whitespace-normal py-3"><Link to="/book?offer=google-maps-boost">Request ${auditOffers.mapsBoost}/mo Google Maps Boost</Link></Button>
            <p className="text-xs text-muted-foreground">Founder Plan uses AI Essentials checkout. Google Maps Boost is confirmed during an implementation call; this button does not charge you.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}