import { describe, it, expect } from "vitest";
import {
  applyPhoneSignals, checklistProgress, day1NudgeDue, deriveChecklist,
  phoneIsLive, phoneStepCompleted, ringSeconds, statusAfterSave,
  type PhoneSetupState,
} from "../../supabase/functions/_shared/onboarding";

// Onboarding state logic (onboarding batch, 2026-11-12): checklist
// derivation from real state, phone status transitions, day-1 due rule.
describe("phone setup status", () => {
  it("maps ring choices to carrier seconds (≈5s per ring)", () => {
    expect(ringSeconds(2)).toBe(10);
    expect(ringSeconds(3)).toBe(15);
    expect(ringSeconds(4)).toBe(20);
    expect(ringSeconds(5)).toBe(25);
    expect(ringSeconds(7)).toBeNull();
    expect(ringSeconds(undefined)).toBeNull();
  });

  it("derives the post-save status by route and number assignment", () => {
    expect(statusAfterSave("forward")).toBe("awaiting_number");
    expect(statusAfterSave("forward", "+18778624949")).toBe("waiting_first_call");
    expect(statusAfterSave("port")).toBe("port_requested");
    expect(statusAfterSave("new")).toBe("new_number_requested");
  });

  it("detection beats confirmation; signals never complete a port", () => {
    const base: PhoneSetupState = { route: "forward", status: "waiting_first_call" };
    const confirmed = applyPhoneSignals(base, { testCallConfirmedAt: "2026-11-12T00:00:00Z" });
    expect(confirmed.status).toBe("live_confirmed");
    const detected = applyPhoneSignals(confirmed, { firstCallAt: "2026-11-12T01:00:00Z" });
    expect(detected.status).toBe("live_detected");
    expect(detected.firstCallDetectedAt).toBe("2026-11-12T01:00:00Z");
    const port: PhoneSetupState = { route: "port", status: "port_requested" };
    expect(applyPhoneSignals(port, { firstCallAt: "2026-11-12T01:00:00Z" }).status).toBe("port_requested");
  });

  it("completed and live are distinct, honest states", () => {
    expect(phoneStepCompleted({ status: "not_started" })).toBe(false);
    expect(phoneStepCompleted({ status: "port_requested", route: "port" })).toBe(true);
    expect(phoneStepCompleted(undefined)).toBe(false);
    expect(phoneIsLive({ status: "live_detected", route: "forward" })).toBe(true);
    expect(phoneIsLive({ status: "waiting_first_call", route: "forward" })).toBe(false);
  });
});

describe("first-steps checklist derivation", () => {
  const fresh = deriveChecklist({ workspaceReady: true, phone: { status: "not_started" }, taught: false, testCallDone: false, published: false });
  it("a fresh workspace has only the calendar item done — with honest copy", () => {
    expect(fresh.filter((i) => i.done).map((i) => i.id)).toEqual(["calendar"]);
    expect(fresh[0].detail).toMatch(/Nothing to connect/);
    expect(checklistProgress(fresh)).toEqual({ done: 1, total: 5, complete: false });
  });

  it("phone item reflects saved and live states distinctly", () => {
    const saved = deriveChecklist({ workspaceReady: true, phone: { status: "awaiting_number", route: "forward" }, taught: false, testCallDone: false, published: false });
    expect(saved.find((i) => i.id === "phone")!.done).toBe(true);
    expect(saved.find((i) => i.id === "phone")!.detail).toMatch(/finish the last step/i);
    const live = deriveChecklist({ workspaceReady: true, phone: { status: "live_detected", route: "forward" }, taught: true, testCallDone: true, published: true });
    expect(live.find((i) => i.id === "phone")!.detail).toMatch(/answering your calls/i);
    expect(checklistProgress(live).complete).toBe(true);
  });
});

describe("day-1 nudge due rule", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  it("due only when welcome is old enough, unsent, and phone incomplete", () => {
    expect(day1NudgeDue({ welcomeSentAt: "2026-11-12T12:00:00Z", phone: { status: "not_started" }, now })).toBe(true);
    expect(day1NudgeDue({ welcomeSentAt: "2026-11-13T10:00:00Z", phone: { status: "not_started" }, now })).toBe(false); // 2h old
    expect(day1NudgeDue({ welcomeSentAt: "2026-11-12T12:00:00Z", day1SentAt: "2026-11-13T08:00:00Z", phone: { status: "not_started" }, now })).toBe(false); // already sent
    expect(day1NudgeDue({ welcomeSentAt: "2026-11-12T12:00:00Z", phone: { status: "waiting_first_call", route: "forward" }, now })).toBe(false); // phone done
    expect(day1NudgeDue({ welcomeSentAt: null, phone: { status: "not_started" }, now })).toBe(false); // no welcome yet
  });
});
