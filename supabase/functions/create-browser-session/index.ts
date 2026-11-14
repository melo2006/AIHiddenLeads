import { buildCookieConsentDismissalScript } from "../_shared/cookie-consent-dismissal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BROWSERBASE_API_URL = "https://api.browserbase.com/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("BROWSERBASE_API_KEY");
    const projectId = Deno.env.get("BROWSERBASE_PROJECT_ID");

    if (!apiKey) throw new Error("BROWSERBASE_API_KEY is not configured");
    if (!projectId) throw new Error("BROWSERBASE_PROJECT_ID is not configured");

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'url' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create session
    const createRes = await fetch(`${BROWSERBASE_API_URL}/sessions`, {
      method: "POST",
      headers: {
        "x-bb-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        browserSettings: { blockAds: true },
        keepAlive: true,
        timeout: 300,
      }),
    });

    if (!createRes.ok) {
      const errorBody = await createRes.text();
      console.error("Session creation failed:", createRes.status, errorBody);

      // Handle billing/quota errors gracefully so frontend can fallback
      if (createRes.status === 402 || createRes.status === 429) {
        return new Response(
          JSON.stringify({
            error: "QUOTA_EXCEEDED",
            message: "Browser session quota reached. Falling back to iframe preview.",
            fallback: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Browserbase API error [${createRes.status}]: ${errorBody}`);
    }

    const session = await createRes.json();
    const sessionId = session.id;
    const connectUrl = session.connectUrl;
    if (!sessionId) throw new Error("No session ID returned");

    console.log("Session created:", sessionId);

    // 2. Navigate via CDP WebSocket and wait for the page to actually load
    let navigated = false;
    if (connectUrl) {
      try {
        navigated = await navigateViaCDP(connectUrl, url);
      } catch (e) {
        console.warn("CDP WebSocket navigation failed:", e);
      }
    }

    // 3. Fetch debug URL only after navigation attempt so the live view is less likely to show a blank shell
    await new Promise((r) => setTimeout(r, navigated ? 500 : 1500));

    const debugRes = await fetch(`${BROWSERBASE_API_URL}/sessions/${sessionId}/debug`, {
      headers: { "x-bb-api-key": apiKey },
    });

    if (!debugRes.ok) {
      throw new Error(`Debug fetch failed: ${debugRes.status}`);
    }

    const debugInfo = await debugRes.json();
    const liveViewUrl = debugInfo.debuggerFullscreenUrl;

    if (!liveViewUrl) {
      throw new Error("No live view URL returned");
    }

    return new Response(
      JSON.stringify({ sessionId, liveViewUrl, connectUrl, navigated }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function navigateViaCDP(connectUrl: string, targetUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    let loadFired = false;
    const timeout = setTimeout(() => {
      cleanup(loadFired);
    }, 20000);

    let msgId = 0;
    let resolved = false;
    let pageSessionId: string | null = null;
    let navigateRequestId: number | null = null;
    const evaluateRequestIds = new Set<number>();
    const dismissalTimers: ReturnType<typeof setTimeout>[] = [];

    const cleanup = (result: boolean, ws?: WebSocket) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      for (const t of dismissalTimers) clearTimeout(t);
      try {
        ws?.close();
      } catch {
        // ignore close failures
      }
      resolve(result);
    };

    const send = (ws: WebSocket, method: string, params?: Record<string, unknown>, sessionId?: string) => {
      ws.send(JSON.stringify({
        id: ++msgId,
        method,
        ...(params ? { params } : {}),
        ...(sessionId ? { sessionId } : {}),
      }));

      return msgId;
    };

    const attachToTarget = (ws: WebSocket, targetId: string) => {
      console.log("Attaching to page target:", targetId);
      send(ws, "Target.attachToTarget", { targetId, flatten: true });
    };

    try {
      const ws = new WebSocket(connectUrl);

      ws.onopen = () => {
        console.log("CDP connected, getting targets");
        send(ws, "Target.getTargets");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Response to Target.getTargets
          if (data.id === 1 && data.result?.targetInfos) {
            const pageTarget = data.result.targetInfos.find(
              (t: any) => t.type === "page"
            );
            if (pageTarget) {
              attachToTarget(ws, pageTarget.targetId);
            } else {
              console.warn("No page target found, creating one");
              send(ws, "Target.createTarget", { url: "about:blank" });
            }
          }

          // Response to Target.createTarget
          if (data.result?.targetId && data.id === 2) {
            attachToTarget(ws, data.result.targetId);
          }

          // Response to Target.attachToTarget
          if (data.result?.sessionId && typeof data.id === "number") {
            pageSessionId = data.result.sessionId;
            console.log("Attached to page, sessionId:", pageSessionId);
            send(ws, "Page.enable", undefined, pageSessionId);
            navigateRequestId = send(ws, "Page.navigate", { url: targetUrl }, pageSessionId);
          }

          // Response to Page.navigate
          if (navigateRequestId && data.id === navigateRequestId) {
            const success = !data.error;
            console.log("Navigate command result:", success ? "accepted" : JSON.stringify(data.error));
            if (!success) {
              cleanup(false, ws);
            }
          }

          // Response to a consent-dismissal Runtime.evaluate
          if (typeof data.id === "number" && evaluateRequestIds.has(data.id)) {
            evaluateRequestIds.delete(data.id);
            const value = data.result?.result?.value;
            if (value) {
              console.log("Cookie consent dismissal:", JSON.stringify(value));
            } else if (data.result?.exceptionDetails) {
              console.warn("Cookie consent dismissal evaluate failed:", JSON.stringify(data.result.exceptionDetails).slice(0, 300));
            }
          }

          if (data.method === "Page.loadEventFired" && data.sessionId === pageSessionId) {
            console.log("Page load event fired");
            loadFired = true;
            // Dismiss the site's cookie-consent banner inside the remote
            // browser before the live view reaches the visitor — demo
            // surfaces must not sit behind a privacy banner. The shared
            // script prefers Reject/Decline and only falls back to Accept
            // when no refusal exists; it also keeps watching in-page for
            // late banners. Dismissal problems never fail the session.
            const sid = pageSessionId;
            if (!sid) {
              cleanup(true, ws);
            } else {
              try {
                send(ws, "Runtime.enable", undefined, sid);
                const expression = buildCookieConsentDismissalScript({ observeMs: 5000 });
                const evaluateNow = () => {
                  if (resolved) return;
                  const id = send(ws, "Runtime.evaluate", { expression, returnByValue: true }, sid);
                  evaluateRequestIds.add(id);
                };
                evaluateNow();
                dismissalTimers.push(setTimeout(evaluateNow, 1500));
                dismissalTimers.push(setTimeout(evaluateNow, 3500));
                dismissalTimers.push(setTimeout(() => cleanup(true, ws), 5200));
              } catch {
                cleanup(true, ws);
              }
            }
          }

          if (data.method === "Inspector.targetCrashed") {
            console.warn("Target crashed while navigating");
            cleanup(false, ws);
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        cleanup(false, ws);
      };

      ws.onclose = () => {
        if (!resolved) cleanup(false);
      };
    } catch {
      cleanup(false);
    }
  });
}
