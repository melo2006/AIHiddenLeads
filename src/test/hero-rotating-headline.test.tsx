import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HeroRotatingHeadline, {
  HERO_HEADLINE_TEXTS,
} from "@/components/landing/HeroRotatingHeadline";

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

const getLines = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-line-index]"));

const activeIndex = (container: HTMLElement) =>
  getLines(container).findIndex((line) => line.dataset.active === "true");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setReducedMotion(false);
});

describe("HeroRotatingHeadline", () => {
  it("renders all seven lines in order with the first line active", () => {
    setReducedMotion(false);
    const { container } = render(<HeroRotatingHeadline />);
    const lines = getLines(container);
    expect(lines).toHaveLength(HERO_HEADLINE_TEXTS.length);
    lines.forEach((line, i) => {
      expect(line.textContent).toBe(HERO_HEADLINE_TEXTS[i]);
    });
    expect(activeIndex(container)).toBe(0);
  });

  it("cycles through the lines in order and wraps back to the first", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const { container } = render(<HeroRotatingHeadline />);
    expect(activeIndex(container)).toBe(0);
    for (let next = 1; next < HERO_HEADLINE_TEXTS.length; next++) {
      act(() => {
        vi.advanceTimersByTime(4500);
      });
      expect(activeIndex(container)).toBe(next);
    }
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(activeIndex(container)).toBe(0);
  });

  it("does not cycle while paused", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const { container } = render(<HeroRotatingHeadline paused />);
    act(() => {
      vi.advanceTimersByTime(45000);
    });
    expect(activeIndex(container)).toBe(0);
  });

  it("renders the first line statically with prefers-reduced-motion", () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    const { container } = render(<HeroRotatingHeadline />);
    expect(activeIndex(container)).toBe(0);
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(activeIndex(container)).toBe(0);
    expect(getLines(container)[0].textContent).toBe(HERO_HEADLINE_TEXTS[0]);
  });
});
