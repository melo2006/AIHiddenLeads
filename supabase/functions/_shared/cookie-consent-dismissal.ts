/**
 * Cookie-consent auto-dismissal for AiHiddenLeads DEMO surfaces.
 *
 * Ron's directive (2026-11-14): demo views of a prospect's website must not sit
 * behind the site's cookie/privacy banner ("We value your privacy" with
 * REJECT NON-ESSENTIAL / CUSTOMIZE / ACCEPT ALL on martinezrealtorsfl.com).
 * For demos only, dismiss the banner automatically:
 *   1. Prefer a REFUSAL control (Reject, Reject all, Decline, Cancel,
 *      Reject non-essential, Disagree, Do not sell/share, essential-only…).
 *   2. Press Accept / Accept all ONLY when no refusal control exists.
 *   3. Never press anything else (Customize/Settings/Manage/Learn more are
 *      never clicked), and never click outside a validated consent container.
 *
 * The page-side logic lives in ONE self-contained source string
 * (COOKIE_CONSENT_DISMISSAL_SOURCE). It is the single source of truth:
 *  - scan-website injects it into the capture browser before screenshotting,
 *  - create-browser-session evaluates it in the Browserbase live view via CDP,
 *  - the unit tests materialize the exact same string and run it against
 *    jsdom fixtures, so what is tested is byte-for-byte what ships.
 *
 * The script is safe to inject repeatedly: state is shared on
 * window.__aihlCookieDismissal, each banner container is clicked at most
 * twice, and observation stops after a bounded window.
 */

export interface CookieConsentDismissalOptions {
  /** How long to keep watching for a late-appearing banner, in ms. Default 6000. */
  observeMs?: number;
  /** Fallback poll interval while watching, in ms. Default 400. */
  pollMs?: number;
}

export interface CookieConsentDismissalReport {
  status: "pending" | "dismissed-reject" | "dismissed-accept" | "not-found";
  clicked: "reject" | "accept" | null;
  clickedText: string | null;
  attempts: number;
  containers: number;
}

