import { useEffect, useState } from "react";
import { Minus, Plus, RotateCcw, Type } from "lucide-react";
import { Button } from "@/components/ui/button";

const sizes = [90, 100, 110, 125, 150];
export default function TextSizeControl() {
  const [size, setSize] = useState(() => {
    try { const saved = Number(localStorage.getItem("reading-text-size")); return sizes.includes(saved) ? saved : 100; } catch { return 100; }
  });
  useEffect(() => {
    document.documentElement.dataset.textSize = String(size);
    try { localStorage.setItem("reading-text-size", String(size)); } catch { /* Reading remains available without storage. */ }
  }, [size]);
  const index = sizes.indexOf(size);
  return <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-3">
    <span className="flex items-center gap-2 text-sm"><Type className="h-4 w-4" />Text size</span>
    <div className="flex items-center gap-1">
      <Button size="icon" variant="outline" disabled={index === 0} aria-label="Decrease text size" title="Smaller text" onClick={() => setSize(sizes[index - 1])}><Minus /></Button>
      <output aria-live="polite" className="w-12 text-center text-xs">{size}%</output>
      <Button size="icon" variant="outline" disabled={index === sizes.length - 1} aria-label="Increase text size" title="Larger text" onClick={() => setSize(sizes[index + 1])}><Plus /></Button>
      <Button size="icon" variant="ghost" aria-label="Reset text size" title="Reset to 100%" onClick={() => setSize(100)}><RotateCcw /></Button>
    </div>
  </div>;
}