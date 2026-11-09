import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en.json";
import { readFileSync } from "node:fs";
import path from "node:path";
import DemoReassuranceStrip, {
  REASSURANCE_AUTO_COLLAPSE_SECONDS,
} from "@/components/landing/DemoReassuranceStrip";

// The strip reads its copy from i18next; resolve keys against the real en
// locale so this test pins the STRIP STRINGS the visitor actually sees.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const value = key
        .split(".")
        .reduce<unknown>(
          (acc, part) =>
            acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
          en as unknown,
        );
      return typeof value === "string" ? value : key;
    },
  }),
}));

const FULL = en.tryDemo.notTouched;
const SHORT = en.tryDemo.notTouchedShort;
const MS = REASSURANCE_AUTO_COLLAPSE_SECONDS * 1000;

const stripEl = () => screen.getByRole("note");
const toggle = () => screen.getByRole("button");

describe("DemoReassuranceStrip — one slim row + anchored dropdown (owner's orders, 2026-11-09)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("the row itself is always the slim bar: short line + chevron, whatever the state", () => {
    render(<DemoReassuranceStrip />);
    // The short line is the ROW (always in the layout); the full line
    // lives in the dropdown panel anchored under it.
    expect(screen.getByText(SHORT)).toBeInTheDocument();
    expect(screen.getByText(FULL)).toBeInTheDocument();
    expect(stripEl().dataset.expanded).toBe("true");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("the detail dropdown starts open and folds away after 15 seconds — not before", () => {
    render(<DemoReassuranceStrip />);
    const dropdown = screen.getByText(FULL).closest("div");
    expect(dropdown?.className).toContain("max-h-28");
    act(() => {
      vi.advanceTimersByTime(MS - 1);
    });
    expect(stripEl().dataset.expanded).toBe("true");
    expect(screen.getByText(FULL).closest("div")?.className).toContain("max-h-28");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(stripEl().dataset.expanded).toBe("false");
    // Folded: the panel collapses to zero height (the copy stays mounted
    // inside the hidden panel; the slim row is what the visitor sees).
    expect(screen.getByText(FULL).closest("div")?.className).toContain("max-h-0");
    expect(screen.getByText(SHORT)).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("manual re-expand after the auto-collapse stays open — no second auto-collapse", () => {
    render(<DemoReassuranceStrip />);
    act(() => {
      vi.advanceTimersByTime(MS);
    });
    expect(stripEl().dataset.expanded).toBe("false");

    fireEvent.click(toggle());
    expect(stripEl().dataset.expanded).toBe("true");
    expect(screen.getByText(FULL).closest("div")?.className).toContain("max-h-28");

    // Long past another full countdown: a manual expansion is the
    // visitor's choice and is never folded away behind their back.
    act(() => {
      vi.advanceTimersByTime(MS * 4);
    });
    expect(stripEl().dataset.expanded).toBe("true");
  });

  it("the chevron folds the dropdown manually too, in both variants", () => {
    render(<DemoReassuranceStrip compact />);
    fireEvent.click(toggle());
    expect(stripEl().dataset.expanded).toBe("false");
    expect(screen.getByText(FULL).closest("div")?.className).toContain("max-h-0");
    expect(screen.getByText(SHORT)).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(stripEl().dataset.expanded).toBe("true");
    expect(screen.getByText(FULL).closest("div")?.className).toContain("max-h-28");
  });

  it("the dropdown is anchored, not in-flow: absolutely positioned under the row", () => {
    render(<DemoReassuranceStrip />);
    const dropdown = screen.getByText(FULL).closest("div");
    expect(dropdown?.className).toContain("absolute");
    expect(dropdown?.className).toContain("top-full");
    // The row must leave room for the anchor: the root is the positioned parent.
    expect(stripEl().className).toContain("relative");
  });
});

describe("DemoSite header integration — the strip shares the meta row (owner's footprint ask)", () => {
  it("renders inside the header's meta row; no standalone strip row beneath it", () => {
    const site = readFileSync(
      path.join(__dirname, "..", "pages", "DemoSite.tsx"),
      "utf8",
    );
    const metaRow = site.indexOf("Your real website is not changed.");
    const strip = site.indexOf("<DemoReassuranceStrip compact />");
    const audit = site.indexOf("<RankAuditPanel", metaRow);
    expect(metaRow).toBeGreaterThanOrEqual(0);
    expect(strip).toBeGreaterThan(metaRow);
    expect(strip).toBeLessThan(audit);
    // The old full-width strip row under the header is gone.
    expect(site).not.toContain('<div className="mt-2">\n            <DemoReassuranceStrip compact />');
    expect(site.match(/<DemoReassuranceStrip compact \/>/g)).toHaveLength(1);
  });
});
