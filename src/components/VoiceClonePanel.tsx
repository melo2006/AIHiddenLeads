import { useEffect, useRef, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { AudioLines, Check, Loader2, Mic, Play, RotateCcw, Square, UploadCloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CLONE_AUDIO_ACCEPT, MAX_RECORD_SECONDS, VOICE_CLONE_INSTRUCTIONS, VOICE_CLONE_SCRIPT,
  formatClock, isCloneAudioType, measureAudioDuration, validateCloneSample,
  type ClonedVoice,
} from "@/lib/voiceClone";

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("voice-clone-create", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : error.message);
  }
  return data;
}

interface Props {
  /** Agent whose record holds the clone. Without one the panel explains itself and stays inert. */
  agentId?: string;
  /** Controlled picker selection: true when "Your voice (cloned)" is the chosen voice. */
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  /** Admin (on-behalf) mode: shows the stored ElevenLabs voice ID with paste-to-attach and remove controls. */
  adminMode?: boolean;
}

type Sample = { blob: Blob; url: string; durationSeconds: number | null };

/**
 * "Create your own voice" — record the approved script in the browser (or
 * upload audio), send it to the voice-clone-create edge function, and show
 * the stored clone in the voice picker. Part of the $50 custom add-on
 * (photo avatar + voice clone together).
 */
