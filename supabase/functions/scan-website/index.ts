const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { learningLinks } from '../_shared/website-learning.ts';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1';
const LOVABLE_AI_BASE = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const ALLOWED_NICHES = ['realtors', 'medspa', 'autodetail', 'veterinary', 'marine', 'general'] as const;
type AllowedNiche = (typeof ALLOWED_NICHES)[number];

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
};

const TRACKING_PARAMS = ['fbclid', 'gclid', 'msclkid', 'igshid', 'mc_cid', 'mc_eid'];

/** Keep the exact page the user gave us (deep listing links included); only drop tracking params */
const toTargetUrl = (value: string) => {
  try {
    const url = new URL(normalizeUrl(value));
    TRACKING_PARAMS.forEach((param) => url.searchParams.delete(param));
    Array.from(url.searchParams.keys())
      .filter((key) => key.toLowerCase().startsWith('utm_'))
      .forEach((key) => url.searchParams.delete(key));
    url.hash = '';
    return url.toString().replace(/\?$/, '');
  } catch {
    return normalizeUrl(value);
  }
};

/** True when the URL points at a specific page rather than the site root */
const isDeepLink = (value: string) => {
  try {
    const url = new URL(normalizeUrl(value));
    return url.pathname.replace(/\/+$/, '') !== '';
  } catch {
    return false;
  }
};


/** Extract phone numbers from text content */
const extractPhones = (text: string): string[] => {
  const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const matches = text.match(phoneRegex) || [];
  return unique(matches.map((p) => p.replace(/[^\d+]/g, '').replace(/^1(\d{10})$/, '$1')).filter((p) => p.length >= 10)).slice(0, 5);
};

/** Extract email addresses from text content */
const extractEmails = (text: string): string[] => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const excluded = /example\.com|test\.com|email\.com|domain\.com|sentry|google|facebook|twitter|recaptcha/i;
  const matches = text.match(emailRegex) || [];
  return unique(matches.filter((e) => !excluded.test(e)).map((e) => e.toLowerCase())).slice(0, 5);
};

const unwrapFirecrawlPayload = (payload: any) => payload?.data?.data ?? payload?.data ?? payload ?? {};

const cleanText = (value?: string | null) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

const truncate = (value: string, max: number) => value.slice(0, max);

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const parseJsonContent = (value: string) => {
  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  return JSON.parse(cleaned);
};

const getHost = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const mapDetectedNiche = (value?: string | null, fallback?: string | null): AllowedNiche => {
  const normalized = cleanText(value).toLowerCase();
  const candidate = normalized || cleanText(fallback).toLowerCase();

  if (/realtor|real estate|property/.test(candidate)) return 'realtors';
  if (/medspa|med spa|aesthetic|injectable|botox|facial|skin/.test(candidate)) return 'medspa';
  if (/detail|detailing|ceramic|paint correction|car wash|vehicle/.test(candidate)) return 'autodetail';
  if (/vet|veterinar|animal hospital|pet clinic|pet care/.test(candidate)) return 'veterinary';
  if (/marine|boat|yacht|dock|outboard|inboard|haul/.test(candidate)) return 'marine';
  return 'general';
};

const inferNicheFromKeywords = (value: string, fallback?: string | null): AllowedNiche => mapDetectedNiche(value, fallback);

