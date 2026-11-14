import { detectConsentInHtml } from "../_shared/cookie-consent-dismissal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
};

const stripQuotes = (value: string) => value.trim().replace(/^['"]|['"]$/g, "");

const getOrigin = (value: string | null | undefined) => {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const wildcardHostMatch = (hostname: string, pattern: string) => {
  const normalizedPattern = pattern.replace(/^\*\./, "").toLowerCase();
  const normalizedHost = hostname.toLowerCase();

  return normalizedHost === normalizedPattern || normalizedHost.endsWith(`.${normalizedPattern}`);
};

const parseFrameAncestors = (cspHeader: string | null) => {
  if (!cspHeader) return null;

  const directive = cspHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("frame-ancestors"));

  if (!directive) return null;

  return directive
    .split(/\s+/)
    .slice(1)
    .map(stripQuotes)
    .filter(Boolean);
};

const matchesSourceExpression = (source: string, embedOrigin: string, targetOrigin: string) => {
  const normalizedSource = stripQuotes(source);
  const lowerSource = normalizedSource.toLowerCase();

  if (!normalizedSource) return false;
  if (normalizedSource === "*") return true;
  if (lowerSource === "none") return false;
  if (lowerSource === "self") return embedOrigin === targetOrigin;

  try {
    const embedUrl = new URL(embedOrigin);

    if (/^[a-z][a-z0-9+.-]*:$/i.test(normalizedSource)) {
      return embedUrl.protocol === normalizedSource.toLowerCase();
    }

    if (normalizedSource.startsWith("*.")) {
      return wildcardHostMatch(embedUrl.hostname, normalizedSource);
    }

    if (normalizedSource.includes("://")) {
      const [scheme, hostPattern] = normalizedSource.split("://");
      if (!hostPattern) return false;
      if (embedUrl.protocol !== `${scheme.toLowerCase()}:`) return false;

      return hostPattern.startsWith("*.")
        ? wildcardHostMatch(embedUrl.hostname, hostPattern)
        : embedUrl.host.toLowerCase() === hostPattern.toLowerCase();
    }

    return wildcardHostMatch(embedUrl.hostname, normalizedSource);
  } catch {
    return false;
  }
};

const isFrameAncestorsAllowed = (sources: string[] | null, embedOrigin: string, targetOrigin: string) => {
  if (!sources || sources.length === 0) return true;
  if (sources.some((source) => stripQuotes(source).toLowerCase() === "none")) return false;

  return sources.some((source) => matchesSourceExpression(source, embedOrigin, targetOrigin));
};

const isXFrameOptionsAllowed = (headerValue: string | null, embedOrigin: string, targetOrigin: string) => {
  if (!headerValue) return true;

  const directives = headerValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const directive of directives) {
    const lowerDirective = directive.toLowerCase();

    if (lowerDirective === "deny") return false;
    if (lowerDirective === "sameorigin") return embedOrigin === targetOrigin;

    if (lowerDirective.startsWith("allow-from")) {
      const allowedOrigin = getOrigin(directive.split(/\s+/).slice(1).join(" "));
      return allowedOrigin ? allowedOrigin === embedOrigin : false;
    }
  }

  return true;
};

const fetchResponse = async (url: string) => {
  let lastError: unknown = null;

  for (const method of ["HEAD", "GET"] as const) {
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        headers: {
          "user-agent": "LovableIframeChecker/1.0",
          accept: "text/html,application/xhtml+xml",
        },
      });

      if (response.status !== 405 && response.status !== 501) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to inspect iframe headers");
};

// Consent detection (Publish #48 follow-up, 2026-11-14): the embed
// verdict above is headers-only by design and stays untouched. When —
// and only when — the site turns out EMBEDDABLE, the demo's live
// presentation would be the raw cross-origin iframe, whose consent
// banner no script can dismiss. So for embeddable sites only, fetch
// the homepage HTML once and fingerprint it for a consent banner
// (see _shared/cookie-consent-dismissal.ts). Detection is strictly
// best-effort: any failure (bot wall, timeout, non-HTML) answers
// false, which routes exactly like today — the raw iframe.
const CONSENT_DETECTION_MAX_BYTES = 512_000;
const CONSENT_DETECTION_TIMEOUT_MS = 4000;

const readBoundedBody = async (response: Response, maxBytes: number): Promise<string> => {
  if (!response.body) return response.text().then((text) => text.slice(0, maxBytes));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let html = "";
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    // Stop downloading the rest of the page once the fingerprint
    // window is full — CMP fingerprints live in the head / early body.
    await reader.cancel().catch(() => undefined);
  }
  return html;
};

const detectConsentBanner = async (url: string): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONSENT_DETECTION_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "LovableIframeChecker/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.includes("html")) return false;
    const html = await readBoundedBody(response, CONSENT_DETECTION_MAX_BYTES);
    return detectConsentInHtml(html);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, embedOrigin } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ success: false, error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedUrl = normalizeUrl(url);
    const response = await fetchResponse(normalizedUrl);
    const finalUrl = response.url || normalizedUrl;
    const targetOrigin = getOrigin(finalUrl) || getOrigin(normalizedUrl) || normalizedUrl;
    const safeEmbedOrigin = getOrigin(typeof embedOrigin === "string" ? embedOrigin : "") || "";
    const xFrameOptions = response.headers.get("x-frame-options");
    const frameAncestors = parseFrameAncestors(response.headers.get("content-security-policy"));

    const embeddable = safeEmbedOrigin
      ? isXFrameOptionsAllowed(xFrameOptions, safeEmbedOrigin, targetOrigin) &&
        isFrameAncestorsAllowed(frameAncestors, safeEmbedOrigin, targetOrigin)
      : true;

    // Blocked/unreachable sites never present through the raw iframe,
    // so detection would change nothing there — it runs only for the
    // embeddable case it exists to reroute.
    const consentDetected = embeddable ? await detectConsentBanner(finalUrl) : false;

    return new Response(
      JSON.stringify({
        success: true,
        checked: true,
        embeddable,
        consentDetected,
        finalUrl,
        headers: {
          xFrameOptions,
          frameAncestors,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("check-iframe-embed failed:", error);

    // Site is unreachable (DNS failure, connection refused, etc.)
    // Mark as not embeddable so the client falls back to screenshot
    return new Response(
      JSON.stringify({
        success: true,
        checked: true,
        embeddable: false,
        unreachable: true,
        consentDetected: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});