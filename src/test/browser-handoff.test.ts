// @vitest-environment node
import { expect, test } from 'vitest';
import { acceptsManager, ownerOutcome, transferDestination } from '../../supabase/functions/_shared/browser-handoff';
test('handoff dials only the configured business destination, without a visitor phone',()=>{
  expect(transferDestination({transferPhone:'+19547706622'})).toBe('+19547706622');
  expect(transferDestination({callerPhone:'+15612755757'})).toBeNull();
});
test('manager must explicitly press 1 to accept',()=>{expect(acceptsManager('1')).toBe(true);expect(acceptsManager('')).toBe(false);expect(acceptsManager('2')).toBe(false);});
test('unanswered manager calls fail so visitors can return to Aspen',()=>{expect(ownerOutcome('no-answer',false)).toBe('failed');expect(ownerOutcome('completed',false)).toBe('failed');});
test('completed accepted handoff remains completed in history',()=>expect(ownerOutcome('completed',true)).toBe('completed'));
test('international business destinations including Brazil are allowed',()=>expect(transferDestination({transferPhone:'+5511999999999'})).toBe('+5511999999999'));