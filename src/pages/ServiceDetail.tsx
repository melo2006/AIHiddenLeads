import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LandingNavbar from "@/components/landing/LandingNavbar";
import Footer from "@/components/landing/Footer";
import { findServiceDetail } from "@/data/serviceDetails";
import { supabase } from "@/integrations/supabase/client";
import PhoneFirstOffer from "@/components/landing/PhoneFirstOffer";

const ServiceDetail = () => {
  const { id } = useParams();
  const s = findServiceDetail(id);
  const [voicePrice, setVoicePrice] = useState<number | null>(null);
  useEffect(() => {
    if (s) document.title = `${s.name} | AI Hidden Leads`;
    if (id === "voice") supabase.rpc("get_public_telephony_prices").then(({ data }) => setVoicePrice(data?.[0]?.voice_per_min ?? null));
  }, [s, id]);
  if (!s) return <Navigate to="/#services" replace />;
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main className="container mx-auto max-w-3xl px-5 py-12">
        <Link to="/#services" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />All services</Link>
        <Badge variant="outline" className="mt-6 block w-fit border-primary/40 text-primary">{s.status === "available" ? "Available" : "Pre-order · activates after setup"}</Badge>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{s.problem}</h1>
        <p className="mt-4 text-muted-foreground">{s.today}</p>
        <h2 className="mt-8 text-xl font-semibold text-primary">{s.name}</h2>
        <p className="mt-2 leading-relaxed">{s.solution}</p>
        <ul className="mt-6 space-y-3">
          {s.details.map((d) => <li key={d} className="flex gap-2 text-sm"><Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />{d}</li>)}
          {voicePrice != null && <li className="flex gap-2 text-sm"><Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />Phone usage: {(voicePrice * 100).toFixed(1).replace(/\.0$/, "")}¢ per minute, billed by the second.</li>}
        </ul>
        {id === 'voice' && <PhoneFirstOffer />}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild><Link to="/plans">{s.status === "available" ? "Get started" : "Pre-order"}</Link></Button>
          <Button asChild variant="outline"><Link to="/demo">Try my website — free demo</Link></Button>
        </div>
      </main>
      <Footer />
    </div>
  );
};
export default ServiceDetail;
