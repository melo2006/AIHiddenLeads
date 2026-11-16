import { useState, useRef, useEffect, useMemo, useCallback, type ChangeEvent } from "react";
import { Bot, User, Maximize2, Minimize2, X, ExternalLink, Mic, Square, AudioLines, Send, Plus, Camera, Image as ImageIcon, FolderOpen, FileText, Volume2, Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MessageResponse } from '@/components/ai-elements/message';
import { displayNumbers } from '@/lib/displayNumbers';
import { useTranslation } from "react-i18next";
import "@/i18n"; // standalone harnesses mount this panel without main.tsx
import { explicitUiLocale, normalizeUiLocale, uiLocaleLanguage } from "@/lib/uiLocale";
import { visitMemoryAppend, visitMemoryGet } from "@/lib/visitMemory";
import { PERSONAS } from "../../../../supabase/functions/_shared/personas";
import { voiceForLocaleSession } from "../../../../supabase/functions/_shared/locale-voices";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatWidgetProps {
  businessName: string;
  businessNiche: string;
  websiteUrl: string;
  businessInfo: string;
  ownerName?: string;
  callerName?: string;
  callerEmail?: string;
  callerPhone?: string;
  leadId?: string;
  prospectId?: string;
  onClose?: () => void;
  embedded?: boolean;
  active?: boolean;
  /** Solo-presenter demo (Frank / Monica / Denise):
   *  the typed chat introduces THIS presenter — its consent card,
   *  opening greeting, composer placeholder and aria labels name her
   *  or him instead of Aspen. Undefined on every Aspen surface, where
   *  all strings render exactly as before. */
  presenterName?: string;
  /** Presenter demo only: extra demo knowledge for the chat brain —
   *  on the pinned realtor examples, the example's listings pack
   *  digest (the same canonical pack the voice session is stamped
   *  with server-side), so the typed chat answers as the presenter
   *  WITH the demo's listings, not from the bare website scan. The
   *  demo widget builds it; every other surface leaves it undefined
   *  and the prompt is unchanged. */
  presenterKnowledge?: string;
  /** Detected site language (Publish #66): the language the demo's
   *  scanned website is itself published in ('es' | 'pt-BR'), passed by
   *  DemoSite from the lead record. Used for the chat's reply language
   *  and greeting ONLY when the visitor made no explicit language-switch
   *  pick — the explicit pick always wins. Undefined everywhere else. */
  detectedSiteLanguage?: string;
  /** ONE CONTINUOUS CONVERSATION (Ron, 2026-11-16): the visit-memory
   *  key the voice panel uses for this surface (the conversation's
   *  agentId, or 'homepage'). When set, the typed thread is seeded
   *  from — and appended back to — the SAME visit store the voice
   *  sessions write, so Voice ⇄ Type shows one thread: spoken lines
   *  appear here, typed lines ride the voice session's resume recap.
   *  Undefined on standalone surfaces, which keep their local thread. */
  memoryKey?: string;
  /** Switch the shell to the live voice conversation (the composer's
   *  voice-mode button, Gemini-style). Undefined where the surface has
   *  no voice mode to switch to — the button then does not render. */
  onVoiceMode?: () => void;
}

/** A file the visitor attached in the composer. PHOTOS are seen by
 *  the chat brain (Ron, 2026-11-16): an image is downscaled on the
 *  device (see prepareImagePayload) and rides the send as an inline
 *  image part, so Aspen replies about what she sees. Every other
 *  kind stays local: the thread shows the chip (name / type / size,
 *  image preview when local) and the message carries a bracketed
 *  note naming the attachment — never a faked upload. */
export interface ChatAttachmentMeta {
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
}

