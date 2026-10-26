import { useSearchParams, useNavigate } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CheckoutReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md mx-auto text-center px-4 space-y-6">
        {sessionId ? (
          <>
            <Shield className="w-16 h-16 text-primary mx-auto" />
            <h1 className="text-3xl font-bold text-foreground">Payment confirmation needed</h1>
            <p className="text-muted-foreground">
              Returning from checkout does not confirm payment. Customer setup will only open after payment is verified. Book a quick call if you need help with your order.
            </p>
            <div className="rounded-xl border border-border bg-card p-5 text-left space-y-2">
              <h3 className="font-semibold text-foreground">What happens next:</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>1. Verify your payment and customer account</li>
                <li>2. Review your website knowledge and FAQs</li>
                <li>3. Test your assistant before installation</li>
              </ul>
            </div>
            <Button onClick={() => navigate("/book")} className="w-full">
              Book a quick call
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
