// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const conversation = read("../components/GeminiConversation.tsx");
const handoff = read("../components/BrowserVoiceHandoff.tsx");
const en = JSON.parse(read("../i18n/locales/en.json")) as { voice: Record<string, string> };
const es = JSON.parse(read("../i18n/locales/es.json")) as { voice: Record<string, string> };
const pt = JSON.parse(read("../i18n/locales/pt-BR.json")) as { voice: Record<string, string> };

/**
 * Batch 1 client fixes (2026-11-12) — source pins for the parts of
 * GeminiConversation that only exist inside a live Gemini session
 * (the repo's established seam for this component: see
 * caption-panel-layout.test.ts). The pure logic (ambient pick) lives in
 * voice-lab-audio.test.ts and the handoff's signal behaviour in
 * manager-pill.test.tsx.
 */
describe("Batch 1 — voice-asked transfer: start_handoff dispatch", () => {
  it("BOTH WS message handlers (main session + segment socket) handle start_handoff", () => {
    const cases = conversation.match(/case "start_handoff":/g) ?? [];
    expect(cases).toHaveLength(2);
    const bumps = conversation.match(/setHandoffStartSignal\(value => value \+ 1\)/g) ?? [];
    expect(bumps).toHaveLength(2);
  });

  it("the counter state exists and is passed as startSignal to BOTH handoff renderings", () => {
    expect(conversation).toContain("const [handoffStartSignal, setHandoffStartSignal] = useState(0);");
    const passes = conversation.match(/startSignal=\{handoffStartSignal\}/g) ?? [];
    expect(passes).toHaveLength(2);
  });

  it("BrowserVoiceHandoff accepts the optional signal and latches the mount-time value", () => {
    expect(handoff).toContain("startSignal?:number");
    expect(handoff).toContain("const lastStartSignal=useRef(startSignal);");
    expect(handoff).toContain("if(startSignal===lastStartSignal.current)return;");
    expect(handoff).toContain("if(startSignal>0)void begin();");
  });
});

describe("Batch 1 — mic environment control: capture-loop wiring", () => {
  it("BOTH capture loops feed every frame's RMS into the ambient tracker", () => {
    const feeds = conversation.match(/feedAmbientSample\(rms\);/g) ?? [];
    expect(feeds).toHaveLength(2);
    expect(conversation).toContain("pushAmbientRms(ambientTrackerRef.current, rms)");
  });

  it("auto-pick is throttled to ~3s and gated on NOT having manually picked this session", () => {
    expect(conversation).toContain("if (now - ambientCheckedAtRef.current < 3000) return;");
    expect(conversation).toContain("if (!noiseFilterManualRef.current && next.filter !== noiseFilterRef.current) setNoiseFilter(next.filter);");
  });

  it("every explicit pick routes through chooseNoiseFilter, which marks manual", () => {
    expect(conversation).toContain("noiseFilterManualRef.current = true;");
    // The panel segmented control + BOTH settings-dialog Selects
    // (compact dialog and the non-compact lab view).
    expect(conversation).toContain("onClick={() => chooseNoiseFilter(value)}");
    const selects = conversation.match(/onValueChange=\{value => chooseNoiseFilter\(value as NoiseFilter\)\}/g) ?? [];
    expect(selects).toHaveLength(2);
    // No direct setNoiseFilter call remains outside the manual chooser
    // and the gated auto-pick (the useState destructure is not a call).
    const direct = conversation.match(/setNoiseFilter\(/g) ?? [];
    expect(direct).toHaveLength(2);
  });

  it("the persisted value stays the starting point (localStorage read/write untouched)", () => {
    expect(conversation).toContain('localStorage.getItem("voice-noise-filter")');
    expect(conversation).toContain('localStorage.setItem("voice-noise-filter", noiseFilter)');
  });
});

describe("Batch 1 — mic environment control: settings-dialog surface (moved off the panel's permanent rows, Scalone batch Item 8a)", () => {
  const meterStart = conversation.indexOf('data-testid="ambient-level-label"');
  const meterRow = conversation.slice(meterStart - 400, meterStart + 1600);

  it("the meter label is the SMOOTHED ambient state, not the raw instantaneous micLevel", () => {
    expect(meterStart).toBeGreaterThan(-1);
    expect(meterRow).toContain('ambientLevel === "quiet" ? t("voice.envQuiet")');
    expect(meterRow).toContain('ambientLevel === "noisy" ? t("voice.envNoisy")');
    // The old raw-value label is gone from the compact meter row.
    expect(conversation).not.toContain('<span>{micLevel > 3 ? t("voice.sound") : t("voice.quiet")}</span>');
  });

  it("the control lives INSIDE the settings dialog — the panel keeps no permanent environment row", () => {
    const dialogStart = conversation.indexOf('{showSettings && (');
    expect(dialogStart).toBeGreaterThan(-1);
    expect(meterStart).toBeGreaterThan(dialogStart);
    // Exactly one ambient label in the file: the panel row is gone,
    // the dialog section is the only surface.
    expect(conversation.match(/data-testid="ambient-level-label"/g)).toHaveLength(1);
    // The panel body between the transport slot and the dialog
    // carries no environment controls anymore.
    const panelBody = conversation.slice(conversation.indexOf('{!wideLandscape && transportControls}'), dialogStart);
    expect(panelBody).not.toContain('ambient-level-label');
    expect(panelBody).not.toContain('data-noise-filter');
  });

  it("a 3-way segmented Quiet / Normal / Noisy control sits beside the meter, wired to the same state", () => {
    expect(meterRow).toContain('role="group" aria-label={t("voice.micEnvironment")}');
    expect(meterRow).toContain('["light", "envQuiet"], ["balanced", "envNormal"], ["strong", "envNoisy"]');
    expect(meterRow).toContain("aria-pressed={noiseFilter === value}");
    expect(meterRow).toContain("data-noise-filter={value}");
  });

  it("the Auto indicator shows while auto is in charge and disappears after a manual pick", () => {
    expect(meterRow).toContain('{!noiseFilterManual && <span data-testid="noise-auto-indicator"');
    expect(meterRow).toContain('t("voice.envAuto")');
  });

  it("the new strings exist in all three locales under voice.*", () => {
    for (const locale of [en, es, pt]) {
      for (const key of ["micEnvironment", "envQuiet", "envNormal", "envNoisy", "envAuto"]) {
        expect(locale.voice[key], key).toBeTruthy();
      }
    }
    expect(en.voice.envQuiet).toBe("Quiet");
    expect(en.voice.envNormal).toBe("Normal");
    expect(en.voice.envNoisy).toBe("Noisy");
    expect(en.voice.envAuto).toBe("Auto");
  });
});
