// @vitest-environment node
// Barge-in hardening (2026-11-17).
//
// Ron's staging sessions: on his phone (43849783) a two-word fragment
// ("insane thing" — room noise / speaker echo transcribed as speech)
// cut Aspen off mid-sentence; she answered "Sorry, I didn't catch
// that", and when he said "I didn't say anything" she abandoned her
// point and changed the subject. On his rebooted laptop in a QUIET
// room she stopped three more times while he said nothing — the
// settings screenshot showed the ambient auto-pick had silently
// relaxed his filter to Balanced, where her own playback echo clears
// the gate. The client half (sustained-speech gate, strong-only auto
// pick) is unit-tested in voice-lab-audio.test.ts; this file pins the
// shared prompt half and the wiring.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { INTERRUPTION_RESUME_POLICY } from '../../supabase/functions/_shared/voice-config';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe("interrupted-turn resume policy — shared layer", () => {
  it("tells the model to resume a point cut off by a content-free turn, without apologizing", () => {
    expect(INTERRUPTION_RESUME_POLICY).toContain('do NOT apologize');
    expect(INTERRUPTION_RESUME_POLICY).toContain('do NOT ask the caller to repeat it');
    expect(INTERRUPTION_RESUME_POLICY).toContain('continue what you were saying and finish the point');
    expect(INTERRUPTION_RESUME_POLICY).toContain('If the caller then says they did not say anything, just keep going the same way');
  });

  it("carves out short real answers and keeps clarification for genuine garbled attempts", () => {
    expect(INTERRUPTION_RESUME_POLICY).toContain('Short real answers are NOT blips');
    expect(INTERRUPTION_RESUME_POLICY).toContain('Ask the caller to repeat only when they clearly tried to give a real answer or ask a real question and it came through garbled');
    expect(INTERRUPTION_RESUME_POLICY).toContain('overrides the general ask-to-repeat guidance');
  });

  it("is woven into EVERY session prompt the proxy builds (sales, simulations, tenants share the template)", () => {
    const proxy = read('supabase/functions/gemini-live-proxy/index.ts');
    expect(proxy).toContain("INTERRUPTION_RESUME_POLICY, languagePolicyFor");
    expect(proxy).toContain('${INTERRUPTION_RESUME_POLICY}');
    // It rides the one shared prompt template — the same line that
    // carries NO_SPEAKER_LABEL_RULE for every session class.
    expect(proxy).toContain('${NO_SPEAKER_LABEL_RULE}\\n${INTERRUPTION_RESUME_POLICY}');
  });
});

describe("speech gate wiring — both capture loops", () => {
  const conversation = read('src/components/GeminiConversation.tsx');

  it("both mic pipelines run the sustained-speech gate with the speaking-aware bar", () => {
    const calls = conversation.match(/pushSpeechGateFrame\(speechGate, rms, noiseFilterRef\.current, performance\.now\(\), assistantSpeaking\)/g) ?? [];
    expect(calls).toHaveLength(2);
    const speakingSignals = conversation.match(/const assistantSpeaking = idleRef\.current\.generating \|\| sourcesRef\.current\.size > 0 \|\| engineTimersRef\.current\.size > 0;/g) ?? [];
    expect(speakingSignals).toHaveLength(2);
  });

  it("neither pipeline calls the old first-frame gate anymore", () => {
    expect(conversation).not.toContain('microphoneGate(rms');
    expect(conversation).not.toContain('gateOpenUntil');
  });

  it("the settings readout presents the environment in force, not the raw measured floor", () => {
    expect(conversation).toContain('const ambientLevel = appliedAmbientLevel(noiseFilterManual, ambientFloor);');
  });
});
