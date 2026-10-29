export type CallReport = {
  id: string; business_name: string; created_at: string; channel?: string;
  caller_name?: string | null; caller_email?: string | null; caller_phone?: string | null;
  call_status?: string; duration_seconds?: number | null;
  summary?: string | { summary: string } | null;
};

// Explicit allowlist: recordings, transcripts, credentials and outreach drafts stay private.
export function reportPayload(record: CallReport) {
  return {
    id: record.id, business: record.business_name, started_at: record.created_at,
    channel: record.channel ?? 'voice', status: record.call_status ?? '',
    duration_seconds: record.duration_seconds ?? null,
    caller_name: record.caller_name ?? '', caller_email: record.caller_email ?? '',
    caller_phone: record.caller_phone ?? '',
    summary: typeof record.summary === 'string' ? record.summary : record.summary?.summary ?? '',
  };
}

export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function callReportsCsv(records: CallReport[]): string {
  const headers = ['id', 'business', 'started_at', 'channel', 'status', 'duration_seconds', 'caller_name', 'caller_email', 'caller_phone', 'summary'] as const;
  return [headers.map(csvCell).join(','), ...records.map(record => {
    const payload = reportPayload(record);
    return headers.map(key => csvCell(payload[key])).join(',');
  })].join('\r\n');
}

export function downloadCallReports(records: CallReport[]) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', callReportsCsv(records)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'call-reports.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function validateZapierUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.hostname !== 'hooks.zapier.com' || url.port || url.username || url.password || !/^\/hooks\/catch\/[^/]+\/[^/]+\/?$/.test(url.pathname) || url.search || url.hash) {
    throw new Error('Enter a Zapier Catch Hook URL from hooks.zapier.com.');
  }
  return url.href;
}