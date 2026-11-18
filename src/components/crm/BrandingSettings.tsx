import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImagePlus, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { OrgBranding } from '@/lib/clients';
import { BRAND_COLOR_PRESETS, SLOGAN_MAX, placeholderLogoSvg } from '@/lib/tenancy';

// Branding settings (multi-tenant design Phase 2, 2026-11-18 §4.1):
// company name, logo (upload to the tenant-branding bucket under the
// org's own prefix, or a one-tap generated placeholder mark), slogan
// (max 80 characters) and support email — with a LIVE preview of the
// header exactly as this tenant's clients will see it. Saving goes
// through the voice-agents saveBranding action, which re-validates
// everything server-side, including that the logo lives under the
// org's own prefix.

interface Props {
  organizationId: string;
  organizationName: string;
  initial: OrgBranding;
  onSaved?: () => void;
}

export function BrandingSettings({ organizationId, organizationName, initial, onSaved }: Props) {
  const [name, setName] = useState(initial.name ?? organizationName);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? '');
  const [slogan, setSlogan] = useState(initial.slogan ?? '');
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail ?? '');
  const [brandColor, setBrandColor] = useState(initial.brandColor ?? '#10b981');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadLogo = async (file: File | Blob, filename: string) => {
    setBusy(true);
    try {
      const path = `${organizationId}/${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('tenant-branding').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('tenant-branding').getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      toast.success('Logo uploaded — save to apply it.');
    } catch (e) {
      toast.error('Logo upload failed', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const generatePlaceholder = async () => {
    const svg = placeholderLogoSvg(name, brandColor);
    await uploadLogo(new Blob([svg], { type: 'image/svg+xml' }), 'logo-placeholder.svg');
  };

  const save = async () => {
    if (slogan.trim().length > SLOGAN_MAX) {
      toast.error(`Slogan must be ${SLOGAN_MAX} characters or fewer.`);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('voice-agents', {
      body: {
        action: 'saveBranding',
        organizationId,
        branding: { name: name.trim() || null, logoUrl: logoUrl || null, slogan: slogan.trim() || null, supportEmail: supportEmail.trim() || null, brandColor },
      },
    });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error('Could not save branding.', { description: (data as { error?: string })?.error });
      return;
    }
    toast.success('Branding saved.');
    onSaved?.();
  };

  return (
    <div className="space-y-4">
      {/* Live header preview — exactly the shape clients see. */}
      <div className="overflow-hidden rounded-lg border border-border">
        <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Preview — your clients' header
        </p>
        <div className="flex h-14 items-center gap-2 bg-background px-4">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: brandColor }}>
              {(name || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-bold leading-tight">{name || 'Your company'}</span>
            {slogan.trim() && <span className="block truncate text-[11px] leading-tight text-muted-foreground">{slogan.trim()}</span>}
          </span>
        </div>
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Company name</span>
        <Input className="mt-1 h-9 text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
      </label>

      <div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Logo</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {logoUrl && <img src={logoUrl} alt="Current logo" className="h-12 w-12 rounded-lg border border-border object-cover" />}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f, f.name); e.target.value = ''; }} />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="mr-1 h-3 w-3" /> Upload a logo
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void generatePlaceholder()}>
            <Sparkles className="mr-1 h-3 w-3" /> Generate one for me
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Square works best — it appears in a round frame in the header. You can replace it any time.</p>
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Slogan</span>
        <Input className="mt-1 h-9 text-sm" value={slogan} onChange={(e) => setSlogan(e.target.value)} maxLength={SLOGAN_MAX + 20}
          placeholder="One line your clients will remember" />
        <span className={`mt-0.5 block text-[11px] ${slogan.trim().length > SLOGAN_MAX ? 'text-destructive' : 'text-muted-foreground'}`}>
          {slogan.trim().length}/{SLOGAN_MAX} characters
        </span>
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Support email — where your clients reach you</span>
        <Input className="mt-1 h-9 text-sm" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@yourcompany.com" />
      </label>

      <div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Brand color</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {BRAND_COLOR_PRESETS.map((c) => (
            <button key={c} type="button" aria-label={`Brand color ${c}`} onClick={() => setBrandColor(c)}
              className={`h-8 w-8 rounded-full border-2 ${brandColor === c ? 'border-foreground' : 'border-transparent'}`}
              style={{ background: c }} />
          ))}
          <Input aria-label="Custom brand color" className="h-8 w-28 text-xs" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
        </div>
      </div>

      <Button size="sm" disabled={busy} onClick={() => void save()}><Save className="mr-1 h-3 w-3" /> Save branding</Button>
    </div>
  );
}

export default BrandingSettings;
