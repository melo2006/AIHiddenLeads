// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const css = read("../index.css");
const frame = read("../components/FloatingPersonFrame.tsx");
const conversation = read("../components/GeminiConversation.tsx");
const demoWidget = read("../components/landing/demo-results/AspenDemoWidget.tsx");
const draggable = read("../components/landing/demo-results/DraggableFloating.tsx");
const floatingViewportLib = read("../lib/floatingViewport.ts");
const agentWidget = read("../components/GeminiAgentWidget.tsx");

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
    // Chat-fix4: the arithmetic moved into the shared, unit-tested
    // helper (src/lib/visualViewport.ts) and the same visual height
    // toggles the short-viewport class on the container.
    expect(draggable).toContain("'--aspen-available-height': `${availableHeightFor(viewport.height)}px`");
    expect(draggable).toContain("className={visualViewportClass(viewport.height)}");
  });

  it("the frame's children wrapper is the flex squeeze/scroll region when open", () => {
    expect(frame).toContain("'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain'");
  });
});

describe("widget viewport fit — pinned chrome, scrolling transcript", () => {
  it("voice panel children are pinned; only the caption region may shrink, and only to its full-height floor", () => {
    expect(rule(".aspen-voice-panel > * {")).toContain("flex-shrink: 0");
    const region = rule(".aspen-voice-panel > .aspen-caption-region {");
    // Caption floor: originally 62px (2026-11-11, 2 full lines + the
    // caption box's padding and border; min-height: 0 had let viewport
    // pressure crush captions to ~1 half line). Raised to 86px on
    // 2026-11-15 — the caption home itself is 86px tall, so the old
    // floor still let the region clip the caption's lower line.
    expect(region).toContain("min-height: 86px");
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

describe("widget viewport fit — the chat panel is capped by the dock, not the viewport", () => {
  it("inside the chat dock the panel flexes to the scroll region and is hard-capped at its height", () => {
    // Ron's chat-revamp phone test (2026-11-16): the panel sized
    // itself against the viewport (base cap below), outgrew the
    // dock's region by the pinned chrome's height, and the composer
    // sat below the fold — he could not see the bottom of the chat
    // box or type anything. In the dock the panel now takes the
    // region's remaining height under the shell's cap chain.
    expect(css).toContain(".aspen-chat-dock .aspen-panel { flex: 1 1 auto; max-height: 100%; }");
  });

  it("the base panel cap stays viewport-keyed outside the dock (the voice-side panel is untouched)", () => {
    expect(rule(".aspen-panel {")).toContain("max-height: min(70dvh, var(--aspen-available-height, 70dvh))");
    expect(rule(".aspen-panel {")).toContain("display: flex");
    expect(rule(".aspen-panel {")).toContain("flex-direction: column");
  });

  it("the chat thread is the panel's only scroll region: chat content flexes, the widget list scrolls internally", () => {
    expect(rule(".aspen-chat-content {")).toContain("flex: 1");
    expect(rule(".aspen-chat-content {")).toContain("min-height: 0");
    expect(rule(".aspen-chat-content {")).toContain("overflow: hidden");
  });

  it("the chat region may actually shrink: the blanket first-child pin excludes it (chat-fix3)", () => {
    // Ron's second phone test (2026-11-16): the composer was clipped
    // out of the panel at phone heights — .aspen-panel's blanket
    // `> div:first-child { flex-shrink: 0 }` pin matched the chat
    // region (it IS the panel's first div child) and out-specified
    // the flex:1 shorthand, so the region sized to its content
    // (495px) inside the capped panel (404px) and the panel's
    // overflow clip ate the composer. The pin now excludes the
    // region and a dedicated rule states its shrink.
    expect(css).toContain(".aspen-panel > div:first-child:not(.aspen-chat-content)");
    expect(css).toContain(".aspen-panel > div.aspen-chat-content { flex-shrink: 1; }");
  });
});

describe("widget viewport fit — Captions toggle is the CC button in the merged control row (chat-fix4, 2026-11-16)", () => {
  it("the CC button leads the ONE control row; the status header row no longer carries a Captions pill", () => {
    // The toggle itself: literal "CC" in every locale, localized
    // aria-label/title, the same chooseCaptions behaviour.
    const btnStart = conversation.indexOf('data-testid="aspen-captions-toggle"');
    expect(btnStart).toBeGreaterThan(-1);
    const btn = conversation.slice(btnStart, conversation.indexOf("</Button>", btnStart) + "</Button>".length);
    expect(btn).toContain(">CC</Button>");
    expect(btn).toContain("aria-label={captions ? t('voice.hideCaptions') : t('voice.showCaptions')}");
    expect(btn).toContain("onClick={() => chooseCaptions(!captions)}");
    // The merged control row: CC first, then the Voice/Type toggle
    // slot, then the window controls — one line, no wrap.
    const rowStart = conversation.indexOf('data-testid="aspen-control-row"');
    expect(rowStart).toBeGreaterThan(-1);
    const row = conversation.slice(rowStart, rowStart + 700);
    expect(row).toContain("flex-nowrap");
    expect(row.indexOf("{captionsToggleButton}")).toBeGreaterThan(-1);
    expect(row.indexOf("{captionsToggleButton}")).toBeLessThan(row.indexOf("{belowAvatar}"));
    expect(row.indexOf("{belowAvatar}")).toBeLessThan(row.indexOf("{windowControls}"));
    // The status header row keeps the flexible status text (a crowded
    // header truncates instead of wrapping) and no captions button.
    const headerStart = conversation.indexOf('<div className="flex items-center gap-1.5">');
    const header = conversation.slice(headerStart, conversation.indexOf("</div>", headerStart));
    expect(header).not.toContain("aspen-captions-toggle");
    expect(header).not.toContain("t('voice.captions')");
    expect(header).toContain('className="min-w-0 flex-1 break-words text-xs leading-snug text-foreground"');
    // The old word pill is gone from the conversation entirely.
    expect(conversation).not.toContain("{t('voice.captions')}");
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
    expect(block).toContain(".aspen-person-livebox { width: 150px; height: 120px; }");
    expect(block).toContain(".aspen-person-shell.aspen-person-focus .aspen-person-livebox { width: 187px; height: 150px; }");
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

describe("widget viewport fit — POSITION chain derives from the one tracked visual-viewport rect (fix batch 2026-11-24)", () => {
  // Root cause: the shell is position:fixed (left/top resolve against
  // the visual viewport's own origin), but the corner math added the
  // visual viewport's offset within the layout viewport on top —
  // double-counting it, so the panel seated too low on Android Chrome.
  // Meanwhile clampPosition, the window-resize reseat and drag all
  // clamped against the LAYOUT viewport size, including a hard-coded
  // layout-height-minus-100 reseat target. Every positioning path now
  // derives from readFloatingViewport() / the tracked `viewport` state.
  it("no positioning path in the shell or its lib reads the layout viewport size", () => {
    for (const src of [draggable, floatingViewportLib]) {
      expect(src).not.toContain("window.innerHeight");
      expect(src).not.toContain("window.innerWidth");
      expect(src).not.toContain("innerHeight - 100");
      expect(src).not.toContain("innerHeight-90");
    }
    // The visual viewport's offset within the layout viewport is never
    // added to a fixed-position coordinate (the double-count).
    expect(draggable).not.toContain(".offsetTop");
    expect(draggable).not.toContain(".offsetLeft");
    expect(floatingViewportLib).not.toContain(".offsetTop");
    expect(floatingViewportLib).not.toContain(".offsetLeft");
  });

  it("the tracked rect is the visual viewport's SIZE with a 0,0 origin", () => {
    expect(floatingViewportLib).toContain("export function readFloatingViewport(): FloatingViewport");
    expect(floatingViewportLib).toContain("width: visual?.width ??");
    expect(floatingViewportLib).toContain("height: visual?.height ??");
    expect(floatingViewportLib).toContain("left: 0,");
    expect(floatingViewportLib).toContain("top: 0,");
    // The component's tracked state is seeded and updated ONLY from it.
    expect(draggable).toContain("useState<FloatingViewport>(() => readFloatingViewport())");
    expect(draggable).toContain("const update = () => setViewport(readFloatingViewport());");
  });

  it("corner, clamp, reseat, reset and drag all derive from the tracked rect", () => {
    // Corner (rendered position for the anchored, un-moved shell) and
    // the render-time re-fit that runs on every stage/size change.
    expect(draggable).toContain("? floatingCornerPosition(dimensions, viewport, initialX)");
    expect(draggable).toContain(": fitFloatingPosition(pos, dimensions, viewport);");
    // clampPosition fits against the tracked rect, not layout maxima.
    expect(draggable).toContain("fitFloatingPosition(nextPosition ?? prev, size, viewport, VIEWPORT_PADDING)");
    // resetKey re-seats anchored shells at the tracked corner.
    expect(draggable).toContain("clampPosition(floatingCornerPosition(size, viewport, initialX));");
    // The window-resize reseat reads a fresh tracked rect and seats
    // the corner from it — no hard-coded layout-height target remains.
    expect(draggable).toContain("const rect = readFloatingViewport();");
    expect(draggable).toContain("setPos(floatingCornerPosition(size, rect, initialX));");
    // Dragging clamps through the same fit against the tracked rect.
    expect(draggable).toContain("readFloatingViewport(),\n        VIEWPORT_PADDING,");
  });

  it("the Aspen shells pass a bottom inset, not a layout-height-derived top", () => {
    expect(demoWidget).not.toContain("window.innerHeight");
    expect(agentWidget).not.toContain("window.innerHeight");
    expect(demoWidget).toContain("initialY={12} anchorRight anchorBottom");
    expect(agentWidget).toContain("initialY={12} anchorRight anchorBottom");
  });
});
