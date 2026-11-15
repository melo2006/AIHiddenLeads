import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";
import ScanningAnimation from "@/components/landing/ScanningAnimation";

/**
 * Publish #77 (owner's correction of #73, 2026-11-15): the scan-wait
 * feature deck is a ROTATING HERO, not a grid.
 *
 * The owner tested the #73 six-card grid on his phone and rejected
 * it: too many cards, too much text, the scan screen ran way past one
 * screen and forced scrolling. His order: the cards rotate — "one
 * big card one page at any given time… like a hero page." These tests
 * drive the real component (continuous mode, as DemoSite runs it)
 * and pin the behavior he asked for:
 *   — exactly ONE feature card on screen at a time;
 *   — it auto-rotates (4.5 s) through all six, in selling order;
 *   — dots show the position and every card is reachable by dot;
 *   — prev/next arrows walk the deck and wrap around;
 *   — interacting (dot / arrow / hover) PAUSES the rotation, which
 *     later resumes on its own;
 *   — the truthful scan progress stays rendered, separate from the
 *     hero — the sell never impersonates progress.
 * Copy parity for the new rotator strings is pinned at the bottom.
 */

// Resolve keys against the real en catalog (with {{interpolation}}),
// so these tests pin the strings the visitor actually sees.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const raw = key
        .split(".")
        .reduce<unknown>(
          (acc, part) =>
            acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
          en as unknown,
        );
      if (typeof raw !== "string") return key;
      return raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options?.[name] ?? ""));
    },
  }),
}));

const FEATURE_ORDER = [
  "videoAvatar",
  "conversation",
  "dashboard",
  "appointments",
  "warmTransfer",
  "readyFast",
] as const;

const ROTATE_MS = 4500;
const RESUME_MS = 10000;

const renderScan = () =>
  render(
    <ScanningAnimation websiteUrl="example.com" onComplete={() => {}} mode="continuous" />,
  );