const pickRelevantLinks = (links: string[], rootUrl: string) => {
  const rootHost = getHost(rootUrl);
  const excluded = /(privacy|terms|login|signin|signup|cart|checkout|wp-admin|feed|tag\/|category\/|author\/)/i;
  // High-priority pages: pricing, services, products, FAQ — generic across all industries
  const highPriority = /(pric|cost|rate|fee|menu|package|plan|product|special|deal|offer|discount|promotion|shop|catalog|faq|question|support|help)/i;
  const preferred = /(about|service|services|treatment|pricing|faq|contact|location|locations|team|gallery|reviews|testimonial|book|appointment|schedule|quote|estimate|menu|packages|plans|rates|fees|costs|offerings|product|shop|catalog|inventory|portfolio|project|work|before-after|showroom|staff|our-team|how-it-works|process|why-us|blog|news|resources|careers)/i;

  const filtered = unique(
    links
      .map((link) => cleanText(link))
      .filter(Boolean)
      .filter((link) => /^https?:\/\//i.test(link))
      .filter((link) => getHost(link) === rootHost)
      .filter((link) => !excluded.test(link))
  ).filter((link) => link !== rootUrl);

  // Sort: high-priority (pricing/products) first, then preferred, then the rest
  filtered.sort((a, b) => {
    const aHigh = Number(highPriority.test(a));
    const bHigh = Number(highPriority.test(b));
    if (aHigh !== bHigh) return bHigh - aHigh;
    return Number(preferred.test(b)) - Number(preferred.test(a));
  });

  return filtered.slice(0, 6);
};

/**
 * For deep links (e.g. a single listing page), pick sibling/child pages that live under the
 * same path branch so we learn about that specific agent/section — never the whole parent site.
 */
const pickDeepLinkChildren = (links: string[], targetUrl: string, limit: number) => {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return [];
  }
  const segments = target.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const branch = `/${segments.slice(0, Math.max(1, segments.length - 1)).join('/')}`;
  const excluded = /(privacy|terms|login|signin|signup|cart|checkout|wp-admin|feed)/i;

  return unique(
    links
      .map((link) => cleanText(link))
      .filter((link) => /^https?:\/\//i.test(link))
      .filter((link) => getHost(link) === getHost(targetUrl))
      .filter((link) => !excluded.test(link))
      .filter((link) => {
        try {
          const path = new URL(link).pathname.replace(/\/+$/, '');
          return path !== target.pathname.replace(/\/+$/, '') && (branch === '/' ? true : path.startsWith(branch));
        } catch {
          return false;
        }
      }),
  ).slice(0, limit);
};

type ViewportConfig = {
  width: number;
  height: number;
  deviceScaleFactor: number;
  suffix: string;
  startDelayMs?: number;
};

const VIEWPORT_CONFIGS: ViewportConfig[] = [
  { width: 1920, height: 1080, deviceScaleFactor: 2, suffix: 'desktop', startDelayMs: 0 },
  { width: 768, height: 1024, deviceScaleFactor: 2, suffix: 'tablet', startDelayMs: 900 },
  { width: 390, height: 844, deviceScaleFactor: 3, suffix: 'mobile', startDelayMs: 1800 },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function browserlessScreenshotSingle(
  url: string,
  apiKey: string,
  leadId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  viewport: ViewportConfig,
): Promise<string | null> {
  try {
    if (viewport.startDelayMs) {
      await sleep(viewport.startDelayMs);
    }

    console.log(`[Browserless] Taking ${viewport.suffix} screenshot of:`, url);
    let buffer: ArrayBuffer | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`https://production-sfo.browserless.io/screenshot?token=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          options: {
            fullPage: true,
            type: 'png',
          },
          viewport: {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: viewport.deviceScaleFactor,
          },
          waitForTimeout: 14000,
          gotoOptions: {
            waitUntil: 'networkidle2',
            timeout: 45000,
          },
          waitForSelector: { selector: 'body', timeout: 8000 },
          addScriptTag: [{
            content: `
              (async () => {
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

                const closeOverlays = () => {
                  // Phase 1: Click all dismiss/close/accept buttons we can find
                  const clickSelectors = [
                    // Cookie consent
                    '[class*="cookie"] button', '[id*="cookie"] button',
                    '[class*="consent"] button', '[class*="gdpr"] button',
                    'button[class*="accept"]', 'button[class*="agree"]',
                    'button[id*="accept"]', 'button[id*="agree"]',
                    'a[class*="accept"]', 'a[id*="accept"]',
                    // Generic close buttons
                    '[class*="popup"] [class*="close"]', '[class*="popup"] button[class*="dismiss"]',
                    '[class*="modal"] [class*="close"]', '[class*="modal"] button[class*="dismiss"]',
                    '[class*="overlay"] [class*="close"]', '[class*="overlay"] button[class*="dismiss"]',
                    '[class*="banner"] [class*="close"]', '[class*="banner"] button[class*="dismiss"]',
                    '[class*="dialog"] [class*="close"]', '[class*="dialog"] button[class*="dismiss"]',
                    '[class*="lightbox"] [class*="close"]',
                    '[aria-label*="close" i]', '[aria-label*="dismiss" i]',
                    '[title*="close" i]', '[title*="dismiss" i]',
                    'button[class*="close"]', 'button[id*="close"]',
                    // Newsletter / signup popups
                    '[class*="newsletter"] [class*="close"]', '[class*="signup"] [class*="close"]',
                    '[class*="subscribe"] [class*="close"]', '[class*="sign-up"] [class*="close"]',
                    '[class*="email-capture"] [class*="close"]', '[class*="lead-capture"] [class*="close"]',
                    '[class*="promo"] [class*="close"]', '[class*="offer"] [class*="close"]',
                    // Common framework patterns
                    '.modal .close', '.modal-close', '.popup-close',
                    '[data-dismiss="modal"]', '[data-close]', '[data-action="close"]',
                    'button.close-button', 'button.btn-close', '.btn-close',
                    // X icon buttons (SVG close icons)
                    'button:has(svg[class*="close"])', 'button:has(svg[class*="x"])',
                  ];
                  const clicked = new Set();
                  for (const sel of clickSelectors) {
                    try {
                      document.querySelectorAll(sel).forEach((el) => {
                        if (el instanceof HTMLElement && !clicked.has(el)) {
                          clicked.add(el);
                          el.click();
                        }
                      });
                    } catch {}
                  }

                  // Phase 2: Force-hide any remaining fixed/absolute overlays that cover the viewport
                  document.querySelectorAll('div, section, aside, [role="dialog"], [role="alertdialog"]').forEach((el) => {
                    if (!(el instanceof HTMLElement)) return;
                    const style = window.getComputedStyle(el);
                    const pos = style.position;
                    if (pos !== 'fixed' && pos !== 'absolute') return;
                    const z = parseInt(style.zIndex || '0', 10);
                    if (z < 100) return;
                    const rect = el.getBoundingClientRect();
                    const coversViewport = rect.width > window.innerWidth * 0.4 && rect.height > window.innerHeight * 0.3;
                    const isBackdrop = style.backgroundColor?.includes('rgba') || parseFloat(style.opacity || '1') < 0.95;
                    if (coversViewport || isBackdrop) {
                      el.style.display = 'none';
                    }
                  });

                  // Phase 3: Remove common overlay/backdrop classes entirely
                  document.querySelectorAll('.modal-backdrop, .overlay-backdrop, [class*="backdrop"], [class*="overlay-bg"]').forEach((el) => {
                    if (el instanceof HTMLElement) el.style.display = 'none';
                  });

                  // Phase 4: Restore body scroll (many popups add overflow:hidden)
                  document.body.style.overflow = '';
                  document.body.style.overflowY = '';
                  document.documentElement.style.overflow = '';
                  document.documentElement.style.overflowY = '';
                };

                const makeMediaEager = () => {
                  document.querySelectorAll('img, iframe, video source').forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;
                    node.setAttribute('loading', 'eager');
                    node.setAttribute('fetchpriority', 'high');
                  });

                  document.querySelectorAll('img').forEach((img) => {
                    const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
                    const dataSrcset = img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset');
                    if ((!img.getAttribute('src') || img.getAttribute('src') === '') && dataSrc) img.setAttribute('src', dataSrc);
                    if ((!img.getAttribute('srcset') || img.getAttribute('srcset') === '') && dataSrcset) img.setAttribute('srcset', dataSrcset);
                    img.removeAttribute('loading');
                  });

                  // Replace video elements with their poster or first frame
                  document.querySelectorAll('video').forEach((video) => {
                    try {
                      // If poster exists, replace video with an img
                      if (video.poster) {
                        const img = document.createElement('img');
                        img.src = video.poster;
                        img.style.cssText = window.getComputedStyle(video).cssText;
                        img.style.width = video.offsetWidth + 'px';
                        img.style.height = video.offsetHeight + 'px';
                        img.style.objectFit = 'cover';
                        video.parentNode?.replaceChild(img, video);
                        return;
                      }
                      // Try to capture the first frame via canvas
                      if (video.readyState >= 2 && video.videoWidth > 0) {
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.drawImage(video, 0, 0);
                          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                          if (dataUrl && dataUrl.length > 100) {
                            const img = document.createElement('img');
                            img.src = dataUrl;
                            img.style.cssText = window.getComputedStyle(video).cssText;
                            img.style.width = video.offsetWidth + 'px';
                            img.style.height = video.offsetHeight + 'px';
                            img.style.objectFit = 'cover';
                            video.parentNode?.replaceChild(img, video);
                            return;
                          }
                        }
                      }
                      // Fallback: pause and show first frame in place
                      video.pause();
                      video.currentTime = 0;
                    } catch (e) { /* cross-origin or other error, skip */ }
                  });
                };

                const decodeImages = async () => {
                  const images = Array.from(document.images || []);
                  await Promise.allSettled(images.map((img) => {
                    if (img.complete) return Promise.resolve();
                    if (typeof img.decode === 'function') {
                      return img.decode().catch(() => undefined);
                    }
                    return new Promise((resolve) => {
                      img.addEventListener('load', () => resolve(undefined), { once: true });
                      img.addEventListener('error', () => resolve(undefined), { once: true });
                    });
                  }));
                };

                closeOverlays();
                makeMediaEager();
                await wait(1200);

                const maxScroll = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight);
                const viewport = Math.max(window.innerHeight, 1);
                for (let y = 0; y < maxScroll; y += Math.max(320, Math.round(viewport * 0.8))) {
                  window.scrollTo({ top: y, behavior: 'auto' });
                  makeMediaEager();
                  closeOverlays();
                  await wait(350);
                }

                await decodeImages();
                await wait(1200);
                window.scrollTo({ top: 0, behavior: 'auto' });
                closeOverlays();
              })();
            `
          }],
        }),
      });

      if (response.ok) {
        buffer = await response.arrayBuffer();
        break;
      }

      const errText = await response.text();
      const isRetryableRateLimit = response.status === 429 && attempt < 1;
      console.error(`[Browserless] ${viewport.suffix} screenshot failed:`, response.status, errText);

      if (!isRetryableRateLimit) {
        return null;
      }

      console.log(`[Browserless] Retrying ${viewport.suffix} screenshot after rate limit...`);
      await sleep(2000);
    }

    if (!buffer) {
      return null;
    }

    console.log(`[Browserless] ${viewport.suffix} screenshot captured, size:`, buffer.byteLength);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const filePath = viewport.suffix === 'desktop' ? `${leadId}.png` : `${leadId}-${viewport.suffix}.png`;
    const { error: uploadError } = await supabase.storage
      .from('website-screenshots')
      .upload(filePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[Browserless] ${viewport.suffix} upload error:`, uploadError);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from('website-screenshots')
      .getPublicUrl(filePath);

    console.log(`[Browserless] ${viewport.suffix} screenshot uploaded:`, publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error(`[Browserless] ${viewport.suffix} screenshot error:`, err);
    return null;
  }
}

