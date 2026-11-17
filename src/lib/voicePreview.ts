/**
 * Per-card voice previews for the pickers (Ron, 2026-11-17): every
 * voice card gets its own play/stop button so a voice can be heard
 * from its card — the only preview before was a separate control
 * that played the SELECTED voice through a full test conversation.
 *
 * Synthesis REUSES the chat read-aloud path exactly: the
 * `chat-read-aloud` Edge function synthesizes one line in the
 * requested Gemini voice (allow-listed server-side) and returns a
 * WAV; the client fetches it and plays the blob. No second synthesis
 * route was built. The sample line is the SAME for every voice so
 * comparisons are fair.
 *
 * One shared player (module singleton): starting any card's preview
 * stops the one already playing — two voices can never overlap.
 * Samples are cached per voice in memory for the session, so
 * replaying a voice is instant and never re-bills the TTS call.
 * Playback stops when the owning picker unmounts (the React scope
 * in VoicePicker.tsx calls stop()).
 */

export const VOICE_PREVIEW_LINE =
  "Hello, and thank you for calling. I can answer questions, book appointments, and make sure every caller gets a friendly, helpful response.";

/** The slice of HTMLAudioElement the player drives — injectable for tests. */
export interface PreviewAudioElement {
  src: string;
  play(): Promise<void>;
  pause(): void;
  onended: (() => void) | null;
  onerror: (() => void) | null;
}

export interface VoicePreviewDeps {
  /** Fetch the synthesized sample for a voice; resolves to a playable URL. */
  fetchSampleUrl(voice: string): Promise<string>;
  createAudio(): PreviewAudioElement;
}

async function fetchReadAloudSample(voice: string): Promise<string> {
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-read-aloud`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
        Authorization: "Bearer " + publishableKey,
      },
      body: JSON.stringify({ text: VOICE_PREVIEW_LINE, voice }),
    },
  );
  if (!res.ok) throw new Error(`voice preview failed [${res.status}]`);
  return URL.createObjectURL(await res.blob());
}

export interface VoicePreviewState {
  playingId: string | null;
  loadingId: string | null;
  errorId: string | null;
}

const IDLE: VoicePreviewState = { playingId: null, loadingId: null, errorId: null };

export class VoicePreviewPlayer {
  private deps: VoicePreviewDeps;
  private cache = new Map<string, string>();
  private audio: PreviewAudioElement | null = null;
  /** Bumped on every stop/toggle so a stale in-flight fetch can never start. */
  private gen = 0;
  private state: VoicePreviewState = IDLE;
  private listeners = new Set<() => void>();

  constructor(deps?: Partial<VoicePreviewDeps>) {
    this.deps = {
      fetchSampleUrl: fetchReadAloudSample,
      createAudio: () => new Audio() as unknown as PreviewAudioElement,
      ...deps,
    };
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): VoicePreviewState => this.state;

  private setState(next: VoicePreviewState) {
    this.state = next;
    for (const fn of this.listeners) fn();
  }

  private ensureAudio(): PreviewAudioElement {
    if (!this.audio) {
      this.audio = this.deps.createAudio();
      this.audio.onended = () => {
        if (this.state.playingId) this.setState(IDLE);
      };
      this.audio.onerror = () => {
        if (this.state.playingId || this.state.loadingId) {
          this.setState({
            playingId: null,
            loadingId: null,
            errorId: this.state.playingId ?? this.state.loadingId,
          });
        }
      };
    }
    return this.audio;
  }

  /** Play this voice's sample, or stop it if it is playing/loading. */
  async toggle(voiceId: string): Promise<void> {
    if (this.state.playingId === voiceId || this.state.loadingId === voiceId) {
      this.stop();
      return;
    }
    this.stop();
    const gen = this.gen;
    this.setState({ playingId: null, loadingId: voiceId, errorId: null });
    let url = this.cache.get(voiceId);
    if (!url) {
      try {
        url = await this.deps.fetchSampleUrl(voiceId);
      } catch {
        if (gen === this.gen) {
          this.setState({ playingId: null, loadingId: null, errorId: voiceId });
        }
        return;
      }
      // Cache even when this play was superseded — the sample is paid for.
      this.cache.set(voiceId, url);
    }
    if (gen !== this.gen) return;
    const audio = this.ensureAudio();
    audio.src = url;
    try {
      await audio.play();
    } catch {
      if (gen === this.gen) {
        this.setState({ playingId: null, loadingId: null, errorId: voiceId });
      }
      return;
    }
    if (gen !== this.gen) return;
    this.setState({ playingId: voiceId, loadingId: null, errorId: null });
  }

  stop(): void {
    this.gen += 1;
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        /* already stopped */
      }
    }
    if (this.state.playingId || this.state.loadingId) {
      this.setState({ playingId: null, loadingId: null, errorId: this.state.errorId });
    }
  }
}

/** The one player every picker shares — that sharing IS the
 *  "starting one preview stops any other" guarantee. */
export const voicePreviewPlayer = new VoicePreviewPlayer();
