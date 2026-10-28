import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AVATAR_DEVICES, avatarCoordinates, deviceScale } from '@/lib/avatarLayout';
import type { VideoAvatar } from '../../supabase/functions/_shared/video-avatar';
import aspenFace from '@/assets/aspen_blonde_avatar.jpg';

export default function AvatarDevicePreview({ avatar }: { avatar: VideoAvatar }) {
  const [deviceId, setDeviceId] = useState<string>('phone-portrait');
  const [width, setWidth] = useState(320);
  const ref = useRef<HTMLDivElement>(null);
  const device = AVATAR_DEVICES.find(d => d.id === deviceId) || AVATAR_DEVICES[0];
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(el); return () => observer.disconnect();
  }, []);
  const scale = deviceScale(device.width, device.height, width);
  const size = Math.min(avatar.size, device.width * .7);
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-1" aria-label="Preview device">{AVATAR_DEVICES.map(d => <Button key={d.id} size="sm" variant={d.id === deviceId ? 'default' : 'outline'} aria-pressed={d.id === deviceId} onClick={() => setDeviceId(d.id)} className="text-xs">{d.label}</Button>)}</div>
    <p className="text-xs text-muted-foreground">Sample page · {device.label} · {device.width} × {device.height} px · {Math.round(scale * 100)}% scale</p>
    <div ref={ref} className="w-full">
      <div className="relative mx-auto overflow-hidden rounded-lg border border-border" style={{ width: device.width * scale, height: device.height * scale }}>
        <div className="absolute left-0 top-0 origin-top-left bg-background" style={{ width: device.width, height: device.height, transform: `scale(${scale})` }}>
          <div className="flex h-16 items-center justify-between border-b border-border px-6"><strong>Business website</strong><span className="text-muted-foreground">Menu</span></div>
          <div className="space-y-6 p-6"><div className="h-32 bg-muted"/><div className="h-5 w-2/3 bg-secondary"/><div className="h-3 bg-muted"/><div className="h-3 w-4/5 bg-muted"/><div className="grid grid-cols-3 gap-3">{[1,2,3].map(n => <div key={n} className="h-28 border border-border bg-card"/>)}</div></div>
          <div aria-label="Avatar placement" className={`absolute overflow-hidden border-2 border-primary ${avatar.shape === 'circle' ? 'rounded-full' : avatar.shape === 'rounded' ? 'rounded-3xl' : 'rounded-none'}`} style={{ ...avatarCoordinates(avatar.position, size, device.width, device.height), width: size, height: size }}>
            {avatar.faceId.includes('99126e69') ? <img src={aspenFace} alt="Aspen sample portrait" className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center bg-card p-2 text-center text-sm text-muted-foreground">Selected face</div>}
          </div>
          <div className="absolute bottom-0 h-12 w-full border-t border-border bg-card"/>
        </div>
      </div>
    </div>
  </div>;
}