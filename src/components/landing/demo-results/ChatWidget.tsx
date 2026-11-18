import { useState, useRef, useEffect, useMemo, useCallback, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Bot, User, Maximize2, Minimize2, X, ExternalLink, Mic, Square, AudioLines, Send, Plus, Camera, SwitchCamera, Image as ImageIcon, FolderOpen, FileText, Volume2, Copy, Check, ThumbsUp, ThumbsDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MessageResponse } from '@/components/ai-elements/message';
import { displayNumbers } from '@/lib/displayNumbers';
import { useTranslation } from "react-i18next";
import "@/i18n"; // standalone harnesses mount this panel without main.tsx
import { explicitUiLocale, normalizeUiLocale, uiLocaleLanguage } from "@/lib/uiLocale";
import { visitMemoryAppend, visitMemoryGet, visitMemorySet, type VisitTurn } from "@/lib/visitMemory";
import { splitReadAloudChunks } from "@/lib/readAloudChunks";
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
  /** End-of-chat copy offer (chat-fix5, 2026-11-16): the shell hands
   *  its REAL close function here. When the copy pop-up resolves —
   *  sent, declined, or dismissed — the widget calls this to finish
   *  the close the visitor started. Undefined on standalone surfaces,
   *  where the dismissal falls back to `onClose`. */
  onRequestClose?: () => void;
  /** End-of-chat copy offer: the shell registers its close path's
   *  guard slot here (the shellControlsRef pattern). The widget fills
   *  it with `() => boolean` — TRUE means "I intercepted this close:
   *  the copy pop-up is showing instead, do not close yet". The shell
   *  consults it at the top of its close function (NEVER on
   *  minimize); a false return lets the close proceed. */
  closeGuardRef?: { current: (() => boolean) | null };
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
  /** LIVE CAMERA (2026-11-17): this user turn carried a live
   *  camera frame as its image part, so the payload mapping adds
   *  the camera-frame note — the model knows the image is the
   *  visitor's camera RIGHT NOW, not an uploaded photo. */
  cameraFrame?: boolean;
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

/** LIVE CAMERA (Ron, 2026-11-17 — "Build the camera next"): the
 *  composer's Camera entry starts the visitor's camera IN the panel
 *  and Aspen sees what it shows. Design, pinned here so the cost
 *  shape is auditable:
 *  - Frames are SAMPLED locally every 2s and only the freshest is
 *    kept (in a ref — never stored, never uploaded on its own).
 *  - A frame reaches the model ONLY on a conversation turn, riding
 *    the exact vision path a photo uses (the chat-completion
 *    `image` part): once when the camera starts (an intro turn, so
 *    she can greet what she sees) and then on each visitor send
 *    while the camera is live. An idle camera costs ZERO model
 *    calls — there is no frame streaming.
 *  - Frames are downscaled harder than photos (768px edge): they
 *    are a live view, not a keepsake, and they ride many turns.
 *  - A frame older than the stale bound never rides a send — she
 *    must never describe a scene the camera left seconds ago. */
export const LIVE_CAMERA_FRAME_INTERVAL_MS = 2000;
export const LIVE_CAMERA_FRAME_MAX_EDGE_PX = 768;
export const LIVE_CAMERA_FRAME_STALE_MS = 10_000;
/** The model-facing note appended to a turn that carries a live
 *  frame (English like the attachment note — payload plumbing, not
 *  visitor copy). */
export const CAMERA_FRAME_NOTE = "[Live camera frame: this image is what the visitor's camera is showing right now.]";

export interface CameraFramePayload {
  data: string;
  mimeType: string;
  byteSize: number;
  capturedAt: number;
}

/** Sampling gate: only sample while the camera is on, the page is
 *  visible, and the video element actually has frames to draw. */
export function cameraShouldSample(input: { on: boolean; hidden: boolean; videoWidth: number; videoHeight: number }): boolean {
  return input.on && !input.hidden && input.videoWidth > 0 && input.videoHeight > 0;
}

/** A banked frame may ride a send only while it is fresh. */
export function cameraFrameFresh(frame: CameraFramePayload | null, now: number): frame is CameraFramePayload {
  return frame !== null && now - frame.capturedAt <= LIVE_CAMERA_FRAME_STALE_MS;
}

async function drawVideoToJpegBlob(video: HTMLVideoElement, maxEdgePx: number, quality: number): Promise<Blob | null> {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) return null;
  const scale = Math.min(1, maxEdgePx / Math.max(srcW, srcH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => {
    if (typeof canvas.toBlob === "function") canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    else resolve(null);
  });
}

/** Capture the video element's current frame as a chat `image`
 *  payload (768px edge, JPEG) — the live-frame twin of
 *  prepareImagePayload. Null whenever the frame cannot be taken. */
export async function captureCameraFrame(video: HTMLVideoElement): Promise<CameraFramePayload | null> {
  try {
    const blob = await drawVideoToJpegBlob(video, LIVE_CAMERA_FRAME_MAX_EDGE_PX, 0.7);
    if (!blob) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("frame read failed"));
      reader.readAsDataURL(blob);
    });
    const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (!data) return null;
    return { data, mimeType: "image/jpeg", byteSize: blob.size, capturedAt: Date.now() };
  } catch {
    return null;
  }
}

/** Capture the current frame as a full-size photo File (1568px
 *  edge — the still-photo cap), so the preview's "Take a photo"
 *  button stages it through the exact attachment path a picked
 *  photo takes. */
