import {expect,it} from 'vitest';
import {callerLocation,reportTime,validMilestone,visitJourney} from '../../supabase/functions/_shared/report-context';

it('shows Eastern time with the correct daylight-saving offset',()=>{
  expect(reportTime('2026-10-31T14:00:00Z')).toBe('Oct 31, 2026, 10:00 AM');
  expect(reportTime('2026-11-02T14:00:00Z')).toBe('Nov 2, 2026, 9:00 AM');
});
it('uses visitor-local timezone only as a clock setting',()=>{
  expect(reportTime('2026-10-31T00:55:00Z','Australia/Sydney')).toBe('Oct 31, 2026, 11:55 AM');
  expect(reportTime('2026-10-31T00:55:00Z','made-up')).toBeNull();
});
it('never guesses caller location from headquarters, timezone or phone area code',()=>{
  for(const source of ['headquarters','timezone','area_code','client_ip_header']) expect(callerLocation({source,city:'Miami',country:'US'})).toBe('Not available');
  expect(callerLocation(null)).toBe('Not available');
});
it('labels explicitly stated and verified approximate locations',()=>{
  expect(callerLocation({source:'caller_stated',city:'Boston',country:'US'})).toBe('Boston, US (caller stated; unverified)');
  expect(callerLocation({source:'verified_ip_lookup',country:'US'})).toContain('approximate IP location');
});
it('joins only the same tab visit and excludes activity after the conversation',()=>{
  expect(visitJourney([
    {visit_id:'a',event:'page_view',path:'/demo',created_at:'2026-10-31T10:00:00Z'},
    {visit_id:'a',event:'page_view',path:'/demo-site',created_at:'2026-10-31T10:01:00Z'},
    {visit_id:'b',event:'page_view',path:'/',created_at:'2026-10-31T10:01:00Z'},
    {visit_id:'a',event:'section_view',path:'/#pricing',created_at:'2026-10-31T11:00:00Z'},
  ],'a','2026-10-31T10:05:00Z')).toBe('Demo form → Business demo · Main website not observed');
});
it('accepts observed public sections but rejects private paths and unapproved sections',()=>{
  expect(validMilestone('section_view','/#pricing')).toBe(true);
  expect(validMilestone('section_view','/#services')).toBe(true);
  expect(validMilestone('section_view','/#private')).toBe(false);
  expect(validMilestone('page_view','/dashboard/telephony')).toBe(false);
});
it('does not infer website activity for an unlinked phone call',()=>expect(visitJourney([],null)).toBe('Not linked to a website visit'));