/** Capture screenshots for all viewports (desktop, tablet, mobile) in parallel */
async function browserlessMultiScreenshot(
  url: string,
  apiKey: string,
  leadId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{ desktop: string | null; tablet: string | null; mobile: string | null }> {
  const results = await Promise.allSettled(
    VIEWPORT_CONFIGS.map((vp) =>
      browserlessScreenshotSingle(url, apiKey, leadId, supabaseUrl, supabaseServiceKey, vp)
    )
  );

  return {
    desktop: results[0].status === 'fulfilled' ? results[0].value : null,
    tablet: results[1].status === 'fulfilled' ? results[1].value : null,
    mobile: results[2].status === 'fulfilled' ? results[2].value : null,
  };
}

/** Use Browserless headless Chrome to read page content when Firecrawl is blocked */
async function browserlessReadContent(url: string, apiKey: string): Promise<{ markdown: string; title: string; description: string } | null> {
  try {
    console.log('[Browserless] Reading content from:', url);
    const response = await fetch(`https://production-sfo.browserless.io/content?token=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        waitForTimeout: 5000,
        gotoOptions: {
          waitUntil: 'networkidle2',
          timeout: 30000,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Browserless] Content read failed:', response.status, errText);
      return null;
    }

    const html = await response.text();
    if (!html || html.length < 100) {
      console.warn('[Browserless] Content too short, likely blocked');
      return null;
    }

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
    const description = descMatch ? descMatch[1].replace(/\s+/g, ' ').trim() : '';

    // Strip scripts, styles, nav, footer, header tags and extract text
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length < 50) {
      console.warn('[Browserless] Extracted text too short after cleanup');
      return null;
    }

    console.log('[Browserless] Content extracted, length:', cleaned.length);
    return {
      markdown: truncate(cleaned, 30000),
      title,
      description,
    };
  } catch (err) {
    console.error('[Browserless] Content read error:', err);
    return null;
  }
}

async function firecrawlRequest(path: string, apiKey: string, body: Record<string, unknown>, retries = 1): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const requestBody = { ...body };
    if (attempt > 0) {
      requestBody.timeout = 45000;
      if (Array.isArray(requestBody.formats)) {
        requestBody.formats = (requestBody.formats as string[]).filter(
          (f: string) => !f.startsWith('screenshot')
        );
      }
      console.log(`Firecrawl retry ${attempt} for ${path} (simplified)`);
    }

    const response = await fetch(`${FIRECRAWL_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json().catch(() => null);

    if (response.ok) return data;

    lastError = new Error(`Firecrawl error [${response.status}]: ${JSON.stringify(data)}`);

    const isRetryable = response.status === 408 || response.status >= 500;
    if (!isRetryable || attempt === retries) break;

    await new Promise((r) => setTimeout(r, 1000));
  }

  throw lastError!;
}

async function scrapeMarkdownPage(url: string, apiKey: string) {
  const response = await firecrawlRequest('/scrape', apiKey, {
    url,
    formats: ['markdown', 'summary'],
    onlyMainContent: true,
    waitFor: 1500,
    timeout: 12000,
  }, 0);

  const data = unwrapFirecrawlPayload(response);
  return {
    url,
    title: cleanText(data.metadata?.title),
    summary: cleanText(data.summary),
    markdown: truncate(cleanText(data.markdown), 12000),
  };
}

async function scrapeScreenshotFallback(url: string, apiKey: string) {
  try {
    const response = await firecrawlRequest('/scrape', apiKey, {
      url,
      formats: ['screenshot'],
      waitFor: 3000,
      timeout: 25000,
    }, 0);

    const data = unwrapFirecrawlPayload(response);
    return typeof data?.screenshot === 'string' && data.screenshot ? data.screenshot : null;
  } catch (error) {
    console.warn('Fallback screenshot scrape failed:', error);
    return null;
  }
}

const escapeSvgText = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const splitTextIntoLines = (value: string, maxLineLength: number, maxLines: number) => {
  const words = cleanText(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLength) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (lines.length >= maxLines - 1) break;
  }

  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length === maxLines) {
    lines[maxLines - 1] = truncate(lines[maxLines - 1], Math.max(0, maxLineLength - 1)).trimEnd() + '…';
  }

  return lines.slice(0, maxLines);
};

const buildGeneratedFallbackScreenshot = ({
  businessName,
  websiteUrl,
  description,
  niche,
  serviceArea,
  highlights = [],
}: {
  businessName?: string | null;
  websiteUrl: string;
  description?: string | null;
  niche?: string | null;
  serviceArea?: string | null;
  highlights?: string[];
}) => {
  const title = truncate(cleanText(businessName) || getHost(websiteUrl) || 'Website preview', 42);
  const host = truncate(getHost(websiteUrl) || cleanText(websiteUrl), 54);
  const summary = cleanText(description) || `We captured the business details for ${title}, but a live screenshot was unavailable.`;
  const summaryLines = splitTextIntoLines(summary, 42, 5);
  const detailLines = unique([
    serviceArea ? `Service area: ${serviceArea}` : '',
    niche ? `Niche: ${niche.replace(/-/g, ' ')}` : '',
    ...highlights.map((item) => cleanText(item)).filter(Boolean).slice(0, 3),
  ]).slice(0, 5);

  const summaryMarkup = summaryLines
    .map((line, index) => `<tspan x="110" dy="${index === 0 ? 0 : 42}">${escapeSvgText(line)}</tspan>`)
    .join('');
  const detailMarkup = detailLines
    .map((line, index) => `<tspan x="1035" dy="${index === 0 ? 0 : 38}">${escapeSvgText(line)}</tspan>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" fill="none">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1600" y2="900" gradientUnits="userSpaceOnUse">
        <stop stop-color="#07111E"/>
        <stop offset="0.55" stop-color="#0E2035"/>
        <stop offset="1" stop-color="#091725"/>
      </linearGradient>
      <linearGradient id="panel" x1="56" y1="56" x2="1544" y2="844" gradientUnits="userSpaceOnUse">
        <stop stop-color="#13253B"/>
        <stop offset="1" stop-color="#0E1B2C"/>
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)"/>
    <circle cx="1320" cy="148" r="180" fill="#25D0FF" fill-opacity="0.12"/>
    <circle cx="260" cy="760" r="220" fill="#6EE7B7" fill-opacity="0.10"/>
    <rect x="56" y="56" width="1488" height="788" rx="40" fill="url(#panel)" stroke="#2A415D"/>
    <rect x="96" y="96" width="1408" height="52" rx="26" fill="#16283D"/>
    <circle cx="126" cy="122" r="8" fill="#F87171"/>
    <circle cx="154" cy="122" r="8" fill="#FBBF24"/>
    <circle cx="182" cy="122" r="8" fill="#34D399"/>
    <text x="220" y="128" fill="#9FB2C9" font-family="Arial, Helvetica, sans-serif" font-size="20">Scan-based preview</text>
    <text x="110" y="208" fill="#73D0FF" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="2">CAPTURED WEBSITE SUMMARY</text>
    <text x="110" y="300" fill="#F8FBFF" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700">${escapeSvgText(title)}</text>
    <text x="110" y="346" fill="#9FB2C9" font-family="Arial, Helvetica, sans-serif" font-size="26">${escapeSvgText(host)}</text>
    <text x="110" y="456" fill="#E6EEF9" font-family="Arial, Helvetica, sans-serif" font-size="34">${summaryMarkup}</text>
    <rect x="980" y="214" width="430" height="428" rx="30" fill="#15263B" stroke="#2A415D"/>
    <text x="1035" y="276" fill="#F8FBFF" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">Captured details</text>
    <text x="1035" y="336" fill="#C8D5E6" font-family="Arial, Helvetica, sans-serif" font-size="28">${detailMarkup}</text>
    <rect x="980" y="674" width="430" height="108" rx="26" fill="#0E1C2D" stroke="#2A415D"/>
    <text x="1035" y="724" fill="#73D0FF" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" letter-spacing="1.6">LIVE SITE UNAVAILABLE</text>
    <text x="1035" y="760" fill="#C8D5E6" font-family="Arial, Helvetica, sans-serif" font-size="24">The demo can still use the scanned business info.</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

async function webResearch(firecrawlKey: string, queries: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const query of queries) {
    try {
      const response = await fetch(`${FIRECRAWL_BASE}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, limit: 3 }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && Array.isArray(data?.data)) {
        for (const item of data.data) {
          const snippet = [
            item.title ? `**${item.title}**` : '',
            item.description || '',
            item.markdown ? truncate(cleanText(item.markdown), 1000) : '',
          ].filter(Boolean).join('\n');
          if (snippet.length > 10) results.push(snippet);
        }
      }
    } catch (err) {
      console.warn(`Web research failed for "${query}":`, err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return results;
}

async function analyzeBusinessProfile({
  lovableApiKey,
  websiteUrl,
  providedBusinessName,
  initialNiche,
  title,
  description,
  homepageMarkdown,
  combinedContent,
}: {
  lovableApiKey?: string | null;
  websiteUrl: string;
  providedBusinessName?: string | null;
  initialNiche?: string | null;
  title?: string | null;
  description?: string | null;
  homepageMarkdown: string;
  combinedContent: string;
}) {
  const fallbackNiche = inferNicheFromKeywords(`${title ?? ''}\n${description ?? ''}\n${combinedContent}`, initialNiche);
  const fallbackName = cleanText(providedBusinessName) || cleanText(title) || getHost(websiteUrl) || 'This business';
  const fallbackSummary = cleanText(description) || `Modern, clearer positioning for ${fallbackName}.`;

  if (!lovableApiKey) {
    return {
      businessName: fallbackName,
      detectedNiche: fallbackNiche,
      summary: fallbackSummary,
      serviceArea: '',
      serviceHighlights: [],
      trustSignals: [],
      faqs: [],
      toneKeywords: ['friendly', 'helpful', 'clear'],
      audience: '',
      callGoals: ['Answer questions clearly', 'Guide the caller to the next step'],
      pricing: [],
      competitors: [],
      reviews: [],
    };
  }

  const source = truncate(
    [
      `Website URL: ${websiteUrl}`,
      providedBusinessName ? `Business name from form: ${providedBusinessName}` : '',
      title ? `Title: ${title}` : '',
      description ? `Description: ${description}` : '',
      homepageMarkdown ? `Homepage content:\n${homepageMarkdown}` : '',
      combinedContent ? `Additional website content:\n${combinedContent}` : '',
      initialNiche ? `Initial niche hint from the form: ${initialNiche}` : '',
    ].filter(Boolean).join('\n\n'),
    16000,
  );

  try {
    const response = await fetch(LOVABLE_AI_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract a comprehensive business profile from website content. Return strict JSON with these keys only: businessName (string), detectedNiche (string), summary (string), serviceArea (string with city/region/state), serviceHighlights (array of up to 10 short strings describing specific services offered), trustSignals (array of up to 6 short strings), faqs (array of up to 10 question-and-answer pairs as strings — include every FAQ found on the website verbatim), toneKeywords (array of up to 5 short strings), audience (string describing target customers), callGoals (array of up to 4 short strings), pricing (array of up to 12 strings with ANY and ALL pricing info found — include every single price point, package name, and tier from lowest to highest), competitors (array of up to 3 competitor company names if mentioned). detectedNiche must be one of: realtors, medspa, autodetail, veterinary, marine, general. Use the form niche only as a weak hint. If the website contradicts it, override it. Never default to realtors unless the content clearly indicates real estate. For serviceArea, extract the specific city, region, or metro area they serve. For pricing, be EXHAUSTIVE — extract every price mentioned on every page. For faqs, capture EVERY FAQ from the website including both the question and answer. If no pricing is on the site, return an empty array — do NOT make up prices.',
          },
          { role: 'user', content: source },
        ],
      }),
    });

    const completion = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`AI profile failed [${response.status}]`);

    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('AI profile response was empty');

    const parsed = parseJsonContent(content);

    return {
      businessName: cleanText(parsed.businessName) || fallbackName,
      detectedNiche: mapDetectedNiche(parsed.detectedNiche, fallbackNiche),
      summary: cleanText(parsed.summary) || fallbackSummary,
      serviceArea: cleanText(parsed.serviceArea),
      serviceHighlights: Array.isArray(parsed.serviceHighlights) ? unique(parsed.serviceHighlights.map((s: string) => cleanText(s))).slice(0, 10) : [],
      trustSignals: Array.isArray(parsed.trustSignals) ? unique(parsed.trustSignals.map((s: string) => cleanText(s))).slice(0, 6) : [],
      faqs: Array.isArray(parsed.faqs) ? unique(parsed.faqs.map((s: string) => cleanText(s))).slice(0, 6) : [],
      toneKeywords: Array.isArray(parsed.toneKeywords) ? unique(parsed.toneKeywords.map((s: string) => cleanText(s))).slice(0, 5) : ['friendly', 'helpful', 'clear'],
      audience: cleanText(parsed.audience),
      callGoals: Array.isArray(parsed.callGoals) ? unique(parsed.callGoals.map((s: string) => cleanText(s))).slice(0, 4) : ['Answer questions clearly', 'Guide the caller to the next step'],
      pricing: Array.isArray(parsed.pricing) ? unique(parsed.pricing.map((s: string) => cleanText(s))).slice(0, 12) : [],
      competitors: Array.isArray(parsed.competitors) ? unique(parsed.competitors.map((s: string) => cleanText(s))).slice(0, 3) : [],
      reviews: [] as string[],
    };
  } catch (error) {
    console.warn('AI business profile failed, using fallback:', error);
    return {
      businessName: fallbackName,
      detectedNiche: fallbackNiche,
      summary: fallbackSummary,
      serviceArea: '',
      serviceHighlights: [],
      trustSignals: [],
      faqs: [],
      toneKeywords: ['friendly', 'helpful', 'clear'],
      audience: '',
      callGoals: ['Answer questions clearly', 'Guide the caller to the next step'],
      pricing: [],
      competitors: [],
      reviews: [],
    };
  }
}

