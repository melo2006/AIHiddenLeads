// @vitest-environment node
// Video avatar free-first-month mechanic (pricing cleanup, Ron's
// decisions 2026-11-12): $79/mo flat on any plan, first month free via a
// trial on the add-on's own subscription, default OFF at trial end,
// one free trial per business, no overage during the free month (the
// avatar soft-stops to voice-only past the included video allowance).
import { describe, expect, test } from 'vitest';
import {
  AVATAR_TRIAL_DAYS,
  AVATAR_REMINDER_LEAD_DAYS,
  PLAN_VIDEO_MINUTES,
  avatarAllowanceMinutes,
  avatarStartMode,
  avatarReminderDue,
  avatarTrialSoftStop,
} from '../../supabase/functions/_shared/avatar-trial';
import { PAYMENT_PLANS } from '../../supabase/functions/_shared/payment-rules';

test('the free month is a 30-day trial and the reminder leads trial end by 5 days', () => {
  expect(AVATAR_TRIAL_DAYS).toBe(30);
  expect(AVATAR_REMINDER_LEAD_DAYS).toBe(5);
});

test('included video minutes match each plan voice minutes, for exactly the plan catalog', () => {
  expect(Object.keys(PLAN_VIDEO_MINUTES).sort()).toEqual(Object.keys(PAYMENT_PLANS).sort());
  expect(avatarAllowanceMinutes('essentials_monthly')).toBe(400);
  expect(avatarAllowanceMinutes('growth_monthly')).toBe(1200);
  expect(avatarAllowanceMinutes('fullservice_monthly')).toBe(2500);
  expect(avatarAllowanceMinutes('video_avatar_monthly')).toBeNull();
  expect(avatarAllowanceMinutes('nope')).toBeNull();
  expect(avatarAllowanceMinutes(undefined)).toBeNull();
});

describe('avatarStartMode — one free trial per business', () => {
  test('a live avatar subscription blocks any second start', () => {
    expect(avatarStartMode({ hasLiveAvatarSubscription: true, priorTrialCount: 0 })).toBe('already_active');
    expect(avatarStartMode({ hasLiveAvatarSubscription: true, priorTrialCount: 2 })).toBe('already_active');
  });
  test('first-ever start gets the free trial month', () => {
    expect(avatarStartMode({ hasLiveAvatarSubscription: false, priorTrialCount: 0 })).toBe('trial');
  });
  test('a business that used its free month re-subscribes paid, no second trial', () => {
    expect(avatarStartMode({ hasLiveAvatarSubscription: false, priorTrialCount: 1 })).toBe('paid');
  });
});

describe('avatarReminderDue — the day-~25 reminder window', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const inDays = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();
  test('due inside the 5-day window, unkept and unsent', () => {
    expect(avatarReminderDue({ trialEnd: inDays(5), keptAt: null, reminderSentAt: null, now })).toBe(true);
    expect(avatarReminderDue({ trialEnd: inDays(1), keptAt: null, reminderSentAt: null, now })).toBe(true);
  });
  test('not due outside the window or after the end', () => {
    expect(avatarReminderDue({ trialEnd: inDays(6), keptAt: null, reminderSentAt: null, now })).toBe(false);
    expect(avatarReminderDue({ trialEnd: inDays(-1), keptAt: null, reminderSentAt: null, now })).toBe(false);
  });
  test('never due once kept, once sent, or without a trial end', () => {
    expect(avatarReminderDue({ trialEnd: inDays(3), keptAt: inDays(-2), reminderSentAt: null, now })).toBe(false);
    expect(avatarReminderDue({ trialEnd: inDays(3), keptAt: null, reminderSentAt: inDays(-1), now })).toBe(false);
    expect(avatarReminderDue({ trialEnd: null, keptAt: null, reminderSentAt: null, now })).toBe(false);
  });
});

describe('avatarTrialSoftStop — no overage in the free month, voice continues', () => {
  test('soft-stops at and beyond the allowance, only while trialing', () => {
    expect(avatarTrialSoftStop({ status: 'trialing', monthVideoMinutes: 400, allowanceMinutes: 400 })).toBe(true);
    expect(avatarTrialSoftStop({ status: 'trialing', monthVideoMinutes: 512.5, allowanceMinutes: 400 })).toBe(true);
    expect(avatarTrialSoftStop({ status: 'trialing', monthVideoMinutes: 399.9, allowanceMinutes: 400 })).toBe(false);
  });
  test('a kept, paid add-on never soft-stops (overage meters instead)', () => {
    expect(avatarTrialSoftStop({ status: 'active', monthVideoMinutes: 9999, allowanceMinutes: 400 })).toBe(false);
    expect(avatarTrialSoftStop({ status: 'past_due', monthVideoMinutes: 9999, allowanceMinutes: 400 })).toBe(false);
  });
  test('an unknown plan allowance never soft-stops', () => {
    expect(avatarTrialSoftStop({ status: 'trialing', monthVideoMinutes: 9999, allowanceMinutes: null })).toBe(false);
  });
});
