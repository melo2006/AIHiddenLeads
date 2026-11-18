import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, test } from "vitest";
import { BrandLockup, BrandMark } from "@/components/BrandLogo";

// Dashboard shell + logo (Ron's directives, 2026-11-17): one lockup
// built on the pin-with-person SVG mark. The brand lives in the shell's
// sticky header — menu trigger first, then the lockup, then help +
// account on the right — at every width, on every dashboard page. The
// sidebar starts with its nav (no lockup, no edge chevron), and the
// header carries no breadcrumb: pages render their own headings.

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

describe("CRM shell structure", () => {
  test("the raster logo is gone from the CRM shell files", () => {
    expect(crm).not.toContain("/logo.png");
    expect(sidebar).not.toContain("/logo.png");
  });

  // The shell header is the one inside the SidebarProvider tree (an
  // earlier <header> in the file belongs to the editor-only mini shell).
  const shell = crm.slice(crm.indexOf("<SidebarProvider>"));
  const header = shell.slice(shell.indexOf("<header"), shell.indexOf("</header>"));

  test("the sticky header carries the brand: trigger, lockup, help, account", () => {
    expect(header).toContain("sticky top-0");
    expect(header).toContain("<BrandLockup />");
    expect(header).toContain("AccountMenu");
    // Help points at the app's existing /help page (Help & support).
    expect(header).toContain('to="/help"');
    expect(header).toContain("HelpCircle");
    // Order: menu trigger first, then the brand, account last.
    expect(header.indexOf("SidebarTrigger")).toBeLessThan(header.indexOf("BrandLockup"));
    expect(header.indexOf("BrandLockup")).toBeLessThan(header.indexOf("AccountMenu"));
  });

  test("the header brand links back to the main site homepage, not the dashboard", () => {
    // Ron's rule (2026-11-18): tapping the logo/name in the admin header
    // leaves the admin for the public homepage, like other software.
    expect(header).toContain('<Link to="/"');
    expect(header).not.toContain('<Link to="/dashboard"');
  });

  test("the header trigger works at every width — it is not mobile-only", () => {
    expect(header).toContain('SidebarTrigger className="h-8 w-8 shrink-0"');
    expect(header).not.toContain("md:hidden");
    // Exactly one SidebarTrigger in the page (the header one).
    expect(crm.match(/<SidebarTrigger/g)).toHaveLength(1);
  });

  test("no breadcrumb in the header — pages render their own headings", () => {
    expect(header).not.toContain("pageTitle");
    expect(crm).not.toContain("crmTitleForPath");
    expect(sidebar).not.toContain("crmTitleForPath");
  });

  test("the sidebar starts with its nav: no lockup, no edge chevron", () => {
    expect(sidebar).not.toContain("BrandLockup");
    expect(sidebar).not.toContain("BrandMark");
    expect(sidebar).not.toContain("Expand sidebar");
    expect(sidebar).not.toContain("Collapse sidebar");
    expect(sidebar).not.toContain("translate-x-1/2");
    // Existing collapse machinery is preserved (icon rail + cookie state
    // come from SidebarProvider/useSidebar, untouched); the header
    // trigger drives it now.
    expect(sidebar).toContain('collapsible="icon"');
  });
});