const NICHE_FALLBACK_KNOWLEDGE: Record<AllowedNiche, { services: string[]; trust: string[]; faqs: string[] }> = {
  realtors: {
    services: ['Buyer and seller representation', 'Listing strategy and market pricing', 'Showings and offer coordination'],
    trust: ['Fast response to inbound leads', 'Neighborhood and market expertise', 'Transparent communication from first contact to closing'],
    faqs: ['How quickly can I book a showing?', 'Can you help me price my home?', 'What neighborhoods fit my budget?'],
  },
  medspa: {
    services: ['Consultations and treatment planning', 'Injectables and skincare programs', 'Follow-up care guidance'],
    trust: ['Licensed, experienced providers', 'Comfort-first appointment experience', 'Clear aftercare and results expectations'],
    faqs: ['Which treatment is best for my goals?', 'How long is recovery?', 'Do you offer consultations?'],
  },
  autodetail: {
    services: ['Interior and exterior detailing', 'Paint correction and ceramic coating', 'Protection packages and maintenance plans'],
    trust: ['Consistent quality and turnaround', 'Clear package recommendations', 'Protection-focused service approach'],
    faqs: ['What package do you recommend?', 'How long does service take?', 'Do you offer ceramic coating?'],
  },
  veterinary: {
    services: ['Wellness and preventive care', 'Vaccinations and diagnostics', 'Urgent pet concerns triage'],
    trust: ['Compassionate pet-first communication', 'Clear care plans and follow-up', 'Responsive scheduling support'],
    faqs: ['Do you accept new patients?', 'What should I do for urgent symptoms?', 'How do I schedule a visit?'],
  },
  marine: {
    services: ['Routine boat maintenance', 'Engine diagnostics and repair', 'Seasonal prep and service scheduling'],
    trust: ['Marine-specific technical expertise', 'Reliable turnaround windows', 'Clear recommendations and next steps'],
    faqs: ['Can you service my engine type?', 'Do you offer seasonal packages?', 'How soon can I get on the schedule?'],
  },
  general: {
    services: ['Consultation and needs assessment', 'Service recommendations by goal', 'Fast support and next-step guidance'],
    trust: ['Prompt customer communication', 'Clear pricing and process expectations', 'Professional service delivery'],
    faqs: ['What services do you offer?', 'How quickly can I get started?', 'What is your process?'],
  },
};