interface Message {
  role: "assistant" | "user";
  content: string;
  attachment?: ChatAttachmentMeta;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ACCEPT_ALL = "image/*,audio/*,video/*,.pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv";
const ATTACHMENT_MIME_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.oasis.opendocument.text", "application/rtf", "text/plain", "text/markdown", "text/csv"];

export function attachmentSupported(file: { name: string; type: string }): boolean {
  if (file.type.startsWith("image/") || file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  if (ATTACHMENT_MIME_TYPES.includes(file.type)) return true;
  return /\.(pdf|doc|docx|odt|rtf|txt|md|csv)$/i.test(file.name);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The bracketed note that rides the text payload (and the visit
 *  memory) for a message with an attachment, so the conversation —
 *  and any later voice resume — knows a file was shared. */
export function attachmentNote(attachment: ChatAttachmentMeta): string {
  return `[Attached file: ${attachment.name} (${attachment.type || "file"}, ${formatFileSize(attachment.size)})]`;
}

/** Photo vision (Ron, 2026-11-16): before a photo is sent it is
 *  downscaled ON THE DEVICE — long edge capped at 1568px, re-encoded
 *  as JPEG — and the encoded payload is capped at 4 MB, so a phone
 *  camera shot reaches the model at a sane size. One photo per
 *  message (the composer stages a single attachment). */
export const MAX_IMAGE_EDGE_PX = 1568;
export const MAX_IMAGE_PAYLOAD_BYTES = 4 * 1024 * 1024;
export type ImagePrepResult = { image: { data: string; mimeType: string } } | { error: "too-large" | "unreadable" } | null;

export async function prepareImagePayload(file: File): Promise<ImagePrepResult> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = url;
    });
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return { error: "unreadable" };
    const scale = Math.min(1, MAX_IMAGE_EDGE_PX / Math.max(srcW, srcH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: "unreadable" };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      if (typeof canvas.toBlob === "function") canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
      else resolve(null);
    });
    let dataUrl: string;
    let byteSize: number;
    if (blob) {
      byteSize = blob.size;
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("image read failed"));
        reader.readAsDataURL(blob);
      });
    } else {
      dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      byteSize = Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
    }
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (!data) return { error: "unreadable" };
    if (byteSize > MAX_IMAGE_PAYLOAD_BYTES) return { error: "too-large" };
    return { image: { data, mimeType: "image/jpeg" } };
  } catch {
    return { error: "unreadable" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The displayable thread stored in the visit memory under `key`:
 *  both sides in order, dividers and synthetic [visit fact] records
 *  filtered out (those are recap plumbing, not conversation). */
export function threadFromVisitMemory(key: string): Message[] {
  return visitMemoryGet(key)
    .filter((turn) => turn.role !== "divider" && !turn.text.startsWith("[visit fact]"))
    .map((turn) => ({ role: turn.role as "user" | "assistant", content: turn.text }));
}

/** BCP-47 tag for dictation, from the chat's effective
 *  locale ('en' | 'es' | 'pt-BR' | undefined). */
export function speechLangFor(locale: string | undefined): string {
  if (locale === "pt-BR") return "pt-BR";
  if (locale === "es") return "es";
  return "en-US";
}

/** Read-aloud voice (Ron, 2026-11-16): the Gemini voice the VOICE
 *  sessions assign this presenter for the chat's language — the
 *  persona registry's base voice run through the same per-language
 *  remap the Live proxy applies (Aspen: Kore, pt-BR Despina;
 *  Frank: Schedar, pt-BR Alnilam, es Orus; Monica: Sulafat…). The
 *  chat is handed only the presenter's display name, so the binding
 *  is resolved from it; an unknown name falls back to Aspen, the
 *  chat's own default identity. The chat-read-aloud function
 *  validates the name against the Gemini voice allow-list before
 *  synthesizing, so a bad resolution fails safe (an error line),
 *  never a wrong voice. */
export function readAloudVoiceFor(presenterDisplayName: string | undefined, locale: string | undefined): string {
  const name = presenterDisplayName?.trim().toLowerCase();
  const binding = Object.values(PERSONAS).find((persona) => persona.displayName.toLowerCase() === name) ?? PERSONAS.aspen;
  return voiceForLocaleSession(binding.voiceName, binding.id, locale);
}

interface SpeechRecognitionResultLike { isFinal: boolean; 0: { transcript: string } }
interface SpeechRecognitionEventLike { results: ArrayLike<SpeechRecognitionResultLike> }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function speechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ChatWidget = ({
  businessName,
  businessNiche,
  websiteUrl,
  businessInfo,
  ownerName,
  callerName,
  callerEmail,
  callerPhone,
  leadId,
  prospectId,
  onClose,
  embedded = false,
  active = true,
  presenterName,
  presenterKnowledge,
  detectedSiteLanguage,
  memoryKey,
  onVoiceMode,
}: ChatWidgetProps) => {
  const presenterDisplayName = presenterName?.trim() || "Aspen";
  // A named presenter means the WHOLE chat is that presenter — display
  // strings AND the brain (sendToAI below). Before 2026-11-14 only the
  // strings followed the presenter while the system prompt still said
  // "You are Aspen", so a Frank demo greeted as Frank and then thought
  // and answered as Aspen.
  const isPresenterChat = Boolean(presenterName?.trim());
  const { t } = useTranslation();
  // Effective chat language (Publish #66): the visitor's explicit
  // language-switch pick wins; below it, the language the demo's own
  // scanned website is published in (detectedSiteLanguage from the lead
  // record); neither → undefined → English default, exactly as before.
  const explicitLocale = explicitUiLocale();
  const effectiveChatLocale = explicitLocale ?? normalizeUiLocale(detectedSiteLanguage) ?? undefined;
  // The voice her replies are read aloud in (see readAloudVoiceFor).
  const readAloudVoice = readAloudVoiceFor(presenterDisplayName, effectiveChatLocale);
  const chatLocaleFromDetection = !explicitLocale && Boolean(effectiveChatLocale);
  const [messages, setMessages] = useState<Message[]>([]);
  const [recordingAgreed,setRecordingAgreed]=useState(false);
  const [copyEmail,setCopyEmail]=useState('');
  const [copyOpen,setCopyOpen]=useState(false);
  const [copyStatus,setCopyStatus]=useState('');
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialized = useRef(false);
  const mounted = useRef(true);
  const sessionId = useRef(crypto.randomUUID()+crypto.randomUUID());
  const recordQueue=useRef(Promise.resolve());
  // Gemini-style composer (Ron, 2026-11-16): staged attachment,
  // dictation, per-reply actions.
  const [attachment, setAttachment] = useState<ChatAttachmentMeta | null>(null);
  // The picked File itself (the meta above is display-only); a photo
  // is downscaled from it at send time. Cleared wherever the staged
  // chip is cleared.
  const attachmentFileRef = useRef<File | null>(null);
  const [attachError, setAttachError] = useState("");
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [ratings, setRatings] = useState<Record<number, "up" | "down">>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [listenLoadingIndex, setListenLoadingIndex] = useState<number | null>(null);
  const [listenErrorIndex, setListenErrorIndex] = useState<number | null>(null);
  const replyAudioRef = useRef<HTMLAudioElement | null>(null);
  const replyAudioCacheRef = useRef(new Map<number, string>());
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationBaseRef = useRef("");
  const objectUrlsRef = useRef<string[]>([]);
  const [speechSupported] = useState(() => Boolean(speechRecognitionCtor()));
  // Visit-memory sync bookkeeping (memoryKey surfaces only): how many
  // raw visit turns `messages` already reflects, and whether a reply
  // is mid-stream (a sync must never fight the streaming line).
  const consumedTurnsRef = useRef(0);
  const streamingRef = useRef(false);

  const ownerLabel = ownerName?.trim() || callerName?.trim() || "the business owner";
  const isBusy = isThinking || isStreaming;
  useEffect(() => { if (active && !isBusy) inputRef.current?.focus({ preventScroll: true }); }, [active, isBusy]);

  const logChatMessage = useCallback((role: string, content: string) => {
    if (!content.trim()) return;
    if(!recordingAgreed)return;
    recordQueue.current=recordQueue.current.then(async()=>{const {error}=await supabase.functions.invoke('conversation-records',{body:{action:'chat',capability:sessionId.current,businessName,role,content:content.trim(),agreed:true}});if(error)console.error('Private chat save failed');});
    supabase.from("demo_chat_interactions").insert({
      session_id: sessionId.current,
      lead_id: leadId || null,
      prospect_id: prospectId || null,
      business_name: businessName,
      website_url: websiteUrl,
      caller_name: callerName || null,
      caller_email: callerEmail || null,
      caller_phone: callerPhone || null,
      role,
      content: content.trim(),
    }).then(({ error }) => {
      if (error) console.error("Failed to log chat interaction:", error);
    });
  }, [leadId, prospectId, businessName, websiteUrl, callerName, callerEmail, callerPhone,recordingAgreed]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      recognitionRef.current?.abort();
      if (replyAudioRef.current) { try { replyAudioRef.current.pause(); } catch { /* already stopped */ } replyAudioRef.current = null; }
      objectUrlsRef.current.forEach((url) => { try { URL.revokeObjectURL(url); } catch { /* already gone */ } });
      objectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const panel = messagesEndRef.current?.parentElement;
    if (panel && followLatest.current) panel.scrollTop = panel.scrollHeight;
  }, [messages, isThinking]);

  const quickPrompts = useMemo(() => {
    const nichePrompts: Record<string, string[]> = {
      realtors: [
        "What services do you offer for buyers and sellers?",
        "Can this AI qualify new real estate leads?",
        "How does voice AI help with showings and inquiries?",
      ],
      medspa: [
        "What treatments do you offer most often?",
        "Can this assistant answer pricing and consultation questions?",
        "How can AI chat and voice improve bookings?",
      ],
      autodetail: [
        "What detailing packages are available?",
        "Can Aspen handle quote questions 24/7?",
        "How quickly can this setup be added to my site?",
      ],
      veterinary: [
        "Can this assistant help with pet appointment questions?",
        "How does it handle urgent inquiries after hours?",
        "What does setup look like for a vet clinic?",
      ],
      marine: [
        "Can Aspen answer questions about boat services?",
        "How can this capture leads after hours?",
        "Can voice AI reduce missed calls?",
      ],
      general: [
        "What can Aspen do for my business?",
        "How do AI chat and voice work together?",
        "Can I schedule a 15-minute walkthrough?",
      ],
    };

    const prompts = nichePrompts[businessNiche] ?? nichePrompts.general;
    // Presenter demos: the starter questions name the presenter too —
    // "What can Aspen do…" under a Frank demo was part of the same
    // wrong-identity bug. Aspen surfaces keep the strings untouched.
    return isPresenterChat ? prompts.map((prompt) => prompt.replace(/Aspen/g, presenterDisplayName)) : prompts;
  }, [businessNiche, isPresenterChat, presenterDisplayName]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("chat.goodMorning", { lng: effectiveChatLocale });
    if (hour < 17) return t("chat.goodAfternoon", { lng: effectiveChatLocale });
    return t("chat.goodEvening", { lng: effectiveChatLocale });
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // ONE THREAD (memoryKey surfaces): if the visit already has a
    // conversation — spoken on the voice side, typed earlier, or both
    // — the chat OPENS on that thread instead of a fresh greeting.
    if (memoryKey) {
      const existing = threadFromVisitMemory(memoryKey);
      if (existing.length) {
        consumedTurnsRef.current = visitMemoryGet(memoryKey).length;
        setMessages(existing);
        return;
      }
    }

    const firstName = callerName?.split(" ")[0]?.trim();
    const nameGreet = firstName ? `, ${firstName}` : "";
    const greeting = `${getGreeting()}${nameGreet}! 👋 ${t("chat.greetingBody", { businessName, name: presenterDisplayName, lng: effectiveChatLocale })}`;

    setMessages([{ role: "assistant", content: greeting }]);
    if (memoryKey) {
      // The greeting joins the shared thread, so a later switch to
      // voice resumes from the whole conversation, greeting included.
      visitMemoryAppend(memoryKey, { role: "assistant", text: greeting });
      consumedTurnsRef.current = visitMemoryGet(memoryKey).length;
    }
  }, [businessName, callerName]);

  // Re-sync on (re)activation: while the visitor was on the voice
  // side, spoken turns landed in the visit store; when the chat
  // becomes active again they join the thread — and if the store was
  // wiped meanwhile (start-over), the thread rebuilds from it.
  const syncFromVisitMemory = useCallback(() => {
    if (!memoryKey || isBusy || streamingRef.current) return;
    const raw = visitMemoryGet(memoryKey);
    if (raw.length === consumedTurnsRef.current) return;
    if (raw.length > consumedTurnsRef.current) {
      const fresh = raw.slice(consumedTurnsRef.current)
        .filter((turn) => turn.role !== "divider" && !turn.text.startsWith("[visit fact]"))
        .map((turn) => ({ role: turn.role as "user" | "assistant", content: turn.text }));
      consumedTurnsRef.current = raw.length;
      if (fresh.length) setMessages((prev) => [...prev, ...fresh]);
      return;
    }
    consumedTurnsRef.current = raw.length;
    setMessages(threadFromVisitMemory(memoryKey));
  }, [memoryKey, isBusy]);
  useEffect(() => { if (active) syncFromVisitMemory(); }, [active, syncFromVisitMemory]);

  const sendToAI = async (conversationHistory: Message[], image?: { data: string; mimeType: string }) => {
    // Presenter brain (2026-11-14): on a presenter demo the identity
    // line names the presenter and a PRESENTER DEMO block pins the
    // role, so the chat thinks as Frank/Latina — the same presenter
    // who fronts the voice demo — instead of falling back to Aspen
    // under the presenter's name tag. Without a presenter both blocks
    // are empty and the prompt is byte-identical to the legacy Aspen
    // prompt every other surface has always sent.
    // RESPONSE LANGUAGE directive (Publish #66): the wording names the
    // TRUE source of the chat language — the visitor's explicit switch
    // pick, or (below it) the language the demo's own website is
    // published in. retell-web-call independently enforces the same
    // locale server-side from the locale field sent below.
    const responseLanguageLine = chatLocaleFromDetection
      ? `RESPONSE LANGUAGE: This demo was built from the visitor's own website, which is published in ${uiLocaleLanguage(effectiveChatLocale)}. Reply in ${uiLocaleLanguage(effectiveChatLocale)} from the first message, and stay in it unless the visitor explicitly asks you to switch to another language.`
      : `RESPONSE LANGUAGE: The visitor selected ${uiLocaleLanguage(explicitUiLocale())} with the website's language switch. Reply in ${uiLocaleLanguage(explicitUiLocale())} from the first message, and stay in it unless the visitor explicitly asks you to switch to another language.`;
    const presenterBlock = isPresenterChat ? `
PRESENTER DEMO:
- You are ${presenterDisplayName}, the presenter fronting this demo — the same ${presenterDisplayName} who runs the voice demo on this page. Always speak as ${presenterDisplayName}; never call yourself Aspen or any other name.
- In this typed chat you are demonstrating the business's own AI chat assistant: answer as ${businessName}'s assistant, using the business knowledge below.
` : "";
    const presenterKnowledgeBlock = isPresenterChat && presenterKnowledge?.trim() ? `
CURRENT LISTINGS FOR THIS BUSINESS (the demo's listings pack — present each home by its descriptor, the way the business's own site names it; never invent listings, prices or details beyond this list and the knowledge above):
${presenterKnowledge.trim()}
` : "";
    const systemPrompt = `You are ${isPresenterChat ? presenterDisplayName : "Aspen"}, the AI chat assistant for ${businessName}. You are warm, witty, funny, and genuinely helpful — like a knowledgeable friend who happens to work at the business.
${presenterBlock}
IMPORTANT CONTEXT:
- Business: ${businessName}
- Industry: ${businessNiche}
- Website: ${websiteUrl}
- Business owner / point of contact: ${ownerLabel}
- Caller name: ${callerName || "Unknown"}
- Caller email: ${callerEmail || "Not provided"}
- Caller phone: ${callerPhone || "Not provided"}

COMPREHENSIVE BUSINESS KNOWLEDGE (scraped from their website + web research):
${businessInfo?.substring(0, 8000) || "A professional business offering quality services."}
${presenterKnowledgeBlock}

PERSONALITY & STYLE:
- Be funny, cordial, and CONVERSATIONAL — talk like a real person, not a robot.
- Use light humor, casual language, and warmth. Think: the friendliest receptionist ever.
- Keep responses concise: 1-3 short sentences max unless the question needs detail.
- Use the caller's name naturally.
- Let the caller lead the conversation — ask follow-up questions, don't monologue.
- Validate their needs: "Great question!" / "Oh absolutely, let me tell you about that..."
- If you know the answer from the knowledge base, give specifics (services, pricing, areas served).
- If you DON'T know something specific, use industry knowledge to give a helpful general answer.

DEMO CONTEXT:
- This is a demonstration of AI chat capabilities overlaid on a website screenshot.
- Mention capabilities naturally: AI chat, AI voice, lead capture, and appointment booking.
- If asked for a human, offer a callback or a 15-minute appointment with ${ownerLabel}.

EMAIL CONFIRMATION:
- If caller email exists, occasionally confirm: "I have your email as ${callerEmail || "not provided"}. Is that correct?"
- If caller gives a new email, acknowledge and use the updated one.

CRITICAL RULES:
- NEVER make up specific prices unless they appear in the knowledge base — say "let me have ${ownerLabel} get back to you with exact pricing."
- ALWAYS reference the actual business name, not generic placeholders.
- If business info is thin, use common ${businessNiche} industry knowledge to sound informed.

${responseLanguageLine}`;

    const { data, error } = await supabase.functions.invoke("retell-web-call", {
      body: {
        action: "chat-completion",
        locale: effectiveChatLocale,
        systemPrompt,
        // A message with an attachment carries the bracketed note as
        // its payload suffix (the thread itself shows the chip, not
        // the note). A PHOTO additionally rides as `image` — the
        // downscaled JPEG the endpoint attaches to the last user
        // message as an image part, so the model sees it too.
        messages: conversationHistory.map((m) => ({ role: m.role, content: m.attachment ? `${m.content} ${attachmentNote(m.attachment)}`.trim() : m.content })),
        ...(image ? { image } : {}),
      },
    });

    if (error || !data?.content) {
      throw new Error(error?.message || "No response");
    }

    return data.content as string;
  };

  const typeAssistantResponse = useCallback(async (response: string) => {
    streamingRef.current = true;
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const chunks = response.split(/(\s+)/);
    let built = "";

    for (const chunk of chunks) {
      if (!mounted.current) return;
      built += chunk;

      setMessages((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        const lastIndex = next.length - 1;
        if (next[lastIndex]?.role === "assistant") {
          next[lastIndex] = { ...next[lastIndex], content: built };
        }
        return next;
      });

      const delay = chunk.trim().length === 0 ? 12 : Math.min(85, Math.max(22, chunk.length * 10));
      await sleep(delay);
    }

    streamingRef.current = false;
    if (mounted.current) {
      // The completed reply joins the shared visit thread BEFORE the
      // busy flag drops, so the activation sync can never duplicate it.
      if (memoryKey) {
        visitMemoryAppend(memoryKey, { role: "assistant", text: response });
        consumedTurnsRef.current = visitMemoryGet(memoryKey).length;
      }
      setIsStreaming(false);
      logChatMessage("assistant", response);
    }
  }, [logChatMessage, memoryKey]);

  const handleSend = useCallback(async (prefill?: string) => {
    const userMsg = (prefill ?? input).trim();
    // A staged attachment can carry a message on its own (no text).
    const staged = prefill ? null : attachment;
    if ((!userMsg && !staged) || isBusy || !recordingAgreed) return;

    // PHOTO VISION (Ron, 2026-11-16): a staged photo is downscaled
    // here, before the composer clears, so she actually receives it.
    // Still too large after downscaling → keep the chip staged, show
    // the friendly error, and do NOT send a message she can't see.
    // Undecodable in this browser → the message still sends with the
    // chip + note, as every attachment did before.
    let imagePayload: { data: string; mimeType: string } | undefined;
    const stagedFile = prefill ? null : attachmentFileRef.current;
    if (staged && stagedFile && staged.type.startsWith("image/")) {
      setIsThinking(true);
      const prep = await prepareImagePayload(stagedFile);
      if (!mounted.current) return;
      if (prep && "error" in prep && prep.error === "too-large") {
        setIsThinking(false);
        setAttachError(t("chat.attachTooLarge", { size: "4 MB" }));
        return;
      }
      if (prep && "image" in prep) imagePayload = prep.image;
    }

    if (!prefill) {
      setInput("");
      setAttachment(null);
      attachmentFileRef.current = null;
      setAttachError("");
    }

    const userMessage: Message = { role: "user", content: userMsg, ...(staged ? { attachment: staged } : {}) };
    const updated = [...messages, userMessage];
    followLatest.current = true;
    setMessages(updated);
    setIsThinking(true);
    const loggedText = staged ? `${userMsg} ${attachmentNote(staged)}`.trim() : userMsg;
    logChatMessage("user", loggedText);
    if (memoryKey) {
      visitMemoryAppend(memoryKey, { role: "user", text: loggedText });
      consumedTurnsRef.current = visitMemoryGet(memoryKey).length;
    }

    try {
      const response = await sendToAI(updated, imagePayload);
      if (!mounted.current) return;

      await sleep(350);
      setIsThinking(false);
      await typeAssistantResponse(response);
    } catch (err) {
      console.error("Chat AI error:", err);
      if (!mounted.current) return;

      setIsThinking(false);
      const fallback = t("chat.fallback", { owner: ownerLabel });
      await typeAssistantResponse(fallback);
    }
  }, [input, isBusy, messages, ownerLabel, typeAssistantResponse, recordingAgreed, attachment, memoryKey]);

  // Dictation (Gemini-style mic inside the composer): tap to start,
  // tap the square stop state to end. Interim results update the
  // field live while recording; the recognized speech lands as TEXT
  // IN THE FIELD and is NEVER auto-sent — the visitor reviews, taps
  // in and edits (recognition errors, TV noise, accents), mixes in
  // typed corrections, and sends only by tapping Send. The button
  // only exists when the browser offers the SpeechRecognition API.
  const toggleDictation = useCallback(() => {
    if (dictating) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = speechLangFor(effectiveChatLocale);
    recognition.interimResults = true;
    recognition.continuous = false;
    dictationBaseRef.current = input;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      const base = dictationBaseRef.current;
      setInput(base ? `${base.replace(/\s+$/, "")} ${transcript}` : transcript);
    };
    recognition.onend = () => { setDictating(false); recognitionRef.current = null; };
    recognition.onerror = () => { setDictating(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setDictating(true);
    try { recognition.start(); } catch { setDictating(false); recognitionRef.current = null; }
  }, [dictating, input, effectiveChatLocale]);

  // Attachment picking: one handler for the Camera / Photos / Files
  // inputs — same guardrails (type allow-list, 10 MB cap) and the
  // same staged chip whichever entry the visitor used.
  const handleFilePicked = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAttachMenuOpen(false);
    if (!file) return;
    if (!attachmentSupported(file)) {
      setAttachError(t("chat.attachUnsupported"));
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError(t("chat.attachTooLarge", { size: "10 MB" }));
      return;
    }
    setAttachError("");
    attachmentFileRef.current = file;
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
    if (previewUrl) objectUrlsRef.current.push(previewUrl);
    setAttachment({ name: file.name, type: file.type, size: file.size, ...(previewUrl ? { previewUrl } : {}) });
  }, [t]);

  // Per-reply actions: read-aloud in the PRESENTER'S OWN Gemini
  // voice, copy, and local-only thumbs. Read-aloud used the device's
  // speechSynthesis until Ron's 2026-11-16 phone test — "an ugly
  // browser TTS voice", not hers. Now the chat-read-aloud function
  // synthesizes the reply server-side in her assigned voice for the
  // chat's language (readAloudVoice) and the client plays the WAV:
  // first Listen on a reply fetches it, later taps replay the
  // in-memory cache, tapping the playing reply stops it. There is
  // deliberately NO speechSynthesis fallback — a failure surfaces
  // the localized listenError line instead of a robot voice.
  const stopReplyAudio = useCallback(() => {
    const audio = replyAudioRef.current;
    if (audio) {
      try { audio.pause(); } catch { /* already stopped */ }
      replyAudioRef.current = null;
    }
    setSpeakingIndex(null);
  }, []);
  const speakReply = useCallback(async (index: number, text: string) => {
    if (speakingIndex === index) { stopReplyAudio(); return; }
    if (listenLoadingIndex !== null) return;
    stopReplyAudio();
    setListenErrorIndex(null);
    let url = replyAudioCacheRef.current.get(index);
    if (!url) {
      setListenLoadingIndex(index);
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-read-aloud`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text, voice: readAloudVoice }),
        });
        if (!res.ok) throw new Error(`read-aloud failed [${res.status}]`);
        url = URL.createObjectURL(await res.blob());
        replyAudioCacheRef.current.set(index, url);
        objectUrlsRef.current.push(url);
      } catch {
        setListenLoadingIndex(null);
        if (mounted.current) setListenErrorIndex(index);
        return;
      }
      setListenLoadingIndex(null);
    }
    if (!mounted.current) return;
    const audio = new Audio(url);
    replyAudioRef.current = audio;
    audio.onended = () => { if (replyAudioRef.current === audio) { replyAudioRef.current = null; setSpeakingIndex(null); } };
    audio.onerror = () => { if (replyAudioRef.current === audio) { replyAudioRef.current = null; setSpeakingIndex(null); setListenErrorIndex(index); } };
    setSpeakingIndex(index);
    try { await audio.play(); } catch { if (replyAudioRef.current === audio) { replyAudioRef.current = null; setSpeakingIndex(null); setListenErrorIndex(index); } }
  }, [speakingIndex, listenLoadingIndex, stopReplyAudio, readAloudVoice]);
  const copyReply = useCallback(async (index: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
    } catch { /* clipboard unavailable — the button simply does nothing */ }
  }, []);
  const toggleRating = useCallback((index: number, value: "up" | "down") => {
    setRatings((prev) => {
      const next = { ...prev };
      if (next[index] === value) delete next[index];
      else next[index] = value;
      return next;
    });
  }, []);

  // Composer auto-grow: one line at rest, up to ~4 lines while typing.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [input]);

  const userHasMessaged = messages.some((m) => m.role === "user");
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant")?.content;

  if(!recordingAgreed)return <div className="space-y-3 p-4 text-foreground"><p className="text-sm font-semibold">{t("chat.consentTitle", { name: presenterDisplayName })}</p><p className="text-xs text-muted-foreground">{t("chat.consentBody")}</p><Button onClick={()=>setRecordingAgreed(true)}>{t("chat.consentStart")}</Button></div>;
  return (
    <div className={embedded ? 'overflow-hidden bg-card' : 'rounded-2xl border border-accent/20 bg-card shadow-2xl overflow-hidden'}>
      {!embedded && <div className="flex items-center justify-between px-4 py-3 bg-accent/10 border-b border-accent/20">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20">
              <Bot className="h-4 w-4 text-accent" />
            </div>
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card" />
          </div>
          <div>
            <p className="text-sm font-bold">{t("chat.title")}</p>
            <p className="text-[10px] text-muted-foreground">{t("chat.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized((prev) => !prev)}
            className="rounded-md bg-foreground/10 p-1 text-foreground transition-colors hover:bg-foreground/20"
            aria-label={isMinimized ? t("chat.expand") : t("chat.minimize")}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md bg-foreground/10 p-1 text-foreground transition-colors hover:bg-foreground/20"
              aria-label={t("chat.close")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>}

      {isMinimized ? (
        <div className="p-3">
          <p className="text-xs text-muted-foreground">
            {t("chat.minimizedNote")}
          </p>
          {lastAssistantMessage && (
            <p className="mt-2 line-clamp-2 text-xs text-foreground/80">{displayNumbers(lastAssistantMessage)}</p>
          )}
        </div>
      ) : (
      <>
      {/* KEYBOARD FIT (2026-11-16): embedded, the list is a pure flex
          child (min-h-0 flex-1) with NO dvh-based height cap — dvh
          does not shrink when the on-screen keyboard opens, so the
          old 35dvh cap held the list at its full height and the
          shell clipped the composer below the fold (Ron's phone
          test: the input field completely hidden behind the
          keyboard). Flex lets the list absorb the whole squeeze
          while the composer stays pinned. */}
      <div aria-label={t("chat.messagesAria", { name: presenterDisplayName })} role="region" onScroll={event => { const panel = event.currentTarget; followLatest.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 48; }} className={`${embedded ? 'min-h-0 flex-1' : 'max-h-[22rem]'} overflow-y-auto overscroll-contain touch-pan-y p-3 space-y-2.5`}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                msg.role === "assistant" ? "bg-accent/20" : "bg-primary/20"
              }`}
            >
              {msg.role === "assistant" ? (
                <Bot className="h-3.5 w-3.5 text-accent" />
              ) : (
                <User className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <div className={`flex max-w-[80%] flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              {/* TWO-SIDE COLOURS (Ron, 2026-11-16): the visitor's
                  bubbles wear the emerald primary; Aspen's wear a
                  violet accent tint with a soft border — the same two
                  treatments as the voice transcript, so the thread
                  reads identically in both modes. */}
              <div
                data-side={msg.role}
                data-testid="chat-message-bubble"
                className={`rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-line ${
                  msg.role === "assistant" ? "border border-accent/25 bg-accent/15 text-foreground shadow-sm" : "bg-primary text-primary-foreground"
                }`}
              >
                {msg.attachment && (
                  <div data-testid="chat-message-attachment" className="mb-1.5 flex items-center gap-2 rounded-lg bg-background/30 px-2 py-1.5">
                    {msg.attachment.previewUrl ? <img src={msg.attachment.previewUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" /> : <FileText className="h-4 w-4 shrink-0" />}
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-semibold">{msg.attachment.name}</span>
                      <span className="block text-[10px] opacity-80">{formatFileSize(msg.attachment.size)}</span>
                    </span>
                  </div>
                )}
                <MessageResponse>{msg.role === "assistant" ? displayNumbers(msg.content) : msg.content}</MessageResponse>
              </div>
              {msg.role === "assistant" && msg.content.trim() && !(isStreaming && i === messages.length - 1) && (
                <>
                <div data-testid="chat-message-actions" className="mt-1 flex items-center gap-0.5">
                  <button type="button" aria-label={t("chat.listen")} title={t("chat.listen")} aria-pressed={speakingIndex === i} aria-busy={listenLoadingIndex === i} onClick={() => void speakReply(i, msg.content)} className={`flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${listenLoadingIndex === i ? "animate-pulse" : ""}`}><Volume2 className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={copiedIndex === i ? t("chat.copied") : t("chat.copyReply")} title={copiedIndex === i ? t("chat.copied") : t("chat.copyReply")} onClick={() => void copyReply(i, msg.content)} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{copiedIndex === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
                  <button type="button" aria-label={t("chat.rateGood")} title={t("chat.rateGood")} aria-pressed={ratings[i] === "up"} onClick={() => toggleRating(i, "up")} className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-muted ${ratings[i] === "up" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><ThumbsUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={t("chat.rateBad")} title={t("chat.rateBad")} aria-pressed={ratings[i] === "down"} onClick={() => toggleRating(i, "down")} className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-muted ${ratings[i] === "down" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}><ThumbsDown className="h-3.5 w-3.5" /></button>
                </div>
                {listenErrorIndex === i && <p role="alert" className="mt-1 text-[11px] font-medium text-destructive">{t("chat.listenError")}</p>}
                </>
              )}
            </div>
          </div>
        ))}

        {!userHasMessaged && (
          <div className="ml-8 flex flex-wrap gap-2 pt-1">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void handleSend(prompt)}
                disabled={isBusy}
                className="rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {isThinking && (
          <div className="flex gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20">
              <Bot className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-accent/10 px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 p-3 border-t border-border">
       {messages.some(m=>m.role==='user') && <div className="mb-2 space-y-2"><Button size="sm" variant="ghost" onClick={()=>setCopyOpen(v=>!v)}>{t("chat.emailTranscript")}</Button>{copyOpen&&<form className="space-y-2" onSubmit={async e=>{e.preventDefault();await recordQueue.current;const {error}=await supabase.functions.invoke('conversation-records',{body:{action:'chatCopy',capability:sessionId.current,email:copyEmail,consent:true}});setCopyStatus(error?t("chat.copyUnavailable"):t("chat.copyRequested"));}}><Input aria-label={t("chat.copyEmailAria")} type="email" required value={copyEmail} onChange={e=>setCopyEmail(e.target.value)} placeholder={t("chat.copyEmailPlaceholder")}/><Button type="submit" size="sm">{t("chat.confirmCopy")}</Button><p className="text-xs text-muted-foreground">{t("chat.copyNote")}</p></form>}{copyStatus&&<p role="status" className="text-xs">{copyStatus}</p>}</div>}
       {/* GEMINI-STYLE COMPOSER (Ron, 2026-11-16, from his annotated
           Gemini app screenshot): ONE rounded bar — the "+" attach
           menu at the left (Camera / Photos / Files, exactly three
           entries), the text field, an in-field dictation mic, the
           voice-mode switch (waveform), and a send button that
           appears once there is something to send. Enter sends,
           Shift+Enter keeps the newline, as before. */}
       {attachment && (
        <div data-testid="chat-attachment-chip" className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-secondary px-2.5 py-1.5">
          {attachment.previewUrl ? <img src={attachment.previewUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{attachment.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatFileSize(attachment.size)}</span>
          <button type="button" onClick={() => { setAttachment(null); attachmentFileRef.current = null; }} aria-label={t("chat.removeAttachment")} title={t("chat.removeAttachment")} className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
       )}
       {attachError && <p role="alert" className="mb-2 text-[11px] font-medium text-destructive">{attachError}</p>}
       <div data-testid="chat-composer" className="flex items-end gap-0.5 rounded-[1.75rem] border border-border bg-background px-1.5 py-1.5 shadow-sm transition-colors focus-within:border-primary/60">
        <div className="relative shrink-0">
          <button type="button" aria-label={t("chat.attach")} title={t("chat.attach")} aria-haspopup="menu" aria-expanded={attachMenuOpen} onClick={() => setAttachMenuOpen((open) => !open)} className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"><Plus className="h-5 w-5" /></button>
          {attachMenuOpen && (
            <>
              <div aria-hidden="true" className="fixed inset-0 z-40 cursor-default" onClick={() => setAttachMenuOpen(false)} />
              <div role="menu" aria-label={t("chat.attach")} className="absolute bottom-full left-0 z-50 mb-1.5 w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg">
                <button type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); cameraInputRef.current?.click(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"><Camera className="h-4 w-4 shrink-0 text-muted-foreground" />{t("chat.attachCamera")}</button>
                <button type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); photosInputRef.current?.click(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"><ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />{t("chat.attachPhotos")}</button>
                <button type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); filesInputRef.current?.click(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"><FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />{t("chat.attachFiles")}</button>
              </div>
            </>
          )}
        </div>
        <textarea
          ref={inputRef}
          aria-label={t("chat.messageAria", { name: presenterDisplayName })}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder={t("chat.placeholder", { name: presenterDisplayName })}
          rows={1}
          className="max-h-24 min-h-9 w-full min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-base leading-snug outline-none placeholder:text-muted-foreground"
          disabled={isBusy}
        />
        {speechSupported && (
          <button type="button" data-testid="chat-dictate-button" aria-label={dictating ? t("chat.dictateStop") : t("chat.dictate")} title={dictating ? t("chat.dictateStop") : t("chat.dictate")} aria-pressed={dictating} onClick={toggleDictation} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${dictating ? "bg-destructive/15 text-destructive" : "text-foreground hover:bg-muted"}`}>{dictating ? <Square className="h-4 w-4 animate-pulse fill-current" /> : <Mic className="h-5 w-5" />}</button>
        )}
        {onVoiceMode && (
          <button type="button" aria-label={t("chat.voiceMode")} title={t("chat.voiceMode")} onClick={onVoiceMode} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"><AudioLines className="h-5 w-5" /></button>
        )}
        {(input.trim() || attachment) && (
          <button type="button" aria-label={t("chat.sendAria", { name: presenterDisplayName })} title={t("chat.sendAria", { name: presenterDisplayName })} disabled={isBusy} onClick={() => void handleSend()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"><Send className="h-4 w-4" /></button>
        )}
       </div>
       <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden="true" tabIndex={-1} onChange={handleFilePicked} />
       <input ref={photosInputRef} type="file" accept="image/*,video/*" className="hidden" aria-hidden="true" tabIndex={-1} onChange={handleFilePicked} />
       <input ref={filesInputRef} type="file" accept={ATTACHMENT_ACCEPT_ALL} className="hidden" aria-hidden="true" tabIndex={-1} onChange={handleFilePicked} />
      </div>

      {/* CTA Banner */}
      {!embedded && <a
        href="https://aihiddenleads.com"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 px-3 py-2.5 text-[11px] font-bold text-white transition-opacity hover:opacity-90"
      >
        <ExternalLink className="h-3 w-3" />
        {t("chat.ctaBanner")}
      </a>}
      </>
      )}
    </div>
  );
};

export default ChatWidget;
