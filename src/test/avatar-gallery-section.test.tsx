import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvatarGallerySection from "@/components/landing/AvatarGallerySection";

// Homepage avatar gallery (Ron's standing order: Aspen → customs → Simli
// standards → your photo). The roster is derived from src/lib/avatarLibrary
// — the same source of truth the setup wizard picks from — so this test
// pins the rendered order against the agreed one and fails if the section
// ever drifts back to a hand-maintained list.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));

afterEach(() => cleanup());

describe("AvatarGallerySection", () => {
  it("renders the agreed roster order, customs first, your-photo tile last", () => {
    const { container } = render(<AvatarGallerySection />);
    const captions = [...container.querySelectorAll("figcaption")].map((c) => c.textContent);
    expect(captions).toEqual([
      "Aspen",
      "Frank",
      "Latina",
      "Black Professional Lady",
      "Executive",
      "Sara",
      "Alex",
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
    expect(alts).toHaveLength(12);
    expect(new Set(alts).size).toBe(12);
    expect(alts).not.toContain("Lukas");
    expect(container.textContent).toContain("one-time $50 setup");
  });
});
