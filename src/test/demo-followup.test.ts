// @vitest-environment node
import { expect, test } from 'vitest';
import { businessDemoConfig, greeting, SIMULATION_GREETING } from '../../supabase/functions/_shared/voice-config';
import { confirmedVisitorContact } from '../../supabase/functions/_shared/visitor-followup';
import { slotIsFree } from '../../supabase/functions/_shared/platform-calendar';
test('simulation uses known first name and visitor morning time', () => {
  expect(greeting(businessDemoConfig('A&R Towing', 'Towing services'), 9, 'Alan Smith')).toContain('Good morning, Alan.');
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