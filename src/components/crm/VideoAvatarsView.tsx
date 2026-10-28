import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import AvatarSettings from "@/components/AvatarSettings";
import { DEFAULT_VIDEO_AVATAR, normalizeVideoAvatar, type VideoAvatar } from "../../../supabase/functions/_shared/video-avatar";

/** Admin: manage Simli faces and the homepage/demo-room Aspen face. Gemini Live stays the voice and brain. */
export default function VideoAvatarsView() {
  const [avatar, setAvatar] = useState<VideoAvatar>({ ...DEFAULT_VIDEO_AVATAR, enabled: true });
  const [faces, setFaces] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadFaces() {
    const { data, error } = await supabase.functions.invoke("simli-avatar", { body: { action: "faces" } });
    if (error) toast.error("Could not load your Simli faces");
    else setFaces(data.faces || []);
  }
  useEffect(() => {
    void loadFaces();
    void supabase.functions.invoke("voice-agent-public", { method: "GET" }).then(({ data }) => { if (data?.videoAvatar) setAvatar(normalizeVideoAvatar(data.videoAvatar)); });
  }, []);

  async function apply() {
    setBusy(true);
    const { error } = await supabase.functions.invoke("simli-avatar", { body: { action: "applyHomepage", avatar } });
    setBusy(false);
    if (error) toast.error("Could not save"); else toast.success(avatar.enabled ? "Homepage and demo-room Aspen now use this face" : "Homepage Aspen is back to voice only");
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">Video Avatars</h1>
          <p className="text-xs text-muted-foreground">Simli shows the face; the Gemini Live voice, prompts and knowledge stay the same. HeyGen is planned for later.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadFaces()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh faces</Button>
        <Button size="sm" disabled={busy} onClick={() => void apply()}><Save className="mr-1.5 h-3.5 w-3.5" />Use on homepage & demo room</Button>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <AvatarSettings value={avatar} onChange={setAvatar} faces={faces} adminPreview />
      </div>
      <p className="text-[11px] text-muted-foreground">Customer assistants pick their own face in Customer Setup → step 4 “Face & avatar”. Video minutes are billed by Simli on top of Gemini voice usage.</p>
    </div>
  );
}
