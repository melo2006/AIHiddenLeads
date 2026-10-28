export const AVATAR_DEVICES = [
  { id: 'phone-portrait', label: 'Phone portrait', width: 390, height: 844 },
  { id: 'phone-landscape', label: 'Phone landscape', width: 844, height: 390 },
  { id: 'tablet-portrait', label: 'Tablet portrait', width: 768, height: 1024 },
  { id: 'tablet-landscape', label: 'Tablet landscape', width: 1024, height: 768 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
] as const;
export function deviceScale(width: number, height: number, availableWidth: number) {
  return Math.min(1, Math.max(1, availableWidth) / width, 440 / height);
}
export function avatarCoordinates(position: string, size: number, width: number, height: number) {
  const x = position === 'center' ? (width - size) / 2 : position.endsWith('left') ? 12 : width - size - 12;
  const y = position === 'center' ? (height - size) / 2 : position.startsWith('top') ? 80 : height - size - 112;
  return { left: Math.max(0, x), top: Math.max(0, y) };
}