export async function captureCameraPhotoFile(video: HTMLVideoElement): Promise<File | null> {
  try {
    const blob = await drawVideoToJpegBlob(video, MAX_IMAGE_EDGE_PX, 0.85);
    if (!blob) return null;
    return new File([blob], "camera-photo.jpg", { type: "image/jpeg" });
  } catch {
    return null;
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

/** The store's canned-greeting turn when the thread holds ONLY the
 *  seeded greeting (chat-fix3): the marker the seed writes (kind +
 *  greetingLang on the turn) makes "canned-only" mechanically
 *  checkable — a thread with any real exchange, or a lone turn
 *  without the marker, is conversation history and returns null. */
export function cannedGreetingTurn(turns: VisitTurn[]): VisitTurn | null {
  const displayable = turns.filter((turn) => turn.role !== "divider" && !turn.text.startsWith("[visit fact]"));
  if (displayable.length !== 1) return null;
  const only = displayable[0];
  return only.role === "assistant" && only.kind === "canned-greeting" ? only : null;
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
interface SpeechRecognitionErrorEventLike { error: string }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
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

/** Hard cap on a typed-chat send (2026-11-16 outage): when the
 *  chat-completion backend died, sends spun forever and the panel
 *  looked frozen. At 30s the invoke is aborted and the rejection
 *  takes handleSend's normal error path — the canned fallback types
 *  out — instead of the visitor staring at a dead panel. */
export const CHAT_COMPLETION_TIMEOUT_MS = 30_000;

export async function invokeChatCompletion(
  body: Record<string, unknown>,
  timeoutMs: number = CHAT_COMPLETION_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await supabase.functions.invoke("retell-web-call", { body, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  onRequestClose,
  closeGuardRef,
}: ChatWidgetProps) => {
  const presenterDisplayName = presenterName?.trim() || "Aspen";
  // A named presenter means the WHOLE chat is that presenter — display
  // strings AND the brain (sendToAI below). Before 2026-11-14 only the
  // strings followed the presenter while the system prompt still said
  // "You are Aspen", so a Frank demo greeted as Frank and then thought
  // and answered as Aspen.
  const isPresenterChat = Boolean(presenterName?.trim());
  const { t, i18n } = useTranslation();
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
  const [copyStatus,setCopyStatus]=useState('');
  // End-of-chat copy offer (chat-fix5, 2026-11-16): the email form
  // used to live INSIDE the panel under the thread, where it ate a
  // quarter of the box and shoved the current reply's Listen/copy
  // row out of view (Ron's annotated screenshots). It now exists
  // ONLY in the end-of-chat pop-up: copyPopupOpen drives the dialog,
  // copySent records a completed send for this visit (the close
  // guard's "already sent" condition).
  const [copySent,setCopySent]=useState(false);
  const [copyPopupOpen,setCopyPopupOpen]=useState(false);
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
  // Per-chunk object URLs (chat-fix6): a reply's audio is cached
  // chunk by chunk under its message index; the array fills in as
  // chunks land and a replay reuses whatever is already there.
  const replyAudioCacheRef = useRef(new Map<number, Array<string | undefined>>());
  // Playback generation + fetch abort: stopping (toggle-off, a new
  // Listen, unmount) bumps the generation and aborts in-flight
  // chunk fetches, so a superseded player can never start or
  // advance playback afterwards.
  const replyAudioGenRef = useRef(0);
  const replyAudioAbortRef = useRef<AbortController | null>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationBaseRef = useRef("");
  // Dictation keep-recording state (2026-11-17): the browser's
  // recognition session is NOT the dictation — it ends itself on a
  // silence pause or a transient error while the visitor is still
  // mid-thought (Ron's report: cut off ~10s in, mid-sentence). The
  // refs below carry the dictation ACROSS those self-ended sessions:
  // active = the visitor's intent (only their stop tap ends it),
  // committed = final speech banked from sessions that already ended,
  // and the restart bookkeeping backs off instead of spinning when
  // sessions die instantly with nothing heard.
  const dictationActiveRef = useRef(false);
  const dictationCommittedRef = useRef("");
  const dictationSessionFinalRef = useRef("");
  const dictationSessionLastSegmentRef = useRef("");
  const dictationSessionHadResultRef = useRef(false);
  const dictationLastSegmentRef = useRef("");
  const dictationSkipFirstRef = useRef(false);
  const dictationSessionCheckedRef = useRef(false);
  const dictationFailuresRef = useRef(0);
  const dictationRestartTimerRef = useRef<number | null>(null);
  const dictationLangRef = useRef("en-US");
  const dictationEndRef = useRef<(immediate: boolean) => void>(() => { /* set below */ });
  const [dictateError, setDictateError] = useState("");
  // LIVE CAMERA state (2026-11-17): off by default, started only by
  // the visitor's tap on the composer's Camera entry. The stream,
  // the sampler timer and the freshest frame live in refs (frames
  // are never state — they change every 2s and must not re-render
  // the panel); cameraOn mirrors the stream for rendering the
  // preview strip, and cameraOnRef mirrors it for the async
  // callbacks that must never act on a stopped camera.
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [cameraCanFlip, setCameraCanFlip] = useState(false);
  const [cameraStreamVersion, setCameraStreamVersion] = useState(0);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoElRef = useRef<HTMLVideoElement | null>(null);
  const cameraFrameRef = useRef<CameraFramePayload | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const cameraOnRef = useRef(false);
  const cameraStartingRef = useRef(false);
  const cameraIntroSentRef = useRef(false);
  // The intro-turn checker is defined below handleSend (it needs the
  // send plumbing); the sampler reaches it through this ref, the
  // same pattern dictation uses for its controls below handleSend.
  const cameraIntroCheckRef = useRef<() => void>(() => { /* set below */ });

  /** Stop the camera completely: sampler off, every track ended
   *  (the browser's camera light dies with the last track), the
   *  banked frame dropped. Safe to call when already off. */
  const stopCamera = useCallback(() => {
    cameraOnRef.current = false;
    if (cameraTimerRef.current !== null) { window.clearInterval(cameraTimerRef.current); cameraTimerRef.current = null; }
    const stream = cameraStreamRef.current;
    cameraStreamRef.current = null;
    if (stream) stream.getTracks().forEach((track) => { try { track.stop(); } catch { /* already stopped */ } });
    if (cameraVideoElRef.current) { try { cameraVideoElRef.current.srcObject = null; } catch { /* element gone */ } }
    cameraFrameRef.current = null;
    setCameraOn(false);
    setCameraCanFlip(false);
  }, []);

  /** Sample one frame into the bank (the freshest frame is the only
   *  one kept). A landed first frame also pokes the intro check —
   *  she greets what she sees once the camera has something to
   *  show and the panel is free to take the turn. */
  const sampleCameraFrame = useCallback(async () => {
    const video = cameraVideoElRef.current;
    if (!video) return;
    if (!cameraShouldSample({ on: cameraOnRef.current, hidden: typeof document !== "undefined" ? document.hidden : false, videoWidth: video.videoWidth, videoHeight: video.videoHeight })) return;
    const frame = await captureCameraFrame(video);
    if (!frame || !cameraOnRef.current) return;
    const isFirst = cameraFrameRef.current === null;
    cameraFrameRef.current = frame;
    if (isFirst) cameraIntroCheckRef.current();
  }, []);

  const startCamera = useCallback(async () => {
    if (cameraOnRef.current || cameraStartingRef.current) return;
    setCameraError("");
    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!mediaDevices?.getUserMedia) {
      setCameraError(t("chat.cameraUnavailable"));
      return;
    }
    cameraStartingRef.current = true;
    try {
      const stream = await mediaDevices.getUserMedia({ video: { facingMode: cameraFacing }, audio: false });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => { try { track.stop(); } catch { /* already stopped */ } });
        return;
      }
      cameraStreamRef.current = stream;
      cameraOnRef.current = true;
      cameraIntroSentRef.current = false;
      cameraFrameRef.current = null;
      setCameraOn(true);
      // Flip control: only when the device really has a second
      // camera (a coarse-pointer device is the fallback signal —
      // phones/tablets carry front + back even when enumeration
      // is stingy before permission settles).
      try {
        const devices = typeof mediaDevices.enumerateDevices === "function" ? await mediaDevices.enumerateDevices() : [];
        const cameraCount = devices.filter((device) => device.kind === "videoinput").length;
        const coarse = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
        if (mounted.current && cameraOnRef.current) setCameraCanFlip(cameraCount > 1 || coarse);
      } catch { /* flip simply stays hidden */ }
      if (cameraTimerRef.current !== null) window.clearInterval(cameraTimerRef.current);
      cameraTimerRef.current = window.setInterval(() => { void sampleCameraFrame(); }, LIVE_CAMERA_FRAME_INTERVAL_MS);
      void sampleCameraFrame();
    } catch (err) {
      const name = (err as { name?: string } | null)?.name ?? "";
      setCameraError(name === "NotAllowedError" || name === "SecurityError"
        ? t("chat.cameraDenied", { name: presenterDisplayName })
        : t("chat.cameraUnavailable"));
    } finally {
      cameraStartingRef.current = false;
    }
  }, [cameraFacing, sampleCameraFrame, t, presenterDisplayName]);

  const flipCamera = useCallback(async () => {
    if (!cameraOnRef.current || cameraStartingRef.current) return;
    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!mediaDevices?.getUserMedia) return;
    const next = cameraFacing === "user" ? "environment" : "user";
    cameraStartingRef.current = true;
    try {
      const stream = await mediaDevices.getUserMedia({ video: { facingMode: next }, audio: false });
      if (!mounted.current || !cameraOnRef.current) {
        stream.getTracks().forEach((track) => { try { track.stop(); } catch { /* already stopped */ } });
        return;
      }
      const previous = cameraStreamRef.current;
      cameraStreamRef.current = stream;
      if (previous) previous.getTracks().forEach((track) => { try { track.stop(); } catch { /* already stopped */ } });
      setCameraFacing(next);
      setCameraStreamVersion((version) => version + 1);
      void sampleCameraFrame();
    } catch {
      if (mounted.current) setCameraError(t("chat.cameraUnavailable"));
    } finally {
      cameraStartingRef.current = false;
    }
  }, [cameraFacing, sampleCameraFrame, t]);

  // Attach the live stream to the preview element whenever it
  // (re)mounts or the stream is replaced (flip). A muted inline
  // preview may autoplay; a refused play() just leaves the sampler
  // to work from the element's frames once it can.
  useEffect(() => {
    if (!cameraOn) return;
    const video = cameraVideoElRef.current;
    const stream = cameraStreamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      try {
        const played = video.play();
        if (played && typeof played.catch === "function") played.catch(() => { /* preview refusal is not fatal */ });
      } catch { /* element cannot play yet */ }
    }
    // First frame as soon as the preview can produce one; the
    // sampler's 2s tick is the backstop when metadata is slow.
    void sampleCameraFrame();
  }, [cameraOn, cameraStreamVersion, sampleCameraFrame]);

  // The camera never runs while the chat is not the active mode
  // (voice mode, panel closed) or while the widget is minimized —
  // capture follows the visitor's eyes, exactly like dictation.
  useEffect(() => { if (!active && cameraOn) stopCamera(); }, [active, cameraOn, stopCamera]);
  useEffect(() => { if (isMinimized && cameraOn) stopCamera(); }, [isMinimized, cameraOn, stopCamera]);
  const objectUrlsRef = useRef<string[]>([]);
  const [speechSupported] = useState(() => Boolean(speechRecognitionCtor()));
  // Chat-fix4 (2026-11-16, Ron's redesign): composer focus state.
  // Focus on ANY composer control counts (field, +, mic, voice-mode,
  // send); the blur handler checks focus stayed inside the composer
  // before clearing. It drives the typing layout (full-width field,
  // controls below) and the space reclamation while typing (chips
  // row + email-transcript line hide until blur).
  const [composerActive, setComposerActive] = useState(false);
  const chipsScrollRef = useRef<HTMLDivElement>(null);
  const chipsObserverRef = useRef<ResizeObserver | null>(null);
  const [chipsOverflow, setChipsOverflow] = useState(false);
  const measureChips = useCallback(() => {
    const el = chipsScrollRef.current;
    if (el) setChipsOverflow(el.scrollWidth > el.clientWidth + 4 && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  // Callback ref (not an effect): the chips row mounts only after
  // the consent click re-renders this widget, so an effect keyed on
  // the usual deps never re-runs to measure it — the callback fires
  // exactly when the row mounts, and again if it remounts.
  const chipsScrollCallbackRef = useCallback((el: HTMLDivElement | null) => {
    chipsScrollRef.current = el;
    chipsObserverRef.current?.disconnect();
    chipsObserverRef.current = null;
    if (!el) return;
    measureChips();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measureChips);
      observer.observe(el);
      chipsObserverRef.current = observer;
    }
  }, [measureChips]);
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
      stopCamera();
      dictationActiveRef.current = false;
      if (dictationRestartTimerRef.current !== null) { window.clearTimeout(dictationRestartTimerRef.current); dictationRestartTimerRef.current = null; }
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      replyAudioGenRef.current += 1;
      replyAudioAbortRef.current?.abort();
      if (replyAudioRef.current) { try { replyAudioRef.current.pause(); } catch { /* already stopped */ } replyAudioRef.current = null; }
      objectUrlsRef.current.forEach((url) => { try { URL.revokeObjectURL(url); } catch { /* already gone */ } });
      objectUrlsRef.current = [];
    };
  }, []);

  // isStreaming is a dep on purpose (chat-fix5): a reply's
  // Listen/copy/thumbs row only mounts when streaming ENDS, growing
  // the thread by its height after the last chunk's scroll — without
  // this final pass the row sat ~10px below the fold, the tail of
  // Ron's photographed complaint.
  useEffect(() => {
    const panel = messagesEndRef.current?.parentElement;
    if (panel && followLatest.current) panel.scrollTop = panel.scrollHeight;
  }, [messages, isThinking, isStreaming]);

  const quickPrompts = useMemo(() => {
    // Suggestion chips live in the locale catalogs (chat-fix3,
    // 2026-11-16): they used to be 18 hardcoded English strings, so
    // a Portuguese chat wore English chips under a Portuguese
    // greeting (Ron's second phone test). The niche set and the
    // three-per-niche shape are unchanged; the strings now render
    // in the chat's effective language.
    const niche = ["realtors", "medspa", "autodetail", "veterinary", "marine"].includes(businessNiche) ? businessNiche : "general";
    const prompts = [1, 2, 3].map((n) => t(`chat.prompts.${niche}.${n}`, { lng: effectiveChatLocale }));
    // Presenter demos: the starter questions name the presenter too —
    // "What can Aspen do…" under a Frank demo was part of the same
    // wrong-identity bug. Aspen surfaces keep the strings untouched.
    return isPresenterChat ? prompts.map((prompt) => prompt.replace(/Aspen/g, presenterDisplayName)) : prompts;
  }, [businessNiche, isPresenterChat, presenterDisplayName, t, effectiveChatLocale]);

  // The language the canned greeting must speak RIGHT NOW: the
  // chat's effective locale when one is in force, else the site's
  // current UI language (which itself resolves pick → browser).
  const currentChatLang = normalizeUiLocale(effectiveChatLocale) ?? normalizeUiLocale(i18n.language) ?? "en";

  /** Compose the canned opening greeting in a given language (the
   *  chat's effective locale when omitted). One composer for the
   *  seed, the language repair below, and its legacy-store check,
   *  so all three always agree byte-for-byte. */
  const buildGreeting = useCallback((lang?: string) => {
    const hour = new Date().getHours();
    const dayPart = hour < 12 ? "chat.goodMorning" : hour < 17 ? "chat.goodAfternoon" : "chat.goodEvening";
    const firstName = callerName?.split(" ")[0]?.trim();
    const nameGreet = firstName ? `, ${firstName}` : "";
    return `${t(dayPart, { lng: lang })}${nameGreet}! 👋 ${t("chat.greetingBody", { businessName, name: presenterDisplayName, lng: lang })}`;
  }, [t, callerName, businessName, presenterDisplayName]);

  // Standalone surfaces (no visit store): whether the local thread
  // still holds ONLY the seeded greeting. Cleared the moment a
  // real exchange begins (handleSend), like the store marker.
  const cannedLocalRef = useRef(false);

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

    const greeting = buildGreeting(effectiveChatLocale);

    setMessages([{ role: "assistant", content: greeting }]);
    if (memoryKey) {
      // The greeting joins the shared thread, so a later switch to
      // voice resumes from the whole conversation, greeting included.
      // It carries the canned-greeting marker + the language it was
      // composed in, so the repair below can recognize a thread
      // holding ONLY this greeting and re-seed it if the site's
      // language moves on (chat-fix3).
      visitMemoryAppend(memoryKey, { role: "assistant", text: greeting, kind: "canned-greeting", greetingLang: currentChatLang });
      consumedTurnsRef.current = visitMemoryGet(memoryKey).length;
    } else {
      cannedLocalRef.current = true;
    }
  }, [businessName, callerName, buildGreeting, effectiveChatLocale, currentChatLang, memoryKey]);

  // CANNED-GREETING LANGUAGE REPAIR (chat-fix3, Ron's second phone
  // test): he switched the site to English and the chat still
  // opened with "Boa noite!" — the greeting had been seeded in
  // Portuguese under an earlier pick and nothing ever revisited it.
  // When the chat opens, and whenever the language changes while it
  // is open, a thread holding ONLY the canned greeting is re-seeded
  // in the current language — in component state AND in the visit
  // store. A thread with any real visitor/assistant exchange is
  // history and is never rewritten.
  const repairCannedGreeting = useCallback(() => {
    if (!initialized.current) return;
    if (memoryKey) {
      const raw = visitMemoryGet(memoryKey);
      let canned = cannedGreetingTurn(raw);
      if (!canned) {
        // Legacy stores seeded before the marker existed: recognize
        // the canned greeting by exact composition — the lone
        // displayable turn IS this composer's output in one of the
        // supported languages. Anything else is real history.
        const displayable = raw.filter((turn) => turn.role !== "divider" && !turn.text.startsWith("[visit fact]"));
        if (displayable.length === 1 && displayable[0].role === "assistant"
          && ["en", "es", "pt-BR", "fr-CA"].some((lang) => displayable[0].text === buildGreeting(lang))) {
          canned = displayable[0];
        }
      }
      if (!canned) return;
      if (canned.greetingLang === currentChatLang) return;
      const fresh = buildGreeting(currentChatLang);
      if (canned.text === fresh) return;
      visitMemorySet(memoryKey, raw.map((turn) => (turn === canned ? { ...turn, text: fresh, kind: "canned-greeting" as const, greetingLang: currentChatLang } : turn)));
      consumedTurnsRef.current = visitMemoryGet(memoryKey).length;
      setMessages([{ role: "assistant", content: fresh }]);
      return;
    }
    if (!cannedLocalRef.current) return;
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0].role !== "assistant") return prev;
      const fresh = buildGreeting(currentChatLang);
      return prev[0].content === fresh ? prev : [{ role: "assistant", content: fresh }];
    });
  }, [memoryKey, currentChatLang, buildGreeting]);
  useEffect(() => { repairCannedGreeting(); }, [repairCannedGreeting]);

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
    // Homepage sales only (Ron's direction, 2026-11-16): where the
    // business being sold is AI Hidden Leads itself, a plan question
    // gets a direct, truthful answer FIRST — the meeting offer is a
    // next step, never a dodge. Presenter demos and prospect
    // simulations answer for the demo business; they never see this.
    const isHomepageSalesChat = !isPresenterChat && businessName.trim().toLowerCase() === "ai hidden leads";
    const homepagePlanBlock = isHomepageSalesChat ? `
AI HIDDEN LEADS PLANS — ANSWER FIRST:
- When the visitor asks about plans, minutes or pricing — including "do you have an unlimited plan?" — ANSWER directly and truthfully FIRST, before offering any next step.
- There is NO unlimited plan and NO Enterprise plan. Never claim one exists and never quote a price for one.
- The plans are Premium ($99/month — 400 minutes, up to 50 B2B prospects a month), Professional ($199/month — 1,200 minutes, up to 100 prospects) and Platinum ($349/month — 2,500 minutes, up to 200 prospects).
- A price question is a question about MONEY: when the visitor asks "how much", what it costs, or anything about price, lead with the DOLLAR prices — Premium $99/month, Professional $199/month, Platinum $349/month — each with what it includes (its minutes and prospects); minutes are supporting detail, never the whole answer. Never answer a money question with minutes alone.
- If they need more than Platinum offers, say the sales director can sometimes arrange custom terms for larger needs — offer that conversation only AFTER answering, never instead of answering.
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
${presenterKnowledgeBlock}${homepagePlanBlock}

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

    const { data, error } = await invokeChatCompletion({
      action: "chat-completion",
      locale: effectiveChatLocale,
      systemPrompt,
      // A message with an attachment carries the bracketed note as
      // its payload suffix (the thread itself shows the chip, not
      // the note). A PHOTO additionally rides as `image` — the
      // downscaled JPEG the endpoint attaches to the last user
      // message as an image part, so the model sees it too. A LIVE
      // CAMERA turn carries the camera-frame note instead, so the
      // model reads the image as the visitor's camera right now.
      messages: conversationHistory.map((m) => ({ role: m.role, content: m.attachment || m.cameraFrame ? `${m.content}${m.attachment ? ` ${attachmentNote(m.attachment)}` : ""}${m.cameraFrame ? ` ${CAMERA_FRAME_NOTE}` : ""}`.trim() : m.content })),
      ...(image ? { image } : {}),
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

  /** Run one visitor turn end to end: append the message, log it,
   *  join the visit thread, ask the brain, type the reply (or the
   *  canned fallback on failure). Shared by handleSend and the
   *  live-camera intro turn — the two ways a visitor turn begins. */
  const dispatchTurn = async (userMessage: Message, loggedText: string, imagePayload?: { data: string; mimeType: string }) => {
    const updated = [...messages, userMessage];
    followLatest.current = true;
    // A real exchange has begun: the thread is history from here —
    // the canned-greeting repair must never touch it again.
    cannedLocalRef.current = false;
    setMessages(updated);
    setIsThinking(true);
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
  };

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

    // LIVE CAMERA (2026-11-17): while the camera is live, the
    // freshest banked frame rides this send on the same vision
    // path — so "what do you see?" (or anything else) is answered
    // about the camera's current view. A staged photo wins: the
    // visitor explicitly chose that image for this message.
    let cameraFrameUsed = false;
    if (!imagePayload && cameraOnRef.current) {
      const frame = cameraFrameRef.current;
      if (cameraFrameFresh(frame, Date.now())) {
        imagePayload = { data: frame.data, mimeType: frame.mimeType };
        cameraFrameUsed = true;
      }
    }

    if (!prefill) {
      // A send ends any dictation in flight (contract: send is one
      // of the only ways a dictation ends) — the field is about to
      // clear, and a live session would refill it mid-send. Via the
      // ref: the dictation controls live below handleSend in this
      // file, and the active flag is never stale.
      if (dictationActiveRef.current) dictationEndRef.current(true);
      setInput("");
      setAttachment(null);
      attachmentFileRef.current = null;
      setAttachError("");
    }

    const userMessage: Message = { role: "user", content: userMsg, ...(staged ? { attachment: staged } : {}), ...(cameraFrameUsed ? { cameraFrame: true } : {}) };
    let loggedText = staged ? `${userMsg} ${attachmentNote(staged)}`.trim() : userMsg;
    if (cameraFrameUsed) loggedText = `${loggedText} ${CAMERA_FRAME_NOTE}`.trim();
    await dispatchTurn(userMessage, loggedText, imagePayload);
  }, [input, isBusy, messages, ownerLabel, typeAssistantResponse, recordingAgreed, attachment, memoryKey]);

  // LIVE CAMERA intro turn (2026-11-17): once per camera start,
  // when the first frame is banked and no reply is in flight, she
  // gets one vision turn — the visitor's "I turned on my camera"
  // line with the frame riding it (and its thumbnail in the
  // thread) — so she greets what she sees instead of waiting to be
  // asked. If a reply IS in flight, the check runs again when the
  // panel frees up (the isBusy effect below); if the camera stops
  // first, the check no-ops on the refs.
  const checkCameraIntro = () => {
    if (cameraIntroSentRef.current || !cameraOnRef.current || isBusy || !recordingAgreed) return;
    const frame = cameraFrameRef.current;
    if (!cameraFrameFresh(frame, Date.now())) return;
    cameraIntroSentRef.current = true;
    const introText = t("chat.cameraIntroAsk");
    const userMessage: Message = {
      role: "user",
      content: introText,
      cameraFrame: true,
      attachment: { name: t("chat.cameraLive"), type: "image/jpeg", size: frame.byteSize, previewUrl: `data:${frame.mimeType};base64,${frame.data}` },
    };
    void dispatchTurn(userMessage, `${introText} ${CAMERA_FRAME_NOTE}`.trim(), { data: frame.data, mimeType: frame.mimeType });
  };
  useEffect(() => { cameraIntroCheckRef.current = checkCameraIntro; });
  useEffect(() => { if (!isBusy && cameraOn) cameraIntroCheckRef.current(); }, [isBusy, cameraOn]);

  // Dictation (Gemini-style mic inside the composer): tap to start,
  // tap the square stop state to end. Interim results update the
  // field live while recording; the recognized speech lands as TEXT
  // IN THE FIELD and is NEVER auto-sent — the visitor reviews, taps
  // in and edits (recognition errors, TV noise, accents), mixes in
  // typed corrections, and sends only by tapping Send. The button
  // only exists when the browser offers the SpeechRecognition API.
  //
  // KEEP-RECORDING (2026-11-17, Ron's report): the browser's
  // recognition session is not the dictation. Sessions end THEMSELVES
  // — Chrome stops on a silence pause, engines cut long sessions —
  // and the old code treated that self-end as the visitor finishing,
  // truncating him mid-sentence (~10s in). Now a session that ends
  // while the visitor's intent stands is restarted seamlessly, its
  // final speech banked first so nothing is lost or repeated; ONLY
  // the visitor's stop tap (or send / voice-mode switch / unmount)
  // ends a dictation. A hard mic denial ends it too, with a notice —
  // restarting against a denied permission would spin forever.
  const endDictation = useCallback((immediate: boolean) => {
    dictationActiveRef.current = false;
    if (dictationRestartTimerRef.current !== null) { window.clearTimeout(dictationRestartTimerRef.current); dictationRestartTimerRef.current = null; }
    const recognition = recognitionRef.current;
    if (immediate) {
      recognitionRef.current = null;
      if (recognition) { try { recognition.abort(); } catch { /* already gone */ } }
      setDictating(false);
      return;
    }
    if (recognition) {
      // Graceful stop: the engine delivers any last final result,
      // then onend sees the intent flag down and finishes teardown.
      try { recognition.stop(); } catch { recognitionRef.current = null; setDictating(false); }
    } else {
      // Between sessions (a restart was pending): nothing to stop.
      setDictating(false);
    }
  }, []);

  const dictationStartRef = useRef<() => void>(() => { /* set below */ });
  const scheduleDictationRestart = useCallback((hadResult: boolean) => {
    if (!hadResult) dictationFailuresRef.current += 1;
    const failures = dictationFailuresRef.current;
    const delay = hadResult ? 120 : Math.min(250 * 2 ** Math.max(0, failures - 1), 2500);
    dictationRestartTimerRef.current = window.setTimeout(() => {
      dictationRestartTimerRef.current = null;
      dictationStartRef.current();
    }, delay);
  }, []);

  const startDictationSession = useCallback(() => {
    if (!dictationActiveRef.current) return;
    const Ctor = speechRecognitionCtor();
    if (!Ctor) { dictationActiveRef.current = false; setDictating(false); return; }
    const recognition = new Ctor();
    // Dictation speaks the language the visitor is actually seeing
    // (chat-fix3): the explicit pick when there is one, else the
    // session's current UI language — the same currentChatLang the
    // greeting, chips and Listen follow. (The VOICE session's
    // language stays explicit-pick-only; that lock is separate.)
    // The language is captured when the dictation STARTS, so a
    // restarted session keeps listening in the same language.
    recognition.lang = dictationLangRef.current;
    recognition.interimResults = true;
    // continuous too: it lengthens each session, but the restart
    // below is what actually guarantees no mid-sentence cutoff —
    // some engines ignore continuous and end anyway.
    recognition.continuous = true;
    dictationSessionFinalRef.current = "";
    dictationSessionLastSegmentRef.current = "";
    dictationSessionHadResultRef.current = false;
    dictationSkipFirstRef.current = false;
    dictationSessionCheckedRef.current = false;
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      dictationSessionHadResultRef.current = true;
      dictationFailuresRef.current = 0;
      const results = event.results;
      // Replay guard: a restarted session can re-deliver the last
      // banked sentence as its first final result (the classic
      // restart duplicate). Detect that once, on the session's first
      // result event, and skip exactly that one segment.
      if (!dictationSessionCheckedRef.current) {
        dictationSessionCheckedRef.current = true;
        const first = results.length > 0 ? results[0] : undefined;
        if (first?.isFinal && first[0].transcript.trim() && first[0].transcript.trim() === dictationLastSegmentRef.current) {
          dictationSkipFirstRef.current = true;
        }
      }
      let live = "";
      let finals = "";
      let lastFinal = "";
      for (let i = dictationSkipFirstRef.current ? 1 : 0; i < results.length; i++) {
        const transcript = results[i][0].transcript;
        live += transcript;
        if (results[i].isFinal) { finals += transcript; lastFinal = transcript; }
      }
      dictationSessionFinalRef.current = finals;
      if (lastFinal.trim()) dictationSessionLastSegmentRef.current = lastFinal.trim();
      const base = [dictationBaseRef.current, dictationCommittedRef.current].map((part) => part.trim()).filter(Boolean).join(" ");
      const spoken = live.trim();
      setInput([base, spoken].filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      const code = event?.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        // Hard failure — the mic is denied or there is no mic at
        // all. Restarting would spin against a wall: end the
        // dictation and say why, in the chat's language.
        dictationActiveRef.current = false;
        if (dictationRestartTimerRef.current !== null) { window.clearTimeout(dictationRestartTimerRef.current); dictationRestartTimerRef.current = null; }
        recognitionRef.current = null;
        setDictating(false);
        setDictateError(t("chat.dictateMicDenied"));
      }
      // Transient errors ('no-speech', 'network', 'aborted') are
      // not the end of the dictation: onend follows and restarts
      // while the visitor's intent stands.
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      // Bank this session's final speech before anything else: a
      // restarted session starts with an empty result list, so
      // anything not committed here would vanish from the field —
      // and anything committed twice would repeat a sentence.
      const finalText = dictationSessionFinalRef.current.trim();
      if (finalText) {
        dictationCommittedRef.current = [dictationCommittedRef.current.trim(), finalText].filter(Boolean).join(" ");
        if (dictationSessionLastSegmentRef.current) dictationLastSegmentRef.current = dictationSessionLastSegmentRef.current;
      }
      dictationSessionFinalRef.current = "";
      dictationSessionLastSegmentRef.current = "";
      if (!dictationActiveRef.current) { setDictating(false); return; }
      scheduleDictationRestart(dictationSessionHadResultRef.current);
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {
      // start() can throw when the previous session has not fully
      // released the mic yet — route through the same restart path
      // instead of killing the dictation.
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (dictationActiveRef.current) scheduleDictationRestart(false);
      else setDictating(false);
    }
  }, [scheduleDictationRestart, t]);

  useEffect(() => { dictationStartRef.current = startDictationSession; dictationEndRef.current = endDictation; }, [startDictationSession, endDictation]);

  const toggleDictation = useCallback(() => {
    if (dictating) {
      endDictation(false);
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    dictationBaseRef.current = input;
    dictationCommittedRef.current = "";
    dictationLastSegmentRef.current = "";
    dictationFailuresRef.current = 0;
    dictationLangRef.current = speechLangFor(currentChatLang);
    dictationActiveRef.current = true;
    setDictateError("");
    setDictating(true);
    dictationStartRef.current();
  }, [dictating, input, currentChatLang, endDictation]);

  // Leaving the typed chat (voice-mode switch, panel collapse)
  // ends any dictation in flight — the composer mic never captures
  // while the visitor is somewhere else.
  useEffect(() => { if (!active && dictating) endDictation(true); }, [active, dictating, endDictation]);

  // Attachment staging: one path for the Photos / Files inputs and
  // the live camera's snapshot — same guardrails (type allow-list,
  // 10 MB cap) and the same staged chip whichever way the file
  // arrived.
  const stagePickedFile = useCallback((file: File) => {
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

  const handleFilePicked = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAttachMenuOpen(false);
    if (!file) return;
    stagePickedFile(file);
  }, [stagePickedFile]);

  // LIVE CAMERA snapshot (2026-11-17): the preview's photo button
  // freezes the current frame as a staged photo — from here it is
  // indistinguishable from a picked photo (same chip, same
  // downscale-and-send vision path). The live camera keeps running.
  const snapshotCamera = useCallback(async () => {
    const video = cameraVideoElRef.current;
    if (!video || !cameraOnRef.current) return;
    const file = await captureCameraPhotoFile(video);
    if (file && mounted.current && cameraOnRef.current) stagePickedFile(file);
  }, [stagePickedFile]);

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
  //
  // CHUNKED PLAYBACK (chat-fix6): the function synthesizes a whole
  // request before returning, so one request for a long reply cost
  // ~30s of silence before the first sound. The reply is now split
  // into sentence-sized chunks (lib/readAloudChunks.ts): chunk 1 is
  // requested first and plays as soon as it lands, later chunks are
  // prefetched while the current one plays and are played in order
  // on the same audio element. Stopping (toggle-off, another
  // Listen, unmount) bumps the playback generation and aborts
  // in-flight fetches, so nothing stale can start or advance.
  const stopReplyAudio = useCallback(() => {
    replyAudioGenRef.current += 1;
    replyAudioAbortRef.current?.abort();
    replyAudioAbortRef.current = null;
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
    const chunks = splitReadAloudChunks(text);
    if (chunks.length === 0) return;
    const gen = replyAudioGenRef.current;
    const stale = () => gen !== replyAudioGenRef.current || !mounted.current;
    const controller = new AbortController();
    replyAudioAbortRef.current = controller;
    const existing = replyAudioCacheRef.current.get(index);
    const chunkUrls: Array<string | undefined> = existing && existing.length === chunks.length ? existing : new Array<string | undefined>(chunks.length);
    if (chunkUrls !== existing) replyAudioCacheRef.current.set(index, chunkUrls);
    const fullyCached = chunkUrls.every(Boolean);
    const inflight = new Map<number, Promise<string>>();
    const getChunkUrl = (i: number): Promise<string> => {
      const hit = chunkUrls[i];
      if (hit) return Promise.resolve(hit);
      let pending = inflight.get(i);
      if (!pending) {
        pending = (async () => {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-read-aloud`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ text: chunks[i], voice: readAloudVoice }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`read-aloud failed [${res.status}]`);
          const url = URL.createObjectURL(await res.blob());
          chunkUrls[i] = url;
          objectUrlsRef.current.push(url);
          return url;
        })();
        inflight.set(i, pending);
      }
      return pending;
    };
    const fail = () => {
      if (stale()) return;
      stopReplyAudio();
      setListenLoadingIndex(null);
      setListenErrorIndex(index);
    };
    // The element is created lazily, only once chunk 1's URL is in
    // hand: a failed synthesis must leave nothing constructed or
    // playing behind (the chat-revamp pin), just the error line.
    let audio: HTMLAudioElement | null = null;
    let current = -1;
    const ensureAudio = (): HTMLAudioElement => {
      if (!audio) {
        audio = new Audio();
        replyAudioRef.current = audio;
        audio.onended = () => { void playChunk(current + 1); };
        audio.onerror = () => { fail(); };
      }
      return audio;
    };
    const playChunk = async (i: number): Promise<void> => {
      if (stale()) return;
      if (i >= chunks.length) {
        if (audio && replyAudioRef.current === audio) { replyAudioRef.current = null; setSpeakingIndex(null); }
        return;
      }
      current = i;
      let url: string;
      try { url = await getChunkUrl(i); } catch { fail(); return; }
      if (stale()) return;
      // Prefetch the next chunk while this one plays; a prefetch
      // failure surfaces when playback actually reaches that chunk.
      if (i + 1 < chunks.length) void getChunkUrl(i + 1).catch(() => { /* reached-chunk handling reports it */ });
      const el = ensureAudio();
      el.src = url;
      try { await el.play(); } catch { fail(); return; }
      if (i === 0 && !stale()) { setListenLoadingIndex(null); setSpeakingIndex(index); }
    };
    if (!fullyCached) setListenLoadingIndex(index);
    await playChunk(0);
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

  // TYPING LAYOUT (chat-fix4, Ron's words: "when you start typing the
  // controls for the mic and the listen and the send arrow would be
  // below and the text would go the whole length"): the composer is
  // in its typing layout while it is focused OR holds text OR stages
  // an attachment — the textarea then spans the composer's full
  // width and the control buttons move to a row below it. Pure
  // class switching on the same mounted elements: focus and text
  // survive the switch. The mic renders in BOTH layouts, always —
  // Ron contrasted apps where the mic vanishes once typing starts.
  const typingLayout = composerActive || input.length > 0 || !!attachment;

  // END-OF-CHAT COPY POP-UP (chat-fix5, 2026-11-16, Ron's design:
  // "make a pop-up at the end — when you click the end or try to
  // close, offer that as a pop-up"). The close guard intercepts the
  // panel's close ONCE per visit, only when a real conversation
  // happened (a visitor message AND a completed Aspen reply after
  // it — the seeded greeting alone never counts) and no copy has
  // been sent yet. Every dismissal route (No thanks, the pop-up's X,
  // the backdrop, and the post-send close) marks the offer resolved
  // and finishes the close through the shell's own close function,
  // so the guard can never loop or nag twice. Minimize never comes
  // near this code — the shells consult the guard only in their
  // close functions.
  const copyOfferResolvedRef = useRef(false);
  const copyGuardStateRef = useRef({ hasConversation: false, copySent: false });
  const firstUserIndex = messages.findIndex((m) => m.role === "user");
  const hasConversation = firstUserIndex >= 0
    && messages.slice(firstUserIndex + 1).some((m) => m.role === "assistant" && m.content.trim().length > 0);
  useEffect(() => {
    copyGuardStateRef.current = { hasConversation, copySent };
  }, [hasConversation, copySent]);
  const tryInterceptClose = useCallback((): boolean => {
    const state = copyGuardStateRef.current;
    if (!state.hasConversation || state.copySent || copyOfferResolvedRef.current) return false;
    setCopyPopupOpen(true);
    return true;
  }, []);
  useEffect(() => {
    if (!closeGuardRef) return;
    closeGuardRef.current = tryInterceptClose;
    return () => { if (closeGuardRef.current === tryInterceptClose) closeGuardRef.current = null; };
  }, [closeGuardRef, tryInterceptClose]);
  const finishCloseFromPopup = useCallback(() => {
    copyOfferResolvedRef.current = true;
    setCopyPopupOpen(false);
    (onRequestClose ?? onClose)?.();
  }, [onRequestClose, onClose]);
  // The copy send itself is byte-identical to the old inline form's
  // submit (chat-fix5 only relocated it): flush the pending record
  // writes first, then the same conversation-records chatCopy call
  // with the same capability, email and consent payload.
  const submitCopy = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    await recordQueue.current;
    const { error } = await supabase.functions.invoke('conversation-records', { body: { action: 'chatCopy', capability: sessionId.current, email: copyEmail, consent: true } });
    if (error) {
      setCopyStatus(t("chat.copyUnavailable"));
    } else {
      setCopyStatus(t("chat.copyRequested"));
      setCopySent(true);
    }
  }, [copyEmail, t]);
  // The pop-up is portaled to the body (the panel lives inside a
  // transformed, sometimes-hidden shell, so an in-tree dialog could
  // be clipped or invisible) and sized against the VISUAL viewport
  // while it is open — the fix4 lesson: dvh does not shrink when the
  // on-screen keyboard opens, so the email field rides the visual
  // viewport's own box and stays above the keyboard.
  const [copyPopupBox, setCopyPopupBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    if (!copyPopupOpen) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setCopyPopupBox({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [copyPopupOpen]);

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
              onClick={() => { if (!tryInterceptClose()) onClose(); }}
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
      <div data-testid="chat-message-list" aria-label={t("chat.messagesAria", { name: presenterDisplayName })} role="region" onScroll={event => { const panel = event.currentTarget; followLatest.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 48; }} className={`${embedded ? 'min-h-0 flex-1' : 'max-h-[22rem]'} overflow-y-auto overscroll-contain touch-pan-y p-3 space-y-2.5`}>
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

        {/* The suggestion chips used to render here, wrapping into
            3–4 stacked lines inside the thread. Chat-fix4 moved them
            to a pinned horizontal row above the composer (below). */}

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
       {/* SUGGESTION CHIPS (chat-fix4, 2026-11-16, Ron's redesign):
           ONE horizontal row, sideways-scrollable, never stacked —
           with a right-edge fade + chevron while more chips sit
           off-screen. The row is pinned above the composer (it left
           the message list, where it wrapped into 3–4 lines) and
           hides while typing (display-only; it returns on blur). */}
       {!userHasMessaged && (
        <div data-testid="chat-chips" className={`relative mb-2 ${typingLayout ? 'hidden' : ''}`}>
          <div ref={chipsScrollCallbackRef} data-chips-scroll onScroll={measureChips} className="flex flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void handleSend(prompt)}
                disabled={isBusy}
                className="shrink-0 whitespace-nowrap rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
          {chipsOverflow && (
            <div data-testid="chat-chips-more" aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-card via-card/85 to-transparent pr-0.5">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
       )}
       {/* The email-transcript block used to render HERE, between the
           thread and the composer (chat-fix5 removed it, Ron's
           order): it stood in the panel permanently once the visitor
           had messaged and shoved the current reply's action row out
           of view. The offer now lives ONLY in the end-of-chat
           pop-up rendered at the bottom of this component — the
           thread and composer own this whole column again. */}
       {/* GEMINI-STYLE COMPOSER (Ron, 2026-11-16, from his annotated
           Gemini app screenshot): ONE rounded bar — the "+" attach
           menu at the left (Camera / Photos / Files, exactly three
           entries — since 2026-11-17 the Camera entry starts the
           LIVE in-panel camera instead of the OS capture picker),
           the text field, an in-field dictation mic, the
           voice-mode switch (waveform), and a send button that
           appears once there is something to send. Enter sends,
           Shift+Enter keeps the newline, as before.
           TWO LAYOUTS (chat-fix4, same day, Ron's unfolded-phone
           screenshots): IDLE is that single row unchanged. TYPING
           (focused or holding text) wraps the bar: the textarea
           takes the full width on its own line — his text wrapped
           at ~2 words per line when the buttons squeezed it from
           both sides — and the controls drop to a row below (send
           right-aligned). The wrap is pure flex classes on the same
           mounted elements (the controls wrapper is `contents` in
           idle, a flex row in typing), so focus and text survive
           the switch; the mic renders in both layouts, always. */}
       {/* LIVE CAMERA PREVIEW (2026-11-17): the visitor's self-view
           while the camera is on — a strip in the composer column
           (the header, chips and composer bar keep their approved
           layout). The red LIVE pill is the always-visible
           camera-on indicator; the corner buttons flip (only when
           a second camera exists), snapshot a still into the
           staged-attachment path, and stop the camera outright. */}
       {cameraOn && (
        <div data-testid="chat-camera-preview" className="relative mb-2 overflow-hidden rounded-xl border border-border bg-black">
          <video
            ref={(el) => { cameraVideoElRef.current = el; }}
            autoPlay
            muted
            playsInline
            aria-label={t("chat.cameraLive")}
            className={`max-h-40 w-full object-cover ${cameraFacing === "user" ? "-scale-x-100" : ""}`}
          />
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {t("chat.cameraLive")}
          </div>
          <div className="absolute right-2 top-2 flex items-center gap-1.5">
            {cameraCanFlip && (
              <button type="button" onClick={() => void flipCamera()} aria-label={t("chat.cameraFlip")} title={t("chat.cameraFlip")} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"><SwitchCamera className="h-4 w-4" /></button>
            )}
            <button type="button" onClick={() => void snapshotCamera()} aria-label={t("chat.cameraSnapshot")} title={t("chat.cameraSnapshot")} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"><Camera className="h-4 w-4" /></button>
            <button type="button" onClick={stopCamera} aria-label={t("chat.cameraStop")} title={t("chat.cameraStop")} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"><X className="h-4 w-4" /></button>
          </div>
        </div>
       )}
       {attachment && (
        <div data-testid="chat-attachment-chip" className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-secondary px-2.5 py-1.5">
          {attachment.previewUrl ? <img src={attachment.previewUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{attachment.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatFileSize(attachment.size)}</span>
          <button type="button" onClick={() => { setAttachment(null); attachmentFileRef.current = null; }} aria-label={t("chat.removeAttachment")} title={t("chat.removeAttachment")} className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
       )}
       {attachError && <p role="alert" className="mb-2 text-[11px] font-medium text-destructive">{attachError}</p>}
       {dictateError && <p role="alert" className="mb-2 text-[11px] font-medium text-destructive">{dictateError}</p>}
       {cameraError && <p role="alert" className="mb-2 text-[11px] font-medium text-destructive">{cameraError}</p>}
       <div data-testid="chat-composer" data-layout={typingLayout ? 'typing' : 'idle'} onFocus={() => setComposerActive(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setComposerActive(false); }} className="flex flex-wrap items-end gap-0.5 rounded-[1.75rem] border border-border bg-background px-1.5 py-1.5 shadow-sm transition-colors focus-within:border-primary/60">
        <textarea
          ref={inputRef}
          aria-label={t("chat.messageAria", { name: presenterDisplayName })}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder={t("chat.placeholder", { name: presenterDisplayName })}
          rows={1}
          className={`order-1 max-h-24 w-full min-w-0 resize-none bg-transparent px-1.5 py-2 text-base leading-snug outline-none placeholder:text-muted-foreground ${typingLayout ? 'min-h-[3.25rem] flex-none basis-full' : 'min-h-9 flex-1'}`}
          disabled={isBusy}
        />
        <div className={typingLayout ? 'order-2 flex w-full basis-full items-center gap-0.5' : 'contents'}>
        <div className="relative shrink-0">
          <button type="button" aria-label={t("chat.attach")} title={t("chat.attach")} aria-haspopup="menu" aria-expanded={attachMenuOpen} onClick={() => setAttachMenuOpen((open) => !open)} className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"><Plus className="h-5 w-5" /></button>
          {attachMenuOpen && (
            <>
              <div aria-hidden="true" className="fixed inset-0 z-40 cursor-default" onClick={() => setAttachMenuOpen(false)} />
              <div role="menu" aria-label={t("chat.attach")} className="absolute bottom-full left-0 z-50 mb-1.5 w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg">
                <button type="button" role="menuitem" aria-pressed={cameraOn} onClick={() => { setAttachMenuOpen(false); if (cameraOnRef.current) stopCamera(); else void startCamera(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"><Camera className="h-4 w-4 shrink-0 text-muted-foreground" />{t("chat.attachCamera")}</button>
                <button type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); photosInputRef.current?.click(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"><ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />{t("chat.attachPhotos")}</button>
                <button type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); filesInputRef.current?.click(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"><FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />{t("chat.attachFiles")}</button>
              </div>
            </>
          )}
        </div>
        {speechSupported && (
          <button type="button" data-testid="chat-dictate-button" aria-label={dictating ? t("chat.dictateStop") : t("chat.dictate")} title={dictating ? t("chat.dictateStop") : t("chat.dictate")} aria-pressed={dictating} onClick={toggleDictation} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${dictating ? "bg-destructive/15 text-destructive" : "text-foreground hover:bg-muted"}`}>{dictating ? <Square className="h-4 w-4 animate-pulse fill-current" /> : <Mic className="h-5 w-5" />}</button>
        )}
        {onVoiceMode && (
          <button type="button" aria-label={t("chat.voiceMode")} title={t("chat.voiceMode")} onClick={() => { endDictation(true); stopCamera(); onVoiceMode(); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"><AudioLines className="h-5 w-5" /></button>
        )}
        {(input.trim() || attachment) && (
          <button type="button" aria-label={t("chat.sendAria", { name: presenterDisplayName })} title={t("chat.sendAria", { name: presenterDisplayName })} disabled={isBusy} onClick={() => void handleSend()} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 ${typingLayout ? 'ml-auto' : ''}`}><Send className="h-4 w-4" /></button>
        )}
        </div>
       </div>
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
      {/* END-OF-CHAT COPY POP-UP (chat-fix5): the ONLY place the
          email form exists now. Portaled to the body and layered
          with the app's modal layer (above the floating shell);
          its container tracks the visual viewport while open so
          the email field stays above the on-screen keyboard. The
          strings and the send are the old inline form's, unchanged:
          heading, placeholder, confirm button, the no-marketing
          note and the requested/unavailable status line. */}
      {copyPopupOpen && createPortal(
        <div
          data-testid="chat-copy-popup"
          role="dialog"
          aria-modal="true"
          aria-label={t("chat.emailTranscript")}
          className="fixed inset-x-0 z-[var(--layer-modal)] flex items-center justify-center p-4"
          style={copyPopupBox ? { top: copyPopupBox.top, height: copyPopupBox.height } : { top: 0, bottom: 0 }}
        >
          <div aria-hidden="true" className="absolute inset-0 bg-black/55" onClick={finishCloseFromPopup} />
          <div className="relative w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-4 text-foreground shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{t("chat.emailTranscript")}</p>
              <button
                type="button"
                onClick={finishCloseFromPopup}
                aria-label={t("chat.close")}
                className="rounded-md bg-foreground/10 p-1 text-foreground transition-colors hover:bg-foreground/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="space-y-2" onSubmit={submitCopy}>
              <Input aria-label={t("chat.copyEmailAria")} type="email" required autoFocus value={copyEmail} onChange={e=>setCopyEmail(e.target.value)} placeholder={t("chat.copyEmailPlaceholder")}/>
              <Button type="submit" size="sm">{t("chat.confirmCopy")}</Button>
              <p className="text-xs text-muted-foreground">{t("chat.copyNote")}</p>
            </form>
            {copyStatus && <p role="status" className="text-xs">{copyStatus}</p>}
            {!copySent && (
              <Button type="button" variant="ghost" size="sm" data-testid="chat-copy-no-thanks" onClick={finishCloseFromPopup}>{t("chat.copyNoThanks")}</Button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ChatWidget;
