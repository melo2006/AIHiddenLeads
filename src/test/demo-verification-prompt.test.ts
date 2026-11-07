// @vitest-environment node
import { expect, test } from 'vitest';
import {
  DEMO_SALES_POLICY,
  DEMO_VERIFICATION_ACT1,
  DEMO_VERIFICATION_GREETING,
  SALES_ACTION_POLICY,
} from '../../supabase/functions/_shared/demo-sales';

test('verification greeting is a host greeting with the simulation placeholders', () => {
  expect(DEMO_VERIFICATION_GREETING).toContain('{timeGreeting}');
  expect(DEMO_VERIFICATION_GREETING).toContain('{visitorFirstName}');
  expect(DEMO_VERIFICATION_GREETING).toContain('{businessName}');
  expect(DEMO_VERIFICATION_GREETING).toContain('Aspen from AI Hidden Leads');
  expect(DEMO_VERIFICATION_GREETING).toContain('quick scan');
  expect(DEMO_VERIFICATION_GREETING).toContain('4-digit code');
});

test('Act 1 explains the quick scan honestly, without claiming a full read', () => {
  expect(DEMO_VERIFICATION_ACT1).toContain('has not begun');
  expect(DEMO_VERIFICATION_ACT1).toContain('never claim the whole website was read');
  expect(DEMO_VERIFICATION_ACT1).toContain('common-practice defaults');
  expect(DEMO_VERIFICATION_ACT1).toContain('vendor and part page links');
  expect(DEMO_VERIFICATION_ACT1).toContain('complete learning walkthrough');
  expect(DEMO_VERIFICATION_ACT1).toContain('roughly 2-minute learning version');
});

test('Act 1 asks for one channel, confirms dictation, then waits quietly', () => {
  expect(DEMO_VERIFICATION_ACT1).toContain('ONE contact channel only');
  expect(DEMO_VERIFICATION_ACT1).toContain('proves this demo belongs to them');
  expect(DEMO_VERIFICATION_ACT1).toContain('code is on its way');
  expect(DEMO_VERIFICATION_ACT1).toContain('digit by digit');
  expect(DEMO_VERIFICATION_ACT1).toContain('spelled out');
  expect(DEMO_VERIFICATION_ACT1).toContain('source of truth');
  expect(DEMO_VERIFICATION_ACT1).toContain('10 minutes');
  expect(DEMO_VERIFICATION_ACT1).toContain('wait right here quietly');
  expect(DEMO_VERIFICATION_ACT1).toContain('any question about AI Hidden Leads, just ask');
  expect(DEMO_VERIFICATION_ACT1).toContain('check spam or promotions');
  expect(DEMO_VERIFICATION_ACT1).toContain('Do not ask qualification questions');
});

test('Act 1 handles a spoken code without Aspen judging it', () => {
  expect(DEMO_VERIFICATION_ACT1).toContain('repeat the digits back exactly as you heard them');
  expect(DEMO_VERIFICATION_ACT1).toContain('shown in the boxes on screen');
  expect(DEMO_VERIFICATION_ACT1).toContain('offer typing it instead');
});

test('Act 1 transitions into simulation mode and offers a graceful resume', () => {
  expect(DEMO_VERIFICATION_ACT1).toContain('entering simulation mode');
  expect(DEMO_VERIFICATION_ACT1).toContain('act like a visitor to your own website');
  expect(DEMO_VERIFICATION_ACT1).toContain('manager or a sales specialist');
  expect(DEMO_VERIFICATION_ACT1).toContain('pricing');
  expect(DEMO_VERIFICATION_ACT1).toContain('demo stays saved');
  expect(DEMO_VERIFICATION_ACT1).toContain('continue my demo');
  expect(DEMO_VERIFICATION_ACT1).toContain('never repeat the verification ask more than once');
});

test('Act 1 keeps the no-invention guardrails', () => {
  expect(DEMO_VERIFICATION_ACT1).toContain('never claim you sent a code');
  expect(DEMO_VERIFICATION_ACT1).toContain('never claim the code is correct');
  expect(DEMO_VERIFICATION_ACT1).toContain('Never invent a code');
  expect(DEMO_VERIFICATION_ACT1).toContain('explicitly requests a language change');
  expect(DEMO_VERIFICATION_ACT1).toContain('anti-transfer rule');
});

test('existing demo sales exports are intact', () => {
  expect(DEMO_SALES_POLICY).toContain('stepping out of the business simulation');
  expect(SALES_ACTION_POLICY).toContain('recommend_plan');
});
