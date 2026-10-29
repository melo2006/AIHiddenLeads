/** Mono PCM16 WAV in provider timeline order; no synthetic speech or inferred audio. */
export function pcmWav(chunks: Uint8Array[], rate: number) {
  const bytes = chunks.reduce((n,c) => n+c.length,0);
  const out = new Uint8Array(44+bytes); const v = new DataView(out.buffer);
  const text = (at:number,s:string) => { for(let i=0;i<s.length;i++)out[at+i]=s.charCodeAt(i); };
  text(0,'RIFF');v.setUint32(4,36+bytes,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,bytes,true);
  let offset=44;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
}