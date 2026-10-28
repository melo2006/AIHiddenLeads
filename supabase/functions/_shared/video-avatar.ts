// Shared by the browser and backend functions: public video-face settings only (no keys or prompts).
export const ASPEN_SIMLI_FACE = '99126e69-c224-404c-9aed-80805c1c9a94/92f24a0c-f046-45df-8df0-af7449c04571';
export const AVATAR_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'] as const;
export const AVATAR_SHAPES = ['circle', 'rounded', 'square'] as const;
export const AVATAR_MIN_SIZE = 96;
export const AVATAR_MAX_SIZE = 360;
export type AvatarPosition = typeof AVATAR_POSITIONS[number];
export type AvatarShape = typeof AVATAR_SHAPES[number];
export interface VideoAvatar { enabled: boolean; provider: 'simli'; faceId: string; position: AvatarPosition; size: number; shape: AvatarShape; }
export const DEFAULT_VIDEO_AVATAR: VideoAvatar = { enabled: false, provider: 'simli', faceId: ASPEN_SIMLI_FACE, position: 'bottom-right', size: 200, shape: 'circle' };
export const PRESET_FACES = [{ id: ASPEN_SIMLI_FACE, name: 'Aspen (blonde, professional)' }];

/** Simli face ids: a UUID, or a Trinity-2 "uuid/uuid" pair. */
export const validFaceId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i.test(v);

/** Fills missing or invalid fields with safe defaults, so older agents keep saving and rendering. */
export function normalizeVideoAvatar(v: unknown): VideoAvatar {
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  const size = Number(o.size);
  return {
    enabled: o.enabled === true,
    provider: 'simli',
    faceId: validFaceId(o.faceId) ? o.faceId : ASPEN_SIMLI_FACE,
    position: AVATAR_POSITIONS.includes(o.position as AvatarPosition) ? o.position as AvatarPosition : DEFAULT_VIDEO_AVATAR.position,
    size: Number.isFinite(size) ? Math.round(Math.min(AVATAR_MAX_SIZE, Math.max(AVATAR_MIN_SIZE, size))) : DEFAULT_VIDEO_AVATAR.size,
    shape: AVATAR_SHAPES.includes(o.shape as AvatarShape) ? o.shape as AvatarShape : DEFAULT_VIDEO_AVATAR.shape,
  };
}

/** Converts Gemini's 24 kHz PCM16 to Simli's 16 kHz PCM16 (linear interpolation). */
export function pcm24kTo16k(input: Int16Array): Int16Array {
  const outLength = Math.floor(input.length * 2 / 3);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * 1.5;
    const a = input[Math.floor(pos)] ?? 0;
    const b = input[Math.min(input.length - 1, Math.floor(pos) + 1)] ?? a;
    out[i] = Math.round(a + (b - a) * (pos - Math.floor(pos)));
  }
  return out;
}
