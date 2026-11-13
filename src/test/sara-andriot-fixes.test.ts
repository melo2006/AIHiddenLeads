// @vitest-environment jsdom
// Ron's Andriot retests, 2026-11-13 (~00:50 and ~01:01 EST) — regressions:
//
//  Bug 2 — Sara's segment entry greeting was model-improvised from a
//    prose beat and INTERMITTENTLY SKIPPED: one run opened with the
//    host's 78% pitch statistic, another greeted fine. The greeting is
//    now DETERMINISTIC: rendered server-side by gemini-session (the
//    demo-parent hygiene pattern) into config.segmentGreeting and
//    served by the proxy's swap opening as her scripted first line.
//    The manual-resume entry gets the same treatment (scripted in-role
//    welcome-back); drops keep the no-re-greeting law.
//  Bug 3 — Aspen's handoff line now ENDS with the explicit question
//    "Can I transfer you to Sara now?" (the client already gates the
//    swap on the visitor's next line — the line never asked for it).
//  Bug 4 — Sara's listing pitch: preference question FIRST, then
//    FEATURE-FIRST pitching; the street address is a closing detail,
//    never the headline (bare address recitals are banned).
//  Bug 5 — a request for a NAMED person is a transfer, always: no
//    answering AS that person, no impersonation, one soft offer max,
//    a repeated/specific ask transfers immediately — both directions.
//  Bug 1 — in-panel speaker volume wired to BOTH playback paths (the
//    local speaker gain and the Simli element volume); the cut-over
//    sync carries the level into incoming persona instances.
//  Bug 6 — Sara's chroma-key profile: the keying pipeline is shared,
//    so her pale eyelash/halo fringing is a source-frame difference;
//    her key band is shifted up 0.04 (halo pixels go transparent),
//    every other persona keeps the default band byte-for-byte.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { personaSegmentPrompt } from '../../supabase/functions/_shared/personas';
import {
  DEMO_SITE_GREETING_VARIANTS, DEMO_SITE_SARA_INTRO, SIMULATION_HOST_SEGMENT,
  SIMULATION_PROMPT, SIMULATION_RECEPTIONIST_SEGMENT, SWAP_HOST_YIELD_BAR,
  renderOpeningTemplate,
} from '../../supabase/functions/_shared/voice-config';
import { DEMO_INVITE_GREETING_VARIANTS } from '../../supabase/functions/_shared/demo-sales';
import { openingText, personaResumeInstruction, swapOpeningInstruction } from '../../supabase/functions/_shared/session-opening';
import {
  REALTOR_EXAMPLE_PACKS, REALTOR_EXAMPLE_SIMULATION_SCRIPT, buildExampleListingsLayer,
} from '../../supabase/functions/_shared/realtor-example-listings';
import { clampPlaybackVolume, effectivePlaybackLevel, loadPlaybackVolume, savePlaybackVolume } from '@/lib/playbackVolume';
import { cutoverAudioSync } from '@/lib/personaSwap';
import { CHROMA_HIGH, CHROMA_LOW, SARA_CHROMA_KEY_PROFILE, chromaAlpha } from '@/lib/chromaKey';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const sessionSource = read('supabase/functions/gemini-session/index.ts');
const proxySource = read('supabase/functions/gemini-live-proxy/index.ts');
const demoSalesSource = read('supabase/functions/_shared/demo-sales.ts');
const conversation = read('src/components/GeminiConversation.tsx');
const simli = read('src/components/SimliAvatar.tsx');

/** A recap in the shape the swap machine builds: it CONTAINS the host's
 *  full opening — pitch and 78% statistic included — as history. */
const RECAP = `Persona handoff inside one ongoing demo (the visitor has not left; do not greet the visit).
Business being demonstrated: Jean-Luc Andriot Realty.
The visitor is John.
Host (Aspen from AI Hidden Leads) said: "Good morning, John. I am Aspen from AI Hidden Leads — welcome, and thanks for trying the demo I built for Jean-Luc Andriot Realty. It matters because in a 2025 survey, 78% of 1,000 U.S. consumers said they had abandoned a business after an unanswered call. Now, meet Sara — she'll walk you through your site, playing your own receptionist. Can I transfer you to Sara now?"
Visitor said: "Yes, go ahead."`;

