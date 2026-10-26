import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Bot, User, Maximize2, Minimize2, X, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MessageResponse } from '@/components/ai-elements/message';
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/components/ai-elements/prompt-input';

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
}

interface Message {
  role: "assistant" | "user";
  content: string;
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
}: ChatWidgetProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialized = useRef(false);
  const mounted = useRef(true);
  const sessionId = useRef(`chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  const ownerLabel = ownerName?.trim() || callerName?.trim() || "the business owner";
  const isBusy = isThinking || isStreaming;
  useEffect(() => { if (active && !isBusy) inputRef.current?.focus({ preventScroll: true }); }, [active, isBusy]);

  const logChatMessage = useCallback((role: string, content: string) => {
    if (!content.trim()) return;
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
  }, [leadId, prospectId, businessName, websiteUrl, callerName, callerEmail, callerPhone]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const panel = messagesEndRef.current?.parentElement;
    if (panel) panel.scrollTop = panel.scrollHeight;
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

    return nichePrompts[businessNiche] ?? nichePrompts.general;
  }, [businessNiche]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const firstName = callerName?.split(" ")[0]?.trim();
    const nameGreet = firstName ? `, ${firstName}` : "";

    setMessages([
      {
        role: "assistant",
        content: `${getGreeting()}${nameGreet}! 👋 I'm Aspen, the AI assistant for ${businessName}. This is a live demo of how AI chat + AI voice can work on your website to answer questions, capture leads, and book appointments.

Tap a suggestion below or ask me anything.`,
      },
    ]);
  }, [businessName, callerName]);

  const sendToAI = async (conversationHistory: Message[]) => {
    const systemPrompt = `You are Aspen, the AI chat assistant for ${businessName}. You are warm, witty, funny, and genuinely helpful — like a knowledgeable friend who happens to work at the business.

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
- If business info is thin, use common ${businessNiche} industry knowledge to sound informed.`;

    const { data, error } = await supabase.functions.invoke("retell-web-call", {
      body: {
        action: "chat-completion",
        systemPrompt,
        messages: conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      },
    });

    if (error || !data?.content) {
      throw new Error(error?.message || "No response");
    }

    return data.content as string;
  };

  const typeAssistantResponse = useCallback(async (response: string) => {
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

    if (mounted.current) {
      setIsStreaming(false);
      logChatMessage("assistant", response);
    }
  }, [logChatMessage]);

  const handleSend = useCallback(async (prefill?: string) => {
    const userMsg = (prefill ?? input).trim();
    if (!userMsg || isBusy) return;

    if (!prefill) {
      setInput("");
    }

    const updated = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(updated);
    setIsThinking(true);
    logChatMessage("user", userMsg);

    try {
      const response = await sendToAI(updated);
      if (!mounted.current) return;

      await sleep(350);
      setIsThinking(false);
      await typeAssistantResponse(response);
    } catch (err) {
      console.error("Chat AI error:", err);
      if (!mounted.current) return;

      setIsThinking(false);
      const fallback = `Great question. I can help with that and also arrange a callback or a 15-minute demo with ${ownerLabel}.`;
      await typeAssistantResponse(fallback);
    }
  }, [input, isBusy, messages, ownerLabel, typeAssistantResponse]);

  const userHasMessaged = messages.some((m) => m.role === "user");
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant")?.content;

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
            <p className="text-sm font-bold">Chat with Aspen</p>
            <p className="text-[10px] text-muted-foreground">AI Chat Assistant • Online</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized((prev) => !prev)}
            className="rounded-md bg-foreground/10 p-1 text-foreground transition-colors hover:bg-foreground/20"
            aria-label={isMinimized ? "Expand chat" : "Minimize chat"}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md bg-foreground/10 p-1 text-foreground transition-colors hover:bg-foreground/20"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>}

      {isMinimized ? (
        <div className="p-3">
          <p className="text-xs text-muted-foreground">
            Chat minimized. Expand to read full conversation.
          </p>
          {lastAssistantMessage && (
            <p className="mt-2 line-clamp-2 text-xs text-foreground/80">{lastAssistantMessage}</p>
          )}
        </div>
      ) : (
      <>
      <div className={`${embedded ? 'min-h-0 flex-1 max-h-[35dvh]' : 'max-h-[22rem]'} overflow-y-auto p-3 space-y-2.5`}>
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
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-line ${
                msg.role === "assistant" ? "text-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              <MessageResponse>{msg.content}</MessageResponse>
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
       <PromptInput onSubmit={() => { void handleSend(); }}>
        <PromptInputTextarea
          ref={inputRef}
          aria-label="Message Aspen"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Aspen anything..."
          className="min-h-12 max-h-24 w-full min-w-0 text-base"
          disabled={isBusy}
        />
        <PromptInputFooter className="justify-end">
        <PromptInputSubmit
          disabled={!input.trim() || isBusy}
          status={isThinking ? 'submitted' : isStreaming ? 'streaming' : 'ready'}
          aria-label="Send message to Aspen"
          className="h-9 w-9 shrink-0"
        />
        </PromptInputFooter>
       </PromptInput>
      </div>

      {/* CTA Banner */}
      {!embedded && <a
        href="https://aihiddenleads.com"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 px-3 py-2.5 text-[11px] font-bold text-white transition-opacity hover:opacity-90"
      >
        <ExternalLink className="h-3 w-3" />
        🚀 Take advantage of our promo — Visit AIHiddenLeads.com
      </a>}
      </>
      )}
    </div>
  );
};

export default ChatWidget;
