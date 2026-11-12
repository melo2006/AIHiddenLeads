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
      .toBe("I'll transfer you to the owner from Bright Realty now.");
  });

  it('transferRole without a business name', () => {
    expect(managerTransferAnnouncement({ transferRole: 'a sales director' }))
      .toBe("I'll transfer you to a sales director now.");
  });

  it('a blank or non-string transferRole falls through', () => {
    expect(managerTransferAnnouncement({ transferRole: '   ', realtorLanding: true, businessName: 'Bright Realty' }))
      .toBe("I'll transfer you to a realtor from Bright Realty now.");
    expect(managerTransferAnnouncement({ transferRole: 42 }))
      .toBe("I'll transfer you to the manager now.");
  });

  it('realtor landing transfers to a realtor, with and without the business name', () => {
    expect(managerTransferAnnouncement({ realtorLanding: true, businessName: 'Bright Realty' }))
      .toBe("I'll transfer you to a realtor from Bright Realty now.");
    expect(managerTransferAnnouncement({ realtorLanding: true }))
      .toBe("I'll transfer you to a realtor now.");
  });

  it('a real manager name is the person, with and without the business name', () => {
    expect(managerTransferAnnouncement({ transferManagerName: 'Sarah Chen', businessName: 'Bright Realty' }))
      .toBe("I'll transfer you to Sarah Chen from Bright Realty now.");
    expect(managerTransferAnnouncement({ transferManagerName: 'Sarah Chen' }))
      .toBe("I'll transfer you to Sarah Chen now.");
  });

  it("the placeholder 'the manager' is not treated as a person's name", () => {
    expect(managerTransferAnnouncement({ transferManagerName: 'the manager', businessName: 'Acme' }))
      .toBe("I'll transfer you to the manager from Acme now.");
  });

  it('empty config and non-string fields fall back to the plain manager line', () => {
    expect(managerTransferAnnouncement({})).toBe("I'll transfer you to the manager now.");
    expect(managerTransferAnnouncement({ transferManagerName: '', businessName: '' }))
      .toBe("I'll transfer you to the manager now.");
    expect(managerTransferAnnouncement({ transferManagerName: 42, businessName: 7 }))
      .toBe("I'll transfer you to the manager now.");
  });

  it('the announcement is always exactly one short line', () => {
    for (const config of [{}, { realtorLanding: true, businessName: 'Bright Realty' }, { transferManagerName: 'Sarah Chen', businessName: 'Bright Realty' }]) {
      const line = managerTransferAnnouncement(config);
      expect(line).not.toContain('\n');
      expect(line.split(' ').length).toBeLessThanOrEqual(10);
      expect(line.endsWith('now.')).toBe(true);
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
  });
});

describe('proxy wiring — PARKED (INCIDENT 2026-11-12 rollback)', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('no transfer wiring is in the rolled-back proxy', () => {
    // On 2026-11-12 the Edge proxy was rolled back to the
    // last-known-good 17331b2 file after the provider began closing
    // every session at setup (code 1011). The announcement helper and
    // its wording tests above remain in the tree; the declaration,
    // policy block and dispatcher return with the Batch 1 proxy
    // re-land, in a setup shape validated by
    // live-setup-declarations.test.ts.
    expect(src).not.toContain('request_manager_transfer');
    expect(src).not.toContain('start_handoff');
    expect(src).not.toContain('managerTransferAnnouncement');
  });
});
