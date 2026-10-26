// @vitest-environment node
import {expect,test} from 'vitest';
import {callReview} from '../../supabase/functions/_shared/call-review';
test('a sales pitch alone never assigns visitor service interest or score',()=>{
  const r=callReview([{role:'assistant',text:'Voice reception, B2B prospects, Google Maps, reviews and social ads.'}]);
  expect(r.interest).toEqual([]);expect(r.score).toBeNull();expect(r.covered).toHaveLength(5);
});
test('visitor service mentions retain concrete evidence and explicit rule score',()=>{
  const r=callReview([{role:'caller',text:'I need help with missed phone calls and reviews.'}]);
  expect(r.interest.map(a=>a.id)).toEqual(['voice','reputation']);expect(r.score).toBe(25);expect(r.interest[0].evidence).toBe('I need help with missed phone calls and reviews.');
});