const GREETING_LINE = "Good morning, Jean-Luc Andriot Realty — I'm Sara, thanks for calling. How can I help you?";
const RESUME_LINE = "Welcome back — this is Sara, Jean-Luc Andriot Realty's receptionist. Let's pick up right where we left off.";

describe('Bug 2 — Sara segment entry greeting is deterministic', () => {
  it('the segment greeting template renders server-side with the segment timezone hour', () => {
    const built = personaSegmentPrompt('sara', 'doorway', 'Jean-Luc Andriot Realty', SIMULATION_PROMPT);
    expect(built.greeting).toBe("{timeGreeting}, {businessName} — I'm Sara, thanks for calling. How can I help you?");
    const cfg = { businessName: 'Jean-Luc Andriot Realty', name: 'Aspen' };
    expect(renderOpeningTemplate(built.greeting, cfg, 9, '')).toBe(GREETING_LINE);
    expect(renderOpeningTemplate(built.greeting, cfg, 13, '')).toBe("Good afternoon, Jean-Luc Andriot Realty — I'm Sara, thanks for calling. How can I help you?");
    expect(renderOpeningTemplate(built.greeting, cfg, 19, '')).toBe("Good evening, Jean-Luc Andriot Realty — I'm Sara, thanks for calling. How can I help you?");
  });

  it('gemini-session stamps the rendered line and the proxy forwards it', () => {
    expect(sessionSource).toContain("segMeta?.persona==='sara' && segMeta?.boundary==='doorway'");
    expect(sessionSource).toContain('config.segmentGreeting=renderOpeningTemplate');
    expect(sessionSource).toContain("Welcome back — this is Sara, {businessName}'s receptionist.");
    expect(proxySource).toContain('segmentGreeting: config.segmentGreeting');
    expect(proxySource).toContain('businessName: config.businessName');
  });

  it('the doorway swap opening serves the scripted greeting FIRST — no stat can be her opener', () => {
    const text = openingText({
      preview: false, opening: 'unused',
      personaSwap: { to: 'sara', boundary: 'doorway' },
      resumeContext: RECAP,
      segmentGreeting: GREETING_LINE,
      businessName: 'Jean-Luc Andriot Realty',
    });
    expect(text).toBe(swapOpeningInstruction({ to: 'sara', boundary: 'doorway' }, RECAP, { segmentGreeting: GREETING_LINE, businessName: 'Jean-Luc Andriot Realty' }));
    expect(text).toContain(`say this greeting now, exactly, word for word, as your entire first line, with nothing before it: "${GREETING_LINE}"`);
    // The directive (everything before the recap itself) frames the
    // host's pitch as data and never quotes the statistic.
    const directive = text.split('Persona handoff recap')[0];
    expect(directive).toContain('as DATA about what was already said');
    expect(directive).toContain('NEVER skipped on this planned handoff');
    expect(directive).not.toContain('78%');
    expect(directive).not.toContain('did you know');
  });

  it('without a stamped line, the doorway fallback still leads with the greeting and bans the pitch echo', () => {
    const text = openingText({
      preview: false, opening: 'unused',
      personaSwap: { to: 'sara', boundary: 'doorway' },
      resumeContext: RECAP,
    });
    expect(text).toContain('Begin in role NOW with the time-of-day in-role greeting');
    expect(text).toContain("never replaced or preceded by the host's pitch material");
    // The old skip licence ("greeting already delivered → skip it") is gone.
    expect(text).not.toContain('the in-role greeting, or your open question was ALREADY delivered');
  });

  it('the manual-resume entry serves a scripted in-role welcome-back — never pitch or greetings', () => {
    const text = openingText({
      preview: false, opening: 'unused',
      personaResume: { persona: 'sara' },
      resumeContext: RECAP,
      segmentGreeting: RESUME_LINE,
      businessName: 'Jean-Luc Andriot Realty',
    });
    expect(text).toContain(`say it exactly, word for word, as your entire first utterance: "${RESUME_LINE}"`);
    expect(text).toContain("Never replay the host's pitch, its statistics, or any greeting");
    expect(text).toContain('receptionist for Jean-Luc Andriot Realty');
    expect(text).not.toContain('Sorry');
  });

  it('the legacy resume fallback (no stamped line) keeps its historical shape', () => {
    const text = personaResumeInstruction({ persona: 'sara' }, RECAP);
    expect(text).toContain('in this spirit, in your own words: "Welcome back — let\'s pick up right where we left off."');
    expect(text).toContain('You are still Sara —');
  });

  it('other personas\' swap openings are untouched by the greeting stamp', () => {
    const text = openingText({
      preview: false, opening: 'unused',
      personaSwap: { to: 'aspen', boundary: 'stepout' },
      resumeContext: RECAP,
      segmentGreeting: GREETING_LINE,
    });
    expect(text).toContain('You are Aspen from AI Hidden Leads again');
    expect(text).not.toContain('scripted and rendered for you');
  });
});

