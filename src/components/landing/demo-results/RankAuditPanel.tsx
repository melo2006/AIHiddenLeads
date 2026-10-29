import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MapPin, Radar, ShieldCheck } from "lucide-react";
import RankStreetMap from "../RankStreetMap";
import { validateAuditInputs } from "@/lib/rankAuditExamples";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { rankAuditExamples } from "@/lib/rankAuditExamples";
import { auditOffers, simulatedRankGrid } from "@/lib/demoRankGrid";

interface Props { businessName: string; city?: string; niche?: string; websiteUrl?: string; initialKeyword?: string; initialMode?: ScanMode }

type ScanMode = "maps" | "nationwide";

interface LiveCell { row: number; col: number; rank: number | null; lat?: number; lng?: number; query?: string; matchedName?: string }
interface LiveResult {
  mode: "live" | "simulated";
  scanMode: ScanMode;
  cached?: boolean;
  center?: { lat: number; lng: number; formatted?: string } | null;
  grid?: LiveCell[];
  stats?: { totalCells: number; rankedCells: number; avgRank: number | null; top3VisibilityPct: number; blindSpots: number };
  reason?: string;
  error?: string;
}

const liveTone = (rank: number | null) => rank === null ? "unknown" : rank <= 3 ? "good" : rank <= 10 ? "warning" : "bad";

