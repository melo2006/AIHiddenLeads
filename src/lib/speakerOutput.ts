// Speaker-output selection for Aspen's audible voice (2026-11-09).
//
// Why this exists: in a moving-avatar (Simli) call the ONLY audible output
// is the Simli <audio> element, fed by a WebRTC/LiveKit stream. Android
// Chrome classifies that stream as voice-communication (call) audio while
// the microphone is live, so her voice can come out of the EARPIECE even
// though the same phone plays ordinary media through the loudspeaker.
// The voice-only path already plays through an HTMLAudioElement media
// sink (see mediaSink.ts), which the media channel governs.
//
// What the platform actually offers a web page:
//  - HTMLMediaElement.setSinkId(deviceId) — retargets ONE media element
//    to an enumerated "audiooutput" device. This is the only lever that
//    reaches both audible elements here (the Simli element and the local
//    media-sink element). Support is runtime-detected, never assumed:
//    legacy in-repo widgets (VoiceAgentWidget) excluded Android outright
//    because setSinkId cannot override Android's call-audio routing while
//    a mic capture is live — the call may succeed and Android may still
//    keep the call route. We therefore do NOT blanket-exclude Android
//    (desktop Chrome and newer Android builds do honour it for media
//    elements), but a selection is only reported applied when setSinkId
//    actually resolves, and the phone test remains the ground truth.
//  - AudioContext.setSinkId — newer Chrome only; it would govern the
//    ctx.destination fallback for local playback (and the paired path's
//    silent caption clock, gain 0). GeminiConversation applies the chosen
//    device there too when the method exists, as a best-effort extra.
//  - enumerateDevices() kind "audiooutput" — device labels are empty
//    strings until microphone permission has been granted, so callers
//    enumerate after the call's getUserMedia, never before.
//
// Classification is deliberately conservative (the legacy Retell widget
// defaulted every unknown label to "earpiece", inventing routes that may
// not exist): a label we cannot classify stays "unknown" and the menu
// shows the device's own label as-is. The two well-known pseudo devices
// are the only exceptions: "default" is the platform default output
// (offered as Loudspeaker when no explicit speaker is listed, matching
// the legacy widgets' fallback) and "communications" is the active call
// route on Windows/ChromeOS (offered as Phone earpiece).
//
// NOTHING in this module persists a choice. The output route is
// session-scoped state in GeminiConversation: a persisted audio setting
// is exactly what caused the 2026-11-09 hold-to-talk incident, and this
// feature must not create the speaker-side equivalent.

export type SpeakerOutputKind = "speaker" | "earpiece" | "bluetooth" | "headset" | "unknown";

export interface SpeakerOutputDevice {
  deviceId: string;
  /** The device's own label (may be "" before mic permission). */
  label: string;
  kind: SpeakerOutputKind;
}

/** Minimal structural shape so tests can pass plain objects. */
export interface AudioOutputLike {
  deviceId: string;
  kind: string;
  label?: string;
}

export function classifySpeakerOutputLabel(label: string): SpeakerOutputKind {
  const l = (label || "").toLowerCase();
  if (/bluetooth|airpod|beats|pixel buds|galaxy buds|\bbuds\b|wireless/.test(l)) return "bluetooth";
  if (/headset|headphone|earbud|in-ear|over-ear/.test(l)) return "headset";
  if (/earpiece|handset|receiver/.test(l)) return "earpiece";
  if (/speaker|loudspeaker|speakerphone|built.?in speaker|external speaker/.test(l)) return "speaker";
  return "unknown";
}

