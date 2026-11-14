/**
 * Starve Simli's returned stream audio (volume-stream fix,
 * 2026-11-14): in local-first paired mode the presenter's voice is
 * the locally played Gemini chunk, so the audio Simli streams back
 * through LiveKit must never be audible AND should not stay live in
 * the page at all — a live RTC audio receiver is precisely the
 * footprint the Android audio policy classifies with the
 * voice-communication channel (see lib/pairedAudible.ts).
 *
 * simli-client does not expose its LiveKit Room (its transport
 * stores it as `connection.pc`), so — like disarmSimliClient in
 * SimliAvatar — this walks the internals defensively: every step is
 * feature-detected, every failure degrades one rung, and the caller
 * always keeps the element muted as the floor. Outcomes, best first:
 *  - 'unsubscribed': the audio publication's setSubscribed(false)
 *    landed — the SFU stops sending the track; no RTC audio
 *    receiver remains live in the page.
 *  - 'detached': no subscription control, but the remote track was
 *    detached from every element — nothing renders it.
 *  - 'muted-only': an audio track exists but neither control is
 *    reachable; the caller's element mute is the only guard.
 *  - 'unavailable': the internals could not be walked at all (SDK
 *    shape changed / no room yet). The element mute still stands.
 */

export type SimliStreamAudioOutcome =
  | "unsubscribed"
  | "detached"
  | "muted-only"
  | "unavailable";

export type SimliAudioTrackState = "live" | "muted" | "ended" | "absent";

interface PublicationLike {
  kind?: unknown;
  track?: TrackLike;
  setSubscribed?: unknown;
}
interface TrackLike {
  kind?: unknown;
  isMuted?: unknown;
  mediaStreamTrack?: { readyState?: unknown } | null;
  detach?: unknown;
}
interface ParticipantLike {
  trackPublications?: unknown;
}

const valuesOf = (collection: unknown): unknown[] => {
  try {
    if (!collection) return [];
    if (collection instanceof Map) return [...collection.values()];
    if (typeof collection === "object") return Object.values(collection as Record<string, unknown>);
    return [];
  } catch {
    return [];
  }
};

/** Every audio publication reachable from the client's Room. */
const audioPublications = (client: unknown): PublicationLike[] => {
  try {
    const connection = (client as { connection?: { pc?: unknown } } | null)?.connection;
    const room = connection?.pc as { remoteParticipants?: unknown } | undefined;
    if (!room) return [];
    const publications: PublicationLike[] = [];
    for (const participant of valuesOf(room.remoteParticipants)) {
      for (const publication of valuesOf((participant as ParticipantLike)?.trackPublications)) {
        const pub = publication as PublicationLike;
        if (pub?.kind === "audio" || pub?.track?.kind === "audio") publications.push(pub);
      }
    }
    return publications;
  } catch {
    return [];
  }
};

/**
 * Stop the returned audio from being received/rendered. Returns the
 * strongest outcome achieved across all audio publications (any one
 * still-live track means the footprint survives, so the WEAKEST
 * publication decides — except that no publications at all means
 * the walk failed, never success).
 */
export function starveSimliStreamAudio(client: unknown): SimliStreamAudioOutcome {
  try {
    const publications = audioPublications(client);
    if (publications.length === 0) return "unavailable";
    let weakest: SimliStreamAudioOutcome = "unsubscribed";
    for (const pub of publications) {
      if (typeof pub.setSubscribed === "function") {
        (pub.setSubscribed as (subscribed: boolean) => void).call(pub, false);
        continue; // strongest rung for this publication
      }
      const track = pub.track;
      if (track && typeof track.detach === "function") {
        (track.detach as () => unknown).call(track);
        if (weakest === "unsubscribed") weakest = "detached";
        continue;
      }
      weakest = "muted-only";
    }
    return weakest;
  } catch {
    return "unavailable";
  }
}

/** The state of the returned audio track, for playout telemetry:
 *  after a successful unsubscribe the publication's track is gone
 *  ('absent') — the proof in the session record that no RTC audio
 *  receiver stayed live. */
export function simliAudioTrackState(client: unknown): SimliAudioTrackState {
  try {
    const publications = audioPublications(client);
    if (publications.length === 0) return "absent";
    let state: SimliAudioTrackState = "absent";
    for (const pub of publications) {
      const track = pub.track;
      if (!track) continue;
      const ready = track.mediaStreamTrack?.readyState;
      if (ready === "ended") { if (state === "absent") state = "ended"; continue; }
      if (track.isMuted === true) { if (state === "absent" || state === "ended") state = "muted"; continue; }
      return "live";
    }
    return state;
  } catch {
    return "absent";
  }
}
