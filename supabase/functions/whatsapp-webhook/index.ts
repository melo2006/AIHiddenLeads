// WhatsApp inbound webhook — Twilio → Gemini → TwiML reply
// Handles text messages AND voice notes (audio transcribed via Gemini multimodal)
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');

const SYSTEM_PROMPT = `Você é Aspen, atendente virtual com IA da AI Hidden Leads (aihiddenleads.com).
Atende empresas no WhatsApp em português brasileiro, de forma simpática, breve (2-3 frases) e consultiva.

NOSSOS SERVIÇOS:
- Agente de Voz com IA que atende ligações 24/7
- WhatsApp IA (você é a prova viva)
- Chat IA no site, captura e agendamento
- Geração de leads, reativação de base, gestão de avaliações Google

PLANOS (sempre fale em reais, nunca diga "reais brasileiros"):
- Premium: R$ 499/mês — WhatsApp + Voz + Chat
- Pro: R$ 999/mês — adiciona prospecção e campanhas
- Platinum: R$ 1749/mês — tudo ilimitado + gerente dedicado

REGRAS:
- Sempre responder em português, mesmo se a pessoa escrever em outra língua, a menos que peça explicitamente
- Nunca inventar valores, prazos ou recursos
- Para fechar venda, mandar pro site aihiddenleads.com ou oferecer demonstração ao vivo
- Para opt-out: "Pra parar de receber mensagens, responda SAIR"`;

async function transcribeAudio(mediaUrl: string, contentType: string): Promise<string> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials missing for media download');
  }
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const mediaRes = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
  if (!mediaRes.ok) throw new Error(`Media download failed: ${mediaRes.status}`);
  const buf = new Uint8Array(await mediaRes.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);

  const aiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GOOGLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcreva este áudio em português. Retorne APENAS a transcrição, sem comentários.' },
            { type: 'input_audio', input_audio: { data: b64, format: contentType.includes('ogg') ? 'ogg' : 'mp3' } },
          ],
        },
      ],
    }),
  });
  const j = await aiRes.json();
  return j?.choices?.[0]?.message?.content?.trim() ?? '';
}

async function generateReply(userText: string, fromNumber: string): Promise<string> {
  const aiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GOOGLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `[WhatsApp de ${fromNumber}]\n${userText}` },
      ],
    }),
  });
  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error('AI gateway error', aiRes.status, errText);
    return 'Desculpa, tô com uma instabilidade aqui. Pode tentar de novo em alguns segundos?';
  }
  const j = await aiRes.json();
  return (
    j?.choices?.[0]?.message?.content?.trim() ??
    'Oi! Sou a Aspen da AI Hidden Leads. Como posso te ajudar?'
  );
}

function twiml(message: string): Response {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
  return new Response(xml, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const contentType = req.headers.get('content-type') ?? '';
    let params: URLSearchParams;
    if (contentType.includes('application/x-www-form-urlencoded')) {
      params = new URLSearchParams(await req.text());
    } else {
      const body = await req.json().catch(() => ({}));
      params = new URLSearchParams(body as Record<string, string>);
    }

    const from = params.get('From') ?? '';
    const body = (params.get('Body') ?? '').trim();
    const numMedia = parseInt(params.get('NumMedia') ?? '0', 10);

    console.log('WhatsApp inbound', { from, body: body.slice(0, 100), numMedia });

    // Opt-out
    if (/^(sair|parar|stop|cancelar)$/i.test(body)) {
      return twiml('Você foi removido da nossa lista. Pra voltar, é só mandar OI a qualquer momento.');
    }

    let userText = body;

    // Handle voice note / audio
    if (numMedia > 0) {
      const mediaUrl = params.get('MediaUrl0');
      const mediaType = params.get('MediaContentType0') ?? '';
      if (mediaUrl && mediaType.startsWith('audio/')) {
        try {
          const transcript = await transcribeAudio(mediaUrl, mediaType);
          userText = transcript || body || '(áudio sem fala detectada)';
          console.log('Transcribed audio:', userText.slice(0, 100));
        } catch (err) {
          console.error('Audio transcription failed', err);
          return twiml('Recebi seu áudio mas tive problema pra transcrever. Pode me mandar por texto?');
        }
      } else if (mediaUrl) {
        userText = body || 'Visitante mandou uma mídia (não é áudio).';
      }
    }

    if (!userText) {
      return twiml('Oi! Sou a Aspen da AI Hidden Leads 👋 Me conta: qual seu negócio e como posso te ajudar?');
    }

    const reply = await generateReply(userText, from);

    // TODO: persist conversation to Supabase for CRM thread
    return twiml(reply);
  } catch (err) {
    console.error('webhook error', err);
    return twiml('Tive um probleminha agora. Tenta de novo em um instante?');
  }
});
