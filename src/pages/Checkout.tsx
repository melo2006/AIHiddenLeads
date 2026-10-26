import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { useState, useEffect } from 'react';
import { getStripePriceId } from '@/lib/stripe';

const planDetails: Record<string, { name: string; price: string; features: string[]; priceId: string }> = {
  essentials: {
    name: "AI Essentials — Voice + Chat + 50 B2B Leads",
    price: "$99/mo",
    priceId: "essentials_monthly",
    features: [
      "AI Voice Agent — 24/7 receptionist for your business",
      "AI Chat Widget installed on your website",
      "Lead capture & appointment booking",
      "400 browser voice minutes/mo (≈ $0.25/min value)",
      "50 qualified B2B leads per month, delivered weekly",
      "Email lead notifications",
      "Basic analytics dashboard",
    ],
  },
  growth: {
    name: "Growth Engine — More Voice + 100 Leads + Reactivation",
    price: "$199/mo",
    priceId: "growth_monthly",
    features: [
      "Everything in AI Essentials",
      "1,200 browser voice minutes/mo (≈ $0.17/min value)",
      "100 qualified B2B leads per month",
      "Database Reactivation — revive old/cold leads",
      "Automated email campaigns & drip sequences",
      "Speed-to-Lead follow-up",
      "Google Review management",
      "Full CRM pipeline & tracking",
    ],
  },
  fullservice: {
    name: "Full Service — Complete Marketing Machine",
    price: "$349/mo",
    priceId: "fullservice_monthly",
    features: [
      "Everything in Growth Engine",
      "2,500 browser voice minutes/mo (≈ $0.14/min value)",
      "200 qualified B2B leads per month",
      "Social media content creation & posting",
      "Website refresh included",
      "Priority support",
      "Dedicated account manager",
      "White-label reporting",
    ],
  },
};

const disclaimers = [
  "Included minutes cover browser voice conversations on your website. Phone-line services (warm transfer to your phone, SMS notifications, appointment reminders) are optional add-ons billed separately — carrier usage is passed through at cost.",
  "Lead generation results vary by industry, location, and market conditions. We deliver qualified B2B prospect records; we do not guarantee appointments or revenue outcomes.",
  "You may cancel your subscription at any time. No long-term contracts required.",
  "Setup fee is waived through November 30 as a launch promotion; after that it is a one-time charge for initial configuration, widget installation, and onboarding.",
  "Usage is visible in your dashboard at all times before any billing.",
];

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const planKey = searchParams.get("plan") || "essentials";
  const plan = planDetails[planKey] || planDetails.essentials;
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [priceReady, setPriceReady] = useState(false);
  const paymentsAvailable = Boolean(import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN);
  useEffect(() => {
    let active = true;
    setPriceReady(false);
    setPaymentFailed(false);
    if (paymentsAvailable) void getStripePriceId(plan.priceId).then(() => { if (active) setPriceReady(true); }).catch(() => { if (active) setPaymentFailed(true); });
    return () => { active = false; };
  }, [plan.priceId, paymentsAvailable]);

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Plans
        </Button>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Order Summary */}
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{plan.name}</h1>
              <p className="text-3xl font-extrabold text-primary mt-2">{plan.price}</p>
              <p className="text-sm text-muted-foreground mt-1">Launch Special — setup fee waived through Nov 30, included minutes doubled</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" /> What's Included
              </h3>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Our Guarantee
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>✅ Cancel anytime — no long-term contracts</li>
                <li>✅ 14-day money-back guarantee if not satisfied</li>
                <li>✅ Free onboarding call with our team</li>
                <li>✅ Full usage transparency in your dashboard</li>
              </ul>
            </div>

            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" /> Important Disclaimers
              </h3>
              <ul className="space-y-2">
                {disclaimers.map((d, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                    {i + 1}. {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Payment Form */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Complete Your Order</h2>
            <div className="rounded-xl border border-border bg-card p-1 min-h-[400px]">
              {paymentsAvailable && !paymentFailed && !priceReady ? <p role="status" className="p-5 text-sm text-muted-foreground">Checking checkout availability…</p> : paymentsAvailable && !paymentFailed && priceReady ? <StripeEmbeddedCheckout
                priceId={plan.priceId}
                returnUrl={`${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`}
                onUnavailable={() => setPaymentFailed(true)}
              /> : <div className="space-y-3 p-5" role="status"><h3 className="font-semibold">Online checkout is not available yet</h3><p className="text-sm text-muted-foreground">No payment has been taken. Book a quick 15-minute call to discuss this plan and setup.</p><Button onClick={() => navigate('/book')}>Book a quick call</Button></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
