import { describe, it, expect } from 'vitest';
import {
  EMPTY_SERVICE_AREA, compileServiceArea, hasCoverage, normalizeServiceArea, policySentence,
} from '../../supabase/functions/_shared/service-area';

describe('service area compilation', () => {
  it('defaults the out-of-area policy to never-a-flat-no (callback)', () => {
    expect(EMPTY_SERVICE_AREA.outOfAreaPolicy).toBe('callback');
    expect(policySentence('callback')).toContain('never give a flat no');
    expect(compileServiceArea(EMPTY_SERVICE_AREA)).toBe(policySentence('callback'));
  });

  it('compiles the places mode into a plain sentence', () => {
    const text = compileServiceArea({ ...EMPTY_SERVICE_AREA, places: ['Fort Lauderdale', 'Broward County'] });
    expect(text).toContain('We serve these areas: Fort Lauderdale, Broward County.');
    expect(text).toContain(policySentence('callback'));
  });

  it('compiles radius mode with and without an address', () => {
    expect(compileServiceArea({ ...EMPTY_SERVICE_AREA, mode: 'radius', radiusMiles: 20, baseAddress: '100 Main St, Fort Lauderdale, FL' }))
      .toContain('We serve customers within 20 miles of 100 Main St, Fort Lauderdale, FL.');
    expect(compileServiceArea({ ...EMPTY_SERVICE_AREA, mode: 'radius', radiusMiles: 15 }))
      .toContain('We serve customers within 15 miles of our business location.');
  });

  it('compiles ZIP mode and the transfer/decline policies', () => {
    const text = compileServiceArea({ ...EMPTY_SERVICE_AREA, mode: 'zips', zips: ['33301', '33304'], outOfAreaPolicy: 'decline' });
    expect(text).toContain('We serve these ZIP codes: 33301, 33304.');
    expect(text).toContain(policySentence('decline'));
    expect(policySentence('transfer')).toContain('transfer them to the office');
  });

  it('includes the owner travel-fee sentence only when enabled and written', () => {
    const fee = 'Jobs beyond 20 miles carry a travel fee of $49.';
    expect(compileServiceArea({ ...EMPTY_SERVICE_AREA, travelFeeEnabled: true, travelFeeText: fee })).toContain(fee);
    expect(compileServiceArea({ ...EMPTY_SERVICE_AREA, travelFeeEnabled: false, travelFeeText: fee })).not.toContain(fee);
    expect(compileServiceArea({ ...EMPTY_SERVICE_AREA, travelFeeEnabled: true, travelFeeText: '  ' })).not.toContain('travel fee');
  });

  it('normalizes saved drafts: bad ZIPs dropped, radius clamped, policy defaulted', () => {
    const n = normalizeServiceArea({ mode: 'zips', zips: ['33301', 'abc', '3330', '33304'], radiusMiles: 9999, outOfAreaPolicy: 'bogus' });
    expect(n.zips).toEqual(['33301', '33304']);
    expect(n.outOfAreaPolicy).toBe('callback');
    expect(normalizeServiceArea({ mode: 'radius', radiusMiles: 9999 }).radiusMiles).toBe(500);
    expect(normalizeServiceArea(null)).toEqual(EMPTY_SERVICE_AREA);
    expect(hasCoverage(normalizeServiceArea({ places: ['Miami'] }))).toBe(true);
    expect(hasCoverage(EMPTY_SERVICE_AREA)).toBe(false);
  });
});
