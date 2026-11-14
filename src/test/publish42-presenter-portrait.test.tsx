import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * Publish #42 regression (FAIL 2): the in-demo presenter still must be
 * the transparent CUTOUT for Frank / Monica / Black Professional Lady.
 * The #42 batch pinned this with source strings only; this suite pins
 * the RENDERED widget: the floating frame's bubble portrait <img> for
 * each solo-presenter pinned demo resolves to that persona's
 * `-cutout.webp` asset (real alpha), never the opaque catalog photo.
 * Aspen-path demos (no solo presenter) keep the Aspen default exactly.
 */

vi.mock("@/lib/voicePreload", () => ({ preloadVoiceIdentity: vi.fn(async () => ({})) }));
vi.mock("@/components/GeminiConversation", () => ({
  default: (props: { avatarUrl?: string; name?: string }) => (
    <div data-testid="demo-conversation" data-avatar={props.avatarUrl || ""} data-name={props.name || ""} />
  ),
}));
vi.mock("@/components/landing/demo-results/ChatWidget", () => ({
  default: () => <div data-testid="demo-chat" />,
}));
vi.mock("@/components/landing/demo-results/DraggableFloating", () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock("@/components/AspenSalesActions", () => ({ default: () => null }));

import AspenDemoWidget from "@/components/landing/demo-results/AspenDemoWidget";

const baseProps = {
  businessName: "Example Realty",
  businessNiche: "realtors",
  websiteUrl: "https://example.com/",
  businessInfo: "",
  onClosed: () => {},
  sample: true,
};

const bubbleImgSrc = (container: HTMLElement) => {
  const img = container.querySelector("section[aria-label] img");
  return img?.getAttribute("src") || "";
};

describe("FAIL 2 — rendered presenter stills are the transparent cutouts", () => {
  it("Monica (Aurelia Perez demo) renders her cutout, in the bubble and the conversation", async () => {
    const { container } = render(
      <AspenDemoWidget {...baseProps} leadId="850f3d17-85af-49e9-869b-aa6aa4ab540e" />,
    );
    expect(bubbleImgSrc(container)).toContain("e0d7b128-40a7-4d03-ac84-ef4c54b92450-cutout");
    // The conversation mounts once the identity prewarm resolves.
    await waitFor(() => {
      const convo = container.querySelector('[data-testid="demo-conversation"]');
      expect(convo?.getAttribute("data-avatar") || "").toContain("e0d7b128-40a7-4d03-ac84-ef4c54b92450-cutout");
      expect(convo?.getAttribute("data-name")).toBe("Monica");
    });
  });

  it("Frank (Paul Saperstein demo) renders his cutout", () => {
    const { container } = render(
      <AspenDemoWidget {...baseProps} leadId="8db3a00c-b24c-4c5c-a371-67db376c28ef" />,
    );
    expect(bubbleImgSrc(container)).toContain("b3f85f7f-57ea-4f24-b1f6-a57229b4fae1-cutout");
  });

  it("Black Professional Lady (Ann Chamberlain demo) renders her cutout", () => {
    const { container } = render(
      <AspenDemoWidget {...baseProps} leadId="1b68b94a-45fa-446c-9395-7f182cb60abd" />,
    );
    expect(bubbleImgSrc(container)).toContain("9344d4c1-6b69-43e7-a73f-ddc15d1a3f75-cutout");
  });

  it("a pinned example WITHOUT a solo presenter keeps the Aspen default (no cutout, no borrowed face)", () => {
    const { container } = render(
      <AspenDemoWidget {...baseProps} leadId="335785bd-c994-4d13-9a6d-4d38d84fc11e" />,
    );
    expect(bubbleImgSrc(container)).not.toContain("-cutout");
    expect(bubbleImgSrc(container)).toContain("aspen");
  });
});
