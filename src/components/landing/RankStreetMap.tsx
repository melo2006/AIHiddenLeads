import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface StreetRankPoint { lat: number; lng: number; rank: number | null; index?: number }
export default function RankStreetMap({ points, onSelect, selected, illustrative = false }: { points: StreetRankPoint[]; onSelect?: (index: number) => void; selected?: number; illustrative?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const markers = useRef<L.Marker[]>([]);
  useEffect(() => {
    if (!ref.current || !points.length) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, dragging: !illustrative, doubleClickZoom: !illustrative });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    markers.current = points.map((p, i) => {
      const tone = p.rank === null ? "unknown" : p.rank <= 3 ? "good" : p.rank <= 10 ? "warning" : "bad";
      const label = p.rank === null ? "—" : p.rank > 20 ? "20+" : String(p.rank);
      const marker = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "rank-map-icon", html: `<span class="rank-map-pin audit-rank-${tone}">${label}</span>`, iconSize: [32, 32], iconAnchor: [16, 16] }) }).addTo(map);
      marker.bindTooltip(`${illustrative ? "Illustrative" : "Search"} checkpoint ${i + 1}: ${p.rank === null ? "not found or unavailable" : `position ${label}`}`);
      if (onSelect) marker.on("click", () => onSelect(p.index ?? i));
      return marker;
    });
    map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number])).pad(0.22));
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(ref.current);
    return () => { observer.disconnect(); map.remove(); markers.current = []; };
  }, [points, onSelect, illustrative]);
  useEffect(() => { markers.current.forEach((marker, i) => marker.getElement()?.classList.toggle("rank-map-selected", (points[i]?.index ?? i) === selected)); }, [selected, points]);
  return <div ref={ref} className="rank-street-map h-full min-h-72 w-full" aria-label={illustrative ? "Illustrative rankings over Fort Lauderdale street map" : "Live search checkpoints on street map"} />;
}