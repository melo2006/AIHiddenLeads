import { useState } from "react";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const SUPPORT_TOPICS = ["Setup", "Installation", "CRM & integrations", "Billing", "Technical problem", "Other"] as const;
export const SUPPORT_URGENCIES = ["Low", "Normal", "High", "Urgent"] as const;

/**
 * The official support ticket form for /help (Ron's order, 2026-11-21).
 * Submitting invokes the support-ticket edge function, which stores a
 * real row in support_tickets and emails it to the support team; the
 * visitor gets the ticket reference back on screen. No dead form: a
 * failure shows an error with the phone number as the fallback.
 */
export default function SupportTicketForm() {
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>("Technical problem");
  const [urgency, setUrgency] = useState<string>("Normal");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()) || message.trim().length < 10) {
      setError("Please add your name, a valid email, and a few words about the problem (at least a sentence).");
      return;
    }
    setSending(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("support-ticket", {
        body: { name: name.trim(), businessName: businessName.trim(), email: email.trim(), topic, urgency, message: message.trim() },
      });
      if (fnError || !data?.reference) throw new Error("send failed");
      setReference(data.reference as string);
    } catch {
      setError("Your ticket could not be sent just now. Please try again, or call us at 1-877-862-4949 and we will open it with you.");
    } finally {
      setSending(false);
    }
  };

  if (reference) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 text-center" role="status">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-primary" />
        <p className="text-base font-semibold">Ticket {reference} — we have it.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Your ticket was saved and emailed to our support team. Keep the reference <strong className="text-foreground">{reference}</strong> for
          follow-ups — and if it is urgent, call <a className="font-medium text-primary underline" href="tel:+18778624949">1-877-862-4949</a> and quote it.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => { setReference(""); setMessage(""); }}>
          Send another ticket
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Your name *
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jane Smith" required />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Business
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoComplete="organization" placeholder="Smith Dental" />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        Email *
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@yourbusiness.com" required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Topic
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger aria-label="Ticket topic"><SelectValue /></SelectTrigger>
            <SelectContent>{SUPPORT_TOPICS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Urgency
          <Select value={urgency} onValueChange={setUrgency}>
            <SelectTrigger aria-label="Ticket urgency"><SelectValue /></SelectTrigger>
            <SelectContent>{SUPPORT_URGENCIES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        What is happening? *
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="Tell us what you were doing, what you expected, and what happened instead. The page or step you were on helps a lot." required />
      </label>
      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={sending} className="w-full sm:w-auto">
        <Send className="mr-2 h-4 w-4" /> {sending ? "Sending…" : "Send support ticket"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Sending creates a real ticket with a reference number and emails it to our support team. We reply to the email address you give here.
      </p>
    </form>
  );
}
