import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const GEMINI_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const MODEL = 'gemini-3.8-live'

const ASPEN_PROMPT = `You are Aspen, the friendly and professional AI voice assistant for AI Hidden Leads (aihiddenleads.com). You are a warm, enthusiastic woman who genuinely cares about helping businesses grow. You are on a live voice call — speak naturally, like a real person on the phone.

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
- Be conversational, warm, and natural — this is a live phone-style conversation
- Keep responses SHORT (1-3 sentences) unless the caller asks for detail
- Start by greeting the caller and asking their name
- Always guide toward trying the demo
- This is a demo — remind people a full setup includes their complete business knowledge base`

const ALLOWED_VOICES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
])

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)

  // Health check
  if (url.searchParams.get('ping') === '1') {
    return new Response(JSON.stringify({ ok: true, model: MODEL }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response(JSON.stringify({ error: 'WebSocket connection required' }), {
      status: 426,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const voiceRaw = url.searchParams.get('voice') || 'Kore'
  const voice = ALLOWED_VOICES.has(voiceRaw) ? voiceRaw : 'Kore'

  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req)

  let geminiWs: WebSocket | null = null
  let closed = false

  const closeAll = () => {
    if (closed) return
    closed = true
    try { geminiWs?.close() } catch { /* ignore */ }
    try { clientSocket.close() } catch { /* ignore */ }
  }

  clientSocket.onopen = () => {
    geminiWs = new WebSocket(`${GEMINI_WS}?key=${apiKey}`)

    geminiWs.onopen = () => {
      // First message must be the setup
      geminiWs!.send(JSON.stringify({
        setup: {
          model: `models/${MODEL}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          },
          systemInstruction: { parts: [{ text: ASPEN_PROMPT }] },
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              // Tuned for phone-style conversation: quick to notice speech,
              // patient enough to not cut off short pauses
              startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
              endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
              prefixPaddingMs: 200,
              silenceDurationMs: 700,
            },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
      }))
    }

    geminiWs.onmessage = async (event) => {
      if (closed || clientSocket.readyState !== WebSocket.OPEN) return
      try {
        // Gemini Live sends binary frames — normalize to text first
        let raw: string
        if (typeof event.data === 'string') {
          raw = event.data
        } else if (event.data instanceof Blob) {
          raw = await event.data.text()
        } else {
          raw = new TextDecoder().decode(event.data as ArrayBuffer)
        }
        const msg = JSON.parse(raw)

        if (msg.setupComplete) {
          clientSocket.send(JSON.stringify({ type: 'ready' }))
          return
        }

        const sc = msg.serverContent
        if (sc) {
          // Interruption — tell the client to stop playback immediately
          if (sc.interrupted) {
            clientSocket.send(JSON.stringify({ type: 'interrupted' }))
            return
          }
          if (sc.modelTurn?.parts) {
            for (const part of sc.modelTurn.parts) {
              if (part.inlineData?.data) {
                clientSocket.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }))
              }
              if (part.text) {
                clientSocket.send(JSON.stringify({ type: 'model_text', text: part.text }))
              }
            }
          }
          if (sc.outputTranscription?.text) {
            clientSocket.send(JSON.stringify({ type: 'aspen_transcript', text: sc.outputTranscription.text }))
          }
          if (sc.inputTranscription?.text) {
            clientSocket.send(JSON.stringify({ type: 'user_transcript', text: sc.inputTranscription.text }))
          }
          if (sc.turnComplete) {
            clientSocket.send(JSON.stringify({ type: 'turn_complete' }))
          }
          return
        }

        if (msg.error) {
          clientSocket.send(JSON.stringify({ type: 'error', message: JSON.stringify(msg.error) }))
        }
      } catch (e) {
        console.error('proxy message error:', e)
      }
    }

    geminiWs.onerror = (e) => {
      console.error('gemini ws error:', e)
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({ type: 'error', message: 'Connection to Gemini failed' }))
      }
      closeAll()
    }

    geminiWs.onclose = (e) => {
      if (!closed && clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(JSON.stringify({ type: 'closed', reason: e.reason || 'Gemini session ended' }))
      }
      closeAll()
    }
  }

  // Client → Gemini: audio chunks and control messages
  clientSocket.onmessage = (event) => {
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return
    try {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : '{}')
      if (msg.type === 'audio' && typeof msg.data === 'string') {
        // 16-bit PCM, 16 kHz, mono — base64
        geminiWs.send(JSON.stringify({
          realtimeInput: {
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          },
        }))
      } else if (msg.type === 'text' && typeof msg.text === 'string') {
        geminiWs.send(JSON.stringify({ realtimeInput: { text: msg.text } }))
      }
    } catch (e) {
      console.error('client message error:', e)
    }
  }

  clientSocket.onclose = closeAll
  clientSocket.onerror = closeAll

  return response
})
