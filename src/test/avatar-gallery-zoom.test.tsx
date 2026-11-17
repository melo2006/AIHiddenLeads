import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvatarLibraryGrid from "@/components/AvatarLibraryGrid";
import { ASPEN_FACE_ID, FRANK_FACE_ID } from "@/lib/avatarLibrary";
import en from "../i18n/locales/en.json";

// Gallery hover + click-to-enlarge (Ron's order, 2026-11-17) on the
// library picker: the portrait is the "view" action (opens the zoom
// overlay), the name stays the "choose" action, and the overlay itself
// carries "Use this avatar" so viewing never dead-ends picking.
// Strings resolve against the real en locale so the test pins the
// visitor-visible copy, like the reassurance-strip test does.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
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

describe("AvatarLibraryGrid — portrait view overlay", () => {
  it("tiles carry the pointer-only hover highlight and portrait lift", () => {
    render(<AvatarLibraryGrid selectedFaceId={ASPEN_FACE_ID} onPickLibrary={vi.fn()} />);
    const view = screen.getByRole("button", { name: "View Frank up close" });
    const img = view.querySelector("img");
    expect(img?.className).toContain("group-hover:scale-105");
    expect(img?.className).toContain("motion-safe:");
    expect(view.className).toContain("[@media(hover:hover)]:hover:border-primary/60");
    // The card (view button's parent) glows on hover-capable pointers only.
    expect(view.parentElement?.className).toContain("[@media(hover:hover)]:hover:border-primary/60");
  });

  it("clicking the portrait opens the overlay WITHOUT picking; 'Use this avatar' picks and closes", () => {
    const onPick = vi.fn();
    render(<AvatarLibraryGrid selectedFaceId={ASPEN_FACE_ID} onPickLibrary={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "View Frank up close" }));
    expect(onPick).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Frank");
    expect(dialog.textContent).toContain("Voice · Schedar");
    fireEvent.click(screen.getByRole("button", { name: "Use this avatar" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ faceId: FRANK_FACE_ID, label: "Frank" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the name button still picks directly, with no overlay", () => {
    const onPick = vi.fn();
    render(<AvatarLibraryGrid selectedFaceId={ASPEN_FACE_ID} onPickLibrary={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose face Frank" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("viewing the already-selected face shows it as the current avatar, not a pick button", () => {
    render(<AvatarLibraryGrid selectedFaceId={FRANK_FACE_ID} onPickLibrary={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View Frank up close" }));
    const current = screen.getByRole("button", { name: "Your current avatar" });
    expect(current).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Use this avatar" })).not.toBeInTheDocument();
  });

  it("zoom controls scale the portrait and reset restores it", () => {
    render(<AvatarLibraryGrid selectedFaceId={ASPEN_FACE_ID} onPickLibrary={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View Aspen up close" }));
    const dialog = screen.getByRole("dialog");
    const img = dialog.querySelector("img");
    expect(img?.style.transform).toContain("scale(1)");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(img?.style.transform).toContain("scale(1.5)");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(img?.style.transform).toContain("scale(2.25)");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(img?.style.transform).toContain("scale(1.5)");
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(img?.style.transform).toContain("scale(1)");
  });

  it("closes via the X button and via a backdrop press", async () => {
    render(<AvatarLibraryGrid selectedFaceId={ASPEN_FACE_ID} onPickLibrary={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View Aspen up close" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View Aspen up close" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Radix registers its outside-press listener a tick after mount.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const overlay = document.querySelector(".fixed.inset-0");
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay as Element);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
