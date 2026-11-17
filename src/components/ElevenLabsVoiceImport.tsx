import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Check, Library, Loader2, Play, RotateCcw, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EMPTY_ELEVENLABS_FILTERS,
  createElevenLabsPreviewPlayer,
  elevenLabsCategoryLabel,
  elevenLabsFilterOptions,
  elevenLabsVoiceChips,
  filterElevenLabsVoices,
  type ElevenLabsVoice,
  type ElevenLabsVoiceFilters,
} from "@/lib/elevenLabsVoices";
import type { VoicePreviewPlayer } from "@/lib/voicePreview";
import type { ClonedVoice } from "@/lib/voiceClone";

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("voice-clone-create", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : error.message);
  }
  return data;
}

interface Props {
  agentId: string;
  /** The voice id currently stored on the agent (cloned_voice_id), if any. */
  attachedVoiceId: string | null;
  /** Fired after a successful attach so the owning panel refreshes its clone state. */
  onAttached: (clone: ClonedVoice) => void;
}

/** Per-row play/stop for the ElevenLabs preview URL, driven by the one
 *  player the import list shares — starting a preview stops the previous
 *  one, exactly like the Gemini voice cards. A sibling of the row's
 *  attach button, never nested inside it. */
function PreviewButton({ player, voice }: { player: VoicePreviewPlayer; voice: ElevenLabsVoice }) {
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const playing = state.playingId === voice.id;
  const loading = state.loadingId === voice.id;
  const error = state.errorId === voice.id;
  if (!voice.previewUrl) return null;
  return (
    <button
      type="button"
      aria-label={playing ? `Stop ${voice.name} preview` : `Hear ${voice.name}`}
      title={error ? "Couldn't play that preview — tap to try again" : playing ? "Stop preview" : "Hear this voice"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void player.toggle(voice.id);
      }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm transition ${
        playing
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-primary/40 bg-background/90 text-primary hover:bg-primary/10"
      }`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing ? <Square className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
    </button>
  );
}

function FilterSelect({
  label, value, onValueChange, options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="flex h-8 w-[132px] items-center justify-between rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * "Import from ElevenLabs" (Ron, 2026-11-17): the account's ElevenLabs
 * library — the owner's own clones (including any recorded directly in
 * ElevenLabs) plus premade/generated voices — with every attribute the
 * API provides as chips and filters, a per-voice preview, and one-tap
 * attach. Attaching writes the voice into the SAME cloned_voice_id the
 * record-here flow uses (server-validated against the library), so the
 * rest of the product treats an imported voice exactly like a clone
 * created in this panel.
 */
export default function ElevenLabsVoiceImport({ agentId, attachedVoiceId, onAttached }: Props) {
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [problem, setProblem] = useState("");
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [filters, setFilters] = useState<ElevenLabsVoiceFilters>(EMPTY_ELEVENLABS_FILTERS);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const player = useMemo(() => createElevenLabsPreviewPlayer(voices), [voices]);
  useEffect(() => () => player.stop(), [player]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setProblem("");
    void call({ action: "listVoices", agentId })
      .then((d) => {
        if (!live) return;
        if (d.unlocked === false) { setLocked(true); setVoices([]); return; }
        setLocked(false);
        setVoices(Array.isArray(d.voices) ? (d.voices as ElevenLabsVoice[]) : []);
      })
      .catch((e) => { if (live) setProblem(e instanceof Error ? e.message : "Could not load the ElevenLabs library"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [agentId]);

  const options = useMemo(() => elevenLabsFilterOptions(voices), [voices]);
  const visible = useMemo(() => filterElevenLabsVoices(voices, filters), [voices, filters]);
  const dirty = filters.query !== "" || filters.category !== "all" || filters.gender !== "all" || filters.age !== "all" || filters.accent !== "all";

  async function attach(voice: ElevenLabsVoice) {
    setAttachingId(voice.id);
    setProblem("");
    try {
      const d = await call({ action: "importVoice", agentId, voiceId: voice.id });
      const clone = d.clonedVoice as ClonedVoice;
      onAttached(clone);
      toast.success(`“${clone.name}” is now this assistant's cloned voice`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not attach that voice");
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><Library className="h-4 w-4 text-primary" />Import from ElevenLabs</p>
      <p className="text-[11px] text-muted-foreground">
        Already have a voice in ElevenLabs — one you cloned there, or a library voice you like? Pick it here and it becomes
        this assistant's cloned voice, the same as recording one above. Your own clones are listed first.
      </p>

      {loading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading the ElevenLabs library…</p>}
      {!loading && locked && (
        <p role="status" className="rounded-md border border-border bg-muted p-2 text-[11px] text-muted-foreground">
          Locked: importing a library voice is part of the same $50 custom avatar + voice add-on as recording a clone.
        </p>
      )}
      {!loading && !locked && voices.length === 0 && !problem && (
        <p role="status" className="text-[11px] text-muted-foreground">No voices came back from the ElevenLabs library yet.</p>
      )}

      {!loading && !locked && voices.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-40 flex-1 space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Search</span>
              <Input
                aria-label="Search ElevenLabs voices"
                className="h-8 text-xs"
                placeholder="Name, accent, style…"
                value={filters.query}
                onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              />
            </label>
            <FilterSelect label="Type" value={filters.category} onValueChange={(v) => setFilters({ ...filters, category: v })}
              options={[{ value: "all", label: "All types" }, ...options.categories.map((c) => ({ value: c, label: elevenLabsCategoryLabel(c) }))]} />
            <FilterSelect label="Gender" value={filters.gender} onValueChange={(v) => setFilters({ ...filters, gender: v })}
              options={[{ value: "all", label: "All" }, ...options.genders.map((g) => ({ value: g, label: g }))]} />
            <FilterSelect label="Age" value={filters.age} onValueChange={(v) => setFilters({ ...filters, age: v })}
              options={[{ value: "all", label: "All ages" }, ...options.ages.map((a) => ({ value: a, label: a }))]} />
            <FilterSelect label="Accent" value={filters.accent} onValueChange={(v) => setFilters({ ...filters, accent: v })}
              options={[{ value: "all", label: "All accents" }, ...options.accents.map((a) => ({ value: a, label: a }))]} />
            {dirty && (
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilters(EMPTY_ELEVENLABS_FILTERS)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />Reset
              </Button>
            )}
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {visible.map((voice) => {
              const attached = attachedVoiceId === voice.id;
              const chips = elevenLabsVoiceChips(voice);
              return (
                <div key={voice.id} className={`flex items-start gap-2 rounded-xl border-2 p-3 ${attached ? "border-primary bg-primary/10" : "border-border"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{voice.name}</span>
                      <span className="rounded-full border border-border bg-muted/60 px-1.5 py-px text-[9px] font-medium leading-4 text-muted-foreground">
                        {elevenLabsCategoryLabel(voice.category)}
                      </span>
                      {attached && <span className="flex items-center gap-0.5 text-[11px] font-medium text-primary"><Check className="h-3 w-3" />Attached</span>}
                    </p>
                    {chips.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {chips.map((chip) => (
                          <span key={chip} className="rounded-full border border-border bg-muted/60 px-1.5 py-px text-[9px] font-medium leading-4 text-muted-foreground">{chip}</span>
                        ))}
                      </span>
                    )}
                  </div>
                  <PreviewButton player={player} voice={voice} />
                  <Button
                    type="button"
                    size="sm"
                    variant={attached ? "ghost" : "outline"}
                    className="h-7 shrink-0 text-xs"
                    disabled={attached || attachingId !== null}
                    onClick={() => void attach(voice)}
                  >
                    {attachingId === voice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : attached ? "In use" : "Use this voice"}
                  </Button>
                </div>
              );
            })}
            {visible.length === 0 && <p className="text-xs text-muted-foreground">No voices match those filters.</p>}
          </div>
        </div>
      )}
      {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
    </div>
  );
}