export default function VoiceClonePanel({ agentId, selected = false, onSelectChange, adminMode = false }: Props) {
  const [loading, setLoading] = useState(Boolean(agentId));
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [serverAdmin, setServerAdmin] = useState(false);
  const [idInput, setIdInput] = useState("");
  const [idName, setIdName] = useState("");
  const [idBusy, setIdBusy] = useState(false);
  const [clone, setClone] = useState<ClonedVoice | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [voiceName, setVoiceName] = useState("My voice");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sample, setSample] = useState<Sample | null>(null);
  const [problem, setProblem] = useState("");
  const [creating, setCreating] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const audioFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!agentId) { setLoading(false); setUnlocked(null); setClone(null); return; }
    let live = true;
    setLoading(true);
    void call({ action: "get", agentId })
      .then((d) => {
        if (!live) return;
        setUnlocked(Boolean(d.unlocked));
        setServerAdmin(Boolean(d.admin));
        setClone(d.clonedVoice && d.clonedVoice.id ? d.clonedVoice as ClonedVoice : null);
        if (d.clonedVoice?.name) setVoiceName(String(d.clonedVoice.name));
      })
      .catch(() => { if (live) { setUnlocked(false); setClone(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [agentId]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function clearSample() {
    setSample((s) => { if (s) URL.revokeObjectURL(s.url); return null; });
    setProblem("");
  }

  async function startRecording() {
    setProblem("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) => window.MediaRecorder?.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const seconds = Math.max(0, Math.round((Date.now() - startedRef.current) / 1000));
        const error = validateCloneSample({ size: blob.size, durationSeconds: seconds });
        if (error) { setProblem(error); return; }
        clearSample();
        setSample({ blob, url: URL.createObjectURL(blob), durationSeconds: seconds });
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      recorder.start();
      timerRef.current = window.setInterval(() => {
        const s = Math.round((Date.now() - startedRef.current) / 1000);
        setElapsed(s);
        if (s >= MAX_RECORD_SECONDS) recorder.stop();
      }, 250);
    } catch {
      setProblem("We could not reach your microphone. Check the browser's microphone permission, or upload an audio file instead.");
    }
  }

  function stopRecording() { recorderRef.current?.stop(); }

  async function pickAudioFile(file?: File) {
    if (!file) return;
    setProblem("");
    if (!isCloneAudioType(file)) { setProblem("Please choose an MP3, WAV, M4A or WebM audio file."); return; }
    if (file.size > 10 * 1024 * 1024) { setProblem("That file is over 10 MB. A one-minute recording is plenty — please use a shorter sample."); return; }
    const duration = await measureAudioDuration(file);
    const error = validateCloneSample({ size: file.size, durationSeconds: duration });
    if (error) { setProblem(error); return; }
    clearSample();
    setSample({ blob: file, url: URL.createObjectURL(file), durationSeconds: duration });
    if (audioFileRef.current) audioFileRef.current.value = "";
  }

  async function createClone() {
    if (!agentId || !sample) return;
    setCreating(true);
    setProblem("");
    setClone((c) => ({ id: c?.id || "", name: voiceName || "My voice", status: "creating" }));
    try {
      const buf = new Uint8Array(await sample.blob.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const d = await call({ action: "create", agentId, name: (voiceName || "My voice").slice(0, 80), audioBase64: btoa(bin), mimeType: (sample.blob.type || "audio/mpeg").split(";")[0] });
      setClone(d.clonedVoice as ClonedVoice);
      setReplacing(false);
      clearSample();
      onSelectChange?.(true);
      toast.success("Your cloned voice is ready");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Voice cloning failed";
      setProblem(message);
      setClone((c) => c ? { ...c, status: "failed" } : { id: "", name: voiceName || "My voice", status: "failed" });
    } finally { setCreating(false); }
  }

  const isAdmin = adminMode || serverAdmin;

  async function attachId() {
    if (!agentId || !idInput.trim()) return;
    setIdBusy(true); setProblem("");
    try {
      const d = await call({ action: "setId", agentId, voiceId: idInput.trim(), ...(idName.trim() ? { name: idName.trim() } : {}) });
      setClone(d.clonedVoice as ClonedVoice);
      setIdInput("");
      toast.success("Cloned voice ID attached");
    } catch (e) { setProblem(e instanceof Error ? e.message : "Could not attach that voice ID"); }
    finally { setIdBusy(false); }
  }

  async function removeClone() {
    if (!agentId) return;
    setIdBusy(true); setProblem("");
    try {
      await call({ action: "remove", agentId });
      setClone(null);
      onSelectChange?.(false);
      toast.success("Cloned voice removed");
    } catch (e) { setProblem(e instanceof Error ? e.message : "Could not remove the cloned voice"); }
    finally { setIdBusy(false); }
  }

  const showCreator = unlocked && (!clone || clone.status !== "ready" || replacing);

  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><AudioLines className="h-4 w-4 text-primary" />Create your own voice</p>
      <p className="text-[11px] text-muted-foreground">
        Read one short script aloud and your assistant can speak in <strong>your own voice</strong>. Voice cloning is included in the
        <strong> $50 one-time custom add-on</strong> — the same add-on that covers a custom face from your photo.
      </p>

      {!agentId && <p role="status" className="rounded-md border border-border bg-muted p-2 text-[11px] text-muted-foreground">Your assistant needs to exist before it can hold a cloned voice — finish the business step first, then come back here.</p>}
      {loading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking your cloned voice…</p>}

      {agentId && !loading && unlocked === false && (
        <p role="status" className="rounded-md border border-border bg-muted p-2 text-[11px] text-muted-foreground">
          Locked: add the $50 custom avatar + voice option at checkout to unlock voice cloning and photo upload, or contact support at info@aihiddenleads.com.{" "}
          <a className="font-semibold text-primary underline" href="/checkout?addon=custom-avatar">Buy custom avatar + voice ($50)</a>
        </p>
      )}

      {clone?.status === "ready" && (
        <button type="button" aria-pressed={selected} onClick={() => onSelectChange?.(!selected)}
          className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition ${selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
          <Mic className={`h-4 w-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Your voice (cloned)</span>
            <span className="block truncate text-[11px] text-muted-foreground">{clone.name} · Ready</span>
          </span>
          {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
        </button>
      )}
      {clone?.status === "failed" && !showCreator && (
        <p role="status" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">The last clone attempt failed. Record in a quieter spot and try again below.</p>
      )}
      {clone?.status === "ready" && !replacing && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setReplacing(true)}><RotateCcw className="mr-1 h-3.5 w-3.5" />Record a new clone</Button>
      )}

      {isAdmin && agentId && !loading && (
        <div className="space-y-2 rounded-lg border border-border p-2">
          <p className="text-xs font-semibold">Admin · cloned voice ID</p>
          {isAdmin && <p className="text-[11px] text-muted-foreground">Admin mode: no add-on gate — creating or attaching a clone here is done on the client's behalf.</p>}
          {clone?.id
            ? <p className="break-all text-[11px] text-muted-foreground">ElevenLabs voice ID: <span className="font-mono">{clone.id}</span> · status: {clone.status}</p>
            : <p className="text-[11px] text-muted-foreground">No cloned voice stored for this agent yet.</p>}
          <div className="flex flex-wrap gap-2">
            <Input aria-label="ElevenLabs voice ID" className="h-8 min-w-40 flex-1 text-xs" placeholder="Paste ElevenLabs voice ID" value={idInput} onChange={(e) => setIdInput(e.target.value)} />
            <Input aria-label="Cloned voice name" className="h-8 w-32 text-xs" placeholder="Name" value={idName} onChange={(e) => setIdName(e.target.value)} />
            <Button size="sm" className="h-8 text-xs" disabled={idBusy || !idInput.trim()} onClick={() => void attachId()}>Attach ID</Button>
            {clone && <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={idBusy} onClick={() => void removeClone()}>Remove clone</Button>}
          </div>
        </div>
      )}

      {showCreator && (
        <div className="space-y-3">
          <div className="rounded-lg bg-muted p-3">
            <p className="mb-1.5 text-xs font-semibold">Before you record</p>
            <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
              {VOICE_CLONE_INSTRUCTIONS.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold">Read this aloud</p>
            <p className="rounded-lg border border-border bg-card p-3 text-base leading-relaxed sm:text-lg">{VOICE_CLONE_SCRIPT}</p>
          </div>
          <label className="block space-y-1 text-sm font-medium">Voice name
            <Input aria-label="Voice name" maxLength={80} value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="My voice" />
          </label>

          {!sample && !recording && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void startRecording()}><Mic className="mr-2 h-4 w-4" />Record</Button>
              <input ref={audioFileRef} type="file" accept={CLONE_AUDIO_ACCEPT} className="hidden" onChange={(e) => void pickAudioFile(e.target.files?.[0])} />
              <Button variant="outline" onClick={() => audioFileRef.current?.click()}><UploadCloud className="mr-2 h-4 w-4" />Upload audio</Button>
            </div>
          )}
          {recording && (
            <div className="flex items-center gap-3">
              <Button variant="destructive" onClick={stopRecording}><Square className="mr-2 h-4 w-4" />Stop</Button>
              <span role="timer" aria-label="Recording time" className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />{formatClock(elapsed)}
              </span>
              <span className="text-[11px] text-muted-foreground">Keep reading — about a minute is perfect.</span>
            </div>
          )}
          {sample && !recording && (
            <div className="space-y-2 rounded-lg border border-border p-2">
              <p className="flex items-center gap-1.5 text-xs font-medium"><Play className="h-3.5 w-3.5 text-primary" />Listen back{sample.durationSeconds != null ? ` · ${formatClock(sample.durationSeconds)}` : ""}</p>
              <audio controls src={sample.url} className="w-full" />
              <div className="flex flex-wrap gap-2">
                <Button disabled={creating} onClick={() => void createClone()}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AudioLines className="mr-2 h-4 w-4" />}{creating ? "Creating your voice…" : "Create my voice"}</Button>
                <Button variant="ghost" disabled={creating} onClick={clearSample}><RotateCcw className="mr-1 h-4 w-4" />Start over</Button>
              </div>
            </div>
          )}
          {clone?.status === "creating" && <p role="status" className="flex items-center gap-2 text-xs text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating your cloned voice…</p>}
          {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
        </div>
      )}
    </div>
  );
}
