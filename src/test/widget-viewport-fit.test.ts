// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const css = read("../index.css");
const frame = read("../components/FloatingPersonFrame.tsx");
const conversation = read("../components/GeminiConversation.tsx");
const demoWidget = read("../components/landing/demo-results/AspenDemoWidget.tsx");
const draggable = read("../components/landing/demo-results/DraggableFloating.tsx");

/** Extract one CSS rule block (selector through its closing brace). */
function rule(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `selector ${selector} present in index.css`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

/**
 * Widget viewport fit (2026-11-09, owner's Galaxy Z Fold screenshots): the
 * open panel was a scrolling shell capped with viewport units, so on mobile
 * browsers the bottom control row + hint pill sat below the visible area and
 * dragging the panel up cut Aspen's face off at the top. The fix makes the
 * shell a bounded, non-scrolling flex column: the portrait, Voice/Type
 * toggle, control row and hint pill stay pinned, and only the transcript /
 * caption region absorbs the squeeze and scrolls internally. Layout here is
 * CSS + Tailwind classes, so these pins assert the stylesheet rules and the
 * structural classes (the repo's established seam for CSS behaviour — see
 * demo-feedback-fixes.test.ts); jsdom does not apply index.css.
 */
describe("widget viewport fit — shell is bounded and never scrolls as a whole", () => {
  it("caps the shell against the visible viewport (dvh + visualViewport var) with a vh fallback", () => {
    const shell = rule(".aspen-person-shell {");
    expect(shell).toContain("max-height: calc(100vh - 56px)");
    expect(shell).toContain("max-height: min(80dvh, var(--aspen-available-height, calc(100dvh - 56px)))");
  });

  it("the shell clips instead of scrolling (no overflow-y: auto on .aspen-person-shell)", () => {
    const shell = rule(".aspen-person-shell {");
    expect(shell).toContain("overflow: hidden");
    expect(shell).not.toContain("overflow-y: auto");
  });

  it("DraggableFloating still derives the available height from the visual viewport", () => {
    expect(draggable).toContain("window.visualViewport");
    expect(draggable).toContain("'--aspen-available-height': `${Math.max(140, viewport.height - 56)}px`");
  });

  it("the frame's children wrapper is the flex squeeze/scroll region when open", () => {
    expect(frame).toContain("'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain'");
  });
});

describe("widget viewport fit — pinned chrome, scrolling transcript", () => {
  it("voice panel children are pinned; only the caption region may shrink, and only to its 2-line floor", () => {
    expect(rule(".aspen-voice-panel > * {")).toContain("flex-shrink: 0");
    const region = rule(".aspen-voice-panel > .aspen-caption-region {");
    // Caption floor (2026-11-11): 62px = 2 full leading-6 lines (48px) +
    // the caption box's p-1.5 padding (12px) and border (2px). The old
    // min-height: 0 let viewport pressure crush captions to ~1 half line.
    expect(region).toContain("min-height: 62px");
    expect(region).not.toContain("min-height: 0");
    expect(region).toContain("flex-shrink: 1");
    expect(region).toContain("flex-direction: column");
  });

  it("the conversation root is a full-height flex column in face-first mode", () => {
    expect(conversation).toContain('"flex h-full min-h-0 flex-1 flex-col px-2 pb-2 pt-0 text-foreground"');
    expect(conversation).toContain("'aspen-voice-panel relative z-10 flex min-h-0 flex-1 flex-col");
  });

  it("the caption region carries the squeeze classes and the transcript flexes instead of a fixed 72px", () => {
    expect(conversation).toContain("'aspen-caption-space aspen-caption-region'");
    expect(conversation).toContain("${faceFirst ? 'min-h-0 flex-1' : 'max-h-[4.5rem]'}");
    expect(conversation).not.toContain("faceFirst ? 'h-[72px]'");
  });

  it("the demo-site widget passes the flex chain through its wrapper div", () => {
    expect(demoWidget).toContain("gateWaiting ? 'hidden' : 'flex min-h-0 flex-1 flex-col'");
  });
});

describe("widget viewport fit — chevron lives on the header row", () => {
  it("the captions chevron is inside the status header row, right-aligned, with a 40px target", () => {
    const headerStart = conversation.indexOf('<div className="flex items-center gap-1.5">');
    const headerEnd = conversation.indexOf("</div>", headerStart);
    const header = conversation.slice(headerStart, headerEnd);
    expect(header).toContain("ChevronsUpDown");
    expect(header).toContain("ml-auto h-10 w-10 shrink-0");
    // The old standalone full-width chevron row (h-8 w-8, outside the header) is gone.
    expect(conversation).not.toContain('className="h-8 w-8 border-primary/60 bg-transparent text-primary');
    // Status text takes the flexible slot so a crowded header truncates instead of wrapping.
    expect(header).toContain('className="min-w-0 flex-1 break-words text-xs leading-snug text-foreground"');
  });
});

describe("widget viewport fit — stage 3 and short viewports", () => {
  it("stage 3 keeps a safe-area bottom clearance", () => {
    expect(rule(".aspen-person-shell.aspen-person-stage3 {")).toContain("margin-bottom: env(safe-area-inset-bottom, 0px)");
  });

  it("short visible viewports shrink the portrait/livebox and relax the panel floor", () => {
    const mq = "@media (max-width: 1024px) and (max-height: 560px)";
    const start = css.indexOf(mq);
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, start + 600);
    expect(block).toContain(".aspen-person-livebox { height: 120px; }");
    expect(block).toContain(".aspen-voice-panel { min-height: 0; }");
    // The window-controls row is in flow (2026-11-12 panel layout fix):
    // no per-breakpoint top offset follows the shrinking portrait anymore.
    expect(block).not.toContain(".aspen-person-chest-cluster");
  });

  it("desktop rules are untouched: portrait stays 234x188 and the panel floor stays 232px", () => {
    expect(rule(".aspen-person-livebox {")).toContain("width: 234px; height: 188px");
    expect(rule(".aspen-voice-panel {")).toContain("min-height: 232px");
  });

  it("the window-controls row is in flow inside the panel — never an absolute overlay on the portrait (2026-11-12)", () => {
    const cluster = rule(".aspen-person-chest-cluster {");
    expect(cluster).toContain("display: flex");
    expect(cluster).toContain("flex-shrink: 0");
    // The old chest-overlay geometry is gone at every breakpoint: no
    // absolute positioning, no top offset keyed to the portrait height.
    expect(cluster).not.toContain("position: absolute");
    expect(cluster).not.toContain("top:");
    expect(css).not.toContain(".aspen-person-chest-cluster { top:");
  });
});
