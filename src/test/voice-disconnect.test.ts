import {expect,test} from 'vitest';
import {voiceDisconnectMessage} from '../lib/voiceDisconnect';
test('silence and time-limit endings are distinguished from connection failures',()=>{
  expect(voiceDisconnectMessage(1000,'silence_timeout')).toContain('silence check-in');
  expect(voiceDisconnectMessage(1000,'time_limit')).toContain('time limit');
  expect(voiceDisconnectMessage(1006,'')).toContain('code 1006');
});