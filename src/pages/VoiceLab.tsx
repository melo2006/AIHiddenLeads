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
import { Mic, MicOff, Volume2, Loader2, FlaskConical, PhoneOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
type Phase = "idle" | "listening" | "thinking" | "speaking";

// Voice-activity tuning
const SPEECH_THRESHOLD = 0.015; // RMS level that counts as speech
const SILENCE_MS = 1400; // pause this long -> turn is over
const MIN_SPEECH_MS = 500; // ignore blips shorter than this

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("Pick a voice and press Start — then just talk naturally.");
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const turnsRef = useRef<Turn[]>([]);
  const voiceRef = useRef(voice);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Turn capture state (refs — updated inside audio callback)
  const chunksRef = useRef<Float32Array[]>([]);
  const speechStartedRef = useRef(false);
  const speechMsRef = useRef(0);
  const silenceMsRef = useRef(0);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);
  useEffect(() => {
    turnsRef.current = turns;
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const stopEverything = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setPhaseBoth("idle");
    setStatus("Conversation ended. Press Start to begin again.");
  }, [setPhaseBoth]);

  const sendTurn = useCallback(
    async (wav: Blob) => {
      setPhaseBoth("thinking");
      setStatus("Aspen is thinking…");
      try {
        const form = new FormData();
        form.append("file", new File([wav], "recording.wav", { type: "audio/wav" }));
        form.append("voice", voiceRef.current);
        form.append(
          "history",
          JSON.stringify(turnsRef.current.map((t) => ({ role: t.role, content: t.text })))
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

        // Play the reply, then go back to listening
        if (phaseRef.current === "idle") return; // user hung up mid-request
        setPhaseBoth("speaking");
        setStatus("Aspen is speaking…");
        const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
        const el = audioRef.current;
        if (el) {
          el.src = url;
          el.onended = () => {
            URL.revokeObjectURL(url);
            if (phaseRef.current === "speaking") {
              setPhaseBoth("listening");
              setStatus("Listening — just talk.");
            }
          };
          await el.play().catch(() => {
            if (phaseRef.current === "speaking") {
              setPhaseBoth("listening");
              setStatus("Listening — just talk.");
            }
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        if (phaseRef.current !== "idle") {
          setPhaseBoth("listening");
          setStatus("That turn failed — try speaking again.");
        }
      }
    },
    [setPhaseBoth]
  );

  // Continuous listening with voice-activity detection
  const startListening = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;
    const context = new AudioContext();
    await context.resume();
    audioCtxRef.current = context;
    const source = context.createMediaStreamSource(stream);
    const node = context.createScriptProcessor(4096, 1, 1);

    chunksRef.current = [];
    speechStartedRef.current = false;
    speechMsRef.current = 0;
    silenceMsRef.current = 0;

    node.onaudioprocess = (event) => {
      // Only capture while in the listening phase
      if (phaseRef.current !== "listening") return;
      const input = event.inputBuffer.getChannelData(0);
      const chunk = new Float32Array(input);

      // RMS volume of this chunk
      let sum = 0;
      for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
      const rms = Math.sqrt(sum / chunk.length);
      const chunkMs = (chunk.length / context.sampleRate) * 1000;

      if (rms > SPEECH_THRESHOLD) {
        speechStartedRef.current = true;
        speechMsRef.current += chunkMs;
        silenceMsRef.current = 0;
        chunksRef.current.push(chunk);
      } else if (speechStartedRef.current) {
        silenceMsRef.current += chunkMs;
        chunksRef.current.push(chunk); // keep a little of the tail
        if (silenceMsRef.current >= SILENCE_MS) {
          const speechMs = speechMsRef.current;
          const captured = chunksRef.current;
          // Reset for the next turn
          chunksRef.current = [];
          speechStartedRef.current = false;
          speechMsRef.current = 0;
          silenceMsRef.current = 0;
          if (speechMs >= MIN_SPEECH_MS) {
            const wav = encodeWav(captured, context.sampleRate);
            if (wav.size >= 2048) void sendTurn(wav);
          }
        }
      }
    };

    source.connect(node);
    node.connect(context.destination);
  }, [sendTurn]);

  const startConversation = useCallback(async () => {
    setError(null);
    setTurns([]);
    setPhaseBoth("thinking");
    setStatus("Aspen is saying hello…");
    try {
      await startListening();
      const { data, error: fnError } = await supabase.functions.invoke("gemini-voice-lab", {
        body: { action: "greeting", voice: voiceRef.current },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setTurns([{ role: "assistant", text: data.reply }]);

      setPhaseBoth("speaking");
      setStatus("Aspen is speaking…");
      const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      const el = audioRef.current;
      if (el) {
        el.src = url;
        el.onended = () => {
          URL.revokeObjectURL(url);
          if (phaseRef.current === "speaking") {
            setPhaseBoth("listening");
            setStatus("Listening — just talk.");
          }
        };
        await el.play().catch(() => {
          setPhaseBoth("listening");
          setStatus("Listening — just talk.");
        });
      }
    } catch (e) {
      stopEverything();
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone permission was denied — allow it in your browser and try again."
          : e instanceof Error
            ? e.message
            : "Could not start. Try again."
      );
    }
  }, [startListening, setPhaseBoth, stopEverything]);

  // Cleanup on unmount
  useEffect(() => stopEverything, [stopEverything]);

  const phaseLabel: Record<Phase, string> = {
    idle: "Not started",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-extrabold tracking-tight">
            Voice Lab — Gemini Aspen{" "}
            <span className="text-muted-foreground font-normal">(hands-free test)</span>
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground">Voice</label>
              <Select value={voice} onValueChange={setVoice} disabled={phase !== "idle"}>
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
            {phase === "idle" ? (
              <Button onClick={startConversation} variant="secondary">
                <Mic className="h-4 w-4" />
                <span className="ml-2">Start conversation</span>
              </Button>
            ) : (
              <Button onClick={stopEverything} variant="destructive">
                <PhoneOff className="h-4 w-4" />
                <span className="ml-2">End conversation</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {phase === "listening" && <Mic className="h-4 w-4 text-primary animate-pulse" />}
            {phase === "thinking" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            {phase === "speaking" && <Volume2 className="h-4 w-4 text-primary animate-pulse" />}
            {phase === "idle" && <MicOff className="h-4 w-4 text-muted-foreground" />}
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{phaseLabel[phase]}</span>
              {" — "}
              {status}
            </p>
          </div>
          {error && <p className="text-xs text-destructive font-semibold">{error}</p>}
        </Card>

        <Card className="p-4 min-h-[300px] max-h-[50vh] overflow-y-auto space-y-3">
          {turns.length === 0 && (
            <p className="text-sm text-muted-foreground text-center pt-16">
              No conversation yet. Press “Start conversation” and just talk — no buttons needed.
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

        <p className="text-[11px] text-muted-foreground text-center pb-8">
          Tip: talk naturally and pause when you're done — Aspen answers after a short silence.
          For the fully instant, interrupt-anytime version (true Gemini Live), a Google AI Studio
          key is needed.
        </p>

        <audio ref={audioRef} className="hidden" />
      </main>
    </div>
  );
};

export default VoiceLab;
