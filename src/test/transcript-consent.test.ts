// @vitest-environment node
import {expect,test} from 'vitest';
import {transcriptAllowed} from '../../supabase/functions/_shared/transcript-consent';
test('no homepage or agent transcript is saved without visitor consent',()=>{
 expect(transcriptAllowed(true,true,false)).toBe(false);expect(transcriptAllowed(false,true,false)).toBe(false);
});
test('homepage allows an explicitly consented transcript while tenant choice remains authoritative',()=>{
 expect(transcriptAllowed(true,false,true)).toBe(true);expect(transcriptAllowed(false,false,true)).toBe(false);expect(transcriptAllowed(false,true,true)).toBe(true);
});