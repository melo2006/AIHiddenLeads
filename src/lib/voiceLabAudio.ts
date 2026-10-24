export type CaptureMode = "handsfree" | "hold";
export type NoiseFilter = "light" | "balanced" | "strong";
export const noiseThresholds: Record<NoiseFilter, number> = { light: 0.004, balanced: 0.012, strong: 0.025 };
// Send silence (not dropped frames) below the gate so server speech-end detection keeps working.
export function microphoneGate(rms: number, filter: NoiseFilter, now: number, openUntil: number) {
  const next = rms >= noiseThresholds[filter] ? now + 450 : openUntil;
  return { open: now < next, openUntil: next };
}

// Some mobile audio drivers ignore the requested context rate. Send real 16 kHz PCM,
// not device-rate samples mislabeled as 16 kHz (which changes speech speed/pitch).
export function microphonePcm(input: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / 16000;
  const output = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let total = 0;
    for (let j = start; j < end; j++) total += input[j];
    const value = Math.max(-1, Math.min(1, total / (end - start)));
    output[i] = value < 0 ? value * 32768 : value * 32767;
  }
  return output;
}

export function shouldSendMicrophone(mode: CaptureMode, held: boolean, muted: boolean, replaying: boolean): boolean {
  return !muted && !replaying && (mode === "handsfree" || held);
}