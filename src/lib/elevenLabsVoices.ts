/**
 * ElevenLabs library voices on the client: the shaping/filter helpers
 * live in supabase/functions/_shared/elevenlabs-voices.ts (one source
 * for the edge function that fetches the library and the picker that
 * renders it) and are re-exported here for the app's import graph.
 * This module adds the one client-only piece: a preview player whose
 * samples are the ElevenLabs preview URLs themselves — no synthesis
 * call, nothing billed — driven through the same VoicePreviewPlayer
 * the Gemini picker uses, so starting one preview stops another.
 */
import { VoicePreviewPlayer } from "@/lib/voicePreview";

export {
  EMPTY_ELEVENLABS_FILTERS,
  elevenLabsCategoryLabel,
  elevenLabsFilterOptions,
  elevenLabsVoiceChips,
  filterElevenLabsVoices,
  shapeElevenLabsVoice,
  shapeElevenLabsVoiceList,
  type ElevenLabsVoice,
  type ElevenLabsVoiceFilters,
  type ElevenLabsVoiceLabels,
} from "../../supabase/functions/_shared/elevenlabs-voices";

/** A preview player bound to one fetched library list: toggle(voiceId)
 *  plays that voice's ElevenLabs preview_url (resolved from the list,
 *  never fetched again). Unknown ids reject into the player's error
 *  state, exactly like a failed Gemini sample fetch. */
export function createElevenLabsPreviewPlayer(
  voices: { id: string; previewUrl: string | null }[],
): VoicePreviewPlayer {
  const byId = new Map(voices.map((v) => [v.id, v.previewUrl]));
  return new VoicePreviewPlayer({
    fetchSampleUrl: async (voiceId: string) => {
      const url = byId.get(voiceId);
      if (!url) throw new Error(`no preview for voice ${voiceId}`);
      return url;
    },
  });
}
