import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import SitePreview from "./SitePreview";
import { EMPTY } from "./wizardModel";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: () => new Promise(() => {}) } },
}));
afterEach(cleanup);

test("keeps the captured original available while the iframe check is pending", () => {
  render(<SitePreview state={{ ...EMPTY, businessName: "BankUnited", websiteUrl: "https://www.bankunited.com" }} screenshot="/original-capture.png" />);
  expect(screen.getByRole("img", { name: "Captured website for BankUnited" })).toHaveAttribute("src", "/original-capture.png");
  expect(screen.queryByText("Checking website…")).not.toBeInTheDocument();
});

test("offers recovery instead of leaving a broken capture", () => {
  render(<SitePreview state={{ ...EMPTY, businessName: "BankUnited", websiteUrl: "https://www.bankunited.com" }} screenshot="/expired-capture.png" />);
  fireEvent.error(screen.getByRole("img", { name: "Captured website for BankUnited" }));
  expect(screen.getByRole("status")).toHaveTextContent("Learn your website again");
});