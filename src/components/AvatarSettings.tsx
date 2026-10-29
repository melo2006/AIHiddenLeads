import { useEffect, useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Mic, UploadCloud, Video, Play, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import SimliAvatar, { type SimliAvatarHandle } from "@/components/SimliAvatar";
import AvatarDevicePreview from "@/components/AvatarDevicePreview";
import GeminiConversation from "@/components/GeminiConversation";
import { VOICES } from "@/components/setup-wizard/wizardModel";
import { SIMLI_FACE_CATALOG, type AvatarFace } from '@/lib/simliFaceCatalog';
import aspenCutout from "@/assets/aspen-shoulders-512-v2.webp";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AVATAR_MAX_SIZE, AVATAR_MIN_SIZE, AVATAR_POSITIONS, AVATAR_SHAPES, type VideoAvatar,
} from "../../supabase/functions/_shared/video-avatar";

const POSITION_LABEL: Record<VideoAvatar["position"], string> = { "bottom-right": "Lower right", "bottom-left": "Lower left", "top-right": "Upper right", "top-left": "Upper left", center: "Center" };
const SHAPE_LABEL: Record<VideoAvatar["shape"], string> = { circle: "Circle", rounded: "Rounded square", square: "Square" };

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("simli-avatar", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : error.message);
  }
  return data;
}

type Face = AvatarFace;
interface Props {
  value: VideoAvatar;
  onChange: (v: VideoAvatar) => void;
  agentId?: string;
  /** Saves the draft before a preview so the server uses the chosen face. */
  beforePreview?: () => Promise<boolean>;
  faces?: Face[];
  /** Admin page: preview any face without an agent. */
  adminPreview?: boolean;
  voice?: string;
  onVoiceChange?: (voice: string) => void;
  name?: string;
}