export function toSpeakerOutputDevices(devices: readonly AudioOutputLike[]): SpeakerOutputDevice[] {
  const seen = new Set<string>();
  const out: SpeakerOutputDevice[] = [];
  for (const device of devices) {
    if (device.kind !== "audiooutput" || !device.deviceId || seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    out.push({ deviceId: device.deviceId, label: (device.label || "").trim(), kind: classifySpeakerOutputLabel(device.label || "") });
  }
  return out;
}

/** Runtime feature detection: can a media element be retargeted at all? */
export function mediaSetSinkIdSupported(): boolean {
  return (
    typeof HTMLMediaElement !== "undefined" &&
    typeof (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId === "function"
  );
}

export function audioContextSetSinkIdSupported(ctx: unknown): boolean {
  return !!ctx && typeof (ctx as { setSinkId?: unknown }).setSinkId === "function";
}

type SinkElement = { setSinkId?: (deviceId: string) => Promise<void> };

/**
 * Apply a sink selection to one media element. Returns true only when the
 * element exposes setSinkId AND the call resolves — a rejection (device
 * unplugged, unsupported sink) is a honest false, never a silent success.
 * deviceId "" resets the element to the platform default output.
 */
export async function applySinkIdToElement(element: SinkElement | null | undefined, deviceId: string): Promise<boolean> {
  if (!element || typeof element.setSinkId !== "function") return false;
  try {
    await element.setSinkId(deviceId);
    return true;
  } catch {
    return false;
  }
}

export async function listSpeakerOutputs(): Promise<{ devices: SpeakerOutputDevice[]; canSelect: boolean }> {
  const canSelect = mediaSetSinkIdSupported();
  try {
    const all = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
    return { devices: toSpeakerOutputDevices(all), canSelect };
  } catch {
    return { devices: [], canSelect };
  }
}

/**
 * Session-start default (owner's rule, 2026-11-09): Bluetooth when a
 * Bluetooth/headset output is present, otherwise the loudspeaker —
 * "phone-normal" behaviour. Returns null when no selectable device can
 * be identified, in which case the session keeps the platform route.
 */
export function pickDefaultSpeakerOutput(devices: readonly SpeakerOutputDevice[]): SpeakerOutputDevice | null {
  return (
    devices.find((d) => d.kind === "bluetooth" || d.kind === "headset") ??
    devices.find((d) => d.kind === "speaker") ??
    devices.find((d) => d.deviceId === "default") ??
    null
  );
}

export type SpeakerMenuSynthetic = "loudspeaker" | "earpiece" | "platform" | "mute" | "bluetoothFallback";

export interface SpeakerMenuOption {
  id: string;
  /** Set for real device options; undefined for the platform/mute rows. */
  deviceId?: string;
  kind: SpeakerOutputKind | "platform" | "mute";
  /** Synthetic rows are translated by the component; raw device labels are shown as-is. */
  synthetic?: SpeakerMenuSynthetic;
  /** The device's own label, for unknown / Bluetooth / headset rows. */
  rawLabel?: string;
  selected: boolean;
}

/**
 * Build the speaker menu rows. With selectable devices, every enumerated
 * output appears exactly once: the identified speaker is "Loudspeaker",
 * the identified earpiece (or the "communications" pseudo device) is
 * "Phone earpiece", Bluetooth/headset devices keep their own labels, and
 * unknown devices are listed by their own label — never renamed into a
 * route they may not be. Without selectable outputs the menu is honest:
 * the current platform route ("Phone default (video sound)") plus Mute.
 * Mute is always the last row; the component renders the separator.
 */
export function buildSpeakerMenuOptions(input: {
  devices: readonly SpeakerOutputDevice[];
  canSelect: boolean;
  selectedDeviceId: string | null;
  muted: boolean;
}): SpeakerMenuOption[] {
  const { devices, canSelect, selectedDeviceId, muted } = input;
  const options: SpeakerMenuOption[] = [];
  if (canSelect && devices.length > 0) {
    const speakerId = devices.find((d) => d.kind === "speaker")?.deviceId ?? devices.find((d) => d.deviceId === "default")?.deviceId;
    const earpieceId = devices.find((d) => d.kind === "earpiece")?.deviceId ?? devices.find((d) => d.deviceId === "communications")?.deviceId;
    for (const device of devices) {
      const selected = !muted && selectedDeviceId === device.deviceId;
      if (device.deviceId === speakerId) {
        options.push({ id: `device:${device.deviceId}`, deviceId: device.deviceId, kind: "speaker", synthetic: "loudspeaker", selected });
      } else if (device.deviceId === earpieceId) {
        options.push({ id: `device:${device.deviceId}`, deviceId: device.deviceId, kind: "earpiece", synthetic: "earpiece", selected });
      } else if (device.kind === "bluetooth" || device.kind === "headset") {
        options.push({
          id: `device:${device.deviceId}`,
          deviceId: device.deviceId,
          kind: device.kind,
          rawLabel: device.label || undefined,
          synthetic: device.label ? undefined : "bluetoothFallback",
          selected,
        });
      } else {
        options.push({ id: `device:${device.deviceId}`, deviceId: device.deviceId, kind: device.kind, rawLabel: device.label || undefined, selected });
      }
    }
  } else {
    options.push({ id: "platform", kind: "platform", synthetic: "platform", selected: !muted && selectedDeviceId === null });
  }
  options.push({ id: "mute", kind: "mute", synthetic: "mute", selected: muted });
  return options;
}
