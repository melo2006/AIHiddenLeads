import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Braces, Mic, Square, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { spliceText, summarizeForSpeech } from "./wizardModel";

/**
 * Concept C field toolbar (brief §6): a compact cluster at a long field's
 * corner — Dictate (speech → editable text, records until stopped, never
 * auto-sends), Listen (a spoken SUMMARY in the owner's picked voice via
 * the chat read-aloud path, never a robotic read of the whole text), an
 * AI help menu (the power lives here, not in more icons), and a variable
 * inserter that drops {tokens} at the caret.
 */

type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function speechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export type FieldToolbarProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  /** Voice for Listen; falls back to Alex (Puck) when empty. */
  voice?: string;
  /** What Listen reads when it differs from the field value (e.g. a step-level summary). */
  summaryText?: string;
  /** Insertable variables: built-ins + the owner's custom variables. */
  variables?: { token: string; label: string }[];
  /** Contextual AI actions (the step wires the ones that make sense for this field). */
  onSuggest?: () => void;
  onSuggestMore?: () => void;
  /** Warmer/shorter rewrite of the current value; resolves with the new text. */
  onRewrite?: (mode: "warmer" | "shorter") => Promise<string>;
  disabled?: boolean;
};

export default function FieldToolbar({ textareaRef, value, onChange, voice, summaryText, variables, onSuggest, onSuggestMore, onRewrite, disabled }: FieldToolbarProps) {
  const { t } = useTranslation();
  const [dictating, setDictating] = useState(false);
  const [listening, setListening] = useState<"idle" | "loading" | "playing">("idle");
  const [rewriting, setRewriting] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationActiveRef = useRef(false);
  const dictationBaseRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Dictation/recognition and any in-flight read-aloud die with the field.
  useEffect(() => () => {
    dictationActiveRef.current = false;
    try { recognitionRef.current?.abort(); } catch { /* already gone */ }
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  function insertAtCaret(insert: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = spliceText(value, start, end, insert);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + insert.length;
      try { el.setSelectionRange(caret, caret); } catch { /* detached */ }
    });
  }

  function startDictation() {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) { toast.error(t("wizard.toolbar.dictationUnsupported")); return; }
    dictationBaseRef.current = value;
    dictationActiveRef.current = true;
    setDictating(true);
    const startSession = () => {
      if (!dictationActiveRef.current) return;
      const rec = new Ctor();
      recognitionRef.current = rec;
      rec.lang = navigator.language || "en-US";
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (event) => {
        let finals = "";
        for (let i = 0; i < event.results.length; i++) if (event.results[i].isFinal) finals += event.results[i][0].transcript;
        if (finals) {
          const base = dictationBaseRef.current;
          const joined = base ? `${base.replace(/\s+$/, "")} ${finals.trim()}` : finals.trim();
          dictationBaseRef.current = joined;
          onChange(joined);
        }
      };
      // The browser ends sessions on its own (silence, hiccups); the
      // owner's stop tap is the only thing that ends the dictation.
      rec.onend = () => { if (dictationActiveRef.current) { try { startSession(); } catch { /* restart raced */ } } };
      rec.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          dictationActiveRef.current = false;
          setDictating(false);
          toast.error(t("wizard.toolbar.dictationBlocked"));
        }
      };
      try { rec.start(); } catch { /* already running */ }
    };
    startSession();
  }

  function stopDictation() {
    dictationActiveRef.current = false;
    setDictating(false);
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }

  async function toggleListen() {
    if (listening !== "idle") {
      audioRef.current?.pause();
      setListening("idle");
      return;
    }
    const summary = summarizeForSpeech(summaryText ?? value);
    if (!summary) { toast.error(t("wizard.toolbar.nothingToHear")); return; }
    setListening("loading");
    try {
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-read-aloud`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
        body: JSON.stringify({ text: summary, voice: voice || "Puck" }),
      });
      if (!res.ok) throw new Error("read-aloud failed");
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(await res.blob());
      audioUrlRef.current = url;
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onended = () => setListening("idle");
      audio.onerror = () => setListening("idle");
      await audio.play();
      setListening("playing");
    } catch {
      setListening("idle");
      toast.error(t("wizard.toolbar.listenFailed"));
    }
  }

  async function rewrite(mode: "warmer" | "shorter") {
    if (!onRewrite || rewriting) return;
    setRewriting(true);
    try {
      const next = await onRewrite(mode);
      if (next) onChange(next);
    } catch {
      toast.error(t("wizard.toolbar.rewriteFailed"));
    } finally { setRewriting(false); }
  }

  const hasAiMenu = Boolean(onSuggest || onSuggestMore || onRewrite);
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="field-toolbar">
      <Button type="button" size="sm" variant={dictating ? "default" : "ghost"} className="h-8 gap-1 px-2 text-xs" disabled={disabled}
        aria-pressed={dictating} aria-label={t("wizard.toolbar.dictate")} onClick={() => (dictating ? stopDictation() : startDictation())}>
        {dictating ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        {dictating ? t("wizard.toolbar.stop") : t("wizard.toolbar.dictate")}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" disabled={disabled || listening === "loading"}
        aria-pressed={listening === "playing"} aria-label={t("wizard.toolbar.listen")} onClick={() => void toggleListen()}>
        <Volume2 className="h-3.5 w-3.5" />
        {listening === "loading" ? t("wizard.toolbar.preparing") : listening === "playing" ? t("wizard.toolbar.stop") : t("wizard.toolbar.listen")}
      </Button>
      {hasAiMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs text-primary" disabled={disabled || rewriting}>
              <Sparkles className="h-3.5 w-3.5" />{t("wizard.toolbar.aiHelp")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[130]">
            {onSuggest && <DropdownMenuItem onClick={onSuggest}>{t("wizard.toolbar.suggest")}</DropdownMenuItem>}
            {onSuggestMore && <DropdownMenuItem onClick={onSuggestMore}>{t("wizard.toolbar.suggestMore")}</DropdownMenuItem>}
            {onRewrite && <DropdownMenuItem disabled={rewriting} onClick={() => void rewrite("warmer")}>{t("wizard.toolbar.makeWarmer")}</DropdownMenuItem>}
            {onRewrite && <DropdownMenuItem disabled={rewriting} onClick={() => void rewrite("shorter")}>{t("wizard.toolbar.makeShorter")}</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { insertAtCaret(value && !/\s$/.test(value) ? "\n" : ""); textareaRef.current?.focus(); }}>{t("wizard.toolbar.addNote")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {variables && variables.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" disabled={disabled}>
              <Braces className="h-3.5 w-3.5" />{t("wizard.toolbar.variables")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[130] max-h-72 overflow-y-auto">
            <DropdownMenuLabel>{t("wizard.toolbar.insertVariable")}</DropdownMenuLabel>
            {variables.map((v) => (
              <DropdownMenuItem key={v.token} onClick={() => insertAtCaret(`{${v.token}}`)}>
                <span className="font-medium">{`{${v.token}}`}</span>
                <span className="ml-2 text-xs text-muted-foreground">{v.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
