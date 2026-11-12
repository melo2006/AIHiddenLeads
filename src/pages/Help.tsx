import { useState } from "react";
import { Link } from "react-router-dom";
import { LifeBuoy, Phone } from "lucide-react";
import CustomerPageLayout from "@/components/CustomerPageLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarrierGuideView } from "@/components/setup-wizard/PhoneSetupPanel";
import { CARRIER_GUIDES, carrierGuide } from "../../supabase/functions/_shared/carrier-guides";

/** Onboarding FAQs shown on /help. (Deliberately NOT in scripts/seo-routes
 *  .mjs: that table is pinned to the four sitemap routes.) */
export const HELP_FAQS: { q: string; a: string }[] = [
  {
    q: "How do I log in for the first time?",
    a: "After checkout you get a welcome email with a Set my password button. That link signs you in and lets you choose your own password — we never invent one or email one to you. From then on you sign in with your email and that password, and you can request a fresh reset link from the sign-in page any time.",
  },
  {
    q: "How does Aspen answer my business calls without taking my number?",
    a: "You keep your number and your carrier. In the setup wizard you choose \"forward my existing number\", pick how many rings your phone gets first (2, 3, 4 or 5), and set conditional (no-answer) call forwarding on your carrier to your Aspen number. Your phone rings first; only calls you don't answer reach Aspen. Turning it off is one code or menu tap on the same carrier.",
  },
  {
    q: "What if my carrier doesn't offer no-answer forwarding?",
    a: "Some carriers — Google Fi is one — have no no-answer forwarding at all, and some prepaid brands don't publish steps. The wizard offers two other routes: port (bring) your number to us, which takes several business days while we handle the paperwork, or get a brand-new Aspen number in your area code. Either way Aspen ends up answering your calls.",
  },
  {
    q: "How long does porting my number take?",
    a: "Usually several business days — your current carrier has to release the number, and timing is theirs, not ours. Keep your old line active until we confirm the port is complete, or callers won't reach you. Saving the port step in the wizard records your request with our team; it does not move the number instantly.",
  },
  {
    q: "What are the setup steps after I pay?",
    a: "Five first steps, tracked on a checklist in your dashboard: your bookings calendar (nothing to connect — Aspen books and emails you every appointment), set up your phone number, teach Aspen your business from your website and FAQs, make a test call, and go live by publishing and adding one small snippet to your website. Most people finish in about 10–15 minutes. Alex, the setup guide inside the wizard, can walk you through it live.",
  },
  {
    q: "Can Aspen connect to our phone system or SIP trunk directly?",
    a: "That's an advanced integration, not part of the self-service wizard. Most businesses — including brokerages with a trunk of numbers — simply forward their main number to Aspen, which needs no phone-system changes. If you need a direct SIP-trunk integration, talk to us at (877) 862-4949 before choosing a setup route.",
  },
];

/** Help & support (onboarding batch, 2026-11-12): the carrier forwarding
 *  library + onboarding FAQs. The carrier guides live in
 *  _shared/carrier-guides.ts, the same data the setup wizard and Alex use. */
export default function Help() {
  const [carrierId, setCarrierId] = useState("verizon");
  const guide = carrierGuide(carrierId);
  const faqs = HELP_FAQS;
  const [open, setOpen] = useState(0);

  return (
    <CustomerPageLayout>
      <main className="mx-auto w-full max-w-3xl space-y-8 p-4 sm:p-6">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><LifeBuoy className="h-6 w-6 text-primary" /> Help &amp; support</h1>
          <p className="text-sm text-muted-foreground">
            Forwarding guides for your phone carrier, answers about setup, and a human when you need one:
            call <a className="font-medium text-primary underline" href="tel:+18778624949">(877) 862-4949</a> or email{" "}
            <a className="font-medium text-primary underline" href="mailto:info@aihiddenleads.com">info@aihiddenleads.com</a>.
            Inside the <Link className="font-medium text-primary underline" to="/setup">setup wizard</Link>, Alex — our setup guide — can walk you through any of this live.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Phone className="h-5 w-5 text-primary" /> Forward your number to Aspen</h2>
          <p className="text-sm text-muted-foreground">
            The idea: your phone rings first, and only the calls you don&rsquo;t answer forward to Aspen. That setting is called
            <strong> conditional</strong> or <strong>no-answer call forwarding</strong>, and it&rsquo;s set on your own carrier — pick yours for the exact steps.
            Every guide below was checked against the carrier&rsquo;s own support pages; where a carrier doesn&rsquo;t publish verified steps, the guide says so honestly instead of guessing.
          </p>
          <Select value={carrierId} onValueChange={setCarrierId}>
            <SelectTrigger aria-label="Choose your carrier" className="max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{CARRIER_GUIDES.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}{g.country === "CA" ? " (Canada)" : ""}{g.hostNetwork ? ` · on ${g.hostNetwork}` : ""}</SelectItem>)}</SelectContent>
          </Select>
          {guide && <CarrierGuideView guide={guide} />}
          <p className="text-xs text-muted-foreground">
            Don&rsquo;t see your carrier? Any carrier&rsquo;s support line can turn on conditional call forwarding for you — or call us at (877) 862-4949 and we&rsquo;ll walk you through it.
            If your carrier can&rsquo;t do no-answer forwarding, the setup wizard&rsquo;s port and new-number routes will still get Aspen answering your calls.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Setup questions</h2>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {faqs.map((f, i) => (
              <div key={f.q}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                  {f.q}<span className="text-muted-foreground">{open === i ? "−" : "+"}</span>
                </button>
                {open === i && <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>}
              </div>
            ))}
          </div>
        </section>
      </main>
    </CustomerPageLayout>
  );
}
