// @vitest-environment node
// Fix 3 (Batch 1, 2026-11-12) — voice-asked manager transfer.
//
// The model previously had NO transfer tool: a visitor asking Aspen
// for a manager got words, never the dial. The proxy now declares
// request_manager_transfer under its OWN gate (a valid saved transfer
// destination + not a preview — the same sessions gemini-session
// issues a handoff capability for), dispatched BEFORE the
// platformFollowup rejection so tenant/homepage transfer sessions
// without platform follow-up still work. The announcement wording is
// the pure helper pinned here; the proxy wiring is source-pinned.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MANAGER_HANDOFF_DELAY_MS,
  MANAGER_TRANSFER_POLICY,
  managerTransferAnnouncement,
} from '../../supabase/functions/_shared/manager-transfer';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('managerTransferAnnouncement — the wording matrix', () => {
  it('transferRole wins over realtor, name and business defaults', () => {
    expect(managerTransferAnnouncement({ transferRole: 'the owner', realtorLanding: true, transferManagerName: 'Sarah Chen', businessName: 'Bright Realty' }))
      .toBe("I'll transfer you to the owner from Bright Realty now. I'll stay right here until you're through — then I'll step away, and you can talk to the owner directly.");
  });

  it('transferRole without a business name', () => {
    expect(managerTransferAnnouncement({ transferRole: 'a sales director' }))
      .toBe("I'll transfer you to a sales director now. I'll stay right here until you're through — then I'll step away, and you can talk to a sales director directly.");
  });

  it('a blank or non-string transferRole falls through', () => {
    expect(managerTransferAnnouncement({ transferRole: '   ', realtorLanding: true, businessName: 'Bright Realty' }))
      .toBe("I'll transfer you to a realtor from Bright Realty now. I'll stay right here until you're through — then I'll step away, and you can talk to a realtor directly.");
    expect(managerTransferAnnouncement({ transferRole: 42 }))
      .toBe("I'll transfer you to the manager now. I'll stay right here until you're through — then I'll step away, and you can talk to the manager directly.");
  });

  it('realtor landing transfers to a realtor, with and without the business name', () => {
    expect(managerTransferAnnouncement({ realtorLanding: true, businessName: 'Bright Realty' }))
      .toBe("I'll transfer you to a realtor from Bright Realty now. I'll stay right here until you're through — then I'll step away, and you can talk to a realtor directly.");
    expect(managerTransferAnnouncement({ realtorLanding: true }))
      .toBe("I'll transfer you to a realtor now. I'll stay right here until you're through — then I'll step away, and you can talk to a realtor directly.");
  });

  it('a real manager name is the person, with and without the business name', () => {
    expect(managerTransferAnnouncement({ transferManagerName: 'Sarah Chen', businessName: 'Bright Realty' }))
      .toBe("I'll transfer you to Sarah Chen from Bright Realty now. I'll stay right here until you're through — then I'll step away, and you can talk to Sarah Chen directly.");
    expect(managerTransferAnnouncement({ transferManagerName: 'Sarah Chen' }))
      .toBe("I'll transfer you to Sarah Chen now. I'll stay right here until you're through — then I'll step away, and you can talk to Sarah Chen directly.");
  });

  it("the placeholder 'the manager' is not treated as a person's name", () => {
    expect(managerTransferAnnouncement({ transferManagerName: 'the manager', businessName: 'Acme' }))
      .toBe("I'll transfer you to the manager from Acme now. I'll stay right here until you're through — then I'll step away, and you can talk to the manager directly.");
  });

  it('empty config and non-string fields fall back to the plain manager line', () => {
    expect(managerTransferAnnouncement({})).toBe("I'll transfer you to the manager now. I'll stay right here until you're through — then I'll step away, and you can talk to the manager directly.");
    expect(managerTransferAnnouncement({ transferManagerName: '', businessName: '' }))
      .toBe("I'll transfer you to the manager now. I'll stay right here until you're through — then I'll step away, and you can talk to the manager directly.");
    expect(managerTransferAnnouncement({ transferManagerName: 42, businessName: 7 }))
      .toBe("I'll transfer you to the manager now. I'll stay right here until you're through — then I'll step away, and you can talk to the manager directly.");
  });

  it('the announcement is one line: transfer sentence + stay-until-connected sentence', () => {
    // Handoff improvement batch (2026-11-12): Ron's stay-until-
    // connected wording rides as the announcement's second sentence;
    // the shape pinned before (a bare one-sentence line ending in
    // 'now.') was Batch 1's and is superseded by that design.
    for (const config of [{}, { realtorLanding: true, businessName: 'Bright Realty' }, { transferManagerName: 'Sarah Chen', businessName: 'Bright Realty' }]) {
      const line = managerTransferAnnouncement(config);
      expect(line).not.toContain('\n');
      expect(line).toContain(' now. ');
      expect(line).toContain("I'll stay right here until you're through");
      expect(line).toContain('step away');
      expect(line.endsWith('directly.')).toBe(true);
    }
  });
});