describe('Bug 3 — Aspen\'s handoff line ends with the explicit transfer question', () => {
  it('the Sara introduction ends with "Can I transfer you to Sara now?"', () => {
    expect(DEMO_SITE_SARA_INTRO.endsWith('Can I transfer you to Sara now?')).toBe(true);
  });

  it('every demo greeting variant — standard and invite — ends with the question', () => {
    for (const v of DEMO_SITE_GREETING_VARIANTS) expect(v.endsWith('Can I transfer you to Sara now?')).toBe(true);
    for (const v of DEMO_INVITE_GREETING_VARIANTS) expect(v.endsWith('Can I transfer you to Sara now?')).toBe(true);
  });

  it('the host yield beats make her wait for the answer before the handoff proceeds', () => {
    expect(SWAP_HOST_YIELD_BAR).toContain('Can I transfer you to Sara now?');
    expect(SWAP_HOST_YIELD_BAR).toContain('wait for their answer');
    expect(demoSalesSource).toContain('the handoff proceeds on their reply');
  });
});

describe('Bug 4 — listing pitch: preferences first, feature-first, address last', () => {
  it('the script asks what the caller is looking for BEFORE pitching', () => {
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain("ASK WHAT THEY'RE LOOKING FOR — FIRST");
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('before pitching ANY listing, ask ONE preference question');
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT.indexOf("ASK WHAT THEY'RE LOOKING FOR")).toBeLessThan(REALTOR_EXAMPLE_SIMULATION_SCRIPT.indexOf('THE LISTING MOMENT'));
  });

  it('the listing moment pitches feature-first and bans address-led reads', () => {
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('FEATURE-FIRST, NEVER ADDRESS-FIRST');
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('The street address comes LAST');
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('never as a read-out list of addresses');
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).not.toContain('each by its descriptor (street, neighbourhood and one feature');
  });

  it('the listings layer carries the same flow (preferences → feature-first)', () => {
    const pack = REALTOR_EXAMPLE_PACKS.find((p) => p.slug === 'michael-martinez')!;
    const layer = buildExampleListingsLayer(pack);
    expect(layer).toContain('ask ONE preference question');
    expect(layer).toContain('pitched FEATURE-FIRST');
  });

  it('the owner-approved exact lines survive (door-opener, not-ours, invite)', () => {
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('"Are you calling about one of our listings today?"');
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('"That one\'s not among {agentName}\'s listings."');
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('In a real call I\'d whisper a summary and transfer you to');
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('"Ask me about a specific property — try the first one on the list."');
  });
});

describe('Bug 5 — a named-person request is a transfer, always', () => {
  it('Sara\'s segment carries the hard rule (no answering AS Aspen, one offer max)', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('A REQUEST FOR A NAMED PERSON IS A TRANSFER — ALWAYS');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('never answer AS that person');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('never answer AS Aspen herself');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('blonde lady');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('You may offer ONCE');
  });

  it('the rule binds into Sara\'s built segment prompt', () => {
    const built = personaSegmentPrompt('sara', 'doorway', 'Jean-Luc Andriot Realty', SIMULATION_PROMPT);
    expect(built.systemPrompt).toContain('A REQUEST FOR A NAMED PERSON IS A TRANSFER — ALWAYS');
  });

  it('the symmetric direction holds on the host side (asking Aspen for Sara = doorway)', () => {
    expect(SIMULATION_HOST_SEGMENT).toContain('IF THE VISITOR ASKS FOR SARA BY NAME DURING THIS HOST PHASE');
    expect(SIMULATION_HOST_SEGMENT).toContain('Never answer AS Sara');
    expect(SIMULATION_HOST_SEGMENT).toContain('Can I transfer you to Sara now?');
  });

  it('the example simulation script carries the compact rule too', () => {
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('ASKING FOR A PERSON BY NAME');
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).toContain('Never answer AS Aspen');
  });
});

