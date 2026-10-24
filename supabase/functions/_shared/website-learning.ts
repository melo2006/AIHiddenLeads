export function learningLinks(links: string[], targetUrl: string, limit: number) {
  const target = new URL(targetUrl);
  const scope = target.pathname.replace(/\/+$/, '');
  const host = target.hostname.replace(/^www\./, '');
  const excluded = /(?:privacy|terms|login|signin|signup|careers|benefits|employee|investor|newsroom|wp-admin|checkout|\.pdf(?:$|\?))/i;
  const priority = /checking|saving|deposit|banking|loan|mortgage|credit|treasury|rate|fee|service|product|faq|contact|location/i;
  const candidates = new Set<string>();
  for (const link of links) {
    try {
      const url = new URL(link, targetUrl);
      url.hash = '';
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.hostname.replace(/^www\./, '') !== host || excluded.test(url.pathname)) continue;
      if (scope && !url.pathname.startsWith(`${scope}/`)) continue;
      if (url.pathname.replace(/\/+$/, '') === scope) continue;
      candidates.add(url.toString());
    } catch { /* invalid or non-web link */ }
  }
  return [...candidates].sort((a,b) => Number(priority.test(b))-Number(priority.test(a))).slice(0,limit);
}