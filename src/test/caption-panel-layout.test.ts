// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const css = read("../index.css");
const conversation = read("../components/GeminiConversation.tsx");
const handoff = read("../components/BrowserVoiceHandoff.tsx");

/** Extract one CSS rule block (selector through its closing brace). */
function rule(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `selector ${selector} present in index.css`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

/**
 * Caption-panel rearrangement (2026-11-11, Ron's approved mockup).
 *
 * Root cause of the crushed captions: the caption region was the panel's
 * ONLY shrinkable child (flex-shrink: 1) with min-height: 0 and a fixed
 * 72px home — barely 2 lines at the caption's 24px line-height once the
 * box padding/border are counted — so every pixel of viewport-height
 * pressure landed on the captions and could crush them to ~1 half-cut
 * line (Ron's /demo phone screenshot). The fix gives captions a fixed
 * 3-line home with a 2-line floor, funded by moving the demo timer into
 * the header as a pill and the manager transfer into the panel as a
 * compact pill (Batch 1, 2026-11-12: the pill moved again, from the
 * control row into the Voice/Type toggle row — see the manager describe
 * below). Layout is CSS + Tailwind classes, so these pins assert
 * the stylesheet rules and structural classes (the repo's established
 * seam — see widget-viewport-fit.test.ts); geometry is verified by the
 * headless render check in the build report.
 */
describe("caption panel — caption space has a fixed 3-line home and a 2-line floor", () => {
  it("the caption home is 86px: 3 lines x 24px leading-6 + 12px box padding + 2px border", () => {
    const space = rule(".aspen-caption-space {");
    expect(space).toContain("height: 86px");
    expect(css).not.toContain(".aspen-caption-space { height: 72px");
  });

  it("the caption region may shrink only to 62px (2 full lines), never to 0", () => {
    const region = rule(".aspen-voice-panel > .aspen-caption-region {");
    expect(region).toContain("min-height: 62px");
    expect(region).not.toContain("min-height: 0");
    expect(region).toContain("overflow: hidden");
  });

  it("the face is untouched: livebox and portrait keep their established sizes", () => {
    expect(rule(".aspen-person-livebox {")).toContain("width: 234px; height: 188px");
    expect(rule(".aspen-person-portrait {")).toContain("width: 234px; height: 188px");
  });
});

describe("caption panel — demo timer is a pill in the header row", () => {
  const headerStart = conversation.indexOf('<div className="flex items-center gap-1.5">');
  const header = conversation.slice(headerStart, conversation.indexOf("</div>", headerStart));

  it("the header row carries the timer pill next to the speaking label", () => {
    expect(header).toContain('data-testid="demo-timer-pill"');
    expect(header).toContain('t("voice.demoTimeRemaining")');
    expect(header).toContain("rounded-full");
    // After the status/speaking text, before the captions chevron.
    expect(header.indexOf('data-testid="demo-timer-pill"')).toBeGreaterThan(header.indexOf('t("voice.speaking"'));
    expect(header.indexOf('data-testid="demo-timer-pill"')).toBeLessThan(header.indexOf("ChevronsUpDown"));
  });

  it("the pill shows only where the timer already exists (remainingSeconds gate, nothing new)", () => {
    expect(header).toContain("remainingSeconds !== null && <span data-testid=\"demo-timer-pill\"");
  });

  it("the pill is compact (clock icon + mm:ss) with the full line as its accessible name — the 280px panel cannot fit the full text beside the speaking label and chevron without crushing them", () => {
    expect(header).toContain("<Timer className=\"h-3 w-3\" />");
    expect(header).toContain('aria-label={`${t("voice.demoTimeRemaining")}:');
    expect(header).toContain('title={`${t("voice.demoTimeRemaining")}:');
  });

  it("the old standalone timer line under the captions is gone from the compact panel", () => {
    expect(conversation).not.toContain("(!faceFirst || captions) && <p");
    expect(conversation).not.toContain('{remainingSeconds !== null && (!faceFirst || captions)');
  });
});

describe("caption panel — manager transfer is a compact pill in the Voice/Type toggle row (Batch 1 move, 2026-11-12)", () => {
  it("the pill variant shares the exact visibility gate as the standalone control", () => {
    expect(conversation).toContain("const transferPill = phase === 'live' && handoffToken ? <BrowserVoiceHandoff pill token={handoffToken} onActive={onHandoffActive} microphone={microphone} startSignal={handoffStartSignal}/> : null;");
    expect(conversation).toContain("const transferControl = phase === 'live' && handoffToken ? <BrowserVoiceHandoff token={handoffToken} onActive={onHandoffActive} microphone={microphone} startSignal={handoffStartSignal}/> : null;");
  });

  it("the pill is rendered in the toggle row, NOT in the voice-controls row (it wrapped onto its own row on phones there)", () => {
    const rowStart = conversation.indexOf('className="voice-controls flex flex-wrap');
    const row = conversation.slice(rowStart, conversation.indexOf("{phase === \"live\" && speakerOutputNotice", rowStart));
    expect(row).not.toContain("{transferPill}");
    // The control row keeps its 44px minimum targets ([&_button]:min-h-11).
    expect(row).toContain("[&_button]:min-h-11");
  });

  it("the toggle row keeps the Voice/Type toggle centered with flex-1 spacers and parks the pill at the right", () => {
    const rowStart = conversation.indexOf('data-testid="toggle-manager-row"');
    expect(rowStart).toBeGreaterThan(-1);
    const row = conversation.slice(rowStart, conversation.indexOf("</div>", conversation.indexOf("{transferPill}", rowStart)));
    // Left flex-1 spacer, then the toggle, then a flex-1 right zone —
    // equal outer zones keep the toggle centered whether or not the
    // pill is present.
    expect(row).toContain('<div aria-hidden className="flex-1" />');
    expect(row.indexOf('className="flex-1"')).toBeLessThan(row.indexOf("{belowAvatar}"));
    expect(row.indexOf("{belowAvatar}")).toBeLessThan(row.indexOf("{transferPill}"));
    expect(row).toContain('className="flex min-w-0 flex-1 flex-col items-end">{transferPill}');
    // The row renders when either piece exists, so a pill-less toggle
    // (and a toggle-less pill) keep their places.
    expect(conversation).toContain("{(belowAvatar || transferPill) && (");
  });

  it("the pill status line hangs under the pill, right-aligned in its zone — not a full-width centered line", () => {
    expect(handoff).toContain('className="max-w-full break-words text-right text-xs text-muted-foreground"');
    expect(handoff).not.toContain('className="w-full break-words text-center text-xs text-muted-foreground"');
  });

  it("the old standalone manager row above the controls is gone from the compact panel (its only remaining render is the non-compact lab view)", () => {
    const occurrences = conversation.match(/\{transferControl\}/g) ?? [];
    expect(occurrences).toHaveLength(1);
    // That single render sits in the final (non-compact) return, after the compact branch.
    expect(conversation.indexOf("{transferControl}")).toBeGreaterThan(conversation.indexOf('if (compact) {'));
  });

  it("the pill is a phone icon + the word Manager, wired to the same begin() action, with a >=40px target", () => {
    expect(handoff).toContain("pill?:boolean");
    expect(handoff).toContain('aria-label="Talk to manager"');
    expect(handoff).toContain("<PhoneForwarded className=\"mr-1 h-4 w-4\"/>Manager</Button>");
    expect(handoff).toContain('className="aspen-manager-pill !flex-row !min-h-11 !px-3 rounded-full" onClick={()=>void begin()}');
    // The active state keeps the same cancel/return action and label.
    expect(handoff).toContain('aria-label="Return to Aspen"');
  });
});
