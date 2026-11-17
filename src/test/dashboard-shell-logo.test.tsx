import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, test } from "vitest";
import { BrandLockup, BrandMark } from "@/components/BrandLogo";
import { crmTitleForPath } from "@/components/crm/CRMSidebar";

// Dashboard shell + logo rework (Ron's directive, 2026-11-17): the logo
// used to render twice at ~36-40px (sidebar top AND main header), above
// a near-empty "Menu" row. These tests pin the fix: one lockup built on
// the new pin-with-person SVG mark, a single header row carrying the
// active page title, and the collapse chevron on the sidebar edge.

const read = (rel: string) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const crm = read("pages/CRM.tsx");
const sidebar = read("components/crm/CRMSidebar.tsx");

afterEach(() => cleanup());

describe("BrandMark", () => {
  it("renders an inline SVG pin with the emerald -> violet brand gradient", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 48 62");
    const stops = [...container.querySelectorAll("stop")].map((s) => s.getAttribute("stop-color"));
    expect(stops[0]).toBe("hsl(160 84% 50%)");
    expect(stops[stops.length - 1]).toBe("hsl(262 83% 65%)");
    // No raster logo anywhere in the mark.
    expect(container.querySelector("img")).toBeNull();
  });

  it("cuts the person out of the pin (evenodd), so it sits on any background", () => {
    const { container } = render(<BrandMark />);
    const path = container.querySelector("path");
    expect(path?.getAttribute("fill-rule")).toBe("evenodd");
    // One path, two subpaths: the pin outline and the person silhouette.
    expect((path?.getAttribute("d")?.match(/M/g) || []).length).toBe(2);
  });
});

describe("BrandLockup", () => {
  it("shows the mark at 40px with the typeset wordmark, Hidden in emerald", () => {
    const { container } = render(<BrandLockup />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("h-10");
    expect(svg?.getAttribute("class")).toContain("w-10");
    const wordmark = [...container.querySelectorAll("span")].find((s) => s.className.includes("whitespace-nowrap"));
    expect(wordmark?.textContent).toBe("AI Hidden Leads");
    expect(wordmark?.querySelector(".text-primary")?.textContent).toBe("Hidden");
    expect(wordmark?.className).toContain("text-lg");
    expect(wordmark?.className).toContain("font-semibold");
  });

  it("collapsed shows the mark only", () => {
    const { container } = render(<BrandLockup collapsed />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("Hidden");
  });
});

describe("crmTitleForPath", () => {
  test("maps nav routes to their section + title", () => {
    expect(crmTitleForPath("/dashboard")).toEqual({ section: "Overview", title: "Dashboard" });
    expect(crmTitleForPath("/dashboard/video-avatars")).toEqual({ section: "Voice & avatars", title: "Video Avatars" });
    expect(crmTitleForPath("/dashboard/prospects")).toEqual({ section: "Find leads", title: "Prospects" });
    expect(crmTitleForPath("/dashboard/voice-costs")).toEqual({ section: "Voice & avatars", title: "Voice Usage & Costs" });
  });

  test("detail routes resolve to their parent nav item", () => {
    expect(crmTitleForPath("/dashboard/campaigns/abc-123")).toEqual({ section: "Outreach", title: "Campaigns" });
    expect(crmTitleForPath("/dashboard/imported/xyz")).toEqual({ section: "Find leads", title: "Imported Lists" });
  });

  test("unlisted and unknown routes fall back sensibly", () => {
    expect(crmTitleForPath("/dashboard/intent-leads")).toEqual({ section: "Find leads", title: "Intent Leads" });
    expect(crmTitleForPath("/dashboard/nope")).toEqual({ section: "Overview", title: "Dashboard" });
    expect(crmTitleForPath("/dashboard/video-avatars/")).toEqual({ section: "Voice & avatars", title: "Video Avatars" });
  });
});

describe("CRM shell structure", () => {
  test("the raster logo is gone from the CRM shell files", () => {
    expect(crm).not.toContain("/logo.png");
    expect(sidebar).not.toContain("/logo.png");
  });

  test("the lockup appears once in the sidebar and the header carries no logo", () => {
    expect(sidebar).toContain("<BrandLockup collapsed={collapsed} />");
    // The shell header is the one inside the SidebarProvider tree (an
    // earlier <header> in the file belongs to the editor-only mini shell).
    const shell = crm.slice(crm.indexOf("<SidebarProvider>"));
    const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));
    expect(header).not.toContain("BrandLockup");
    expect(header).not.toContain("logo");
    expect(header).toContain("pageTitle.title");
    expect(header).toContain("AccountMenu");
  });

  test("the standalone Menu row is gone; the header trigger is mobile-only", () => {
    expect(crm).not.toContain(">Menu</span>");
    expect(crm).toContain('SidebarTrigger className="h-8 w-8 md:hidden"');
    // Exactly one SidebarTrigger in the page (the mobile header one).
    expect(crm.match(/<SidebarTrigger/g)).toHaveLength(1);
  });

  test("collapse lives on the sidebar edge as a chevron, in both states", () => {
    expect(sidebar).toContain('aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}');
    expect(sidebar).toContain("translate-x-1/2");
    expect(sidebar).toContain("onClick={toggleSidebar}");
    // Existing collapse machinery is preserved (icon rail + cookie state
    // come from SidebarProvider/useSidebar, untouched).
    expect(sidebar).toContain('collapsible="icon"');
  });
});
