import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Loader2, Target, TrendingDown, Zap, CalendarCheck } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GridPoint {
  lat: number;
  lng: number;
  row: number;
  col: number;
  rank: number | null;
  matchedName?: string;
}

interface ScanResult {
  center: { lat: number; lng: number };
  grid: GridPoint[];
  keyword: string;
  businessName: string;
  stats: {
    totalCells: number;
    rankedCells: number;
    avgRank: number | null;
    top3VisibilityPct: number;
  };
}

interface Props {
  businessName: string;
  websiteUrl: string;
  defaultKeyword?: string;
  onBookCall?: () => void;
  onVoiceCall?: () => void;
}

const rankColor = (rank: number | null) => {
  if (rank == null) return "#dc2626"; // red — not in top 20
  if (rank <= 3) return "#16a34a"; // green
  if (rank <= 10) return "#facc15"; // yellow
  return "#f97316"; // orange
};

const rankLabel = (rank: number | null) => (rank == null ? "20+" : `#${rank}`);

// Plain Leaflet (imperative) — react-leaflet v5 requires React 19, this project is React 18.
const ScanMap = ({ center, grid }: { center: { lat: number; lng: number }; grid: GridPoint[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView([center.lat, center.lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
    const pts: L.LatLngExpression[] = [];
    grid.forEach((p) => {
      pts.push([p.lat, p.lng]);
      const color = rankColor(p.rank);
      L.circleMarker([p.lat, p.lng], { radius: 22, color, fillColor: color, fillOpacity: 0.75, weight: 2 })
        .addTo(map)
        .bindTooltip(rankLabel(p.rank), { permanent: true, direction: "center", className: "rank-pin-label" });
    });
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.1));
    const t = setTimeout(() => map.invalidateSize(), 300);
    return () => { clearTimeout(t); map.remove(); };
  }, [center, grid]);
  return <div ref={ref} className="h-full w-full" />;
};

const GeoGridWidget = ({ businessName, websiteUrl, defaultKeyword, onBookCall, onVoiceCall }: Props) => {
  const [keyword, setKeyword] = useState(defaultKeyword || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    if (!keyword.trim()) {
      toast.error("Enter a target keyword");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("geo-grid-scan", {
        body: { businessName, websiteUrl, keyword: keyword.trim(), gridSize: 3, stepKm: 1.6 },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as ScanResult);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Scan failed. Try again.");
      toast.error("Geo-Grid scan failed", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  const stats = result?.stats;
  const blindSpots = useMemo(
    () => (result?.grid || []).filter((g) => g.rank == null || g.rank > 10).length,
    [result],
  );

  return (
    <section className="w-full max-w-5xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 sm:p-7 shadow-[0_0_60px_-20px_hsl(var(--primary)/0.4)]"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/30">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-2xl font-extrabold leading-tight">
              Local Google Maps <span className="text-primary">Blind-Spot</span> Diagnostic
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Live scan of your Google Maps rank across a 3×3 geo-grid around <span className="font-semibold text-foreground">{businessName}</span>.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder='Target keyword (e.g. "med spa near me")'
            disabled={loading}
            className="h-11"
          />
          <Button onClick={runScan} disabled={loading} className="h-11 font-semibold whitespace-nowrap">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scanning…</> : <><MapPin className="w-4 h-4 mr-2" />Run Geo-Grid Scan</>}
          </Button>
        </div>

        {loading && (
          <div className="text-xs text-muted-foreground italic">
            Querying Google Maps across 9 hyper-local checkpoints — this takes 60-120 seconds.
          </div>
        )}

        {error && !loading && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4 mt-2">
            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Avg Rank" value={stats?.avgRank ? `#${stats.avgRank.toFixed(1)}` : "—"} tone={stats?.avgRank && stats.avgRank <= 5 ? "good" : "bad"} />
              <Stat label="Top-3 Visibility" value={`${stats?.top3VisibilityPct ?? 0}%`} tone={(stats?.top3VisibilityPct ?? 0) >= 50 ? "good" : "bad"} />
              <Stat label="Cells Ranked" value={`${stats?.rankedCells ?? 0}/${stats?.totalCells ?? 0}`} />
              <Stat label="Blind Spots" value={`${blindSpots}`} tone={blindSpots === 0 ? "good" : "bad"} icon={<TrendingDown className="w-3 h-3" />} />
            </div>

            {/* Map */}
            <div className="h-[360px] sm:h-[440px] rounded-xl overflow-hidden border border-border">
              <MapContainer center={[result.center.lat, result.center.lng]} zoom={13} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds points={result.grid} />
                {result.grid.map((p, i) => (
                  <CircleMarker
                    key={i}
                    center={[p.lat, p.lng]}
                    radius={22}
                    pathOptions={{ color: rankColor(p.rank), fillColor: rankColor(p.rank), fillOpacity: 0.75, weight: 2 }}
                  >
                    <Tooltip permanent direction="center" className="!bg-transparent !border-0 !shadow-none !text-white !font-bold !text-xs">
                      {rankLabel(p.rank)}
                    </Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            {/* Voice agent narrative + CTAs */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
              <p className="text-sm sm:text-base text-foreground leading-relaxed">
                Fixing these map blind spots takes roughly <span className="font-semibold text-primary">2 to 4 weeks</span> of consistent localized
                proximity signal adjustments. Deploy our automated hyper-local asset system and let our custom AI voice agent handle the incoming
                caller volume as your local pins turn <span className="text-emerald-500 font-semibold">green</span>.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button onClick={onVoiceCall} className="flex-1 h-12 font-bold">
                  <Zap className="w-4 h-4 mr-2" />
                  Talk to Our Automated Specialist Now
                </Button>
                <Button onClick={onBookCall} variant="outline" className="flex-1 h-12 font-bold">
                  <CalendarCheck className="w-4 h-4 mr-2" />
                  Book a Strategy Call
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </section>
  );
};

const Stat = ({ label, value, tone, icon }: { label: string; value: string; tone?: "good" | "bad"; icon?: React.ReactNode }) => (
  <div className={`rounded-lg border p-2 text-center ${tone === "good" ? "border-emerald-500/40 bg-emerald-500/10" : tone === "bad" ? "border-destructive/40 bg-destructive/10" : "border-border bg-secondary/40"}`}>
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-1">{icon}{label}</p>
    <p className="text-base sm:text-lg font-extrabold">{value}</p>
  </div>
);

export default GeoGridWidget;
