export const THEME_FONTS = ['system', 'Arial', 'Georgia', 'Verdana', 'Trebuchet MS'] as const;
export type WidgetTheme = { primary: string; background: string; foreground: string; font: typeof THEME_FONTS[number] };
export const DEFAULT_WIDGET_THEME: WidgetTheme = { primary: '#10B981', background: '#101216', foreground: '#F4F6F8', font: 'system' };
export function normalizeTheme(value: unknown): WidgetTheme {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const color = (key: 'primary' | 'background' | 'foreground') => typeof v[key] === 'string' && /^#[0-9a-f]{6}$/i.test(v[key]) ? String(v[key]) : DEFAULT_WIDGET_THEME[key];
  return { primary: color('primary'), background: color('background'), foreground: color('foreground'), font: THEME_FONTS.find(f => f === v.font) || 'system' };
}
export function websiteTheme(colors: unknown, fonts: unknown): WidgetTheme | null {
  if (!colors || typeof colors !== 'object') return null;
  const c = colors as Record<string, unknown>;
  const fontText = JSON.stringify(fonts || '').toLowerCase();
  const font = THEME_FONTS.find(f => f !== 'system' && fontText.includes(f.toLowerCase())) || 'system';
  if (![c.primary, c.background, c.textPrimary, c.text].some(v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))) return null;
  return normalizeTheme({ primary: c.primary, background: c.background, foreground: c.textPrimary || c.text, font });
}
export function themeVariables(value: unknown) {
  const t = normalizeTheme(value);
  const hsl = (hex: string) => {
    const [r,g,b] = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255);
    const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min, l=(max+min)/2;
    const s=d ? d/(1-Math.abs(2*l-1)) : 0;
    const h=!d ? 0 : max===r ? ((g-b)/d+6)%6 : max===g ? (b-r)/d+2 : (r-g)/d+4;
    return `${Math.round(h*60)} ${Math.round(s*100)}% ${Math.round(l*100)}%`;
  };
  const rgb=[1,3,5].map(i=>parseInt(t.primary.slice(i,i+2),16));
  return { '--primary': hsl(t.primary), '--primary-foreground': hsl(rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>150?'#101216':'#FFFFFF'), '--background':hsl(t.background), '--card':hsl(t.background), '--foreground':hsl(t.foreground), '--card-foreground':hsl(t.foreground), '--muted-foreground':hsl(t.foreground), fontFamily:t.font==='system'?'system-ui, sans-serif':t.font };
}