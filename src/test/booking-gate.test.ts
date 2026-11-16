// @vitest-environment node
// Publish #86 — the BOOKING GATE (2026-11-16).
//
// Ron's D4-on-VPS session 22b47dfa: the config carried
// platformFollowup=true (SQL-verified, byte-identical to the
// working transfer session), so Aspen held every platform booking
// tool and the booking policy for 179 turns and never called one —
// she promised a callback at 15:30, then 15:00, from thin air and
// nothing was ever booked. Prompt rules lose at the commitment
// transition; this gate is the mechanical backstop, split like the
// sales gate's:
//  - MECHANICAL: _shared/booking-gate.ts — the proxy keeps the
//    booking ledger and injects at most one directive per boundary:
//    a commitment correction, an intent order, or a completion
//    order, each capped, sterner on repeat.
//  - WIRING: the proxy stamps the tool ledger in the dispatch
//    (calendar checked / booking completed / card presented) and
//    runs the decision at the turn boundary after the sales gate.
//    The Deno function cannot be imported under vitest, so the
//    wiring is source-pinned here.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOOKING_GATE_MAX_FIRES,
  bookingGateTurnDecision,
  commitmentDirective,
  completeDirective,
  detectBookingIntent,
  detectSlotAcceptance,
  freshBookingGateState,
  intentDirective,
  turnCommitsToTime,
  type BookingGateState,
} from '../../supabase/functions/_shared/booking-gate';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const base = {
  modelTurnText: '',
  visitorUtterance: '',
  calendarChecked: false,
  bookingCompleted: false,
  cardPresented: false,
  blocked: false,
};

const run = (state: BookingGateState, over: Partial<typeof base>) =>
  bookingGateTurnDecision({ state, ...base, ...over });

describe('turnCommitsToTime — the spoken promise', () => {
  it('catches the exact 22b47dfa line (EN flip)', () => {
    expect(turnCommitsToTime("Perfect! I'll schedule the call for today afternoon at 3:30")).toBe(true);
  });

  it('catches Portuguese promises', () => {
    expect(turnCommitsToTime('Vou agendar a ligação para hoje às 15:30, pode deixar.')).toBe(true);
    expect(turnCommitsToTime('Pronto, agendei seu retorno.')).toBe(true);
    expect(turnCommitsToTime('Te ligo às 15h para confirmar.')).toBe(true);
  });

  it('catches strong confirmation phrases without a clock time', () => {
    expect(turnCommitsToTime("You're booked — we'll see you then!")).toBe(true);
    expect(turnCommitsToTime('Your appointment is confirmed.')).toBe(true);
  });

  it('does not fire on pitch talk that merely mentions times or durations', () => {
    expect(turnCommitsToTime('The meeting itself runs 15 to 20 minutes, and the calendar holds a 30-minute slot.')).toBe(false);
    expect(turnCommitsToTime('Most owners tell us mornings are best for a call.')).toBe(false);
    expect(turnCommitsToTime('It costs $99 a month for 400 minutes.')).toBe(false);
    expect(turnCommitsToTime('')).toBe(false);
  });
});

describe('detectBookingIntent — the visitor asks', () => {
  it('catches EN / PT / ES asks and day+time replies', () => {
    expect(detectBookingIntent('Can you call me tomorrow at 3?')).toBe(true);
    expect(detectBookingIntent('Yes, please book a call for me.')).toBe(true);
    expect(detectBookingIntent('Pode me ligar amanhã às 15?')).toBe(true);
    expect(detectBookingIntent('Quero agendar uma ligação.')).toBe(true);
    expect(detectBookingIntent('Tomorrow at 3 works for me.')).toBe(true);
  });

  it('does not fire on ordinary sales conversation', () => {
    expect(detectBookingIntent('How much does it cost?')).toBe(false);
    expect(detectBookingIntent('What does the avatar look like?')).toBe(false);
    expect(detectBookingIntent('')).toBe(false);
  });
});

describe('detectSlotAcceptance — the visitor picks a slot', () => {
  it('catches acceptance with a time or slot reference', () => {
    expect(detectSlotAcceptance('Yes, 3:30 works.')).toBe(true);
    expect(detectSlotAcceptance('Pode ser às 15h.')).toBe(true);
    expect(detectSlotAcceptance('That time is perfect.')).toBe(true);
  });

  it('does not fire on a bare yes', () => {
    expect(detectSlotAcceptance('Yes, I have a question about pricing.')).toBe(false);
    expect(detectSlotAcceptance('Sim, entendi.')).toBe(false);
  });
});

