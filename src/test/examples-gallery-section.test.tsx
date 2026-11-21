import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExamplesGallerySection from "@/components/landing/ExamplesGallerySection";
import { EXAMPLE_THUMBS } from "@/components/landing/examplesGalleryThumbs";
import {
  EXAMPLES_GALLERY,
  GALLERY_CATEGORY_ORDER,
  orderExamplesForDefaultView,
  type GalleryExample,
} from "@/data/examplesGallery";
import en from "../i18n/locales/en.json";

// Homepage examples gallery, business-first redesign (Ron's call,
// 2026-11-21): category filter chips, a business-first default view,
// a contained first-screenful grid with an expand button, and a
// "Don't see your industry?" strip whose niche list is text only.
// Expectations are computed from the gallery data + whichever
// examples currently have a real capture, so this test pins the
// BEHAVIOR and stays true as more captures land.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const value = key
        .split(".")
        .reduce<unknown>(
          (acc, part) =>
            acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
          en as unknown,
        );
      if (Array.isArray(value)) return value;
      if (typeof value !== "string") return key;
      return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(opts?.[name] ?? ""));
    },
  }),
}));

const visible: GalleryExample[] = EXAMPLES_GALLERY.filter((e) => EXAMPLE_THUMBS[e.slug]);
const cardLabel = (e: GalleryExample) => `Run the live demo on ${e.name}'s website`;

const gridCards = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("[data-examples-gallery-grid] > button")];
const gridLabels = (container: HTMLElement) => gridCards(container).map((b) => b.getAttribute("aria-label"));
const chip = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLElement>("[data-examples-gallery-filters] button")].find((b) =>
    b.textContent?.startsWith(label),
  );

beforeEach(() => mockNavigate.mockClear());
afterEach(() => cleanup());

describe("ExamplesGallerySection (business-first, 2026-11-21)", () => {
  it("renders an All chip plus one chip per category that has a rendered example", () => {
    const { container } = render(<ExamplesGallerySection />);
    const chips = [...container.querySelectorAll("[data-examples-gallery-filters] button")];
    const present = GALLERY_CATEGORY_ORDER.filter((category) =>
      visible.some((e) => e.category === category),
    );
    expect(chips).toHaveLength(present.length + 1);
    expect(chip(container, "All")).toBeTruthy();
    for (const category of present) {
      const count = visible.filter((e) => e.category === category).length;
      const found = chips.find((b) => b.textContent?.includes(`(${count})`));
      expect(found, category).toBeTruthy();
    }
    expect(chip(container, "All")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("the default view is business-first and contained to the first screenful", () => {
    const { container } = render(<ExamplesGallerySection />);
    const expected = orderExamplesForDefaultView(visible);
    const labels = gridLabels(container);
    expect(labels).toHaveLength(Math.min(9, expected.length));
    expect(labels).toEqual(expected.slice(0, 9).map(cardLabel));
    expect(labels[0]).toBe(cardLabel(expected[0]));
    expect(expected[0].kind).toBe("b2b");
    // The ≤3-realtors-in-the-first-9 shape needs at least 6 rendered
    // B2B examples; while only some B2B captures exist, the rendered
    // subset cannot satisfy it (the data test pins the rule on the
    // full gallery). Once every B2B capture lands, this asserts live.
    if (visible.filter((e) => e.kind === "b2b").length >= 6) {
      expect(expected.slice(0, 9).filter((e) => e.kind === "realtor").length).toBeLessThanOrEqual(3);
    }
  });

  it("Show all expands the grid in place and Show fewer collapses it back", () => {
    const { container, getByRole } = render(<ExamplesGallerySection />);
    if (visible.length <= 9) return; // nothing to expand with this few captures
    fireEvent.click(getByRole("button", { name: `Show all ${visible.length} examples` }));
    expect(gridCards(container)).toHaveLength(visible.length);
    fireEvent.click(getByRole("button", { name: "Show fewer examples" }));
    expect(gridCards(container)).toHaveLength(9);
  });

  it("the Real Estate filter shows only realtors, and switching filters resets the expansion", () => {
    const { container, getByRole } = render(<ExamplesGallerySection />);
    const realtors = visible.filter((e) => e.category === "real-estate");
    if (visible.length > 9) {
      fireEvent.click(getByRole("button", { name: `Show all ${visible.length} examples` }));
      expect(gridCards(container)).toHaveLength(visible.length);
    }
    fireEvent.click(chip(container, "Real Estate")!);
    const labels = gridLabels(container);
    expect(labels).toHaveLength(Math.min(9, realtors.length));
    expect(labels).toEqual(realtors.slice(0, 9).map(cardLabel));
    if (realtors.length > 9) {
      fireEvent.click(getByRole("button", { name: `Show all ${realtors.length} examples` }));
      expect(gridCards(container)).toHaveLength(realtors.length);
    }
    // Back to All: collapsed to the first screenful again.
    fireEvent.click(chip(container, "All")!);
    expect(gridCards(container)).toHaveLength(Math.min(9, visible.length));
  });

  it("clicking a card still launches the pinned sample demo through /demo", () => {
    const { container } = render(<ExamplesGallerySection />);
    const first = orderExamplesForDefaultView(visible)[0];
    fireEvent.click(gridCards(container)[0]);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const target = String(mockNavigate.mock.calls[0][0]);
    expect(target.startsWith("/demo?")).toBe(true);
    expect(target).toContain(`leadId=${first.leadId}`);
    expect(target).toContain("sample=1");
  });

  it("the industry strip lists niches as plain text (not demos) with the free-demo CTA", () => {
    const { container, getByRole } = render(<ExamplesGallerySection />);
    expect(container.textContent).toContain("Don't see your industry?");
    const nicheItems = [...container.querySelectorAll("li")].map((li) => li.textContent);
    expect(nicheItems).toContain("Chiropractors");
    expect(nicheItems).toContain("E-commerce stores");
    expect(nicheItems).toHaveLength(13);
    fireEvent.click(getByRole("button", { name: "Try Aspen live on your own website — free" }));
    expect(mockNavigate).toHaveBeenCalledWith("/demo");
  });
});
