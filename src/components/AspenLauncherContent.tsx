import { MessageSquare, Video } from 'lucide-react';
import avatar from '@/assets/aspen_blonde_avatar.jpg';

export default function AspenLauncherContent({ name = 'Aspen', avatarUrl, videoEnabled = false }: { name?: string; avatarUrl?: string; videoEnabled?: boolean }) {
  return <>
    <img src={avatarUrl || avatar} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover sm:h-[88px] sm:w-[88px]" />
    <span className="flex flex-col items-start text-base leading-tight"><span>Ask</span><span>{name}</span>{videoEnabled && <span className="mt-1 flex items-center gap-1 text-[10px]"><Video className="h-3 w-3"/>Video & voice</span>}</span>
    {videoEnabled ? <Video className="h-5 w-5 shrink-0" /> : <MessageSquare className="h-5 w-5 shrink-0" />}
  </>;
}