describe('bookingGateTurnDecision — the ledger at work', () => {
  it('fires a commitment correction when she promises a time with no check', () => {
    const r = run(freshBookingGateState(), {
      modelTurnText: "I'll schedule the call for today at 3:30",
      visitorUtterance: 'Pode me ligar hoje às 15:30?',
    });
    expect(r.inject).toBe('commitment');
    expect(r.stern).toBe(false);
    expect(r.state.commitmentFires).toBe(1);
  });

  it('goes sterner on the repeat and stops at the cap', () => {
    let s = freshBookingGateState();
    const turn = { modelTurnText: "You're booked for tomorrow at 10:00", visitorUtterance: '' };
    let r = run(s, turn); s = r.state;
    expect(r.inject).toBe('commitment');
    r = run(s, turn); s = r.state;
    expect(r.inject).toBe('commitment');
    expect(r.stern).toBe(true);
    r = run(s, turn); s = r.state;
    expect(r.inject).toBe('commitment');
    r = run(s, turn);
    expect(r.inject).toBe(null);
    expect(r.state.commitmentFires).toBe(3);
  });

  it('stands down once the calendar was actually checked', () => {
    const r = run(freshBookingGateState(), {
      modelTurnText: "I'll schedule the call for today at 3:30",
      calendarChecked: true,
    });
    expect(r.inject).toBe(null);
  });

  it('orders the check when the visitor asks and she drifts', () => {
    let s = freshBookingGateState();
    let r = run(s, { visitorUtterance: 'Can you call me tomorrow at 3?', modelTurnText: 'Of course! Let me tell you more about the plans first.' });
    expect(r.inject).toBe('intent');
    expect(r.state.intentArmed).toBe(true);
    // One quiet boundary passes (she may be mid-flow)...
    r = run(r.state, { modelTurnText: 'The Professional plan includes 1,200 minutes.' });
    expect(r.inject).toBe(null);
    // ...then the sterner repeat lands.
    r = run(r.state, { modelTurnText: 'And the avatar is free the first month.' });
    expect(r.inject).toBe('intent');
    expect(r.stern).toBe(true);
  });

  it('orders completion when a checked slot is accepted but not booked', () => {
    const r = run(freshBookingGateState(), {
      visitorUtterance: 'Yes, 3:30 works.',
      modelTurnText: 'Great choice!',
      calendarChecked: true,
    });
    expect(r.inject).toBe('complete');
  });

  it('never fires once a booking completed or a card is in play', () => {
    const turn = { modelTurnText: "You're booked for tomorrow at 10:00", visitorUtterance: 'Pode me ligar amanhã às 10?' };
    expect(run(freshBookingGateState(), { ...turn, bookingCompleted: true }).inject).toBe(null);
    expect(run(freshBookingGateState(), { ...turn, cardPresented: true }).inject).toBe(null);
  });

  it('a blocked boundary keeps the debt without spending a fire', () => {
    const r = run(freshBookingGateState(), {
      modelTurnText: "I'll schedule the call for today at 3:30",
      blocked: true,
    });
    expect(r.inject).toBe(null);
    expect(r.state.fires).toBe(0);
    expect(r.state.intentArmed).toBe(true);
    // The next free boundary collects via the intent path.
    const r2 = run(r.state, { modelTurnText: 'So, about the pricing…' });
    expect(r2.inject).toBe('intent');
  });

  it('never exceeds the session fire budget', () => {
    let s = freshBookingGateState();
    for (let i = 0; i < 12; i++) {
      const r = run(s, { modelTurnText: "You're booked for tomorrow at 10:00" });
      s = r.state;
    }
    expect(s.fires).toBeLessThanOrEqual(BOOKING_GATE_MAX_FIRES);
  });
});

describe('directives — orders, not advice', () => {
  it('name the real tools and forbid invented times', () => {
    for (const d of [commitmentDirective(false), commitmentDirective(true), intentDirective(false), intentDirective(true)]) {
      expect(d).toContain('get_availability');
      expect(d).toContain('check_time');
      expect(d).toContain('book_call');
    }
    expect(commitmentDirective(false)).toContain('Never state a time that did not come from a tool result');
    expect(completeDirective()).toContain('request_platform_appointment');
  });
});

describe('proxy wiring — source pins', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('imports the booking gate and arms it on the tool-holding sessions', () => {
    expect(src).toContain("from '../_shared/booking-gate.ts'");
    expect(src).toContain('const bookingGateSession = config.platformFollowup === true && config.simulation !== true');
    expect(src).toContain('let bookingGate: BookingGateState = freshBookingGateState()');
  });

  it('stamps the tool ledger in the dispatch', () => {
    expect(src).toContain("call.name === 'get_availability') {\n              bookingGateTools.calendarChecked = true;");
    expect(src).toContain("call.name === 'check_time') {\n              bookingGateTools.calendarChecked = true;");
    expect(src).toContain("call.name === 'platform_availability') {\n              bookingGateTools.calendarChecked = true;");
    expect(src).toContain('bookingGateTools.bookingCompleted = true;');
    expect(src).toContain("if (call.name === 'request_platform_appointment') bookingGateTools.cardPresented = true;");
  });

  it('runs the decision at the turn boundary, after the sales gate, never stacking', () => {
    const decisionAt = src.indexOf('bookingGateTurnDecision({');
    expect(decisionAt).toBeGreaterThan(src.indexOf('salesGateTurnDecision({'));
    expect(src).toContain('salesGateInjected');
    expect(src).toContain('|| gateInjected || consentInjected || salesGateInjected,');
  });
});
