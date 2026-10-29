import { describe,it,expect } from 'vitest';
import { pcmWav } from '../../supabase/functions/_shared/recording-audio';
describe('private call audio',()=>{
 it('preserves caller PCM at 16000 Hz',()=>{const wav=pcmWav([new Uint8Array([1,2,3,4])],16000);const v=new DataView(wav.buffer);expect(v.getUint32(24,true)).toBe(16000);expect(v.getUint32(40,true)).toBe(4);expect([...wav.slice(44)]).toEqual([1,2,3,4]);});
 it('preserves assistant PCM at 24000 Hz',()=>{const wav=pcmWav([new Uint8Array([9,8])],24000);expect(new DataView(wav.buffer).getUint32(24,true)).toBe(24000);expect([...wav.slice(44)]).toEqual([9,8]);});
});