const buildStructuredKnowledge = ({
  websiteUrl,
  profile,
  homepageSummary,
  pageSummaries,
  webResearchContent,
}: {
  websiteUrl: string;
  profile: Awaited<ReturnType<typeof analyzeBusinessProfile>>;
  homepageSummary: string;
  pageSummaries: string[];
  webResearchContent?: string;
}) => {
  const nicheFallback = NICHE_FALLBACK_KNOWLEDGE[profile.detectedNiche] || NICHE_FALLBACK_KNOWLEDGE.general;
  const services = profile.serviceHighlights.length > 0 ? profile.serviceHighlights : nicheFallback.services;
  const trust = profile.trustSignals.length > 0 ? profile.trustSignals : nicheFallback.trust;
  const faqs = profile.faqs.length > 0 ? profile.faqs : nicheFallback.faqs;

  const sections = [
    `BUSINESS NAME: ${profile.businessName}`,
    `DETECTED NICHE: ${profile.detectedNiche}`,
    profile.serviceArea ? `SERVICE AREA: ${profile.serviceArea}` : '',
    `SUMMARY: ${profile.summary}`,
    homepageSummary ? `HOMEPAGE SUMMARY: ${homepageSummary}` : '',
    profile.audience ? `TARGET AUDIENCE: ${profile.audience}` : '',
    `WEBSITE: ${websiteUrl}`,
    '',
    '=== SERVICES OFFERED ===',
    ...services.map((item) => `- ${item}`),
    '',
    profile.pricing.length > 0 ? '=== PRICING INFO ===' : '',
    ...profile.pricing.map((item) => `- ${item}`),
    '',
    '=== TRUST SIGNALS & DIFFERENTIATORS ===',
    ...trust.map((item) => `- ${item}`),
    '',
    '=== FREQUENTLY ASKED QUESTIONS ===',
    ...faqs.map((item) => `Q: ${item}`),
    '',
    '=== CALL GOALS ===',
    ...profile.callGoals.map((item) => `- ${item}`),
    '',
    '=== TONE ===',
    ...profile.toneKeywords.map((item) => `- ${item}`),
    '',
    profile.competitors.length > 0 ? '=== KNOWN COMPETITORS ===' : '',
    ...profile.competitors.map((item) => `- ${item}`),
    '',
    profile.reviews.length > 0 ? '=== CUSTOMER REVIEWS & REPUTATION ===' : '',
    ...profile.reviews.map((item) => `- ${item}`),
    '',
    ...pageSummaries.map((item) => `- Detail: ${item}`),
    '',
    webResearchContent ? `\n=== INDUSTRY & COMPETITOR RESEARCH ===\n${webResearchContent}` : '',
  ];

  return sections.filter(Boolean).join('\n');
};