const activeCard = () => screen.getByTestId("scan-feature-card");
const dots = () => screen.getAllByTestId("scan-feature-dot");
const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("Publish #77 — rotating scan hero", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows exactly ONE feature card at a time, starting with the video avatar", () => {
    renderScan();
    const cards = screen.getAllByTestId("scan-feature-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.feature).toBe("videoAvatar");
    // The other five headlines are nowhere on screen.
    for (const key of FEATURE_ORDER.slice(1)) {
      expect(screen.queryByText(en.scan.benefits[key].headline)).toBeNull();
    }
    // Card ① keeps its avatar-library row.
    expect(screen.getByText(en.scan.benefits.videoAvatar.avatarsNote)).toBeInTheDocument();
    expect(screen.getByText("1 / 6")).toBeInTheDocument();
  });

  it("auto-rotates through the deck in selling order", () => {
    renderScan();
    expect(activeCard().dataset.feature).toBe("videoAvatar");
    advance(ROTATE_MS);
    expect(activeCard().dataset.feature).toBe("conversation");
    advance(ROTATE_MS);
    expect(activeCard().dataset.feature).toBe("dashboard");
    // Still exactly one card mounted after each swap.
    expect(screen.getAllByTestId("scan-feature-card")).toHaveLength(1);
  });

  it("dots reflect the position and every card is reachable by dot", () => {
    renderScan();
    expect(dots()).toHaveLength(6);
    expect(dots()[0]).toHaveAttribute("aria-current", "true");
    expect(dots()[1]).not.toHaveAttribute("aria-current");

    FEATURE_ORDER.forEach((key, i) => {
      fireEvent.click(dots()[i]);
      expect(activeCard().dataset.feature).toBe(key);
      expect(dots()[i]).toHaveAttribute("aria-current", "true");
      expect(screen.getByText(`${i + 1} / 6`)).toBeInTheDocument();
    });
  });

  it("prev / next arrows walk the whole deck and wrap around", () => {
    renderScan();
    const next = screen.getByRole("button", { name: en.scan.nextFeature });
    const prev = screen.getByRole("button", { name: en.scan.previousFeature });

    for (const key of FEATURE_ORDER.slice(1)) {
      fireEvent.click(next);
      expect(activeCard().dataset.feature).toBe(key);
    }
    // Wrap: past the last card comes the first again…
    fireEvent.click(next);
    expect(activeCard().dataset.feature).toBe("videoAvatar");
    // …and prev from the first lands on the last.
    fireEvent.click(prev);
    expect(activeCard().dataset.feature).toBe("readyFast");
  });

  it("pauses rotation while the visitor interacts, then resumes on its own", () => {
    renderScan();
    // Jump to the warm-transfer card (index 4) by its dot.
    fireEvent.click(dots()[4]);
    expect(activeCard().dataset.feature).toBe("warmTransfer");

    // Well past several rotation intervals: still parked — the
    // visitor is reading, the card must not be yanked away.
    advance(RESUME_MS + ROTATE_MS - 100);
    expect(activeCard().dataset.feature).toBe("warmTransfer");

    // After the resume delay the rotation picks up again by itself:
    // one full rotation interval after the resume, exactly one card
    // has advanced (the restarted interval is registered when React
    // flushes the resume, so measure the interval from there).
    advance(ROTATE_MS);
    expect(activeCard().dataset.feature).toBe("readyFast");
  });

  it("hover pauses rotation; leaving the hero resumes it", () => {
    renderScan();
    const rotator = screen.getByTestId("scan-feature-rotator");
    fireEvent.mouseEnter(rotator);
    advance(ROTATE_MS * 4);
    expect(activeCard().dataset.feature).toBe("videoAvatar");
    fireEvent.mouseLeave(rotator);
    advance(ROTATE_MS + 100);
    expect(activeCard().dataset.feature).toBe("conversation");
  });

  it("keeps the truthful scan progress rendered, separate from the hero", () => {
    renderScan();
    const progress = screen.getByTestId("scan-progress");
    // Real step label + real percentage line live in the progress
    // strip — and the feature card is NOT part of it.
    expect(within(progress).getByText(en.scan.steps.content.label)).toBeInTheDocument();
    expect(within(progress).getByText(/% — Scanning website/)).toBeInTheDocument();
    expect(within(progress).queryByTestId("scan-feature-card")).toBeNull();
    // The hero is headed as its own block.
    expect(screen.getByText(en.scan.featuresTitle)).toBeInTheDocument();
  });
});

describe("Publish #77 — rotator copy parity across locales", () => {
  it("the prev/next labels exist and are translated in all three locales", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      expect(locale.scan.previousFeature.trim().length, `${name}.previousFeature`).toBeGreaterThan(0);
      expect(locale.scan.nextFeature.trim().length, `${name}.nextFeature`).toBeGreaterThan(0);
    }
    expect(pt.scan.previousFeature).not.toBe(en.scan.previousFeature);
    expect(pt.scan.nextFeature).not.toBe(en.scan.nextFeature);
    expect(es.scan.previousFeature).not.toBe(en.scan.previousFeature);
    expect(es.scan.nextFeature).not.toBe(en.scan.nextFeature);
  });

  it("the trimmed hero bodies keep every mandated selling phrase (EN)", () => {
    // Publish #77 lightly trimmed the two longest bodies so one big
    // card stays readable; the phrases the copy guards mandate
    // (demo-copy-refresh) must survive the trim verbatim.
    const b = en.scan.benefits;
    expect(b.videoAvatar.body).toContain("live streaming video avatar");
    expect(b.videoAvatar.body).toContain("face-to-face");
    expect(b.videoAvatar.body).toContain("two-way video conversation");
    expect(b.warmTransfer.body).toContain("summary of the conversation");
    expect(b.warmTransfer.body).toContain("stay in control");
  });
});
