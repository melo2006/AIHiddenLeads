import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HeroSceneSlider from "@/components/landing/HeroSceneSlider";
import { HERO_HEADLINE_TEXTS } from "@/components/landing/HeroRotatingHeadline";

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

const activeLineIndex = (container: HTMLElement) =>
  getLines(container).findIndex((line) => line.dataset.active === "true");

const activeSlideId = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-hero-slide][data-active='true']")
    ?.dataset.heroSlide;

// The scene each line index must show, in order (SLIDER PACKAGE v2,
// 2026-11-18; slide 4 swapped to the spokesperson team photo
// 2026-11-19): pain (plumber, AC man, roofer, white-haired owner) then
// relief (spokesperson team, older couple) closing on Aspen with the owners.
const EXPECTED_SCENES = [
  "manufacturer-pain-whitehair",
  "plumber-pain",
  "ac-guy-pain",
  "roofer-pain",
  "faces-montage",
  "couple-relief",
  "aspen-owners",
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setReducedMotion(false);
});

describe("HeroSceneSlider", () => {
  it("renders all seven slogan lines in order with the first line and scene active", () => {
    setReducedMotion(false);
    const { container } = render(<HeroSceneSlider />);
    const lines = getLines(container);
    expect(lines).toHaveLength(HERO_HEADLINE_TEXTS.length);
    lines.forEach((line, i) => {
      expect(line.textContent).toBe(HERO_HEADLINE_TEXTS[i]);
    });
    expect(activeLineIndex(container)).toBe(0);
    expect(activeSlideId(container)).toBe(EXPECTED_SCENES[0]);
    // Exactly one h1 carries the slogans.
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("keeps each slogan on the side its photo was composed for", () => {
    setReducedMotion(false);
    const { container } = render(<HeroSceneSlider />);
    // Per line, following its scene: the white-haired owner and the AC
    // man sit left (slogan right); the plumber and the roofer work on
    // the right (slogan left); the team photo's side never renders
    // (bottom placement); the couple stands left (slogan right); Aspen
    // and the owners sit right (slogan left).
    const expectedSides = ["right", "left", "right", "left", "left", "right", "left"];
    getLines(container).forEach((line, i) => {
      expect(line.dataset.textSide).toBe(expectedSides[i]);
    });
  });

  it("moves only the team-photo slide's slogan to the bottom band", () => {
    setReducedMotion(false);
    const { container } = render(<HeroSceneSlider />);
    getLines(container).forEach((line, i) => {
      // Slide 4 (the eight-face spokesperson montage) declares
      // placement "bottom" so its slogan never covers a face; every
      // other slide keeps the standard side placement.
      expect(line.dataset.textPlacement).toBe(i === 4 ? "bottom" : "side");
    });
  });

  it("auto-advances every 10s through the scenes in order and wraps", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const { container } = render(<HeroSceneSlider />);
    expect(activeLineIndex(container)).toBe(0);
    // Not yet at 9.999s.
    act(() => {
      vi.advanceTimersByTime(9999);
    });
    expect(activeLineIndex(container)).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(activeLineIndex(container)).toBe(1);
    for (let next = 2; next < EXPECTED_SCENES.length; next++) {
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(activeLineIndex(container)).toBe(next);
      expect(activeSlideId(container)).toBe(EXPECTED_SCENES[next]);
    }
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(activeLineIndex(container)).toBe(0);
    expect(activeSlideId(container)).toBe(EXPECTED_SCENES[0]);
  });

  it("arrow navigation moves one slide and pauses auto-rotation until play", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const { container, getByLabelText } = render(<HeroSceneSlider />);
    fireEvent.click(getByLabelText("Next slide"));
    expect(activeLineIndex(container)).toBe(1);
    expect(activeSlideId(container)).toBe(EXPECTED_SCENES[1]);
    // Manual control pauses the rotation (realtor-slideshow behavior).
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(activeLineIndex(container)).toBe(1);
    fireEvent.click(getByLabelText("Play slideshow"));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(activeLineIndex(container)).toBe(2);
  });

  it("previous arrow wraps from the first slide to the last", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const { container, getByLabelText } = render(<HeroSceneSlider />);
    fireEvent.click(getByLabelText("Previous slide"));
    expect(activeLineIndex(container)).toBe(EXPECTED_SCENES.length - 1);
    expect(activeSlideId(container)).toBe(
      EXPECTED_SCENES[EXPECTED_SCENES.length - 1],
    );
  });

  it("dot navigation jumps to the slide and pauses auto-rotation", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const { container, getByLabelText } = render(<HeroSceneSlider />);
    fireEvent.click(
      getByLabelText(`Show slide 4: ${HERO_HEADLINE_TEXTS[3]}`),
    );
    expect(activeLineIndex(container)).toBe(3);
    expect(activeSlideId(container)).toBe(EXPECTED_SCENES[3]);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(activeLineIndex(container)).toBe(3);
  });

  it("pause toggle stops the rotation and reports aria-pressed", () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const { container, getByLabelText } = render(<HeroSceneSlider />);
    const pause = getByLabelText("Pause slideshow");
    fireEvent.click(pause);
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(activeLineIndex(container)).toBe(0);
  });

  it("renders the first slide statically with prefers-reduced-motion, controls still work", () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    const { container, getByLabelText } = render(<HeroSceneSlider />);
    expect(activeLineIndex(container)).toBe(0);
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(activeLineIndex(container)).toBe(0);
    expect(getLines(container)[0].textContent).toBe(HERO_HEADLINE_TEXTS[0]);
    fireEvent.click(getByLabelText("Next slide"));
    expect(activeLineIndex(container)).toBe(1);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(activeLineIndex(container)).toBe(1);
  });
});
