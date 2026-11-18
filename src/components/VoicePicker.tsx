import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Loader2, Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AGENT_LANGUAGES,
  EMPTY_VOICE_FILTERS,
  GEMINI_LIVE_VOICES,
  VOICE_MOODS,
  filterVoices,
  voiceAgeBand,
  voiceLanguageFit,
  type AgentLanguage,
  type LiveVoice,
  type VoiceFilters,
  type VoiceGender,
} from "@/lib/voiceCatalog";
import {
  voicePreviewPlayer,
  type VoicePreviewPlayer,
} from "@/lib/voicePreview";

/**
 * Shared voice-picker pieces (Ron, 2026-11-17): a per-card play/stop
 * preview, honest metadata tags, and filters — used by the AvatarSettings
 * grid (Video Avatars page, wizard face step) and the setup wizard's
 * voice step, so both pickers behave identically. Playback runs through
 * the one shared player (lib/voicePreview): starting any card stops the
 * preview already playing, and leaving the picker stops it too.
 */

const PlayerContext = createContext<VoicePreviewPlayer>(voicePreviewPlayer);

/** Provides the player to a picker subtree and stops playback when the
 *  picker unmounts (step change, tab switch, dialog close). */
export function VoicePreviewScope({
  player = voicePreviewPlayer,
  children,
}: {
  player?: VoicePreviewPlayer;
  children: ReactNode;
}) {
  useEffect(() => () => player.stop(), [player]);
  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}

function usePreviewState(player: VoicePreviewPlayer) {
  return useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
}

/**
 * The per-card play/stop button. It is rendered as a SIBLING of the
 * card's select button (absolutely positioned over the card's corner)
 * — never nested inside it — and stops propagation, so hearing a voice
 * never selects it.
 */
export function VoicePreviewButton({ voiceId }: { voiceId: string }) {
  const player = useContext(PlayerContext);
  const state = usePreviewState(player);
  const playing = state.playingId === voiceId;
  const loading = state.loadingId === voiceId;
  const error = state.errorId === voiceId;
  return (
    <button
      type="button"
      aria-label={playing ? `Stop ${voiceId} preview` : `Hear ${voiceId}`}
      title={error ? "Couldn't play that preview — tap to try again" : playing ? "Stop preview" : "Hear this voice"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void player.toggle(voiceId);
      }}
      className={`absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition ${
        playing
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-primary/40 bg-background/90 text-primary hover:bg-primary/10"
      }`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : playing ? (
        <Square className="h-3.5 w-3.5" />
      ) : (
        <Play className="ml-0.5 h-3.5 w-3.5" />
      )}
    </button>
  );
}

const LANGUAGE_TAG: Record<AgentLanguage, string> = {
  en: "English",
  es: "Spanish",
  "pt-BR": "Portuguese",
  "fr-CA": "French",
};

/** Honest per-voice tags: the age band only where the style word
 *  implies one, and the languages this voice is a curated pick for. */
export function VoiceMetaTags({ voice }: { voice: LiveVoice }) {
  const age = voiceAgeBand(voice);
  const fit = voiceLanguageFit(voice);
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {age && (
        <span className="rounded-full border border-border bg-muted/60 px-1.5 py-px text-[9px] font-medium leading-4 text-muted-foreground">
          {age}
        </span>
      )}
      {fit.map((lang) => (
        <span
          key={lang}
          className="rounded-full border border-border bg-muted/60 px-1.5 py-px text-[9px] font-medium leading-4 text-muted-foreground"
        >
          {LANGUAGE_TAG[lang]} pick
        </span>
      ))}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  // A native <select> on purpose: it keeps the picker light (the grid
  // mounts inside pages that are already heavy) and needs no popover
  // machinery. Styled with the same tokens as the page's other selects.
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="flex h-8 w-[148px] items-center justify-between rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The filter bar above a picker grid. Gender and mood narrow the list;
 * language is a fit-first sort (every voice can speak every language —
 * the curated picks for the chosen language simply come first).
 */
export function VoiceFilterBar({
  filters,
  onChange,
}: {
  filters: VoiceFilters;
  onChange: (f: VoiceFilters) => void;
}) {
  const dirty =
    filters.language !== "all" || filters.gender !== "all" || filters.mood !== "all";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect
          label="Language fit"
          value={filters.language}
          onValueChange={(v) =>
            onChange({ ...filters, language: v as VoiceFilters["language"] })
          }
          options={[
            { value: "all", label: "All languages" },
            ...AGENT_LANGUAGES.map((l) => ({ value: l.id, label: l.label })),
          ]}
        />
        <FilterSelect
          label="Gender"
          value={filters.gender}
          onValueChange={(v) =>
            onChange({ ...filters, gender: v as VoiceGender | "all" })
          }
          options={[
            { value: "all", label: "All" },
            { value: "Female", label: "Female" },
            { value: "Male", label: "Male" },
          ]}
        />
        <FilterSelect
          label="Mood"
          value={filters.mood}
          onValueChange={(v) => onChange({ ...filters, mood: v })}
          options={[
            { value: "all", label: "All moods" },
            ...VOICE_MOODS.map((m) => ({ value: m, label: m })),
          ]}
        />
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onChange(EMPTY_VOICE_FILTERS)}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Language fit puts the curated picks for that language first — every voice
        can speak every language.
      </p>
    </div>
  );
}

/**
 * The full-catalog picker grid with filters and per-card previews —
 * the AvatarSettings voice grid. Selection behavior is the caller's
 * onSelect, unchanged; the preview button never selects.
 */
export function VoicePickerGrid({
  selectedId,
  onSelect,
  player,
}: {
  /** The selected voice id, or null when a non-catalog choice (clone) is selected. */
  selectedId: string | null;
  onSelect: (voiceId: string) => void;
  player?: VoicePreviewPlayer;
}) {
  const [filters, setFilters] = useState<VoiceFilters>(EMPTY_VOICE_FILTERS);
  const voices = filterVoices(GEMINI_LIVE_VOICES, filters);
  return (
    <VoicePreviewScope player={player}>
      <div className="space-y-2">
        <VoiceFilterBar filters={filters} onChange={setFilters} />
        <div className="grid grid-cols-2 gap-2">
          {voices.map((v) => (
            <div key={v.id} className="relative">
              <Button
                variant={selectedId === v.id ? "default" : "outline"}
                className="h-auto w-full flex-col items-start whitespace-normal p-3 pr-9 text-left"
                onClick={() => onSelect(v.id)}
                aria-pressed={selectedId === v.id}
              >
                <span>{v.id}</span>
                <span className="text-[11px]">
                  {v.style} · {v.gender}
                </span>
                <VoiceMetaTags voice={v} />
              </Button>
              <VoicePreviewButton voiceId={v.id} />
            </div>
          ))}
          {voices.length === 0 && (
            <p className="col-span-2 text-xs text-muted-foreground">
              No voices match those filters.
            </p>
          )}
        </div>
      </div>
    </VoicePreviewScope>
  );
}
