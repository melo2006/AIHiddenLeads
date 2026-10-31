export type VisitEvent = { visit_id: string; event: string; path: string; created_at: string };
export const PUBLIC_PATHS = ['/', '/demo', '/demo-site', '/checkout', '/checkout/return', '/book'] as const;
export const PUBLIC_SECTIONS = ['services', 'pricing', 'map-visibility', 'demo-form', 'how-it-works', 'faq', 'addons'] as const;
export function validMilestone(event: string, path: string) {
  if (event === 'section_view') return PUBLIC_SECTIONS.some(section => path === `/#${section}`);
  return ['page_view', 'scan_started', 'voice_started', 'voice_ended'].includes(event) && PUBLIC_PATHS.some(p => p === path);
}
export function reportTime(iso: string | null | undefined, zone = 'America/New_York') {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  try { return new Intl.DateTimeFormat('en-US', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }
  catch { return null; }
}
const PATH_LABELS: Record<string, string> = { '/': 'Main website', '/demo': 'Demo form', '/demo-site': 'Business demo', '/book': 'Booking', '/checkout': 'Checkout', '/checkout/return': 'Checkout return', '/#services': 'Services', '/#pricing': 'Prices', '/#map-visibility': 'Maps overview', '/#demo-form': 'Website demo section', '/#how-it-works': 'How it works', '/#faq': 'FAQ', '/#addons': 'Add-ons' };
export function visitJourney(events: VisitEvent[], visitId?: string | null, endAt?: string | null) {
  if (!visitId) return 'Not linked to a website visit';
  const end = endAt && Number.isFinite(Date.parse(endAt)) ? Date.parse(endAt) : Infinity;
  const observed = events.filter(e => e.visit_id === visitId && ['page_view', 'section_view'].includes(e.event) && validMilestone(e.event, e.path) && Date.parse(e.created_at) <= end).sort((a,b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  if (!observed.length) return 'No public page activity recorded in this tab';
  const labels = [...new Set(observed.map(e => PATH_LABELS[e.path]).filter(Boolean))];
  return labels.join(' → ') + (observed.some(e => e.path === '/') ? '' : ' · Main website not observed');
}
export function callerLocation(value: unknown) {
  if (!value || typeof value !== 'object') return 'Not available';
  const l = value as Record<string, unknown>;
  // Only explicit statements or a verified server-side source qualify. Never use HQ, timezone or area code.
  if (!['caller_stated', 'verified_ip_lookup'].includes(String(l.source))) return 'Not available';
  const parts = [l.city, l.region, l.country].filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.slice(0,100));
  return parts.length ? `${parts.join(', ')} (${l.source === 'caller_stated' ? 'caller stated; unverified' : 'approximate IP location; may reflect VPN/mobile network'})` : 'Not available';
}