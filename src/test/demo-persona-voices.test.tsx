// Demo Voices admin tab (2026-11-14) — render coverage:
//  - one row per demo persona (all eight), each showing the persona's
//    CURRENT effective voice and whether it is the code default or an
//    admin override;
//  - Frank's row shows the new Gacrux default;
//  - an override row (Frank = Schedar in the fake store) is marked
//    "Admin override", its Reset is armed, and clicking Reset deletes
//    the row and the row falls back to the code default;
//  - the audition mounts the wizard picker's preview mechanism
//    (GeminiConversation previewOnly + previewVoice) with the picked
//    voice — stubbed here so the test spends no Live session.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  overrides: [{ persona: "frank", voice_name: "Schedar" }] as { persona: string; voice_name: string }[],
  deleted: [] as string[],
  upserts: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
    from: () => ({
      select: async () => ({ data: mocks.overrides, error: null }),
      upsert: async (row: Record<string, unknown>) => { mocks.upserts.push(row); return { error: null }; },
      delete: () => ({
        eq: async (_c: string, v: string) => {
          mocks.deleted.push(v);
          mocks.overrides = mocks.overrides.filter((r) => r.persona !== v);
          return { error: null };
        },
      }),
    }),
  },
}));

vi.mock("@/components/GeminiConversation", () => ({
  default: (props: { previewVoice?: string; name?: string; previewOnly?: boolean }) => (
    <div data-testid="voice-audition" data-voice={props.previewVoice} data-name={props.name} data-preview-only={String(props.previewOnly)} />
  ),
}));

import DemoPersonaVoices from "@/components/crm/DemoPersonaVoices";

describe("DemoPersonaVoices", () => {
  beforeEach(() => {
    mocks.overrides = [{ persona: "frank", voice_name: "Schedar" }];
    mocks.deleted = [];
    mocks.upserts = [];
  });

  it("renders all eight persona rows with portraits, pickers and save/reset controls", async () => {
    render(<DemoPersonaVoices />);
    // All rows render together once the single overrides fetch lands:
    // await the first, then the rest are present synchronously.
    await screen.findByTestId("persona-row-aspen");
    for (const persona of ["sara", "alex", "frank", "latina", "black-professional-lady", "executive", "middle-aged-pro"]) {
      expect(screen.getByTestId(`persona-row-${persona}`)).toBeTruthy();
    }
    const monica = screen.getByTestId("persona-row-latina");
    expect(within(monica).getByText("Monica")).toBeTruthy();
    expect(within(monica).getByLabelText("Monica voice")).toBeTruthy();
    expect(within(monica).getByRole("button", { name: /Save/ })).toBeTruthy();
    expect(within(monica).getByRole("button", { name: /Reset to default \(Sulafat\)/ })).toBeTruthy();
  });

  it("shows the effective voice and its source per persona", async () => {
    render(<DemoPersonaVoices />);
    const frank = await screen.findByTestId("persona-row-frank");
    // Frank carries the fake override: Schedar, marked as an override.
    expect(within(frank).getByText(/Now demos with/)).toBeTruthy();
    expect(within(frank).getByText("Schedar")).toBeTruthy();
    expect(within(frank).getByText("Admin override")).toBeTruthy();
    // Aspen has no override: her code default, marked as such.
    const aspen = screen.getByTestId("persona-row-aspen");
    expect(within(aspen).getByText("Kore")).toBeTruthy();
    expect(within(aspen).getByText("Code default")).toBeTruthy();
    // A row with no override has Reset disarmed.
    expect(within(aspen).getByRole("button", { name: /Reset to default/ })).toHaveProperty("disabled", true);
  });

  it("Reset deletes the override and the row falls back to the Gacrux code default", async () => {
    render(<DemoPersonaVoices />);
    const frank = await screen.findByTestId("persona-row-frank");
    const reset = within(frank).getByRole("button", { name: /Reset to default \(Gacrux\)/ });
    expect(reset).toHaveProperty("disabled", false);
    fireEvent.click(reset);
    expect(await within(frank).findByText("Code default")).toBeTruthy();
    expect(mocks.deleted).toEqual(["frank"]);
    expect(within(frank).getByText("Gacrux")).toBeTruthy();
  });

  it("the audition mounts the preview mechanism with the picked voice", async () => {
    render(<DemoPersonaVoices />);
    const frank = await screen.findByTestId("persona-row-frank");
    fireEvent.click(within(frank).getByRole("button", { name: /Hear Schedar/ }));
    const audition = await screen.findByTestId("voice-audition");
    expect(audition.getAttribute("data-voice")).toBe("Schedar");
    expect(audition.getAttribute("data-name")).toBe("Frank");
    expect(audition.getAttribute("data-preview-only")).toBe("true");
  });
});