describe('Bug 1 — in-panel speaker volume', () => {
  it('clamps levels to 0..1 with unity as the safe default', () => {
    expect(clampPlaybackVolume(0.35)).toBe(0.35);
    expect(clampPlaybackVolume(2)).toBe(1);
    expect(clampPlaybackVolume(-1)).toBe(0);
    expect(clampPlaybackVolume(Number.NaN)).toBe(1);
    expect(clampPlaybackVolume('loud')).toBe(1);
  });

  it('mute always wins over the slider; the slider scales unmuted playback', () => {
    expect(effectivePlaybackLevel(true, 0.8)).toBe(0);
    expect(effectivePlaybackLevel(false, 0.8)).toBe(0.8);
    expect(effectivePlaybackLevel(false, 1)).toBe(1);
  });

  it('persists the visitor\'s level across sessions', () => {
    savePlaybackVolume(0.42);
    expect(loadPlaybackVolume()).toBe(0.42);
    savePlaybackVolume(7);
    expect(loadPlaybackVolume()).toBe(1);
  });

  it('the cut-over sync carries the level (default unity for legacy callers)', () => {
    const base = { speakerMuted: false, paused: false, replaying: false, selectedDeviceId: null };
    expect(cutoverAudioSync(base).volume).toBe(1);
    expect(cutoverAudioSync({ ...base, speakerVolume: 0.3 }).volume).toBe(0.3);
    expect(cutoverAudioSync({ ...base, speakerVolume: 9 }).volume).toBe(1);
  });

  it('GeminiConversation wires the slider and pushes the level to every face instance', () => {
    expect(conversation).toContain('id="aspen-speaker-volume"');
    expect(conversation).toContain('aria-label={t("voice.speakerVolume")}');
    expect(conversation).toContain('applyPlaybackVolume');
    expect(conversation).toContain('avatarRef.current?.setPlaybackVolume?.(level)');
    expect(conversation).toContain('stagedAvatarRef.current?.setPlaybackVolume?.(level)');
    expect(conversation).toContain('mainSlotRef.current?.setPlaybackVolume?.(level)');
    expect(conversation).toContain('speakerVolume: playbackVolumeRef.current');
  });

  it('SimliAvatar applies the level at its element and restores it on unmute', () => {
    expect(simli).toContain('setPlaybackVolume: (volume)');
    expect(simli).toContain('audio.volume = playbackMutedRef.current ? 0 : playbackVolumeRef.current');
  });
});

describe('Bug 6 — Sara chroma-key profile', () => {
  it('the shared defaults are unchanged', () => {
    expect(CHROMA_LOW).toBe(0.12);
    expect(CHROMA_HIGH).toBe(0.22);
  });

  it('a halo pixel semi-transparent under the default band is transparent under Sara\'s', () => {
    // (0.2, 0.9, 0.2): CbCr distance ≈ 0.16 from key green — inside the
    // default band (semi-alpha fringe), below Sara's shifted band.
    expect(chromaAlpha(0.2, 0.9, 0.2)).toBeGreaterThan(0.15);
    // The pixel's distance (≈0.160) sits at the very foot of Sara's
    // shifted band: alpha ≈ 0 (vs 0.35 semi-opaque under the default).
    expect(chromaAlpha(0.2, 0.9, 0.2, SARA_CHROMA_KEY_PROFILE.low, SARA_CHROMA_KEY_PROFILE.high)).toBeLessThan(0.001);
  });

  it('subject pixels and the key colour itself behave identically under both profiles', () => {
    expect(chromaAlpha(0, 1, 0)).toBe(0);
    expect(chromaAlpha(0, 1, 0, SARA_CHROMA_KEY_PROFILE.low, SARA_CHROMA_KEY_PROFILE.high)).toBe(0);
    expect(chromaAlpha(0.85, 0.6, 0.45)).toBe(1);
    expect(chromaAlpha(0.85, 0.6, 0.45, SARA_CHROMA_KEY_PROFILE.low, SARA_CHROMA_KEY_PROFILE.high)).toBe(1);
  });

  it('only Sara\'s stream keys with the shifted profile', () => {
    expect(simli).toContain("persona === 'sara' ? SARA_CHROMA_KEY_PROFILE : undefined");
  });
});
