import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Completing Google sign-in...");

  useEffect(() => {
    let active = true;
    const destination=new URLSearchParams(window.location.search).get('next')||sessionStorage.getItem('customer-auth-return');
    const returnPath=destination&&!destination.startsWith('//')&&(destination.startsWith('/checkout')||destination.startsWith('/setup'))?destination:'/dashboard/calls';

    const openDashboard = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error) {
        setMessage("We could not complete sign-in. Please return to the admin login and try again.");
        return;
      }

      if (data.session) {
        navigate(returnPath, { replace: true });
        return;
      }

      setMessage("Waiting for Google to finish signing you in...");
    };

    void openDashboard();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) navigate(returnPath, { replace: true });
    });

    const timeout = window.setTimeout(() => {
      if (active) setMessage("Sign-in did not finish. Return to the admin login and try again.");
    }, 12000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <main className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <img src="/logo.png" alt="AI Hidden Leads" className="mx-auto h-12 w-12" />
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard", { replace: true })}>
          Return to admin login
        </Button>
      </div>
    </main>
  );
};

export default AuthCallback;