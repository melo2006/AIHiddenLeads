export type CaptureMode = "handsfree" | "hold";

export function shouldSendMicrophone(mode: CaptureMode, held: boolean, muted: boolean, replaying: boolean): boolean {
  return !muted && !replaying && (mode === "handsfree" || held);
}