import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarCheck, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { type Slot } from "@/lib/bookingSlots";

const dayLabel = (dateStr: string) =>
  new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default function BookCall() {
  const navigate = useNavigate();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [checking, setChecking] = useState(true);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", businessName: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.functions.invoke('platform-availability').then(async ({data,error}) => {
      setChecking(false);
      if (error || !data?.calendarVerified) { setError(data?.error || 'Calendar availability could not be verified. Please try again later.'); return; }
      setSlots(data.slots || []);
    });
  }, []);

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      if (taken.has(s.iso)) continue;
      map.set(s.dateStr, [...(map.get(s.dateStr) ?? []), s]);
    }
    return [...map.entries()].filter(([, v]) => v.length > 0);
  }, [slots, taken]);

  const activeDay = day && days.some(([d]) => d === day) ? day : days[0]?.[0] ?? null;
  const daySlots = days.find(([d]) => d === activeDay)?.[1] ?? [];

  const submit = async () => {
    if (!slot) return;
    setError(null);
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter your name and a valid email.");
      return;
    }
    setSubmitting(true);
    const { data, error: fnErr } = await supabase.functions.invoke("book-implementation-call", {
      body: { ...form, slotStart: slot.iso, confirmed: true },
    });
    setSubmitting(false);
    if (fnErr || !data?.ok) {
      setError((data?.error as string) || "Booking failed — please try another time or try again.");
      return;
    }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Button>

        {done ? (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
            <CalendarCheck className="w-12 h-12 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">You're booked!</h1>
            <p className="text-muted-foreground">
              Your free implementation call is confirmed on our sales calendar for{" "}
              <span className="text-foreground font-medium">
                {slot && new Date(slot.iso).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "America/New_York" })} (ET)
              </span>
              . Your details are saved; no email confirmation has been sent.
            </p>
            <Button className="mt-6" onClick={() => navigate("/")}>Back to Home</Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Book Your Free Implementation Call</h1>
            <p className="text-muted-foreground mb-8">
              15 minutes, one-on-one with our team. We'll answer your questions and plan your setup. Times shown in Eastern Time (ET).
            </p>

            <h2 className="text-sm font-semibold mb-3">1. Pick a day</h2>{checking && <p className="text-sm text-muted-foreground">Checking Google Calendar…</p>}{!checking && !days.length && <p className="text-sm text-muted-foreground">No available sales appointments in the next 14 days.</p>}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
              {days.map(([d]) => (
                <Button variant="outline"
                  key={d}
                  onClick={() => { setDay(d); setSlot(null); }}
                  className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                    d === activeDay ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {dayLabel(d)}
                </Button>
              ))}
            </div>

            <h2 className="text-sm font-semibold mb-3">2. Pick a time</h2>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-8">
              {daySlots.map((s) => (
                <Button variant="outline"
                  key={s.iso}
                  onClick={() => setSlot(s)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                    slot?.iso === s.iso ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {s.label}
                </Button>
              ))}
            </div>

            <h2 className="text-sm font-semibold mb-3">3. Your details</h2>
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input placeholder="Your name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} />
                <Input placeholder="Email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
                <Input placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
                <Input placeholder="Business name (optional)" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} maxLength={150} />
              </div>
              <Textarea placeholder="What would you like help with? (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} rows={3} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" disabled={!slot || submitting} onClick={submit}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                {slot ? `Book ${dayLabel(slot.dateStr)} at ${slot.label} ET` : "Pick a time above"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