// Background enrichment — runs via EdgeRuntime.waitUntil() after the main response
async function backgroundEnrich(
  leadId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  firecrawlKey: string,
  lovableApiKey: string | undefined,
  profile: Awaited<ReturnType<typeof analyzeBusinessProfile>>,
  initialNiche: string | undefined,
  existingContent: string,
  homepageSummary: string,
  pageSummaries: string[],
  formattedUrl: string,
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const bizName = profile.businessName;
    const area = profile.serviceArea || '';
    const nicheLabel = profile.detectedNiche === 'general' ? (initialNiche || 'business') : profile.detectedNiche;

    const searchQueries: string[] = [];
    if (profile.serviceHighlights.length < 4) {
      searchQueries.push(`complete list of services ${nicheLabel} company offers typical pricing`);
    }
    if (area) {
      searchQueries.push(`best ${nicheLabel} companies in ${area} competitors reviews`);
    }
    searchQueries.push(`${bizName} reviews ratings ${area}`.trim());
    if (profile.pricing.length === 0) {
      searchQueries.push(`${nicheLabel} services average pricing cost ${area || 'USA'} 2024 2025`);
    }

    console.log('Background enrichment: starting web research');
    const researchResults = await webResearch(firecrawlKey, searchQueries);
    const webResearchContent = researchResults.length > 0 ? truncate(researchResults.join('\n\n---\n\n'), 12000) : '';
    console.log('Background enrichment: gathered', researchResults.length, 'snippets');

    // AI enrichment pass
    if (webResearchContent && lovableApiKey) {
      try {
        const enrichResponse = await fetch(LOVABLE_AI_BASE, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: 'You are enriching a business profile with web research. Return strict JSON with: additionalServices (array of up to 8 services this type of business typically offers that are NOT already in the existing list), typicalPricing (array of up to 6 "service: $range" strings), competitorNames (array of up to 5 competitor business names in the area), reviewHighlights (array of up to 4 short reputation/review summary strings), industryFaqs (array of up to 5 common questions customers ask). Only include factual info from the research.',
              },
              {
                role: 'user',
                content: `Business: ${bizName}\nNiche: ${nicheLabel}\nArea: ${area}\nExisting services: ${profile.serviceHighlights.join(', ')}\n\nWeb research:\n${truncate(webResearchContent, 10000)}`,
              },
            ],
          }),
        });

        const enrichCompletion = await enrichResponse.json().catch(() => null);
        if (enrichResponse.ok) {
          const enrichContent = enrichCompletion?.choices?.[0]?.message?.content;
          if (typeof enrichContent === 'string') {
            const enriched = parseJsonContent(enrichContent);

            if (Array.isArray(enriched.additionalServices)) {
              profile.serviceHighlights = unique([...profile.serviceHighlights, ...enriched.additionalServices.map((s: string) => cleanText(s))]).slice(0, 12);
            }
            if (Array.isArray(enriched.typicalPricing) && profile.pricing.length === 0) {
              profile.pricing = enriched.typicalPricing.map((s: string) => cleanText(s)).filter(Boolean).slice(0, 6);
            }
            if (Array.isArray(enriched.competitorNames)) {
              profile.competitors = unique([...profile.competitors, ...enriched.competitorNames.map((s: string) => cleanText(s))]).slice(0, 5);
            }
            if (Array.isArray(enriched.reviewHighlights)) {
              profile.reviews = enriched.reviewHighlights.map((s: string) => cleanText(s)).filter(Boolean).slice(0, 4);
            }
            if (Array.isArray(enriched.industryFaqs)) {
              profile.faqs = unique([...profile.faqs, ...enriched.industryFaqs.map((s: string) => cleanText(s))]).slice(0, 8);
            }

            console.log('Background enrichment: profile enriched with AI');
          }
        }
      } catch (enrichErr) {
        console.warn('Background enrichment: AI enrichment failed:', enrichErr);
      }
    }

    // Rebuild knowledge with enriched profile
    const enrichedKnowledge = buildStructuredKnowledge({
      websiteUrl: formattedUrl,
      profile,
      homepageSummary,
      pageSummaries,
      webResearchContent,
    });

    const fullContent = truncate(
      [existingContent || '', `\n\n=== GENERATED RESEARCH SUMMARY (verify against original sources) ===\n${enrichedKnowledge}`].join(''),
      160000,
    );

    await supabase.from('leads').update({
      website_content: fullContent,
      scan_status: 'enriched',
    }).eq('id', leadId);

    console.log('Background enrichment: completed for lead', leadId);
  } catch (err) {
    console.error('Background enrichment failed:', err);
    // Non-fatal — the basic scan data is already saved
  }
}

