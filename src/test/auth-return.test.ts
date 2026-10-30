import { describe, expect, it } from 'vitest';
import { safeReturnPath } from '@/lib/authReturn';

describe('safeReturnPath', () => {
  it('returns a signed-in administrator to the same demo', () => {
    const demo = '/demo-site?url=https%3A%2F%2FPbfenergy.com&leadId=abc&scan=1';
    expect(safeReturnPath(demo)).toBe(demo);
  });
  it('rejects other sites', () => {
    expect(safeReturnPath('//evil.com/demo-site')).toBeNull();
    expect(safeReturnPath('https://evil.com')).toBeNull();
  });
  it('rejects private dashboard paths', () => {
    expect(safeReturnPath('/dashboard/calls')).toBeNull();
    expect(safeReturnPath('/demo-siteX')).toBeNull();
  });
});
