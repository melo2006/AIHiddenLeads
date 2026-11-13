/**
 * Voice cloning (ElevenLabs Instant Voice Cloning) — shared copy, rules and
 * validation for the "Create your own voice" panel used by the setup wizard
 * and AvatarSettings. The clone itself is created by the `voice-clone-create`
 * edge function; this module never touches the network or any API key.
 */

export type ClonedVoiceStatus = "creating" | "ready" | "failed";

export interface ClonedVoice {
  id: string;
  name: string;
  status: ClonedVoiceStatus;
}

/** Instructions shown before recording (approved copy, 2026-11-13). */
export const VOICE_CLONE_INSTRUCTIONS = [
  "Find a quiet room — no TV, music, or other voices in the background.",
  "Hold the phone or microphone about an arm's length away; speak at your normal volume.",
  "Read the text exactly as written, in your natural speaking voice — don't act or whisper.",
  "One take of about a minute is perfect. You can listen back and re-record as many times as you like.",
] as const;

/** Reading script shown in the interface (approved copy, 2026-11-13). */
export const VOICE_CLONE_SCRIPT =
  "Hello, and thank you for calling. My name is your new virtual receptionist, and I'm here to " +
  "make sure you never miss an important call. Whether you're with a customer, on a job site, " +
  "or enjoying a quiet evening at home, I'll answer professionally every single time. I can " +
  "take a message, book an appointment, or connect the caller straight to you. From early " +
  "morning to late at night, seven days a week, your business always sounds open, friendly, " +
  "and ready to help. Questions? Just ask. I'd be delighted to show you what I can do — call " +
  "us today at eight seven seven, eight six two, four nine four nine, and let's get started.";

/** ElevenLabs needs a real sample: ~25s is the floor we accept client-side. */
export const MIN_CLONE_SECONDS = 25;
/** Recording auto-stops here; the script takes about a minute. */
export const MAX_RECORD_SECONDS = 120;
/** Transport + ElevenLabs per-file guidance: keep one sample at or under 10 MB. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export const CLONE_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
] as const;

export const CLONE_AUDIO_ACCEPT = "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/webm,.mp3,.wav,.m4a,.webm";

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

export function cloneAudioExtension(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType.split(";")[0].trim().toLowerCase()] || "mp3";
}

export function isCloneAudioType(file: { type: string; name: string }): boolean {
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  if ((CLONE_AUDIO_MIME_TYPES as readonly string[]).includes(mime)) return true;
  // Some browsers report an empty type for .m4a files; fall back to extension.
  return /\.(mp3|wav|m4a|webm)$/i.test(file.name || "");
}

/**
 * Friendly client-side validation for one clone sample. Returns an error
 * message to show the customer, or null when the sample is usable.
 * `durationSeconds` may be null when the browser could not measure it
 * (some WebM files report Infinity); then only size/type are checked.
 */
export function validateCloneSample(input: { size: number; durationSeconds: number | null }): string | null {
  if (!input.size) return "That recording is empty — please record or choose a file with your voice in it.";
  if (input.size > MAX_AUDIO_BYTES) return "That file is over 10 MB. A one-minute recording is plenty — please use a shorter sample.";
  if (input.durationSeconds != null && Number.isFinite(input.durationSeconds)) {
    if (input.durationSeconds < MIN_CLONE_SECONDS) {
      return `That sample is only ${Math.round(input.durationSeconds)} seconds. Please give us at least ${MIN_CLONE_SECONDS} seconds of speech — reading the full script takes about a minute.`;
    }
  }
  return null;
}

/** "0:07" / "1:05" timer label. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Measure an audio blob/file's duration in seconds via a throwaway <audio>
 * element. Resolves null when the browser cannot report a finite duration
 * (Chrome reports Infinity for some WebM recordings until seeked; we nudge
 * a seek and give up quietly rather than blocking the customer).
 */
export function measureAudioDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 4000);
    audio.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        window.clearTimeout(timer);
        done(audio.duration);
      } else {
        // Infinity-duration WebM: seek far ahead to force a real value.
        const onChange = () => {
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            window.clearTimeout(timer);
            audio.removeEventListener("durationchange", onChange);
            done(audio.duration);
          }
        };
        audio.addEventListener("durationchange", onChange);
        try { audio.currentTime = Number.MAX_SAFE_INTEGER; } catch { /* noop */ }
      }
    });
    audio.addEventListener("error", () => { window.clearTimeout(timer); done(null); });
    audio.preload = "metadata";
    audio.src = url;
  });
}
