import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const GATEWAY = 'https://ai.gateway.lovable.dev'
const STT_MODEL = 'google/gemini-3.5-transcribe'
const CHAT_MODEL = 'google/gemini-2.5-flash'
const TTS_MODEL = 'google/gemini-3.1-flash-tts-preview'

const ASPEN_PROMPT = `You are Aspen, the friendly and professional AI assistant for AI Hidden Leads (aihiddenleads.com). You are a warm, enthusiastic woman who genuinely cares about helping businesses grow.

CORE PRODUCT KNOWLEDGE:
- AI Hidden Leads provides: Voice AI agents, AI Chat widgets, and AI-powered lead generation
- Voice AI: Answers calls 24/7, books appointments, handles FAQs, does live transfers
- Chat AI: Website chat widget that engages visitors, captures leads, answers questions
- Lead Generation: Scans the internet for high-intent prospects, automated email/SMS outreach
- Speed-to-Lead: Responds to inquiries in under 60 seconds

PRICING (CURRENT PROMOTION):
- Standard Plan: Normally $199/mo → PROMO: $149/mo for first 3 months
- Setup fee: $99 (one-time)
- Setup time: 2-3 business days

KEY STATS:
- 78% of leads go to the first responder
- Average lost lead value: $1,200+
- Clients see 40% increase in booked appointments
- Save 25+ hours/week on calls and follow-ups

BEHAVIOR:
- Be conversational, warm, and natural — like a real phone conversation
- Keep responses SHORT (1-3 sentences max) — this is a voice call, not an essay
- Always guide toward the demo
- This is a demo — remind people a full setup includes their complete business knowledge base`

// Gemini TTS prebuilt voices (see https://ai.google.dev/gemini-api/docs/speech-generation)
const ALLOWED_VOICES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
])

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function transcribe(apiKey: string, audio: Blob, language?: string): Promise<string> {
  const form = new FormData()
  form.append('model', STT_MODEL)
  form.append('file', new File([audio], 'recording.wav', { type: 'audio/wav' }))
  form.append('response_format', 'json')
  if (language) form.append('language', language)
  const res = await fetch(`${GATEWAY}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Transcription failed [${res.status}]: ${await res.text()}`)
  const data = await res.json()
  return (data.text || '').trim()
}

async function chat(apiKey: string, history: { role: string; content: string }[], userText: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: ASPEN_PROMPT },
        ...history.slice(-12),
        { role: 'user', content: userText },
      ],
      max_tokens: 180,
      temperature: 0.8,
    }),
  })
  if (!res.ok) throw new Error(`Chat failed [${res.status}]: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || "Sorry, I didn't catch that — could you say it again?"
}

async function speak(apiKey: string, text: string, voice: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/v1/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TTS_MODEL,
      contents: [{ role: 'user', parts: [{ text: `Say in a warm, natural, conversational tone: ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
      stream_format: 'audio',
    }),
  })
  if (!res.ok) throw new Error(`Speech failed [${res.status}]: ${await res.text()}`)
  const buf = await res.arrayBuffer()
  // base64 encode in chunks to avoid stack overflow on large audio
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) return json({ error: 'AI key not configured' }, 500)

    const contentType = req.headers.get('content-type') || ''

    // Action: text-only greeting (no audio input) — used for the opening line
    if (contentType.includes('application/json')) {
      const body = await req.json()
      if (body.action === 'greeting') {
        const voice = ALLOWED_VOICES.has(body.voice) ? body.voice : 'Kore'
        const greeting = "Hi there! I'm Aspen from AI Hidden Leads. What's your name?"
        const audioBase64 = await speak(apiKey, greeting, voice)
        return json({ reply: greeting, audioBase64 })
      }
      return json({ error: 'Unknown action' }, 400)
    }

    // Action: full voice turn — audio in, transcript + reply + audio out
    const form = await req.formData()
    const audio = form.get('file')
    const voiceRaw = String(form.get('voice') || 'Kore')
    const voice = ALLOWED_VOICES.has(voiceRaw) ? voiceRaw : 'Kore'
    const language = String(form.get('language') || '') || undefined
    const historyRaw = String(form.get('history') || '[]')

    if (!(audio instanceof Blob) || audio.size < 2048) {
      return json({ error: 'Recording was empty or too short — please try again' }, 400)
    }

    let history: { role: string; content: string }[] = []
    try {
      const parsed = JSON.parse(historyRaw)
      if (Array.isArray(parsed)) history = parsed.filter(
        (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
      )
    } catch { /* ignore bad history */ }

    const transcript = await transcribe(apiKey, audio, language)
    if (!transcript) {
      return json({ error: 'I could not hear anything — please try again', transcript: '' }, 200)
    }

    const reply = await chat(apiKey, history, transcript)
    const audioBase64 = await speak(apiKey, reply, voice)

    return json({ transcript, reply, audioBase64 })
  } catch (error) {
    console.error('gemini-voice-lab error:', error)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