export const COOKIE_CONSENT_DISMISSAL_SOURCE = `
function cookieConsentDismissalMain(root, options) {
  var doc = null;
  if (root && root.nodeType === 9) doc = root;
  else if (root && root.ownerDocument) doc = root.ownerDocument;
  else if (typeof document !== 'undefined') doc = document;
  if (!doc) return { status: 'not-found', clicked: null, clickedText: null, attempts: 0, containers: 0 };
  var win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  var opts = options || {};
  var observeMs = typeof opts.observeMs === 'number' ? opts.observeMs : 6000;
  var pollMs = typeof opts.pollMs === 'number' ? opts.pollMs : 400;

  var REFUSAL_PATTERNS = [
    /reject\\s+all/i, /reject/i, /decline/i, /deny/i, /refuse/i, /disagree/i,
    /do\\s+not\\s+(sell|share|accept)/i, /no\\s*,?\\s*thanks/i,
    /opt[\\s-]*out/i, /(only|use\\s+only)\\s+(essential|necessary|required)/i,
    /(essential|necessary|required)\\s+only/i, /continue\\s+without/i,
    /^cancel$/i, /^dismiss$/i, /^close$/i, /^no$/i, /^not\\s+now$/i
  ];
  var STRONG_REFUSAL = /reject|decline|deny|refuse|disagree|do\\s+not\\s+(sell|share)/i;
  var ACCEPT_PATTERNS = [
    /accept\\s+all/i, /accept/i, /allow\\s+all/i, /allow/i, /agree/i,
    /consent/i, /got\\s+it/i, /enable\\s+all/i, /confirm/i, /^ok$/i, /^okay$/i, /^yes$/i
  ];
  var EXCLUDE_PATTERNS = [
    /customi[sz]e/i, /setting/i, /manage/i, /preference/i, /learn\\s+more/i,
    /more\\s+info/i, /read\\s+more/i, /detail/i, /polic/i, /why\\s+we/i,
    /partner/i, /vendor/i, /purpose/i, /show\\s+all/i, /view\\s+all/i
  ];
  var KNOWN_REFUSAL_SELECTORS = [
    '#onetrust-reject-all-handler',
    '#CybotCookiebotDialogBodyButtonDecline',
    '#didomi-notice-disagree-button',
    '.osano-cm-denyAll',
    '.cc-deny',
    '[data-testid="uc-deny-all-button"]',
    '[data-action="reject"]'
  ];
  var KNOWN_ACCEPT_SELECTORS = [
    '#onetrust-accept-btn-handler',
    '#CybotCookiebotDialogBodyLevelButtonAccept',
    '#CybotCookiebotDialogBodyButtonAccept',
    '#didomi-notice-agree-button',
    '.osano-cm-acceptAll',
    '.cc-allow'
  ];
  var FRAMEWORK_CONTAINER_SELECTORS = [
    '#onetrust-banner-sdk', '#onetrust-consent-sdk', '#CybotCookiebotDialog',
    '#didomi-host', '.didomi-popup-container', '#osano-cm-window', '.osano-cm-window',
    '#qc-cmp2-container', '.qc-cmp2-container', '.cc-window', '#cookie-law-info-bar',
    '.cli-bar-container', '#trustarc-banner', '.truste-consent-content',
    '#gdpr-cookie-message', '#usercentrics-root'
  ];
  var GENERIC_CONTAINER_SELECTOR =
    '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i],' +
    ' [id*="privacy" i], [class*="privacy" i], [role="dialog"], [role="alertdialog"],' +
    ' [aria-label*="cookie" i], [aria-label*="consent" i], [aria-label*="privacy" i]';
  var CONSENT_CONTEXT = /cookie|consent|privacy|gdpr|ccpa|cpra|do not sell|personal (data|information)|tracking/i;
  var CLICKABLE_SELECTOR = 'button, a[href], [role="button"], input[type="button"], input[type="submit"]';

  var shared = win ? win.__aihlCookieDismissal : null;
  if (!shared) {
    shared = {
      report: { status: 'pending', clicked: null, clickedText: null, attempts: 0, containers: 0 },
      clickCounts: typeof WeakMap !== 'undefined' ? new WeakMap() : null,
      fallbackCounts: [],
      startedAt: Date.now(),
      observer: null,
      timer: null,
      watching: false,
      done: false,
      scheduled: false
    };
    if (win) win.__aihlCookieDismissal = shared;
  }
  var report = shared.report;

  function clickCountFor(el) {
    if (shared.clickCounts) return shared.clickCounts.get(el) || 0;
    for (var i = 0; i < shared.fallbackCounts.length; i++) {
      if (shared.fallbackCounts[i].el === el) return shared.fallbackCounts[i].n;
    }
    return 0;
  }
  function bumpClickCount(el) {
    if (shared.clickCounts) { shared.clickCounts.set(el, clickCountFor(el) + 1); return; }
    for (var i = 0; i < shared.fallbackCounts.length; i++) {
      if (shared.fallbackCounts[i].el === el) { shared.fallbackCounts[i].n++; return; }
    }
    shared.fallbackCounts.push({ el: el, n: 1 });
  }

  function normText(el) {
    var raw = '';
    if (el) {
      if (typeof el.innerText === 'string' && el.innerText) raw = el.innerText;
      else if (typeof el.textContent === 'string' && el.textContent) raw = el.textContent;
      else raw = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || '');
      if (!raw && el.value) raw = String(el.value);
      if (!raw && el.getAttribute) raw = el.getAttribute('aria-label') || '';
    }
    // Collapse whitespace and trim edge bullets only — symbol-only labels ('×') must survive.
    return String(raw || '').replace(/\\s+/g, ' ').replace(/^[\\s•·]+|[\\s•·]+$/g, '').toLowerCase().trim();
  }

  function isShown(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hidden) return false;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    if (win && win.getComputedStyle) {
      try {
        var cs = win.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      } catch (e) { /* ignore */ }
    }
    // Geometry check only where real layout exists (jsdom reports 0 everywhere).
    if (doc.documentElement && doc.documentElement.clientWidth > 0 && el.getClientRects) {
      if (el.getClientRects().length === 0) return false;
    }
    return true;
  }

  function classify(text) {
    if (!text) return null;
    if (text === '×' || text === '✕' || text === '✖' || text === 'x') return 'reject';
    if (STRONG_REFUSAL.test(text)) return 'reject';
    var i;
    for (i = 0; i < EXCLUDE_PATTERNS.length; i++) if (EXCLUDE_PATTERNS[i].test(text)) return null;
    for (i = 0; i < REFUSAL_PATTERNS.length; i++) if (REFUSAL_PATTERNS[i].test(text)) return 'reject';
    for (i = 0; i < ACCEPT_PATTERNS.length; i++) if (ACCEPT_PATTERNS[i].test(text)) return 'accept';
    return null;
  }

  function clickablesIn(container) {
    var nodes = container.querySelectorAll(CLICKABLE_SELECTOR);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.disabled) continue;
      if (!isShown(el)) continue;
      if (el.tagName === 'A') {
        var href = el.getAttribute('href') || '';
        // Never follow a link away from the demo page.
        if (href && href.charAt(0) !== '#' && !/^javascript:/i.test(href)) continue;
      }
      out.push(el);
    }
    return out;
  }

  function findActionIn(container) {
    var els = clickablesIn(container);
    var firstAccept = null;
    for (var i = 0; i < els.length; i++) {
      var kind = classify(normText(els[i]));
      if (kind === 'reject') return { el: els[i], kind: kind };
      if (kind === 'accept' && !firstAccept) firstAccept = { el: els[i], kind: kind };
    }
    if (!firstAccept) {
      for (var j = 0; j < KNOWN_ACCEPT_SELECTORS.length; j++) {
        var known = null;
        try { known = container.querySelector(KNOWN_ACCEPT_SELECTORS[j]); } catch (e) { known = null; }
        if (known && isShown(known) && !known.disabled) { firstAccept = { el: known, kind: 'accept' }; break; }
      }
    }
    return firstAccept;
  }

  function hasConsentContext(el) {
    var text = '';
    try { text = String(el.textContent || '').slice(0, 4000); } catch (e) { text = ''; }
    if (CONSENT_CONTEXT.test(text)) return true;
    var label = (el.getAttribute && (el.getAttribute('aria-label') || el.id || el.className)) || '';
    return CONSENT_CONTEXT.test(String(label));
  }

  function collectContainers() {
    var out = [];
    var seen = [];
    function push(el) {
      if (!el || el.nodeType !== 1) return;
      if (el.tagName === 'BODY' || el.tagName === 'HTML') return;
      if (seen.indexOf(el) !== -1) return;
      if (!isShown(el)) return;
      seen.push(el);
      out.push(el);
    }
    var i, j, nodes;
    for (i = 0; i < FRAMEWORK_CONTAINER_SELECTORS.length; i++) {
      try { nodes = doc.querySelectorAll(FRAMEWORK_CONTAINER_SELECTORS[i]); } catch (e) { nodes = []; }
      for (j = 0; j < nodes.length; j++) push(nodes[j]);
    }
    try { nodes = doc.querySelectorAll(GENERIC_CONTAINER_SELECTOR); } catch (e) { nodes = []; }
    for (i = 0; i < nodes.length; i++) {
      var g = nodes[i];
      if (seen.indexOf(g) !== -1) continue;
      if (!hasConsentContext(g)) continue;
      var textLen = 0;
      try { textLen = String(g.textContent || '').length; } catch (e) { textLen = 0; }
      if (textLen > 6000) continue;
      if (g.querySelectorAll(CLICKABLE_SELECTOR).length > 40) continue;
      push(g);
    }
    if (out.length === 0 && win && win.getComputedStyle && doc.body) {
      // Heuristic fallback: visible fixed/sticky bars whose text is about consent.
      var all = doc.body.querySelectorAll('div, section, aside, footer, form');
      var scanned = 0;
      for (i = 0; i < all.length && scanned < 3000; i++) {
        var cand = all[i];
        scanned++;
        if (seen.indexOf(cand) !== -1) continue;
        if (cand.tagName === 'HEADER' || cand.tagName === 'NAV') continue;
        if (cand.getAttribute && cand.getAttribute('role') === 'navigation') continue;
        if (cand.querySelector && cand.querySelector('nav')) continue;
        var pos = '';
        try { pos = win.getComputedStyle(cand).position; } catch (e) { pos = ''; }
        if (pos !== 'fixed' && pos !== 'sticky') continue;
        if (!isShown(cand)) continue;
        if (!hasConsentContext(cand)) continue;
        if (cand.querySelectorAll(CLICKABLE_SELECTOR).length > 40) continue;
        push(cand);
      }
    }
    // Drop containers that merely wrap a tighter candidate.
    var tight = [];
    for (i = 0; i < out.length; i++) {
      var wraps = false;
      for (j = 0; j < out.length; j++) {
        if (i !== j && out[i].contains && out[i].contains(out[j])) { wraps = true; break; }
      }
      if (!wraps) tight.push(out[i]);
    }
    // Tightest (shortest text) first — the most banner-like container wins.
    tight.sort(function (a, b) {
      var la = 0, lb = 0;
      try { la = String(a.textContent || '').length; } catch (e) { la = 0; }
      try { lb = String(b.textContent || '').length; } catch (e) { lb = 0; }
      return la - lb;
    });
    return tight;
  }

  function doClick(el, container, kind) {
    var anchor = container || el;
    bumpClickCount(anchor);
    report.clicked = kind;
    report.clickedText = normText(el);
    report.status = kind === 'reject' ? 'dismissed-reject' : 'dismissed-accept';
    try { el.click(); } catch (e) { /* a throwing handler must not break the demo */ }
    // If the banner is still visible shortly after, allow ONE more refusal-led attempt.
    if (win && win.setTimeout) {
      win.setTimeout(function () {
        if (container && isShown(container) && clickCountFor(container) < 2) attempt();
      }, 900);
    }
  }

  function attempt() {
    if (shared.done && report.clicked) return false;
    report.attempts++;
    var i, nodes, el;
    for (i = 0; i < KNOWN_REFUSAL_SELECTORS.length; i++) {
      try { nodes = doc.querySelectorAll(KNOWN_REFUSAL_SELECTORS[i]); } catch (e) { nodes = []; }
      for (var j = 0; j < nodes.length; j++) {
        el = nodes[j];
        if (clickCountFor(el) >= 2) continue;
        if (isShown(el) && !el.disabled) { doClick(el, el, 'reject'); return true; }
      }
    }
    var containers = collectContainers();
    report.containers = containers.length;
    for (i = 0; i < containers.length; i++) {
      var container = containers[i];
      if (clickCountFor(container) >= 2) continue;
      var hit = findActionIn(container);
      if (hit) { doClick(hit.el, container, hit.kind); return true; }
    }
    return false;
  }

  function stopWatching() {
    if (shared.done) return;
    shared.done = true;
    if (shared.observer) { try { shared.observer.disconnect(); } catch (e) { /* ignore */ } shared.observer = null; }
    if (shared.timer && win && win.clearInterval) win.clearInterval(shared.timer);
    shared.timer = null;
    if (report.status === 'pending') report.status = report.clicked ? report.status : 'not-found';
  }

  function ensureWatching() {
    if (shared.watching || shared.done || observeMs <= 0) return;
    shared.watching = true;
    var deadline = shared.startedAt + observeMs;
    var scheduleAttempt = function () {
      if (shared.done || shared.scheduled) return;
      shared.scheduled = true;
      var t = win && win.setTimeout ? win.setTimeout : setTimeout;
      t(function () { shared.scheduled = false; if (!shared.done) attempt(); }, 150);
    };
    if (win && win.MutationObserver && doc.documentElement) {
      try {
        shared.observer = new win.MutationObserver(scheduleAttempt);
        shared.observer.observe(doc.documentElement, {
          childList: true, subtree: true, attributes: true,
          attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
        });
      } catch (e) { shared.observer = null; }
    }
    if (win && win.setInterval) {
      shared.timer = win.setInterval(function () {
        if (shared.done) return;
        if (Date.now() >= deadline) { stopWatching(); return; }
        attempt();
      }, pollMs);
    }
    var stopDelay = Math.max(0, deadline - Date.now());
    var stopTimer = win && win.setTimeout ? win.setTimeout : setTimeout;
    stopTimer(stopWatching, stopDelay + 25);
  }

  attempt();
  if (observeMs > 0) {
    ensureWatching();
  } else {
    if (report.status === 'pending') report.status = report.clicked ? report.status : 'not-found';
    shared.done = true;
  }
  return report;
}
`;

/** Wrap the shared source in a runnable script for injection into a page. */
export function buildCookieConsentDismissalScript(
  options: CookieConsentDismissalOptions = {},
): string {
  return (
    COOKIE_CONSENT_DISMISSAL_SOURCE +
    "\n;cookieConsentDismissalMain(document, " +
    JSON.stringify(options) +
    ");"
  );
}

/**
 * Materialize the page-side function from the shared source. Used by tests
 * (and any in-process DOM owner) so the exact shipped string is what runs.
 */
export function loadCookieConsentDismissalMain(): (
  root: unknown,
  options?: CookieConsentDismissalOptions,
) => CookieConsentDismissalReport {
  const factory = new Function(
    `${COOKIE_CONSENT_DISMISSAL_SOURCE}\nreturn cookieConsentDismissalMain;`,
  ) as () => (
    root: unknown,
    options?: CookieConsentDismissalOptions,
  ) => CookieConsentDismissalReport;
  return factory();
}
