import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic, Square, Volume2, Loader2, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Gemini TTS prebuilt voices — friendly subset first, then the rest
const VOICES = [
  { id: "Kore", label: "Kore — warm female (default)" },
  { id: "Aoede", label: "Aoede — bright female" },
  { id: "Leda", label: "Leda — soft female" },
  { id: "Callirrhoe", label: "Callirrhoe — calm female" },
  { id: "Despina", label: "Despina — lively female" },
  { id: "Zephyr", label: "Zephyr — upbeat female" },
  { id: "Puck", label: "Puck — friendly male" },
  { id: "Charon", label: "Charon — deep male" },
  { id: "Fenrir", label: "Fenrir — warm male" },
  { id: "Orus", label: "Orus — clear male" },
  { id: "Achernar", label: "Achernar — smooth male" },
  { id: "Algenib", label: "Algenib — gravelly male" },
];

type Turn = { role: "user" | "assistant"; text: string };

function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const value of chunk) {
      const sample = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, sample * (sample < 0 ? 32768 : 32767), true);
      offset += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}

const VoiceLab = () => {
  const [voice, setVoice] = useState("Kore");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("Pick a voice, then press the microphone and talk.");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<{
    stop: () => Promise<Blob>;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const playBase64 = useCallback((b64: string) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play().catch(() => setStatus("Tap the speaker to hear the reply."));
    }
  }, []);

  const startGreeting = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Aspen is saying hello…");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("gemini-voice-lab", {
        body: { action: "greeting", voice },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setTurns([{ role: "assistant", text: data.reply }]);
      playBase64(data.audioBase64);
      setStatus("Your turn — press the microphone and answer her.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("Could not start. Try again.");
    } finally {
      setBusy(false);
    }
  }, [voice, playBase64]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const node = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (event) =>
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      source.connect(node);
      node.connect(context.destination);
      let stopped = false;
      recorderRef.current = {
        async stop() {
          if (stopped) throw new Error("Already stopped");
          stopped = true;
          stream.getTracks().forEach((t) => t.stop());
          node.disconnect();
          source.disconnect();
          node.onaudioprocess = null;
          const blob = encodeWav(chunks, context.sampleRate);
          await context.close();
          if (blob.size < 2048) throw new Error("Recording was empty — try again");
          return blob;
        },
      };
      setRecording(true);
      setStatus("Listening… press the square button when you finish speaking.");
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone permission was denied — allow it in your browser and try again."
          : "Could not open the microphone."
      );
    }
  }, []);

  const stopAndSend = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (!recorder) return;
    setBusy(true);
    setStatus("Aspen is thinking…");
    try {
      const blob = await recorder.stop();
      const form = new FormData();
      form.append("file", new File([blob], "recording.wav", { type: "audio/wav" }));
      form.append("voice", voice);
      form.append(
        "history",
        JSON.stringify(turns.map((t) => ({ role: t.role, content: t.text })))
      );
      const { data, error: fnError } = await supabase.functions.invoke("gemini-voice-lab", {
        body: form,
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error && !data?.transcript) throw new Error(data.error);
      setTurns((prev) => [
        ...prev,
        { role: "user", text: data.transcript },
        { role: "assistant", text: data.reply },
      ]);
      playBase64(data.audioBase64);
      setStatus("Your turn — press the microphone to reply.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("That turn failed — try speaking again.");
    } finally {
      setBusy(false);
    }
  }, [turns, voice, playBase64]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-extrabold tracking-tight">
            Voice Lab — Gemini Aspen <span className="text-muted-foreground font-normal">(test only, Retell untouched)</span>
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground">Voice</label>
              <Select value={voice} onValueChange={setVoice} disabled={busy || recording}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={startGreeting} disabled={busy || recording} variant="secondary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              <span className="ml-2">Start / Restart conversation</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{status}</p>
          {error && <p className="text-xs text-destructive font-semibold">{error}</p>}
        </Card>

        <Card className="p-4 min-h-[300px] max-h-[50vh] overflow-y-auto space-y-3">
          {turns.length === 0 && (
            <p className="text-sm text-muted-foreground text-center pt-16">
              No conversation yet. Press “Start / Restart conversation”.
            </p>
          )}
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                  t.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {t.text}
              </span>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </Card>

        <div className="flex justify-center pb-8">
          {!recording ? (
            <Button
              size="lg"
              className="h-16 w-16 rounded-full"
              onClick={startRecording}
              disabled={busy}
            >
              <Mic className="h-6 w-6" />
            </Button>
          ) : (
            <Button
              size="lg"
              variant="destructive"
              className="h-16 w-16 rounded-full animate-pulse"
              onClick={stopAndSend}
            >
              <Square className="h-6 w-6" />
            </Button>
          )}
        </div>

        <audio ref={audioRef} className="hidden" />
      </main>
    </div>
  );
};

export default VoiceLab;
