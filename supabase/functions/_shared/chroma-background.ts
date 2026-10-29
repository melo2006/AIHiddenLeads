/**
 * A flat key-green backdrop uploaded once to Simli and placed behind Trinity-2 faces,
 * so the browser can cut the person out and float her over the page like the static photo.
 */
const SIMLI = 'https://api.simli.ai';
export const CHROMA_BACKGROUND_NAME = 'aihl-chroma-green-512.png';
const PNG_BASE64 = '__PNG__';

let cached: string | null = null;

type Listed = { id?: string; name?: string };
function listOf(d: unknown): Listed[] {
  if (Array.isArray(d)) return d as Listed[];
  if (d && typeof d === 'object') return (Object.values(d).find(Array.isArray) as Listed[] | undefined) ?? [];
  return [];
}

/** Returns the Simli background id for the key-green backdrop, uploading it on first use; null if Simli refuses. */
export async function chromaBackgroundId(apiKey: string): Promise<string | null> {
  if (cached) return cached;
  const headers = { 'x-simli-api-key': apiKey };
  const listed = await fetch(`${SIMLI}/assets/backgrounds`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null);
  const existing = listOf(listed).find(a => a.name === CHROMA_BACKGROUND_NAME && typeof a.id === 'string');
  if (existing?.id) return (cached = existing.id);
  const bytes = Uint8Array.from(atob(PNG_BASE64), c => c.charCodeAt(0));
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: 'image/png' }), CHROMA_BACKGROUND_NAME);
  const res = await fetch(`${SIMLI}/assets/backgrounds`, { method: 'POST', headers, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.id !== 'string') { console.error('simli chroma background upload refused', res.status, JSON.stringify(data?.detail ?? '')); return null; }
  return (cached = data.id);
}
