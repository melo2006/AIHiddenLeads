export const HANDOFF_ACTIVE = ['queued','dialing_owner','awaiting_owner','joined'] as const;
export function transferDestination(config: Record<string, unknown>): string | null {
  const phone = typeof config.transferPhone === 'string' ? config.transferPhone.trim() : '';
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
export function ownerOutcome(status: string, joined: boolean) {
  if (!['busy','failed','no-answer','canceled','completed'].includes(status)) return null;
  return joined ? 'completed' : 'failed';
}
export function acceptsManager(digits: string) { return digits === '1'; }
export function escapeXml(text: string) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
export async function sha256(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
}