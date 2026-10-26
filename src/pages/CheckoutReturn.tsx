import { useSearchParams, useNavigate } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getStripeEnvironment } from '@/lib/stripe';

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("session_id");
  const [paid,setPaid]=useState(false),[message,setMessage]=useState('Confirming your payment…');
  useEffect(()=>{let active=true;if(sessionId)void supabase.functions.invoke('customer-billing',{body:{action:'verify',sessionId,environment:getStripeEnvironment()}}).then(({data,error})=>{if(!active)return;setPaid(data?.paid===true);setMessage(data?.paid?'Your payment is verified. You can now configure your business assistant.':error?'We could not verify this payment for your account. Sign in and check again.':'Payment is still pending. Setup opens once it succeeds.');});return()=>{active=false;};},[sessionId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md mx-auto text-center px-4 space-y-6">
        {sessionId ? (
          <>
            <Shield className="w-16 h-16 text-primary mx-auto" />
            <h1 className="text-3xl font-bold text-foreground">{paid?'Payment confirmed':'Payment confirmation needed'}</h1>
            <p className="text-muted-foreground">
              {message}
            </p>
            <div className="rounded-xl border border-border bg-card p-5 text-left space-y-2">
              <h3 className="font-semibold text-foreground">What happens next:</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>1. Verify your payment and customer account</li>
                <li>2. Review your website knowledge and FAQs</li>
                <li>3. Test your assistant before installation</li>
              </ul>
            </div>
            <Button onClick={() => navigate(paid?'/setup':'/book')} className="w-full">
              {paid?'Start guided setup':'Book a quick call'}
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-foreground">No session found</h1>
            <p className="text-muted-foreground">It looks like you arrived here by accident.</p>
            <Button onClick={() => navigate("/")} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Go Home
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
