import { describe, it, expect } from 'vitest';
import { csvCell, callReportsCsv, reportPayload, validateZapierUrl } from './callReportExport';
const record = { id: 'call-1', business_name: 'Sea-Tech', created_at: '2026-10-29T15:22:00Z', caller_phone: '+15612755757', summary: { summary: 'Requested a service appointment', outreachDraft: 'PRIVATE' }, audio: [{ url: 'PRIVATE_AUDIO' }], transcript: 'PRIVATE_TRANSCRIPT' };
describe('call report export', () => {
  it('exports only the allowlisted report fields, never private audio/transcripts or drafts', () => {
    expect(reportPayload(record)).toEqual({ id: 'call-1', business: 'Sea-Tech', started_at: '2026-10-29T15:22:00Z', channel: 'voice', status: '', duration_seconds: null, caller_name: '', caller_email: '', caller_phone: '+15612755757', summary: 'Requested a service appointment' });
    expect(callReportsCsv([record])).not.toContain('PRIVATE');
  });
  it('neutralizes spreadsheet formulas and preserves international phone numbers', () => {
    for (const value of ['=SUM(A1)', '+15612755757', '-1+2', '@command', '  =evil', '\tcommand']) expect(csvCell(value)).toBe(`"'${value}"`);
  });
  it('escapes quotes and embedded line breaks', () => { expect(csvCell('A "quoted"\nsummary')).toBe('"A ""quoted""\nsummary"'); });
  it('accepts only secure Zapier catch hooks', () => {
    expect(validateZapierUrl('https://hooks.zapier.com/hooks/catch/123/abc/')).toBe('https://hooks.zapier.com/hooks/catch/123/abc/');
    for (const value of ['http://hooks.zapier.com/hooks/catch/123/abc/', 'https://evil.test/hooks/catch/123/abc/', 'https://hooks.zapier.com.evil.test/hooks/catch/123/abc/', 'https://user:password@hooks.zapier.com/hooks/catch/123/abc/', 'https://hooks.zapier.com/other', 'https://hooks.zapier.com/hooks/catch/123/abc/?secret=value']) expect(() => validateZapierUrl(value)).toThrow();
  });
});