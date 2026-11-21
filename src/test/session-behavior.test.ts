// @vitest-environment node
// Session-behavior cluster (2026-11-21, homepage-test items 1, 4, 8):
//   item 1 — a visitor's explicit end request ends the session
//     promptly: the end_conversation tool (homepage + simulation,
//     dispatched before the platform gate), the prompt hook in the
//     sales layer ([[END_CONVERSATION]] on a genuine final goodbye),
//     and the deterministic detectEndIntent backstop on COMPLETED
//     caller transcriptions; the recorded reason is
//     visitor_requested, never the silence ladder.
//   item 4 — the silence/engagement clocks also key on RAW visitor
//     mic activity forwarded by the client speech gate, so a visitor
//     talking continuously (no completed turn yet) never receives a
//     check-in; TRUE silence keeps the approved ladder untouched.
//   item 8 — the authorized session length is a SOFT deadline: a
//     wrap-up path as it approaches, a visible client warning, and
//     an extension while either side is still talking; only the
//     absolute cap (or a deadline reached in silence) closes.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, test } from 'vitest';
import { detectEndIntent } from '../../supabase/functions/_shared/farewell';
import {
  freshSessionCeilingState, sessionCeilingAction,
  SESSION_ABSOLUTE_CAP_SECONDS, SESSION_EXTENSION_SECONDS,
} from '../../supabase/functions/_shared/homepage-pacing';
import { HOMEPAGE_SALES_LAYER } from '../../supabase/functions/_shared/homepage-knowledge';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const proxy = read('supabase/functions/gemini-live-proxy/index.ts');
const client = read('src/components/GeminiConversation.tsx');

describe('detectEndIntent — embedded end requests (item 1c)', () => {
  it('matches clear end phrases buried in a longer sentence', () => {
    expect(detectEndIntent('Please hang up now')).toBe(true);
    expect(detectEndIntent("Okay, that's all I needed, thank you")).toBe(true);
    expect(detectEndIntent('End the call please, I have to run')).toBe(true);
    expect(detectEndIntent('Thanks so much, goodbye')).toBe(true);
    expect(detectEndIntent("That's it for me, I'm done")).toBe(true);
    expect(detectEndIntent('Disconnect me please')).toBe(true);
  });

  it('matches the equivalents in the other session languages', () => {
    expect(detectEndIntent('Por favor, cuelga ya')).toBe(true);
    expect(detectEndIntent('Eso es todo, gracias')).toBe(true);
    expect(detectEndIntent('Pode desligar, por favor')).toBe(true);
    expect(detectEndIntent('É só isso, obrigado')).toBe(true);
    expect(detectEndIntent("Raccrochez, s'il vous plaît")).toBe(true);
    expect(detectEndIntent("C'est tout, au revoir")).toBe(true);
  });

  it('rejects prohibitions, not-readies and new requests riding along', () => {
    expect(detectEndIntent("Don't hang up yet")).toBe(false);
    expect(detectEndIntent('Do not end the call')).toBe(false);
    expect(detectEndIntent("I'm not ready to hang up")).toBe(false);
    expect(detectEndIntent("I'm not done yet")).toBe(false);
    expect(detectEndIntent("Before you hang up, what's the price?")).toBe(false);
    expect(detectEndIntent('My client said goodbye to his old answering service')).toBe(false);
    expect(detectEndIntent("That's all very interesting, but tell me about pricing")).toBe(false);
    expect(detectEndIntent('How much does it cost to end the call early?')).toBe(false);
  });

  it('rejects ordinary conversation and empty input', () => {
    expect(detectEndIntent('')).toBe(false);
    expect(detectEndIntent('Tell me more about the video avatar')).toBe(false);
    expect(detectEndIntent('We lose a lot of calls after hours')).toBe(false);
  });
});

describe('session ceiling — soft deadline machine (item 8)', () => {
  it('starts at the authorized seconds with the absolute cap above it', () => {
    const s = freshSessionCeilingState(900);
    expect(s.deadlineSeconds).toBe(900);
    expect(s.capSeconds).toBe(SESSION_ABSOLUTE_CAP_SECONDS);
    expect(SESSION_ABSOLUTE_CAP_SECONDS).toBe(3600);
  });

  it('wrap-up fires once at the lead mark, then the warning once', () => {
    let s = freshSessionCeilingState(900);
    expect(sessionCeilingAction(s, 700, 5).action).toBeNull();
    const w = sessionCeilingAction(s, 781, 5); // 119s remaining
    expect(w.action).toBe('wrapup');
    s = w.state;
    expect(sessionCeilingAction(s, 800, 5).action).toBeNull(); // no repeat
    const warn = sessionCeilingAction(s, 841, 5); // 59s remaining
    expect(warn.action).toBe('warn');
    s = warn.state;
    expect(sessionCeilingAction(s, 850, 5).action).toBeNull();
  });

  it('an ACTIVE conversation extends at the deadline instead of dying', () => {
    const s = freshSessionCeilingState(900);
    const r = sessionCeilingAction({ ...s, wrapupInjected: true, warningSent: true }, 900, 12);
    expect(r.action).toBe('extend');
    expect(r.state.deadlineSeconds).toBe(900 + SESSION_EXTENSION_SECONDS);
    // The wrap-up/warning cycle re-arms for the new deadline.
    expect(r.state.wrapupInjected).toBe(false);
    expect(r.state.warningSent).toBe(false);
  });

  it('a quiet session closes at the deadline', () => {
    const s = freshSessionCeilingState(900);
    expect(sessionCeilingAction(s, 900, 300).action).toBe('close');
  });

  it('even an active conversation closes at the absolute cap', () => {
    const s = freshSessionCeilingState(900);
    const atCap = { ...s, deadlineSeconds: SESSION_ABSOLUTE_CAP_SECONDS };
    expect(sessionCeilingAction(atCap, SESSION_ABSOLUTE_CAP_SECONDS, 3).action).toBe('close');
    // An extension never pushes past the cap.
    const nearCap = { ...s, deadlineSeconds: SESSION_ABSOLUTE_CAP_SECONDS - 100 };
    const r = sessionCeilingAction(nearCap, SESSION_ABSOLUTE_CAP_SECONDS - 100, 3);
    expect(r.action).toBe('extend');
    expect(r.state.deadlineSeconds).toBe(SESSION_ABSOLUTE_CAP_SECONDS);
  });
});