export default function RankAuditPanel({ businessName, city = "", niche = "", websiteUrl = "", initialKeyword = "", initialMode = "maps" }: Props) {
  const [open, setOpen] = useState(false);
  const [localCity, setLocalCity] = useState(city);
  const [keyword, setKeyword] = useState(initialKeyword || (niche && niche !== "general" ? niche : ""));
  const [scanMode, setScanMode] = useState<ScanMode>(initialMode);
  const [auditName, setAuditName] = useState(businessName);
  useEffect(() => { setLocalCity(city); setKeyword(initialKeyword || (niche && niche !== "general" ? niche : "")); setAuditName(businessName); setScanMode(initialMode); setLive(null); setScanError(null); }, [city, initialKeyword, businessName, initialMode, niche]);
  const [recent, setRecent] = useState<{name:string;city:string;keyword:string;mode:ScanMode;website:string;result:LiveResult;at:string}[]>(() => { try { const value=JSON.parse(localStorage.getItem('rank-audit-recent') || '[]'); return Array.isArray(value)?value.slice(0,5):[]; } catch { return []; } });
  const [auditWebsite,setAuditWebsite] = useState(websiteUrl);
  useEffect(()=>setAuditWebsite(websiteUrl),[websiteUrl]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState<LiveResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const points = useMemo(() => simulatedRankGrid({ businessName, city: localCity, niche }), [businessName, localCity, niche]);

  const runLiveScan = async () => {
    const kw = keyword.trim();
    const invalid = validateAuditInputs(scanMode, auditName, localCity, kw, auditWebsite);
    if (invalid) {
      setScanError(invalid);
      return;
    }
    setLoading(true);
    setScanError(null);
    try {
      const { data, error } = await supabase.functions.invoke("demo-rank-audit", {
        body: { businessName: auditName.trim(), city: localCity.trim(), keyword: kw, niche, websiteUrl: auditWebsite, mode: scanMode },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const details = await error.context.json().catch(() => null);
          throw new Error(details?.error || error.message);
        }
        throw error;
      }
      const result = data as LiveResult;
      if (result?.error) throw new Error(result.error);
      if (result?.mode === "live" && result.grid) {
        setLive(result);
        const entry={name:auditName.trim(),city:localCity.trim(),keyword:kw,mode:scanMode,website:auditWebsite,result,at:new Date().toISOString()};
        const next=[entry,...recent.filter(r=>!(r.name===entry.name && r.city===entry.city && r.keyword===entry.keyword && r.mode===entry.mode))].slice(0,5);
        setRecent(next); try {localStorage.setItem('rank-audit-recent',JSON.stringify(next));} catch { /* optional history */ }
      } else {
        setLive(null);
        setScanError(
          result?.reason === "daily_live_scan_cap_reached"
            ? "Today's live scan limit was reached — showing the simulated preview. Try again tomorrow."
            : "Live scan is unavailable right now — showing the simulated preview.",
        );
      }
    } catch (e: any) {
      setLive(null);
      setScanError(e?.message || "Live scan failed — showing the simulated preview.");
    } finally {
      setLoading(false);
    }
  };

  const isLiveMaps = live?.mode === "live" && live.scanMode === "maps" && live.center;
  const isLiveNationwide = live?.mode === "live" && live.scanMode === "nationwide";

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
          <div className="space-y-2"><p className="text-xs font-semibold">B2B examples</p><div className="flex flex-wrap gap-2">{rankAuditExamples.filter(e=>e.id==='manufacturer'||e.id==='supplier').map(e=><Button key={e.id} variant="outline" size="sm" className="h-auto whitespace-normal text-xs" onClick={()=>{setAuditName(e.name);setAuditWebsite(e.website);setLocalCity(e.location);setKeyword(e.keyword);setScanMode(e.mode);setLive(null);}}>{e.name}</Button>)}</div><p className="text-xs text-muted-foreground">Buyer searches: commercial cleaning, fleet repair, custom manufacturing, industrial supplies, business IT support.</p></div>
          {recent.length>0 && <div className="space-y-2"><p className="text-xs font-semibold">Recent audits</p>{recent.map((r,i)=><Button key={i} variant="outline" size="sm" className="h-auto w-full justify-start whitespace-normal text-left text-xs" onClick={()=>{setAuditName(r.name);setAuditWebsite(r.website);setLocalCity(r.city);setKeyword(r.keyword);setScanMode(r.mode);setLive(r.result);setScanError(null);}}>{r.name} · {r.keyword} · {new Date(r.at).toLocaleDateString()}</Button>)}</div>}
          {!live && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              <p><strong className="text-foreground">Simulated preview — not live rankings.</strong> Illustrative neighborhood pins, not actual business locations or measured Google results. Run the live audit below to measure real visibility.</p>
            </div>
          )}
          {live && (
            <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-xs text-muted-foreground">
              <Radar className="h-4 w-4 shrink-0 text-primary" />
              <p><strong className="text-foreground">Live data{live.cached ? " (cached — 0 extra credits)" : ""} · Serper Google {live.scanMode === "maps" ? "Maps" : "Search"}.</strong> Real search ordering per checkpoint — a strong visibility signal, not a guaranteed ranking.</p>
            </div>
          )}

          <div><label htmlFor="audit-business" className="mb-1 block text-xs font-medium">Exact business / branch name</label><Input id="audit-business" value={auditName} onChange={e => { setAuditName(e.target.value); setLive(null); }} maxLength={200} /></div>
          <div><label htmlFor="audit-website" className="mb-1 block text-xs font-medium">Business website</label><Input id="audit-website" value={auditWebsite} onChange={e=>{setAuditWebsite(e.target.value);setLive(null);}} maxLength={255}/></div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Audit type">
            <Button type="button" size="sm" variant={scanMode === "maps" ? "default" : "outline"} className="h-auto min-h-9 whitespace-normal text-xs" onClick={() => { setScanMode("maps"); setLive(null); }}>
              📍 Local Maps Grid
            </Button>
            <Button type="button" size="sm" variant={scanMode === "nationwide" ? "default" : "outline"} className="h-auto min-h-9 whitespace-normal text-xs" onClick={() => { setScanMode("nationwide"); setLive(null); }}>
              Nationwide Google Search
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {scanMode === "maps" && (
              <div>
                <label htmlFor="audit-city" className="mb-1 block text-xs font-medium">Branch address or city + state</label>
                <Input id="audit-city" value={localCity} onChange={e => { setLocalCity(e.target.value); setLive(null); }} maxLength={100} placeholder="e.g. Fort Lauderdale, FL" />
              </div>
            )}
            <div>
              <label htmlFor="audit-keyword" className="mb-1 block text-xs font-medium">Target keyword</label>
              <Input id="audit-keyword" value={keyword} onChange={e => { setKeyword(e.target.value); setLive(null); }} maxLength={150} placeholder={scanMode === "maps" ? 'e.g. "plumber"' : 'e.g. "industrial supplies"'} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{scanMode === "maps" ? "One location per scan. City + state is required; a full branch address helps avoid the wrong branch. ZIP is optional. Checkpoints are 1.6 km apart, about 2.8 miles from center to a corner." : "25 related buyer searches matched to this website. No ZIP required. This is Google organic search, not a geographic grid or a ChatGPT/Gemini citation test."}</p>
          <p className="text-xs text-muted-foreground">A fresh audit uses 25 Serper credits; identical results are reused for 7 days. Provider usage can become expensive. Maximum 30 fresh audits per day.</p>
          <Button onClick={runLiveScan} disabled={loading} className="h-auto min-h-11 w-full whitespace-normal py-3 font-semibold">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scanning 25 live checkpoints (30–60s)…</> : <><Radar className="mr-2 h-4 w-4" />Run Live 25-Point Audit</>}
          </Button>
          {scanError && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{scanError}</p>}

          {isLiveMaps && live.center && (
            <figure aria-label="Live 25-point map audit" className="space-y-3">
              <figcaption className="text-sm font-semibold">{live.center.formatted || localCity} · 25 live checkpoints</figcaption>
              <div className="overflow-hidden rounded-md border border-border">
                <div className="h-80"><RankStreetMap points={(live.grid || []).flatMap(p => typeof p.lat === "number" && typeof p.lng === "number" ? [{ lat: p.lat, lng: p.lng, rank: p.rank, businessCenter:p.row === 2 && p.col === 2 }] : [])} address={live.center.formatted || localCity} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Double outline and pointer = business location. Grid spacing: about 1 mile; corners about 2.8 miles from the business. Unknown checkpoints are not confirmed low rankings.</p>
            </figure>
          )}

          {isLiveNationwide && (
            <figure aria-label="Live 25-point nationwide search matrix" className="space-y-3">
              <figcaption className="text-sm font-semibold">25 B2B buyer searches · your organic position</figcaption>
              <div className="grid grid-cols-5 grid-rows-5 gap-2 rounded-md border border-border bg-muted/40 p-3">
                {(live.grid || []).map((cell, i) => (
                  <div key={i} className={`audit-rank-${liveTone(cell.rank)} flex aspect-square min-w-0 flex-col items-center justify-center rounded-full text-[10px] font-bold`} title={`${cell.query}: ${cell.rank != null ? `position #${cell.rank}` : "not in top 10"}`}>
                    {cell.rank != null ? `#${cell.rank}` : "—"}
                  </div>
                ))}
              </div>
            </figure>
          )}

          {!live && (
            <figure aria-label="Simulated 5 by 5 neighborhood rank grid" className="space-y-3">
              <figcaption className="text-sm font-semibold">{localCity ? `${localCity} · ` : ""}25 neighborhood checkpoints</figcaption>
              <div className="grid grid-cols-5 gap-3 rounded-md border border-border bg-muted/40 p-3">
                {points.map(point => (
                  <div key={`${point.row}-${point.col}`} data-audit-pin className={`audit-rank-${point.tone} mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold`} title={`Simulated row ${point.row + 1}, column ${point.col + 1}: rank ${point.rank}`}>
                    <span>#{point.rank}</span>
                  </div>
                ))}
              </div>
            </figure>
          )}

          {live?.stats && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border bg-secondary/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">Avg rank</p><p className="text-lg font-extrabold">{live.stats.avgRank ? `#${live.stats.avgRank.toFixed(1)}` : "—"}</p></div>
              <div className="rounded-lg border border-border bg-secondary/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">Top-3 visibility</p><p className="text-lg font-extrabold">{live.stats.top3VisibilityPct}%</p></div>
              <div className="rounded-lg border border-border bg-secondary/40 p-2"><p className="text-[10px] uppercase text-muted-foreground">Blind spots</p><p className="text-lg font-extrabold">{live.stats.blindSpots}</p></div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="audit-rank-good h-2.5 w-2.5 rounded-full" />1–3 · Visible</span>
            <span className="flex items-center gap-1.5"><i className="audit-rank-warning h-2.5 w-2.5 rounded-full" />4–10 · At risk</span>
            <span className="flex items-center gap-1.5"><i className="audit-rank-bad h-2.5 w-2.5 rounded-full" />11+ · Low visibility</span>
            <span className="flex items-center gap-1.5"><i className="audit-rank-unknown h-2.5 w-2.5 rounded-full" />— · Not found / unavailable</span>
          </div>

          <section className="border-t border-border pt-4">
            <h3 className="text-lg font-bold">Our 3-Part Growth Timeline</h3>
            <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Week 1 — Immediate ROI, zero waiting on Google:</strong> Aspen goes live 24/7 on your website and phone lines, and your first batch of verified B2B leads (up to {auditOffers.monthlyLeads}/mo) is delivered to your dashboard.</li>
              <li><strong className="text-foreground">Days 1–14 — Fast-win technical &amp; category fixes:</strong> We deploy AI Answer Engine Schema (llms.txt + JSON-LD for ChatGPT/Gemini), align your exact Google Business Profile categories, and flag keyword-stuffing competitors to capture low-hanging ranking jumps.</li>
              <li><strong className="text-foreground">Days 15–60 — Compound map &amp; search expansion:</strong> Automated weekly Google posts, review velocity, and AI citation pages steadily expand your green zone across surrounding areas and national buyer searches.</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">A realistic action plan, not a ranking guarantee. Prospect records are not guaranteed appointments or opt-in buyers. Google decides whether reported policy violations are removed.</p>
          </section>
          <div className="space-y-2 border-t border-border pt-4">
            <Button asChild className="h-auto min-h-11 w-full whitespace-normal py-3"><Link to="/checkout?plan=essentials">Claim ${auditOffers.founder}/mo Founder Plan</Link></Button>
            <Button asChild variant="outline" className="h-auto min-h-11 w-full whitespace-normal py-3"><Link to="/book?offer=google-maps-boost">Request ${auditOffers.mapsBoost}/mo Google Maps Boost</Link></Button>
            <p className="text-xs text-muted-foreground">Founder Plan uses Premium checkout. Google Maps Boost is confirmed during an implementation call; this button does not charge you.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
