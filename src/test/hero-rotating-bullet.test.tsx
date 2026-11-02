import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HeroRotatingBullet, {
  HERO_ROTATING_LINES,
} from "@/components/landing/HeroRotatingBullet";

const setReducedMotion = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: matches && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setReducedMotion(false);
});

describe("HeroRotatingBullet", () => {
  it("renders the first line initially", () => {
    setReducedMotion(false);
    render(<HeroRotatingBullet />);
    expect(screen.getByText(HERO_ROTATING_LINES[0])).toBeInTheDocument();
  });

  it("cycles to the next line after ~4 seconds", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    render(<HeroRotatingBullet />);
    expect(screen.getByText(HERO_ROTATING_LINES[0])).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    // Allow the exit/enter fade to finish.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(HERO_ROTATING_LINES[1])).toBeInTheDocument();
    expect(screen.queryByText(HERO_ROTATING_LINES[0])).not.toBeInTheDocument();
  });

  it("renders the first line statically with prefers-reduced-motion", () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    render(<HeroRotatingBullet />);
    expect(screen.getByText(HERO_ROTATING_LINES[0])).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText(HERO_ROTATING_LINES[0])).toBeInTheDocument();
    expect(screen.queryByText(HERO_ROTATING_LINES[1])).not.toBeInTheDocument();
  });
});
