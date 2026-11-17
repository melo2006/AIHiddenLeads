import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvatarGallerySection from "@/components/landing/AvatarGallerySection";
import en from "../i18n/locales/en.json";

// Homepage avatar gallery (Ron's standing order: Aspen → customs → Simli
// standards → your photo). The roster is derived from src/lib/avatarLibrary
// — the same source of truth the setup wizard picks from — so this test
// pins the rendered order against the agreed one and fails if the section
// ever drifts back to a hand-maintained list.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    // The tiles' view buttons and the lightbox read the gallery.*
    // strings through i18next; resolve them against the real en locale
    // (with {{name}} interpolation) so the test sees the visitor's text.
    t: (key: string, opts?: Record<string, unknown>) => {
      const value = key
        .split(".")
        .reduce<unknown>(
          (acc, part) =>
            acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
          en as unknown,
        );
      if (typeof value !== "string") return key;
      return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(opts?.[name] ?? ""));
    },
  }),
}));

afterEach(() => cleanup());

describe("AvatarGallerySection", () => {
  it("renders the agreed roster order, customs first, your-photo tile last", () => {
    const { container } = render(<AvatarGallerySection />);
    const captions = [...container.querySelectorAll("figcaption")].map((c) => c.textContent);
    expect(captions).toEqual([
      "Aspen",
      "Frank",
      "Monica",
      "Denise",
      "Andy",
      "Daniel",
      "Sara",
      "Alex",
      "James",
      "Diego",
      "Anna",
      "Mei",
      "Zahra",
      "Hank",
      "Sophie",
      "Your photo",
    ]);
  });

  it("shows each face once — Lukas appears only as Alex — with matching alt text", () => {
    const { container } = render(<AvatarGallerySection />);
    const alts = [...container.querySelectorAll("img")].map((img) => img.getAttribute("alt"));
    expect(alts).toHaveLength(15);
    expect(new Set(alts).size).toBe(15);
    expect(alts).not.toContain("Lukas");
    expect(container.textContent).toContain("one-time $50 setup");
  });

  it("gives every portrait the hover lift and a view button (Ron, 2026-11-17)", () => {
    render(<AvatarGallerySection />);
    const viewButtons = screen.getAllByRole("button", { name: /^View .+ up close$/ });
    expect(viewButtons).toHaveLength(15);
    for (const btn of viewButtons) {
      const img = btn.querySelector("img");
      expect(img?.className).toContain("group-hover:scale-105");
      expect(img?.className).toContain("motion-safe:");
      expect(btn.className).toContain("[@media(hover:hover)]:hover:border-primary/60");
    }
  });

  it("opens the portrait large on click, zooms, and closes with Esc — no select action on the public gallery", () => {
    render(<AvatarGallerySection />);
    fireEvent.click(screen.getByRole("button", { name: "View Frank up close" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Frank");
    const big = dialog.querySelector("img");
    expect(big?.getAttribute("alt")).toBe("Frank");
    expect(big?.style.transform).toContain("scale(1)");
    // The public gallery has no picking flow, so no select action.
    expect(screen.queryByRole("button", { name: "Use this avatar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(big?.style.transform).toContain("scale(1.5)");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
