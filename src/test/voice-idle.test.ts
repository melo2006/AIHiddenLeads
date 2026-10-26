// @vitest-environment node
import { expect, test } from 'vitest';
import { voiceIdleAction } from '../lib/voiceIdle';

test('homepage silence check-in waits fifteen seconds', () => {
  expect(voiceIdleAction('waiting', 1000, 15999)).toBeNull();
  expect(voiceIdleAction('waiting', 1000, 16000)).toBe('checkin');
});
test('caller has another fifteen seconds after check-in playback', () => {
  expect(voiceIdleAction('checkin', 20000, 34999)).toBeNull();
  expect(voiceIdleAction('checkin', 20000, 35000)).toBe('goodbye');
});
test('resumed conversation resets the silence deadline', () => {
  expect(voiceIdleAction('waiting', 35000, 35001)).toBeNull();
});