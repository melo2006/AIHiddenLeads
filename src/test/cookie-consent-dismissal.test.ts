import { afterEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import {
  buildCookieConsentDismissalScript,
  loadCookieConsentDismissalMain,
} from "../../supabase/functions/_shared/cookie-consent-dismissal";

const main = loadCookieConsentDismissalMain();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const doms: JSDOM[] = [];
function makeDom(bodyHtml: string, runScripts = false) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, {
    url: "https://www.martinezrealtorsfl.com/",
    ...(runScripts ? { runScripts: "dangerously" as const } : {}),
  });
  doms.push(dom);
  return dom;
}

afterEach(() => {
  while (doms.length) doms.pop()?.window.close();
});

function clickCounter(el: Element | null | undefined) {
  const state = { count: 0 };
  el?.addEventListener("click", () => {
    state.count += 1;
  });
  return state;
}

function buttonByText(doc: Document, text: string) {
  return (
    Array.from(doc.querySelectorAll("button, a, input")).find(
      (e) =>
        ((e.textContent || (e as HTMLInputElement).value || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase()) === text.toLowerCase(),
    ) ?? null
  );
}

// Mirrors the banner in Ron's 2026-11-14 retest screenshots of the Martinez demo.
const MARTINEZ_BANNER = `
  <div class="privacy-banner">
    <h2>We value your privacy</h2>
    <p>We use cookies and similar technologies to run this site, remember your
       preferences, and understand how the site is used. You can accept all, or
       reject everything that isn't required to make the site work.</p>
    <button type="button">REJECT NON-ESSENTIAL</button>
    <button type="button">CUSTOMIZE</button>
    <button type="button">ACCEPT ALL</button>
  </div>
  <main><h1>Michael Martinez Group</h1></main>`;

describe("cookie consent dismissal (demo surfaces)", () => {
  test("prefers REJECT over ACCEPT on a privacy banner, and never touches CUSTOMIZE", () => {
    const dom = makeDom(MARTINEZ_BANNER);
    const doc = dom.window.document;
    const reject = clickCounter(buttonByText(doc, "REJECT NON-ESSENTIAL"));
    const customize = clickCounter(buttonByText(doc, "CUSTOMIZE"));
    const accept = clickCounter(buttonByText(doc, "ACCEPT ALL"));

    const report = main(doc, { observeMs: 0 });

    expect(report.status).toBe("dismissed-reject");
    expect(report.clicked).toBe("reject");
    expect(report.clickedText).toContain("reject non-essential");
    expect(reject.count).toBe(1);
    expect(customize.count).toBe(0);
    expect(accept.count).toBe(0);
  });

  test("uses ACCEPT only when no refusal control exists", () => {
    const dom = makeDom(`
      <div id="cookie-bar">
        <p>This site uses cookies to improve your experience.</p>
        <button type="button">Learn more</button>
        <button type="button">Accept all</button>
      </div>`);
    const doc = dom.window.document;
    const accept = clickCounter(buttonByText(doc, "Accept all"));
    const learn = clickCounter(buttonByText(doc, "Learn more"));

    const report = main(doc, { observeMs: 0 });

    expect(report.status).toBe("dismissed-accept");
    expect(report.clicked).toBe("accept");
    expect(accept.count).toBe(1);
    expect(learn.count).toBe(0);
  });

  test("clicks the OneTrust reject handler, not the accept handler", () => {
    const dom = makeDom(`
      <div id="onetrust-banner-sdk">
        <p>We use cookies to personalise content and ads.</p>
        <button id="onetrust-accept-btn-handler">Accept All Cookies</button>
        <button id="onetrust-reject-all-handler">Reject All</button>
      </div>`);
    const doc = dom.window.document;
    const reject = clickCounter(doc.querySelector("#onetrust-reject-all-handler"));
    const accept = clickCounter(doc.querySelector("#onetrust-accept-btn-handler"));

    const report = main(doc, { observeMs: 0 });

    expect(report.status).toBe("dismissed-reject");
    expect(reject.count).toBe(1);
    expect(accept.count).toBe(0);
  });

  test("leaves unrelated buttons completely untouched", () => {
    const dom = makeDom(`
      <form id="checkout">
        <label>Card number <input type="text" /></label>
        <input type="submit" value="Accept terms and pay" />
      </form>
      <div role="dialog" class="newsletter-popup">
        <h3>Join our newsletter</h3>
        <p>Get new listings in your inbox every week.</p>
        <button type="button">Subscribe</button>
        <button type="button">Close</button>
      </div>
      <nav><a href="https://www.martinezrealtorsfl.com/sell">Accept an offer</a></nav>`);
    const doc = dom.window.document;
    const pay = clickCounter(doc.querySelector('input[type="submit"]'));
    const subscribe = clickCounter(buttonByText(doc, "Subscribe"));
    const close = clickCounter(buttonByText(doc, "Close"));
    const navLink = clickCounter(doc.querySelector("nav a"));

    const report = main(doc, { observeMs: 0 });

    expect(report.status).toBe("not-found");
    expect(report.clicked).toBeNull();
    expect(pay.count).toBe(0);
    expect(subscribe.count).toBe(0);
    expect(close.count).toBe(0);
    expect(navLink.count).toBe(0);
  });

  test("never clicks Customize / Settings-only banners", () => {
    const dom = makeDom(`
      <div class="cookie-consent">
        <p>We value your privacy. Choose your cookie settings.</p>
        <button type="button">Customize</button>
        <button type="button">Cookie Settings</button>
      </div>`);
    const doc = dom.window.document;
    const customize = clickCounter(buttonByText(doc, "Customize"));
    const settings = clickCounter(buttonByText(doc, "Cookie Settings"));

    const report = main(doc, { observeMs: 0 });

    expect(report.status).toBe("not-found");
    expect(customize.count).toBe(0);
    expect(settings.count).toBe(0);
  });

  test("treats a close (×) control inside a consent banner as a refusal", () => {
    const dom = makeDom(`
      <div class="cookie-notice">
        <p>This website uses cookies to ensure you get the best experience.</p>
        <button type="button" aria-label="Close">×</button>
      </div>`);
    const doc = dom.window.document;
    const close = clickCounter(doc.querySelector(".cookie-notice button"));

    const report = main(doc, { observeMs: 0 });

    expect(report.status).toBe("dismissed-reject");
    expect(close.count).toBe(1);
  });

  test("never follows an off-page accept link; still uses an in-page refusal", () => {
    const dom = makeDom(`
      <div class="consent-banner">
        <p>We use cookies and tracking technologies.</p>
        <a href="https://www.martinezrealtorsfl.com/accept-cookies">Accept</a>
        <button type="button">Decline</button>
      </div>`);
    const doc = dom.window.document;
    const link = clickCounter(doc.querySelector(".consent-banner a"));
    const decline = clickCounter(buttonByText(doc, "Decline"));

    const report = main(doc, { observeMs: 0 });

    expect(report.status).toBe("dismissed-reject");
    expect(link.count).toBe(0);
    expect(decline.count).toBe(1);
  });

  test("dismisses a classless fixed-position banner via the heuristic scan", () => {
    const dom = makeDom(`
      <div style="position: fixed; bottom: 0; left: 0; right: 0;">
        <p>Our site uses cookies. You can decline non-essential cookies.</p>
        <button type="button">Decline</button>
        <button type="button">Accept</button>
      </div>`);
    const doc = dom.window.document;
    const decline = clickCounter(buttonByText(doc, "Decline"));
    const accept = clickCounter(buttonByText(doc, "Accept"));

    const report = main(doc, { observeMs: 0 });

    expect(report.status).toBe("dismissed-reject");
    expect(decline.count).toBe(1);
    expect(accept.count).toBe(0);
  });

  test("handles a banner that only appears after load (observer re-check)", async () => {
    const dom = makeDom(`<main><h1>Michael Martinez Group</h1></main>`);
    const doc = dom.window.document;

    const report = main(doc, { observeMs: 3000, pollMs: 80 });
    expect(report.status).toBe("pending");
    expect(report.clicked).toBeNull();

    await sleep(250);
    const holder = doc.createElement("div");
    holder.innerHTML = MARTINEZ_BANNER;
    doc.body.appendChild(holder.firstElementChild as Element);
    const reject = clickCounter(buttonByText(doc, "REJECT NON-ESSENTIAL"));

    const deadline = Date.now() + 2500;
    while (report.status === "pending" && Date.now() < deadline) {
      await sleep(50);
    }

    expect(report.status).toBe("dismissed-reject");
    expect(reject.count).toBe(1);
  });

  test("runs once per banner: a dismissed (hidden) banner is never clicked again", async () => {
    const dom = makeDom(MARTINEZ_BANNER);
    const doc = dom.window.document;
    const container = doc.querySelector(".privacy-banner") as HTMLElement;
    const rejectBtn = buttonByText(doc, "REJECT NON-ESSENTIAL");
    const reject = clickCounter(rejectBtn);
    // Emulate a real CMP: pressing Reject hides the banner.
    rejectBtn?.addEventListener("click", () => {
      container.style.display = "none";
    });

    main(doc, { observeMs: 1200, pollMs: 80 });
    main(doc, { observeMs: 1200, pollMs: 80 }); // second injection (e.g. second script tag)
    await sleep(1500);

    expect(reject.count).toBe(1);
  });

  test("caps retries on a banner that ignores clicks (never a third click)", async () => {
    const dom = makeDom(MARTINEZ_BANNER);
    const doc = dom.window.document;
    const reject = clickCounter(buttonByText(doc, "REJECT NON-ESSENTIAL"));

    const report = main(doc, { observeMs: 2000, pollMs: 80 });
    await sleep(2300);

    expect(report.clicked).toBe("reject");
    expect(reject.count).toBe(2); // initial click + one capped retry
  });

  test("the shipped script string dismisses the banner when evaluated in-page", () => {
    const dom = makeDom(MARTINEZ_BANNER, true);
    const doc = dom.window.document;
    const reject = clickCounter(buttonByText(doc, "REJECT NON-ESSENTIAL"));
    const accept = clickCounter(buttonByText(doc, "ACCEPT ALL"));

    dom.window.eval(buildCookieConsentDismissalScript({ observeMs: 0 }));

    const shared = (dom.window as unknown as {
      __aihlCookieDismissal: { report: { status: string; clicked: string | null } };
    }).__aihlCookieDismissal;
    expect(shared.report.status).toBe("dismissed-reject");
    expect(shared.report.clicked).toBe("reject");
    expect(reject.count).toBe(1);
    expect(accept.count).toBe(0);
  });
});
