import { MessageSquare } from 'lucide-react';
import avatar from '@/assets/aspen_blonde_avatar.jpg';

export default function AspenLauncherContent({ name = 'Aspen', avatarUrl }: { name?: string; avatarUrl?: string }) {
  return <>
    <img src={avatarUrl || avatar} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover sm:h-[88px] sm:w-[88px]" />
    <span className="flex flex-col items-start text-base leading-tight"><span>Ask</span><span>{name}</span></span>
    <MessageSquare className="h-5 w-5 shrink-0" />
  </>;
}