/** Shared video-face picker for the setup wizard and the admin Video Avatars page. */
export default function AvatarSettings({ value, onChange, agentId, beforePreview, faces = [], adminPreview = false, voice = "Kore", onVoiceChange, name = "Aspen" }: Props) {
  const set = (patch: Partial<VideoAvatar>) => onChange({ ...value, ...patch });
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<{ faceId: string; status: string } | null>(null);
  const [faceName, setFaceName] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [confirmAspen, setConfirmAspen] = useState(false);
  useEffect(() => { setTesting(false); avatarRef.current?.stop(); setPreviewing(false); }, [agentId, voice, value.faceId, value.enabled]);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<SimliAvatarHandle>(null);
  const allFaces: Face[] = [...SIMLI_FACE_CATALOG, ...faces.filter((f) => !SIMLI_FACE_CATALOG.some((p) => p.id === f.id))];
  if (!allFaces.some((f) => f.id === value.faceId)) allFaces.push({ id: value.faceId, name: "Custom face" });

  // Poll a new face's generation; Simli spaces generations about ten minutes apart.
  useEffect(() => {
    if (!pending || pending.status === "completed" || pending.status === "failed") return;
    const timer = window.setInterval(() => {
      void call({ action: "status", faceId: pending.faceId }).then((d) => {
        setPending((p) => p && { ...p, status: d.status });
        if (d.status === "completed") { toast.success("Your new face is ready"); set({ faceId: pending.faceId, enabled: true }); }
        if (d.status === "failed") toast.error("Simli could not build this face. Try a clearer, front-facing photo.");
      }).catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [pending?.faceId, pending?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast.error("Use a PNG, JPG or WebP photo"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Maximum 10 MB"); return; }
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const d = await call({ action: "createFace", agentId, name: (faceName || file.name.replace(/\.\w+$/, "")).slice(0, 60), imageBase64: btoa(bin), mimeType: file.type });
      setPending({ faceId: d.faceId, status: "pending" });
      toast.success("Photo accepted. Simli is building your face; it may take several hours.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function togglePreview() {
    if (previewing) { avatarRef.current?.stop(); setPreviewing(false); return; }
    if (!await faceReady()) return;
    if (beforePreview && !await beforePreview()) return;
    setPreviewing(true);
    const ok = await avatarRef.current?.start();
    if (!ok) setPreviewing(false);
  }

  async function createAspenFace() {
    setConfirmAspen(false);
    try {
      const response = await fetch(aspenCutout);
      if (!response.ok) throw new Error('Aspen photo could not load');
      await upload(new File([await response.blob()], 'Aspen transparent.webp', { type: 'image/webp' }));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Aspen photo could not load'); }
  }

  async function testConversation() {
    if (testing) { setTesting(false); return; }
    if (value.enabled && !await faceReady()) return;
    avatarRef.current?.stop(); setPreviewing(false); setPreparing(true);
    try { if (!beforePreview || await beforePreview()) setTesting(true); }
    finally { setPreparing(false); }
  }
  async function faceReady() {
    if (!allFaces.find(f => f.id === value.faceId)?.generation) return true;
    try {
      const d = await call({ action: 'status', faceId: value.faceId });
      if (d.status === 'completed') return true;
      toast.info(`Aspen is still being created (${d.status}). Choose a ready-made face to test now.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not check face readiness'); }
    return false;
  }
  const choice = (active: boolean) => `h-auto justify-start whitespace-normal rounded-lg border-2 p-3 text-left text-sm transition ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`;
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className={choice(!value.enabled)} aria-pressed={!value.enabled} onClick={() => set({ enabled: false })}><Mic className="h-4 w-4 text-primary" /><span>Photo + voice</span></Button>
          <Button variant="outline" className={choice(value.enabled)} aria-pressed={value.enabled} onClick={() => set({ enabled: true })}><Video className="h-4 w-4 text-primary" /><span>Moving avatar + voice</span></Button>
        </div>

        {value.enabled && <>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Choose a face</p>
            <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
              {allFaces.map((f) => (
                <Button variant="outline" key={f.id} className={`${choice(value.faceId === f.id)} flex-col items-start`} aria-pressed={value.faceId === f.id} onClick={() => set({ faceId: f.id })}>
                  {f.image && <img src={f.image} alt={f.name} loading="lazy" width={240} height={240} className="mb-1 aspect-square w-full rounded-md object-contain" />}
                  <p className="text-xs font-semibold">{f.name}</p>
                  {f.category && <span className="text-[10px] text-muted-foreground">{f.category}</span>}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border-2 border-dashed border-border p-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><UploadCloud className="h-4 w-4 text-primary" />Or create a face from a photo</p>
            <p className="text-[11px] text-muted-foreground">One person facing the camera, good light. Each new face uses one Simli avatar generation. A transparent photo does not guarantee a transparent live video.</p>
            <Input aria-label="Face name" placeholder="Face name, e.g. Lucy" maxLength={60} value={faceName} onChange={(e) => setFaceName(e.target.value)} />
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
            <Button variant="outline" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}{uploading ? "Sending photo…" : "Upload photo"}</Button>
            {adminPreview && <div className="flex items-center gap-3"><img src={aspenCutout} width={64} height={64} alt="Transparent Aspen portrait" className="h-16 w-16 object-contain" /><Button variant="outline" disabled={uploading} className="h-auto whitespace-normal text-xs" onClick={() => setConfirmAspen(true)}>Create face from Aspen photo</Button></div>}
            {pending && <p role="status" className="text-xs text-primary">New face: {pending.status === "completed" ? "ready and selected" : pending.status === "failed" ? "failed" : `building (${pending.status}) — you can keep going; it's selected when ready`}</p>}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Where it appears</p>
            <div className="flex flex-wrap gap-2">{AVATAR_POSITIONS.map((p) => <Button key={p} size="sm" variant={value.position === p ? "default" : "outline"} onClick={() => set({ position: p })} className="text-xs">{POSITION_LABEL[p]}</Button>)}</div>
          </div>
          <div className="space-y-2">
            <p className="flex justify-between text-sm font-medium">Size<span className="text-xs text-muted-foreground">{value.size}px</span></p>
            <Slider aria-label="Avatar size" min={AVATAR_MIN_SIZE} max={AVATAR_MAX_SIZE} step={8} value={[value.size]} onValueChange={([v]) => set({ size: v })} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Shape</p>
            <div className="flex flex-wrap gap-2">{AVATAR_SHAPES.map((sh) => <Button key={sh} size="sm" variant={value.shape === sh ? "default" : "outline"} onClick={() => set({ shape: sh })} className="text-xs">{SHAPE_LABEL[sh]}</Button>)}</div>
          </div>
        </>}
        {onVoiceChange && <div className="space-y-2"><p className="text-sm font-medium">Gemini Live voice</p><div className="grid grid-cols-2 gap-2">{VOICES.map(v => <Button key={v.id} variant={voice === v.id ? 'default' : 'outline'} className="h-auto flex-col items-start whitespace-normal p-3" onClick={() => onVoiceChange(v.id)} aria-pressed={voice === v.id}><span>{v.label}</span><span className="text-[11px]">{v.vibe}</span></Button>)}</div></div>}
      </div>

      <div className="min-w-0 space-y-3">
        <AvatarDevicePreview avatar={value} />
        {value.enabled && <><div className={previewing ? "" : "hidden"}><SimliAvatar ref={avatarRef} inline avatar={{ ...value, size: Math.min(value.size, 300) }} agentId={agentId} draft={Boolean(agentId)} faceOverride={adminPreview ? value.faceId : undefined} onLiveChange={(live) => { if (!live) setPreviewing(false); }} /></div>{(agentId || adminPreview) && <Button variant="outline" className="w-full" disabled={testing || preparing} onClick={() => void togglePreview()}>{previewing ? <><Square />Stop face preview</> : <><Play />Preview live face (silent)</>}</Button>}</>}
        {agentId && <><Button className="w-full" disabled={preparing} onClick={() => void testConversation()}>{preparing ? <Loader2 className="animate-spin"/> : testing ? <Square/> : <Mic/>}{preparing ? 'Saving your choices…' : testing ? 'Close test' : `Test ${name} · ${voice}`}</Button>{testing && <GeminiConversation draft agentId={agentId} compact name={name} previewVoice={voice} videoAvatar={value} avatarInline />}</>}
        <p className="text-[11px] text-muted-foreground">Test usage counts toward voice and video limits. Video plan pricing is not finalized.</p>
      </div>
      <Dialog open={confirmAspen} onOpenChange={setConfirmAspen}><DialogContent className="bg-card"><DialogTitle>Create Aspen in Simli?</DialogTitle><DialogDescription>This sends the optimized portrait to Simli and uses one avatar generation. Your current live face stays unchanged until the new face is ready and you explicitly apply it.</DialogDescription><Button disabled={uploading} onClick={() => void createAspenFace()}><UploadCloud />Create Aspen face</Button></DialogContent></Dialog>
    </div>
  );
}