const HARD_DEADLINE_MS = 130_000; // Return before the 150s idle timeout

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let leadId = '';
  let supabase: ReturnType<typeof createClient> | null = null;
  const startTime = Date.now();
  const isOverBudget = () => Date.now() - startTime > HARD_DEADLINE_MS;

  try {
    const {
      leadId: incomingLeadId,
      websiteUrl,
      businessName,
      secondaryUrl,
      secondaryUrls,
      uploadedFiles,
      initialNiche,
      crawlDepth: rawCrawlDepth,
    } = await req.json();
    const crawlDepth = Number(rawCrawlDepth) === 2 ? 2 : 1;
    const extraUrls: string[] = unique(
      [secondaryUrl, ...(Array.isArray(secondaryUrls) ? secondaryUrls : [])]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => normalizeUrl(v.trim())),
    ).slice(0, 3);
    leadId = incomingLeadId;
    if (!leadId || !websiteUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'leadId and websiteUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const browserlessKey = Deno.env.get('BROWSERLESS_API_KEY');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Backend configuration is incomplete' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);
    await supabase.from('leads').update({ scan_status: 'scanning' }).eq('id', leadId);

    const formattedUrl = toTargetUrl(websiteUrl);
    const scanDeepLink = isDeepLink(websiteUrl);
    console.log('Scanning website page:', formattedUrl, '(original:', websiteUrl, ', deepLink:', scanDeepLink, ')');


    // === PHASE 1: Homepage scrape + Browserless screenshot (parallel) ===
    
    // Start Browserless multi-viewport screenshots in parallel with Firecrawl scrape
    const browserlessPromise = browserlessKey
      ? browserlessMultiScreenshot(formattedUrl, browserlessKey, leadId, supabaseUrl, supabaseServiceKey)
      : Promise.resolve({ desktop: null, tablet: null, mobile: null });

    // Firecrawl scrape — Browserless handles screenshots, so avoid extra screenshot work here.
    let homepageResponse: any = {};
    const firecrawlFormats = ['markdown', 'branding', 'links', 'summary'];

    try {
      homepageResponse = await firecrawlRequest('/scrape', firecrawlKey, {
        url: formattedUrl,
        formats: firecrawlFormats,
        onlyMainContent: false,
        waitFor: 3000,
        timeout: 15000,
      }, 0);
    } catch (screenshotErr) {
      console.warn('Scrape failed, retrying simplified:', screenshotErr);
      try {
        homepageResponse = await firecrawlRequest('/scrape', firecrawlKey, {
          url: formattedUrl,
          formats: ['markdown', 'links', 'summary'],
          onlyMainContent: true,
          waitFor: 2000,
          timeout: 12000,
        }, 0);
      } catch (finalScrapeErr) {
        console.warn('Simplified scrape also failed, continuing with Browserless-first fallback:', finalScrapeErr);
        homepageResponse = {};
      }
    }

    const homepage = unwrapFirecrawlPayload(homepageResponse);
    let homepageMarkdown = cleanText(homepage.markdown);
    let homepageSummary = cleanText(homepage.summary);
    const branding = homepage.branding || {};
    let metadata = homepage.metadata || {};

    // === BROWSERLESS CONTENT FALLBACK ===
    // If Firecrawl returned empty/blocked content, try reading via headless Chrome
    const isContentBlocked = homepageMarkdown.length < 100;
    if (isContentBlocked && browserlessKey) {
      console.log('[Fallback] Firecrawl content appears blocked (length:', homepageMarkdown.length, '), trying Browserless...');
      const browserlessContent = await browserlessReadContent(formattedUrl, browserlessKey);
      if (browserlessContent && browserlessContent.markdown.length > homepageMarkdown.length) {
        console.log('[Fallback] Browserless content succeeded, length:', browserlessContent.markdown.length);
        homepageMarkdown = browserlessContent.markdown;
        if (!homepageSummary && browserlessContent.description) {
          homepageSummary = browserlessContent.description;
        }
        if (!metadata.title && browserlessContent.title) {
          metadata = { ...metadata, title: browserlessContent.title };
        }
        if (!metadata.description && browserlessContent.description) {
          metadata = { ...metadata, description: browserlessContent.description };
        }
      } else {
        console.warn('[Fallback] Browserless content also failed or returned less content');
      }
    }

    // Await Browserless multi-viewport screenshots and recover with Firecrawl fallback if needed.
    const browserlessResults = await browserlessPromise;
    const browserlessScreenshotResult = browserlessResults.desktop;
    const firecrawlScreenshotResult = !browserlessScreenshotResult
      ? await scrapeScreenshotFallback(formattedUrl, firecrawlKey)
      : null;

    // Use Browserless screenshot (higher quality), fall back to Firecrawl, then a generated preview image.
    const finalScreenshot = browserlessScreenshotResult || firecrawlScreenshotResult || null;

    const previewTitle = cleanText(metadata.title) || cleanText(businessName) || getHost(formattedUrl);
    const previewDescription = cleanText(metadata.description) || homepageSummary || null;
    const previewScreenshot = finalScreenshot || buildGeneratedFallbackScreenshot({
      businessName: previewTitle,
      websiteUrl: formattedUrl,
      description: previewDescription,
      niche: initialNiche,
    });
    const screenshotProvider = browserlessScreenshotResult ? 'browserless' : (firecrawlScreenshotResult ? 'firecrawl' : 'generated');
    console.log('Screenshot provider used:', screenshotProvider, '| tablet:', !!browserlessResults.tablet, '| mobile:', !!browserlessResults.mobile);

    const previewUpdate = await supabase.from('leads').update({
      website_url: formattedUrl,
      website_screenshot: previewScreenshot,
      screenshot_tablet: browserlessResults.tablet || null,
      screenshot_mobile: browserlessResults.mobile || null,
      brand_colors: branding.colors || null,
      brand_logo: branding.images?.logo || branding.logo || null,
      brand_fonts: branding.fonts || branding.typography || null,
      website_title: previewTitle || null,
      website_description: previewDescription,
      scan_status: 'scanning',
    }).eq('id', leadId);

    if (previewUpdate.error) {
      console.warn('Could not save preview data early:', previewUpdate.error);
    }

    // === PHASE 2: Sub-pages (skip if running out of time) ===
    // Learn directly linked menu/product pages; depth 2 adds links discovered on those pages.
    let successfulPages: { url: string; title: string; summary: string; markdown: string }[] = [];
    const shouldCrawlChildren = true;
    if (!isOverBudget() && shouldCrawlChildren) {
      const linkPool = new Set<string>();
      if (Array.isArray(homepage.links)) {
        homepage.links.forEach((link: string) => linkPool.add(cleanText(link)));
      }

      if (!isOverBudget() && linkPool.size === 0) {
        try {
          const mapResponse = await firecrawlRequest('/map', firecrawlKey, {
            url: formattedUrl,
            limit: crawlDepth >= 2 ? 60 : 30,
            includeSubdomains: false,
          }, 0);
          const links = Array.isArray(mapResponse.links) ? mapResponse.links : [];
          links.forEach((link: string) => linkPool.add(cleanText(link)));
        } catch (mapError) {
          console.warn('Map failed, using homepage links:', mapError);
        }
      }

      const pool = Array.from(linkPool);
      const candidateLinks = learningLinks(pool, formattedUrl, 20);
      console.log('Relevant links selected:', candidateLinks.length, 'depth:', crawlDepth, 'deepLink:', scanDeepLink);


      if (!isOverBudget()) {
        const pageResults = [];
        for (let i=0;i<candidateLinks.length && !isOverBudget();i+=5) {
          pageResults.push(...await Promise.allSettled(candidateLinks.slice(i,i+5).map((link) => scrapeMarkdownPage(link, firecrawlKey))));
        }
        successfulPages = pageResults
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof scrapeMarkdownPage>>> => r.status === 'fulfilled')
          .map((r) => r.value)
          .filter((page) => page.markdown || page.summary);
        if (crawlDepth === 2 && !isOverBudget()) {
          const nestedLinks = successfulPages.flatMap(page => Array.from(page.markdown.matchAll(/\]\(([^\s)]+)\)/g),m=>{try{return new URL(m[1],page.url).toString()}catch{return ''}}));
          const visited = new Set([formattedUrl,...candidateLinks]);
          const secondLevel = learningLinks(nestedLinks,formattedUrl,60).filter(link=>!visited.has(link)).slice(0,20);
          for(let i=0;i<secondLevel.length && !isOverBudget();i+=5) {
            const results=await Promise.allSettled(secondLevel.slice(i,i+5).map(link=>scrapeMarkdownPage(link,firecrawlKey)));
            results.forEach(r=>{if(r.status==='fulfilled' && (r.value.markdown || r.value.summary)) successfulPages.push(r.value)});
          }
        }
      }
    } else {
      console.warn('Skipping sub-page scraping: time budget exceeded');
    }

    // Extra / secondary URLs (skip if over budget)
    let secondaryContent = '';
    if (!isOverBudget() && extraUrls.length > 0) {
      const extraResults = await Promise.allSettled(extraUrls.map((u) => scrapeMarkdownPage(u, firecrawlKey)));
      const extraPages = extraResults
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof scrapeMarkdownPage>>> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((p) => p.markdown || p.summary);

      // At depth 2, also learn the key sub-pages of each extra URL
      if (crawlDepth >= 2 && !isOverBudget()) {
        for (const extra of extraUrls) {
          if (isOverBudget()) break;
          try {
            const mapResponse = await firecrawlRequest('/map', firecrawlKey, { url: extra, limit: 30, includeSubdomains: false }, 0);
            const links = Array.isArray(mapResponse.links) ? mapResponse.links.map(cleanText) : [];
            const children = isDeepLink(extra)
              ? pickDeepLinkChildren(links, extra, 3)
              : pickRelevantLinks(links, extra).slice(0, 3);
            const childResults = await Promise.allSettled(children.map((link) => scrapeMarkdownPage(link, firecrawlKey)));
            childResults.forEach((r) => {
              if (r.status === 'fulfilled' && (r.value.markdown || r.value.summary)) extraPages.push(r.value);
            });
          } catch (e) {
            console.warn('Extra URL sub-crawl error:', e);
          }
        }
      }

      secondaryContent = extraPages
        .map((p) => [p.url ? `### ${p.url}` : '', p.title ? `## ${p.title}` : '', p.markdown].filter(Boolean).join('\n'))
        .join('\n\n')
        .slice(0, 30000);
    }

    // Uploaded files
    let filesContent = '';
    if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
      for (const filePath of uploadedFiles) {
        try {
          const { data: fileData, error: fileErr } = await supabase.storage.from('lead-uploads').download(filePath);
          if (fileErr || !fileData) continue;
          const ext = filePath.split('.').pop()?.toLowerCase();
          if (ext === 'txt' || ext === 'md' || ext === 'csv') {
            const text = await fileData.text();
            filesContent += `\n--- Uploaded file: ${filePath} ---\n${truncate(text, 8000)}\n`;
          } else if (ext === 'pdf') {
            // Firecrawl can parse PDFs from a URL — hand it a short-lived signed link
            let extracted = '';
            try {
              const { data: signed } = await supabase.storage.from('lead-uploads').createSignedUrl(filePath, 600);
              if (signed?.signedUrl) {
                const parsed = await scrapeMarkdownPage(signed.signedUrl, firecrawlKey);
                extracted = parsed.markdown || parsed.summary || '';
              }
            } catch (pdfErr) {
              console.warn('PDF parse error:', pdfErr);
            }
            filesContent += extracted
              ? `\n--- Uploaded PDF: ${filePath} ---\n${truncate(extracted, 12000)}\n`
              : `\n--- Uploaded PDF: ${filePath} (could not be parsed) ---\n`;
          } else {
            filesContent += `\n--- Uploaded file: ${filePath} (document provided) ---\n`;
          }
        } catch (e) {
          console.warn('File read error:', e);
        }
      }
    }

    const combinedPageContent = successfulPages
      .map((page) => [`SOURCE URL: ${page.url}`,page.title ? `## ${page.title}` : '', page.markdown.slice(0,Math.floor(100000/Math.max(successfulPages.length,1)))].filter(Boolean).join('\n'))
      .join('\n\n')
      .slice(0, 100000);

    // === PHASE 3: AI profile analysis ===
    const profile = await analyzeBusinessProfile({
      lovableApiKey,
      websiteUrl: formattedUrl,
      providedBusinessName: cleanText(businessName),
      initialNiche,
      title: cleanText(metadata.title),
      description: cleanText(metadata.description),
      homepageMarkdown,
      combinedContent: [homepageMarkdown, combinedPageContent, secondaryContent, filesContent].filter(Boolean).join('\n\n'),
    });

    // Build initial knowledge (without web research)
    const initialKnowledge = buildStructuredKnowledge({
      websiteUrl: formattedUrl,
      profile,
      homepageSummary,
      pageSummaries: successfulPages.map((p) => p.summary).filter(Boolean).slice(0, 6),
    });

    const additionalContent = [
      homepageMarkdown ? `\n\n=== HOMEPAGE CONTENT ===\n${homepageMarkdown}` : '',
      combinedPageContent ? `\n\n=== ADDITIONAL WEBSITE CONTENT ===\n${combinedPageContent}` : '',
      secondaryContent ? `\n\n=== SECONDARY WEBSITE ===\n${secondaryContent}` : '',
      filesContent ? `\n\n=== UPLOADED DOCUMENTS ===\n${filesContent}` : '',
    ].join('');

    const initialContent = truncate([`LEARNING COVERAGE: depth ${crawlDepth}; ${successfulPages.length+1} primary website pages read; bounded by time and page limits, not the entire website.\n`, additionalContent, '\n\n=== GENERATED BUSINESS SUMMARY ===\n', initialKnowledge].join(''), 160000);

    const title = cleanText(metadata.title) || profile.businessName || getHost(formattedUrl);
    const description = cleanText(metadata.description) || profile.summary;
    const storedScreenshot = finalScreenshot || buildGeneratedFallbackScreenshot({
      businessName: title,
      websiteUrl: formattedUrl,
      description,
      niche: profile.detectedNiche,
      serviceArea: profile.serviceArea,
      highlights: profile.serviceHighlights,
    });

    // Extract phone and email from all scraped content
    const allTextForExtraction = [homepageMarkdown, combinedPageContent, secondaryContent, filesContent].join('\n');
    const extractedPhones = extractPhones(allTextForExtraction);
    const extractedEmails = extractEmails(allTextForExtraction);
    const primaryPhone = extractedPhones[0] || null;
    const primaryEmail = extractedEmails[0] || null;

    const { data: existingLead, error: existingLeadError } = await supabase
      .from('leads')
      .select('phone, email')
      .eq('id', leadId)
      .maybeSingle();

    if (existingLeadError) {
      console.warn('Could not read existing lead contact details:', existingLeadError);
    }

    const existingLeadPhone = cleanText(existingLead?.phone);
    const existingLeadEmail = cleanText(existingLead?.email);

    console.log('Extracted contact info — phones:', extractedPhones, 'emails:', extractedEmails);

    // Save initial results immediately so the demo can load
    const updateResult = await supabase.from('leads').update({
      business_name: profile.businessName,
      niche: profile.detectedNiche,
      website_url: formattedUrl,
      brand_colors: branding.colors || null,
      brand_logo: branding.images?.logo || branding.logo || null,
      brand_fonts: branding.fonts || branding.typography || null,
      website_screenshot: storedScreenshot,
      screenshot_tablet: browserlessResults.tablet || null,
      screenshot_mobile: browserlessResults.mobile || null,
      website_content: initialContent || null,
      website_title: title || null,
      website_description: description || null,
      scan_status: 'completed',
      // Scraped business contact data belongs in source knowledge, never visitor fields.
    }).eq('id', leadId);

    if (updateResult.error) {
      console.error('Error updating lead:', updateResult.error);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save scan results' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('Scan completed for lead:', leadId, '— content length:', initialContent.length);

    // === PHASE 4: Background enrichment (non-blocking) ===
    // Web research + AI enrichment happens AFTER we return the response
    EdgeRuntime.waitUntil(
      backgroundEnrich(
        leadId,
        supabaseUrl,
        supabaseServiceKey,
        firecrawlKey,
        lovableApiKey || undefined,
        profile,
        initialNiche,
        additionalContent,
        homepageSummary,
        successfulPages.map((p) => p.summary).filter(Boolean).slice(0, 6),
        formattedUrl,
      ).catch((err) => {
        console.error('Background enrichment error:', err);
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          title,
          description,
          colors: branding.colors,
          logo: branding.images?.logo || branding.logo,
          screenshot: Boolean(storedScreenshot),
          screenshotProvider,
          pagesScraped: successfulPages.length + 1,
          detectedNiche: profile.detectedNiche,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in scan-website:', error);

    if (supabase && leadId) {
      await supabase.from('leads').update({ scan_status: 'failed' }).eq('id', leadId);
    }

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