describe('the transfer policy + timing constants', () => {
  it('the handoff starts 4s after the tool answer, so the spoken line lands first', () => {
    expect(MANAGER_HANDOFF_DELAY_MS).toBe(4000);
  });

  it('the policy orders the tool call, forbids premature claims, and names the button fallback', () => {
    expect(MANAGER_TRANSFER_POLICY).toContain('call request_manager_transfer');
    expect(MANAGER_TRANSFER_POLICY).toContain('manager, the owner, or a real person');
    expect(MANAGER_TRANSFER_POLICY).toContain('Never claim the transfer has happened');
    expect(MANAGER_TRANSFER_POLICY).toContain('on-screen Manager button');
    expect(MANAGER_TRANSFER_POLICY).toContain('stay right here until they are through');
  });
});

describe('proxy wiring — declaration, gate and dispatch', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('availability is the handoff-capability gate, computed from transferDestination', () => {
    expect(src).toContain("import { transferDestination } from '../_shared/browser-handoff.ts'");
    expect(src).toContain('const managerTransferAvailable = transferDestination(config) !== null && !preview && config.sharedDemo !== true');
  });

  it('the tool is declared in its OWN gate, before the platformFollowup declarations', () => {
    expect(src).toContain("...(managerTransferAvailable ? [");
    expect(src).toContain("{name:'request_manager_transfer'");
    expect(src.indexOf("{name:'request_manager_transfer'")).toBeLessThan(src.indexOf("{name:'request_conversation_copy'"));
  });

  it('dispatch runs BEFORE the platformFollowup rejection branch, which stays intact', () => {
    const dispatch = src.indexOf("call.name === 'request_manager_transfer'");
    const gate = src.indexOf("!config.platformFollowup || preview");
    expect(dispatch).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(dispatch);
    expect(src).toContain("respond({error:'Action unavailable.'})");
  });

  it('the tool answer carries transferring + the announcement + the say-it-once instruction', () => {
    expect(src).toContain('respond({transferring:true,announcement,instruction:');
    expect(src).toContain('Say the announcement exactly once, word for word');
    expect(src).toContain('managerTransferAnnouncement(config)');
  });

  it('repeats are guarded once per session and never re-schedule the handoff', () => {
    expect(src).toContain('let managerTransferRequested = false');
    expect(src).toContain('alreadyRequested:true');
    expect(occurrences(src, 'managerTransferRequested = true')).toBe(1);
  });

  it('the client is told to start the handoff after the delay, guarded on the session being open', () => {
    expect(src).toContain("clientSocket.send(JSON.stringify({type:'start_handoff'}))");
    expect(src).toContain('MANAGER_HANDOFF_DELAY_MS');
    expect(src).toContain('if (!closed && clientSocket.readyState === WebSocket.OPEN) clientSocket.send');
  });

  it('the setup instruction block is appended ONLY when the tool is available', () => {
    expect(src).toContain("const managerTransferBlock = managerTransferAvailable ? `\\n${MANAGER_TRANSFER_POLICY}` : ''");
    // Handoff improvement batch: the overage pin appends immediately
    // after the transfer block (its own homepageSales-only gate is
    // pinned in overage-facts.test.ts); the transfer block's position
    // at the very end of the system instruction is unchanged.
    expect(src).toContain('${managerTransferBlock}${overageBlock}` }] }');
  });

  it('closeAll clears the scheduled handoff start', () => {
    expect(src).toContain('clearTimeout(handoffStartTimer); cancelFarewellEnd()');
  });
});
