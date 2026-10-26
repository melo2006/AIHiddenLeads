const areas = [
  {id:'voice',label:'AI reception',pattern:/\b(call|phone|reception|voicemail|voice|chat)\b/i},
  {id:'leads',label:'B2B prospects',pattern:/\b(b2b|prospects?|lead generation|outreach|reactivation)\b/i},
  {id:'search',label:'Maps & AI search',pattern:/\b(google|rankings?|maps|seo|search|citations?)\b/i},
  {id:'reputation',label:'Reviews & reputation',pattern:/\b(reviews?|reputation|ratings?)\b/i},
  {id:'social',label:'Social content',pattern:/\b(social|tiktok|facebook|instagram|videos?|ads?|posts?|content creation)\b/i},
] as const;
export function callReview(turns: {role:string;text:string}[]) {
  const caller=turns.filter(t=>t.role==='caller' || t.role==='user');
  const assistant=turns.filter(t=>t.role==='assistant');
  const interest=areas.filter(a=>caller.some(t=>a.pattern.test(t.text))).map(a=>({id:a.id,label:a.label,evidence:caller.find(t=>a.pattern.test(t.text))?.text.slice(0,300)||''}));
  const covered=areas.filter(a=>assistant.some(t=>a.pattern.test(t.text))).map(a=>a.label);
  const score=caller.length ? Math.min(100,caller.length*5+interest.length*10) : null;
  return {interest,covered,score,scoreBasis:'Rule-based engagement indicator: 5 per caller transcript segment + 10 per mentioned service, capped at 100; not buying intent or an AI assessment.',summary:caller.length ? `Visitor mentioned ${interest.map(a=>a.label).join(', ') || 'no identified service area'}. ${caller.length} caller transcript segments saved. Last visitor statement: ${caller.at(-1)?.text.slice(0,350)}` : 'No visitor speech saved; interest cannot be assessed.'};
}