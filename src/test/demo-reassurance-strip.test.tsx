import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en.json";
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

describe("DemoReassuranceStrip auto-collapse (owner's slimming order, 2026-11-09)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("starts expanded with the one-line copy, not collapsed", () => {
    render(<DemoReassuranceStrip />);
    expect(screen.getByText(FULL)).toBeInTheDocument();
    expect(screen.queryByText(SHORT)).not.toBeInTheDocument();
    expect(stripEl().dataset.expanded).toBe("true");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses to the slim bar after 15 seconds — not before", () => {
    render(<DemoReassuranceStrip />);
    act(() => {
      vi.advanceTimersByTime(MS - 1);
    });
    expect(stripEl().dataset.expanded).toBe("true");
    expect(screen.getByText(FULL)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(stripEl().dataset.expanded).toBe("false");
    expect(screen.getByText(SHORT)).toBeInTheDocument();
    expect(screen.queryByText(FULL)).not.toBeInTheDocument();
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
    expect(screen.getByText(FULL)).toBeInTheDocument();

    // Long past another full countdown: a manual expansion is the
    // visitor's choice and is never folded away behind their back.
    act(() => {
      vi.advanceTimersByTime(MS * 4);
    });
    expect(stripEl().dataset.expanded).toBe("true");
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it("the chevron folds it manually too, in both variants", () => {
    render(<DemoReassuranceStrip compact />);
    fireEvent.click(toggle());
    expect(stripEl().dataset.expanded).toBe("false");
    expect(screen.getByText(SHORT)).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(stripEl().dataset.expanded).toBe("true");
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });
});