describe('prompt hook — the sales layer teaches the end signal (item 1a)', () => {
  it('the sales layer carries the adopted hook verbatim in substance', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('[[END_CONVERSATION]]');
    expect(HOMEPAGE_SALES_LAYER).toContain('end_conversation tool');
    expect(HOMEPAGE_SALES_LAYER).toContain('never say the token');
    expect(HOMEPAGE_SALES_LAYER).toContain('never for a pause, a transfer or a persona hand-off');
  });
});

describe('proxy wiring — item 1 (tool + backstop + reason)', () => {
  it('declares end_conversation for homepage + simulation sessions', () => {
    expect(proxy).toContain("name:'end_conversation'");
    expect(proxy).toContain("config.homepageSales === true || config.simulation === true");
    expect(proxy).toContain('[[END_CONVERSATION]]');
  });

  it('dispatches end_conversation BEFORE the platformFollowup gate', () => {
    const dispatchAt = proxy.indexOf("call.name === 'end_conversation'");
    const gateAt = proxy.indexOf("respond({error:'Action unavailable.'})");
    expect(dispatchAt).toBeGreaterThan(0);
    expect(gateAt).toBeGreaterThan(dispatchAt);
  });

  it('records visitor_requested on the requested-end path', () => {
    expect(proxy).toContain("endReason = 'visitor_requested'");
    expect(proxy).toContain('requested_end_path=');
    expect(proxy).toContain("triggerRequestedEnd('tool', 12000)");
  });

  it('the backstop keys on completed utterances and stands down behind a farewell', () => {
    expect(proxy).toContain('detectEndIntent(completedUtterance)');
    expect(proxy).toContain("triggerRequestedEnd('backstop', 12000, true)");
    expect(proxy).toContain("triggerRequestedEnd('backstop_model_closed', FAREWELL_END_DELAY_MS)");
  });

  it('a pending requested end stands the pacing tick and the gate injections down', () => {
    expect(proxy).toContain('if (visitorRequestedEnd) return');
    expect(proxy).toContain('if (gateDecision.inject && !visitorRequestedEnd)');
    expect(proxy).toContain('if (decision.inject && !visitorRequestedEnd)');
    expect(proxy).toContain("if (preArm.inject === 'end-ask-prearm' && !visitorRequestedEnd)");
    // The farewell timer must not overwrite the requested reason.
    expect(proxy).toContain('if (visitorRequestedEnd) return\n      endReason = \'visitor_goodbye\'');
  });
});

describe('proxy + client wiring — item 4 (raw mic activity)', () => {
  it('the proxy keys both clocks to mic_activity', () => {
    const at = proxy.indexOf("msg.type === 'mic_activity'");
    expect(at).toBeGreaterThan(0);
    const block = proxy.slice(at, at + 3000);
    expect(block).toContain('lastCallerSpeech = Date.now()');
    expect(block).toContain('lastRealCallerTurnAt = Date.now()');
    // The rung is NOT reset by activity — only completed turns reset
    // an episode (the ladder's approved semantics are untouched).
    expect(block).not.toContain('silenceRung = 0');
  });

  it('the client forwards gate-open activity from both capture loops, throttled', () => {
    expect(client.match(/type: "mic_activity"/g)?.length).toBe(2);
    expect(client).toContain('lastMicActivitySentRef');
    expect(client).toContain('>= 2000');
  });
});

describe('proxy + client wiring — item 8 (ceiling)', () => {
  it('the proxy runs the ceiling machine from the pacing tick', () => {
    expect(proxy).toContain('freshSessionCeilingState(session.max_seconds)');
    expect(proxy).toContain('sessionCeilingAction(ceiling, elapsed, activityAgo)');
    expect(proxy).toContain("type: 'session_warning'");
    expect(proxy).toContain("type: 'session_extended'");
    expect(proxy).toContain("event: 'session_extended'");
  });

  it('the plain timer is only the absolute-cap backstop on ceiling sessions', () => {
    expect(proxy).toContain('ceilingSession ? Math.max(session.max_seconds, SESSION_ABSOLUTE_CAP_SECONDS) * 1000 : session.max_seconds * 1000');
  });

  it('the client shows a visible warning and adopts the server deadline', () => {
    expect(client).toContain('case "session_warning"');
    expect(client).toContain('case "session_extended"');
    expect(client).toContain('data-testid="session-limit-warning"');
    expect(client).toContain('setLimitWarning(true)');
    expect(client.match(/deadlineRef\.current = msg\.deadlineEpochMs/g)?.length).toBe(4);
  });
});

test('the silence ladder contents stay Ron\u2019s approved protocol', () => {
  const pacing = read('supabase/functions/_shared/homepage-pacing.ts');
  expect(pacing).toContain('SILENCE_RUNG_SECONDS = [15, 40, 75]');
  expect(pacing).toContain('Are you still there?');
});
