// @vitest-environment node
import { expect, test } from 'vitest';
import { businessDemoConfig, greeting, SIMULATION_GREETING } from '../../supabase/functions/_shared/voice-config';
import { confirmedVisitorContact, contactReadback } from '../../supabase/functions/_shared/visitor-followup';
import { slotIsFree } from '../../supabase/functions/_shared/platform-calendar';
test('simulation uses known first name and visitor morning time', () => {
  expect(greeting(businessDemoConfig('A&R Towing', 'Towing services'), 9, 'Alan Smith')).toContain('Good morning, Alan.');
});
test('contact readback spells first and last name separately', () => {
  expect(contactReadback({name:'Alan Smith',email:'',phone:''}).name).toBe('A - l - a - n / S - m - i - t - h');
});
test('contact readback distinguishes difficult email punctuation', () => {
  expect(contactReadback({name:'',email:'a_b-c@x.com',phone:''}).email).toBe('a underscore b hyphen c at x dot c o m');
});
test('contact readback preserves each offered phone digit', () => {
  expect(contactReadback({name:'',email:'',phone:'+1 (561) 275-5757'}).phone).toBe('1 5 6 1 2 7 5 5 7 5 7');
  expect(contactReadback({name:'',email:'',phone:''}).phone).toBe('');
});
test('simulation intro stays separate from platform sales greeting', () => {
  const config = businessDemoConfig('A&R Towing', 'Towing services', { greeting: 'Buy our plan' });
  expect(config.greeting).toBe(SIMULATION_GREETING);
  expect(config.sourceKnowledge).toBe('Towing services');
});
test('follow-up cannot save contacts without explicit consent', () => {
  expect(() => confirmedVisitorContact({ name: 'Alan Smith', email: 'alan@example.com', phone: '', consent: false })).toThrow();
});
test('confirmed contact accepts optional phone and validates email', () => {
  expect(confirmedVisitorContact({ name: 'Alan Smith', email: 'ALAN@example.com', phone: '', consent: true })).toEqual({ name: 'Alan Smith', email: 'alan@example.com', phone: '' });
  expect(() => confirmedVisitorContact({ name: 'Alan', email: 'not-email', phone: '', consent: true })).toThrow();
});
test('calendar busy interval blocks appointment but adjacent slot remains available', () => {
  const busy = [{ start: '2026-10-26T13:00:00Z', end: '2026-10-26T14:00:00Z' }];
  expect(slotIsFree('2026-10-26T13:45:00Z', busy)).toBe(false);
  expect(slotIsFree('2026-10-26T14:00:00Z', busy)).toBe(true);
});