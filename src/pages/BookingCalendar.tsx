import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarPlus, Loader2 } from "lucide-react";

// Landing page for the short calendar-invite link in the booking
// confirmation SMS: https://aihiddenleads.com/cal/<bookingId>.
// Fetches the booking's .ics from the get-booking-ics edge function and
// turns it into a download so the phone offers "add to calendar". The
// auto-download is best-effort (mobile browsers can decline a programmatic
// download after an async fetch), so a real tap target — the fallback
// button below — always carries the same file once it has loaded.

const ICS_FILENAME = "ai-hidden-leads-call.ics";

type State =
  | { kind: "working" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

export default function BookingCalendar() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [state, setState] = useState<State>({ kind: "working" });
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setState({ kind: "error", message: "This calendar link is missing its booking reference." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const base = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!base || !key) throw new Error("Calendar download is not configured.");
        const res = await fetch(
          `${base}/functions/v1/get-booking-ics?bookingId=${encodeURIComponent(bookingId)}`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        if (!res.ok) throw new Error("not-found");
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setState({ kind: "ready", url });
        // Best-effort automatic download; the button below is the reliable
        // path when a browser declines this (notably mobile Safari).
        const a = document.createElement("a");
        a.href = url;
        a.download = ICS_FILENAME;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            message: "We could not find that booking's calendar invite. Your confirmation email carries the same invite as an attachment.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [bookingId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <div className="text-center space-y-4 max-w-sm">
        <CalendarPlus className="h-10 w-10 mx-auto text-primary" />
        {state.kind === "working" && (
          <>
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Adding your call to your calendar…
            </p>
          </>
        )}
        {state.kind === "ready" && (
          <>
            <p className="text-sm text-muted-foreground">
              Adding your call to your calendar… If the download did not start, tap the button below.
            </p>
            <a
              href={state.url}
              download={ICS_FILENAME}
              className="inline-block rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
            >
              Download calendar invite
            </a>
          </>
        )}
        {state.kind === "error" && (
          <>
            <p className="text-sm text-destructive">{state.message}</p>
            <a href="/book" className="text-xs text-primary hover:underline">
              Book a call instead
            </a>
          </>
        )}
      </div>
    </div>
  );
}
