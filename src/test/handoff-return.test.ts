// @vitest-environment node
// Come-back after handoff (Handoff improvement batch, 2026-11-12).
//
// Before this batch the return from a manager handoff was ONE
// outcome-blind client-authored line ("The human handoff has ended
// or was unavailable… Do not claim a manager answered") sent as a
// user-role text turn — identical after a completed manager call, a
// no-answer, a device error and the visitor's own Return tap (the
// forensic session even drifted into the generic silence-recovery
// sequence instead). Now: the client reports only the terminal
// outcome, the proxy authors the instruction server-side
// (_shared/handoff-return.ts) and injects it as a clientContent
// turn — the farewell/idle-prompt channel — once per session, gated
// on the same handoff-capability gate as the transfer tool.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { handoffReturnInstruction, handoffReturnOutcome } from '../../supabase/functions/_shared/handoff-return';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('handoffReturnOutcome — only a proven completion counts', () => {
  it("'completed' passes through; everything else collapses to 'unavailable'", () => {
    expect(handoffReturnOutcome('completed')).toBe('completed');
    expect(handoffReturnOutcome('unavailable')).toBe('unavailable');
    expect(handoffReturnOutcome('failed')).toBe('unavailable');
    expect(handoffReturnOutcome('joined')).toBe('unavailable');
    expect(handoffReturnOutcome(undefined)).toBe('unavailable');
    expect(handoffReturnOutcome(null)).toBe('unavailable');
    expect(handoffReturnOutcome(42)).toBe('unavailable');
    expect(handoffReturnOutcome('COMPLETED')).toBe('unavailable');
  });
});

describe('handoffReturnInstruction — the come-back wording matrix', () => {
  it('completed + sales carries Ron\'s beats: how was the call, what did you arrange, demo/workflow, wizard close', () => {
    const text = handoffReturnInstruction('completed', { sales: true });
    expect(text).toContain('ask how the call went');
    expect(text).toContain('what they arranged with the manager');
    expect(text).toContain('complete their demo now, or go through a workflow');
    expect(text).toContain('Alex, our onboarding engineer');
    expect(text).toContain('setup wizard');
    expect(text).toContain('choose a plan');
    expect(text).toContain('about 15 minutes');
    expect(text).toContain('Start now button');
  });

  it('completed + non-sales keeps the welcome-back in the business role, with no sales close', () => {
    const text = handoffReturnInstruction('completed', { sales: false });
    expect(text).toContain('ask how the call went');
    expect(text).toContain('what they arranged with the manager');
    expect(text).toContain('Continue helping in your business role.');
    expect(text).not.toContain('Start now');
    expect(text).not.toContain('setup wizard');
  });

  it('unavailable is the honest line for every context: no manager answered, offer a callback', () => {
    for (const sales of [true, false]) {
      const text = handoffReturnInstruction('unavailable', { sales });
      expect(text).toContain('did not connect');
      expect(text).toContain('never spoke to a manager');
      expect(text).toContain('without claiming a manager answered');
      expect(text).toContain('callback');
      expect(text).not.toContain('Start now');
    }
  });
});

describe('proxy wiring — the handoff_ended handler', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('handles the client outcome report behind the handoff-capability gate, once per session', () => {
    expect(src).toContain("msg.type === 'handoff_ended' && managerTransferAvailable && !handoffReturnHandled");
    expect(src).toContain('let handoffReturnHandled = false');
    expect(src).toContain('handoffReturnHandled = true');
  });

  it('the outcome is sanitized server-side and the instruction is server-authored', () => {
    expect(src).toContain('const outcome = handoffReturnOutcome(msg.outcome);');
    expect(src).toContain('handoffReturnInstruction(outcome,{sales})');
    expect(src).toContain("import { handoffReturnInstruction, handoffReturnOutcome } from '../_shared/handoff-return.ts'");
  });

  it('the sales variant is limited to homepage-sales sessions that are not simulations', () => {
    expect(src).toContain("const sales = config.homepageSales === true && config.simulation !== true;");
  });

  it('the injection rides the clientContent channel, like farewell and idle prompts', () => {
    const handler = src.slice(src.indexOf("msg.type === 'handoff_ended'"), src.indexOf("msg.type === 'text'"));
    expect(handler).toContain('clientContent:{turns:[{role:\'user\',parts:[{text:handoffReturnInstruction(outcome,{sales})}]}],turnComplete:true}');
  });
});

describe('client wiring — outcome threading', () => {
  const handoff = read('src/components/BrowserVoiceHandoff.tsx');
  const conversation = read('src/components/GeminiConversation.tsx');

  it('BrowserVoiceHandoff reports the outcome, mapped from the terminal handoff status', () => {
    expect(handoff).toContain('onEnded?:(outcome:\'completed\'|\'unavailable\')=>void');
    expect(handoff).toContain("result.status==='completed'?'completed':'unavailable'");
    expect(handoff).toContain("finish('Connection interrupted — back with Aspen.','unavailable')");
  });

  it('a visitor Return after the call joined counts as completed; before joining, unavailable', () => {
    expect(handoff).toContain("finish('Back with Aspen.',joined.current?'completed':'unavailable')");
    expect(handoff).toContain("if(result.status==='joined')joined.current=true;");
  });

  it('the outcome is reported BEFORE onActive(false), so the come-back send can read it', () => {
    expect(handoff).toContain('if(outcome)ended.current?.(outcome);callback.current(false);');
  });

  it('GeminiConversation forwards the stored outcome as handoff_ended and clears it', () => {
    expect(conversation).toContain("JSON.stringify({type:'handoff_ended',outcome:handoffOutcomeRef.current ?? 'unavailable'})");
    expect(conversation).toContain('onEnded={onHandoffEnded}');
    expect(conversation).toContain('handoffOutcomeRef.current = null;');
  });

  it('the old outcome-blind client-authored come-back line is gone', () => {
    expect(conversation).not.toContain('The human handoff has ended or was unavailable');
  });

  it('the connecting status copy carries the stay-until-connected promise', () => {
    expect(handoff).toContain("Calling manager — Aspen stays with you until you're through.");
    expect(handoff).not.toContain('Calling manager — please stay here.');
  });
});
