import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import AvatarSettings from "@/components/AvatarSettings";
import { DEFAULT_VIDEO_AVATAR, normalizeVideoAvatar, type VideoAvatar } from "../../../supabase/functions/_shared/video-avatar";

/** Admin: manage Simli faces and the homepage/demo-room Aspen face. Gemini Live stays the voice and brain. */
export default function VideoAvatarsView() {
  const [avatar, setAvatar] = useState<VideoAvatar>({ ...DEFAULT_VIDEO_AVATAR, enabled: true });
  const [faces, setFaces] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [agents, setAgents] = useState<{id: string; slug?: string; draft: Record<string, unknown>}[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [voice, setVoice] = useState('Kore');
  const selected = agents.find(a => a.id === selectedId);

  async function loadFaces() {
    const { data, error } = await supabase.functions.invoke("simli-avatar", { body: { action: "faces" } });
    if (error) toast.error("Could not load your Simli faces");
    else setFaces(data.faces || []);
  }
  useEffect(() => {
    void loadFaces();
    void supabase.functions.invoke("voice-agents", { body: { action: 'list' } }).then(({ data, error }) => {
      if (error) { toast.error('Could not load saved assistants'); return; }
      const drafts = (data?.agents || []).filter((a: {slug?: string}) => a.slug !== 'aspen-homepage');
      setAgents(drafts);
      const first = drafts[0];
      if (first) { setSelectedId(first.id); setAvatar(normalizeVideoAvatar(first.draft.videoAvatar)); setVoice(String(first.draft.voice || 'Kore')); }
    });
  }, []);

  async function apply() {
    if (!selected) return false;
    setBusy(true);
    try {
      const config = { ...selected.draft, videoAvatar: avatar, voice };
      const { error } = await supabase.functions.invoke('voice-agents', { body: { action: 'save', agentId: selected.id, config } });
      if (error) { toast.error('Could not save this assistant'); return false; }
      setAgents(prev => prev.map(a => a.id === selected.id ? {...a, draft: config} : a));
      toast.success('Face and voice saved to this draft. Homepage unchanged.'); return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">Video Avatars</h1>
          <p className="text-xs text-muted-foreground">Simli shows the face; the Gemini Live voice, prompts and knowledge stay the same. HeyGen is planned for later.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadFaces()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh faces</Button>
        <Button size="sm" disabled={busy || !selected} onClick={() => void apply()}><Save className="mr-1.5 h-3.5 w-3.5" />Save draft choices</Button>
      </div>
      <Select value={selectedId} disabled={busy} onValueChange={id => { const a = agents.find(a => a.id === id); if (!a) return; setSelectedId(id); setAvatar(normalizeVideoAvatar(a.draft.videoAvatar)); setVoice(String(a.draft.voice || 'Kore')); }}><SelectTrigger aria-label="Assistant to test"><SelectValue placeholder="Choose a saved business draft"/></SelectTrigger><SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{String(a.draft.businessName || a.draft.name || 'Business assistant')}</SelectItem>)}</SelectContent></Select>
      {!selected && <p className="text-sm text-muted-foreground">Create a business draft in Customer Setup to test its face, voice and knowledge here.</p>}
      <AvatarSettings value={avatar} onChange={setAvatar} faces={faces} adminPreview agentId={selectedId || undefined} beforePreview={apply} voice={voice} onVoiceChange={setVoice} name={String(selected?.draft.name || 'Aspen')} />
      <p className="text-[11px] text-muted-foreground">Draft tests do not publish or change the homepage. Customer Setup offers the same face and voice choices. HeyGen: coming later.</p>
    </div>
  );
}
