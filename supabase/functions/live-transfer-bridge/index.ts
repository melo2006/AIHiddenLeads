/**
 * Live Transfer Bridge — conference handoff
 *
 * Flow:
 * 1) Web app invokes this function while the voice demo stays live.
 * 2) We call the caller's confirmed phone and place them into a holding conference.
 * 3) We call the owner, whisper the caller details, and wait for a keypress.
 * 4) Once the owner confirms, both legs join the same conference.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TWILIO_CALLER_ID = '+15612755757';
const DEFAULT_OWNER_NAME = 'your dedicated specialist';
const DEFAULT_TRANSFER_NUMBER = '+19547706622';
const HOLD_MUSIC_URL = 'https://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3';

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const twimlResponse = (xml: string) =>
  new Response(xml, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });

const normalizePhoneNumber = (value?: string | null) => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (value.trim().startsWith('+')) return value.trim();
  return '';
};

const isLikelyCallablePhoneNumber = (value?: string | null) => {
  const normalized = normalizePhoneNumber(value);
  if (!/^\+\d{11,15}$/.test(normalized)) return false;

  if (!normalized.startsWith('+1')) return true;

  const digits = normalized.slice(2);
  if (digits.length !== 10) return false;

  const areaCode = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  return /^[2-9]\d{2}$/.test(areaCode) && /^[2-9]\d{2}$/.test(exchange);
};

const normalizeEmailCandidate = (value?: string | null) => {
  if (!value) return '';

  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\(at\)|\[at\]/g, '@')
    .replace(/\(dot\)|\[dot\]/g, '.')
    .replace(/@+/g, '@');

  const match = normalized.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : '';
};

const formatPhoneForSpeech = (value?: string | null) => {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return '';

  const digits = normalized.replace(/^\+1/, '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3).split('').join(' ')}. ${digits.slice(3, 6).split('').join(' ')}. ${digits.slice(6).split('').join(' ')}`;
  }

  return normalized.split('').join(' ');
};

const formatEmailForSpeech = (value?: string | null) => {
  const normalized = normalizeEmailCandidate(value);
  if (!normalized) return '';

  return normalized
    .replace(/@/g, ' at ')
    .replace(/\./g, ' dot ')
    .replace(/-/g, ' dash ')
    .replace(/_/g, ' underscore ');
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const buildConferenceName = (seed?: string | null) => {
  const normalizedSeed = (seed || crypto.randomUUID())
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);

  return `live-transfer-${normalizedSeed || crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
};

const parseFormBody = async (req: Request) => {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams();
  }

  const rawBody = await req.text().catch(() => '');
  return new URLSearchParams(rawBody);
};

const twilioRequest = (path: string, body: URLSearchParams) => {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID'), authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) throw new Error('Twilio connection is unavailable');
  return fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
};

const completeTwilioCall = async (callSid?: string | null) => {
  if (!callSid) return;

  try {
    const response = await twilioRequest(
      `/Calls/${encodeURIComponent(callSid)}.json`,
      new URLSearchParams({ Status: 'completed' }),
    );

    if (!response.ok) {
      const payload = await response.text().catch(() => '');
      console.warn('Failed to complete Twilio call leg:', callSid, payload.slice(0, 500));
    }
  } catch (error) {
    console.warn('Error completing Twilio call leg:', callSid, error);
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestUrl = new URL(req.url);
  const action = requestUrl.searchParams.get('action') || 'init';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || requestUrl.origin.replace(/^http:\/\//, 'https://');
  const baseFunctionUrl = `${supabaseUrl}/functions/v1/live-transfer-bridge`;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
  const anonParam = SUPABASE_ANON_KEY ? `&apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}` : '';
  if (action === 'wait-twiml') {
    const loopUrl = `${baseFunctionUrl}?action=wait-twiml${anonParam}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(HOLD_MUSIC_URL)}</Play><Redirect method="POST">${escapeXml(loopUrl)}</Redirect></Response>`;
    return twimlResponse(twiml);
  }

  if (action === 'caller-twiml') {
    const conferenceName = requestUrl.searchParams.get('conference') || buildConferenceName();
    const ownerName = requestUrl.searchParams.get('owner_name') || 'the business owner';
    const waitUrl = `${baseFunctionUrl}?action=wait-twiml${anonParam}`;
    const sayText = `Please stay on the line while I connect you with ${ownerName} now.`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural" language="en-US">${escapeXml(sayText)}</Say><Dial><Conference waitUrl="${escapeXml(waitUrl)}" waitMethod="POST" startConferenceOnEnter="false" endConferenceOnExit="true" beep="false">${escapeXml(conferenceName)}</Conference></Dial></Response>`;
    return twimlResponse(twiml);
  }

  if (action === 'owner-twiml') {
    const ownerName = requestUrl.searchParams.get('owner_name') || DEFAULT_OWNER_NAME;
    const callerName = requestUrl.searchParams.get('caller_name') || 'the caller';
    const callerPhone = normalizePhoneNumber(requestUrl.searchParams.get('caller_phone') || '');
    const callerEmail = normalizeEmailCandidate(requestUrl.searchParams.get('caller_email') || '');
    const businessName = requestUrl.searchParams.get('business_name') || 'the business';
    const conferenceName = requestUrl.searchParams.get('conference') || buildConferenceName();
    const callerCallSid = requestUrl.searchParams.get('caller_call_sid') || '';
    const joinUrl = `${baseFunctionUrl}?action=join-conference&conference=${encodeURIComponent(conferenceName)}&caller_call_sid=${encodeURIComponent(callerCallSid)}${anonParam}`;

    const callSummary = requestUrl.searchParams.get('call_summary') || '';

    const whisperText = [
      `Hello ${ownerName}. This is Aspen with a live transfer from the ${businessName} demo.`,
      `${callerName} is waiting for you now.`,
      callerPhone ? `Their phone number is ${formatPhoneForSpeech(callerPhone)}.` : 'I do not have a confirmed callback phone number on file.',
      callerEmail ? `Their email is ${formatEmailForSpeech(callerEmail)}.` : '',
      callSummary ? `Here is a quick summary of the conversation: ${callSummary}` : '',
      'Press any key now to join the live transfer.',
    ].filter(Boolean).join(' ');

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" timeout="20" action="${escapeXml(joinUrl)}" actionOnEmptyResult="true" method="POST"><Say voice="Polly.Joanna-Neural" language="en-US">${escapeXml(whisperText)}</Say></Gather><Say voice="Polly.Joanna-Neural" language="en-US">No response received. Goodbye.</Say><Hangup/></Response>`;
    return twimlResponse(twiml);
  }

  if (action === 'join-conference') {
    const conferenceName = requestUrl.searchParams.get('conference') || buildConferenceName();
    const callerCallSid = requestUrl.searchParams.get('caller_call_sid') || '';
    const formBody = await parseFormBody(req);
    const digits = formBody.get('Digits')?.trim() || '';

    if (!digits) {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID'), authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

      if (accountSid && authToken && callerCallSid) {
        await completeTwilioCall(callerCallSid);
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural" language="en-US">No response received. I am ending this transfer request now.</Say><Hangup/></Response>`;
      return twimlResponse(twiml);
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural" language="en-US">Connecting you now.</Say><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${escapeXml(conferenceName)}</Conference></Dial></Response>`;
    return twimlResponse(twiml);
  }

  if (action === 'status') {
    const role = requestUrl.searchParams.get('role') || 'unknown';
    const callerCallSid = requestUrl.searchParams.get('caller_call_sid') || '';
    const body = await parseFormBody(req);
    const callStatus = body.get('CallStatus')?.toLowerCase() || '';

    console.log(`Live transfer status (${role}):`, body.toString().slice(0, 500));

    if (role === 'owner' && callerCallSid && ['busy', 'failed', 'no-answer', 'canceled', 'completed'].includes(callStatus)) {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID'), authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

      if (accountSid && authToken) {
        await completeTwilioCall(callerCallSid);
      }
    }

    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID'), authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) return jsonResponse({ success: false, error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const transferTo = normalizePhoneNumber(typeof body.transferTo === 'string' ? body.transferTo : '') || DEFAULT_TRANSFER_NUMBER;
    const callerPhone = normalizePhoneNumber(typeof body.callerPhone === 'string' ? body.callerPhone : '');
    const callerName = typeof body.callerName === 'string' && body.callerName.trim() ? body.callerName.trim() : 'the caller';
    const callerEmail = normalizeEmailCandidate(typeof body.callerEmail === 'string' ? body.callerEmail : '');
    const businessName = typeof body.businessName === 'string' && body.businessName.trim() ? body.businessName.trim() : 'Demo Business';
    const ownerName = typeof body.ownerName === 'string' && body.ownerName.trim() ? body.ownerName.trim() : DEFAULT_OWNER_NAME;
    const callId = typeof body.callId === 'string' ? body.callId.trim() : '';
    const callSummary = typeof body.callSummary === 'string' && body.callSummary.trim() ? body.callSummary.trim().slice(0, 500) : '';

    if (!isLikelyCallablePhoneNumber(callerPhone)) {
      return jsonResponse({ success: false, error: 'A valid confirmed caller phone number is required for live transfer.' }, 400);
    }

    const conferenceName = buildConferenceName(callId);
    const callerTwimlUrl = `${baseFunctionUrl}?action=caller-twiml&conference=${encodeURIComponent(conferenceName)}&owner_name=${encodeURIComponent(ownerName)}${anonParam}`;
    const callerStatusUrl = `${baseFunctionUrl}?action=status&role=caller${anonParam}`;

    console.log('Live transfer: starting conference bridge', {
      conferenceName,
      transferTo,
      callerPhone: `***${callerPhone.slice(-4)}`,
    });

    const callerResponse = await twilioRequest(
      '/Calls.json',
      new URLSearchParams({
        To: callerPhone,
        From: TWILIO_CALLER_ID,
        Url: callerTwimlUrl,
        Method: 'POST',
        StatusCallback: callerStatusUrl,
        StatusCallbackMethod: 'POST',
        StatusCallbackEvent: 'initiated ringing answered completed',
        Timeout: '30',
      }),
    );

    const callerData = await callerResponse.json().catch(() => null);
    if (!callerResponse.ok) {
      throw new Error(`Twilio call to caller failed [${callerResponse.status}]: ${JSON.stringify(callerData)}`);
    }

    const callerCallSid = typeof callerData?.sid === 'string' ? callerData.sid : '';
    const ownerTwimlUrl = `${baseFunctionUrl}?action=owner-twiml&owner_name=${encodeURIComponent(ownerName)}&caller_name=${encodeURIComponent(callerName)}&caller_phone=${encodeURIComponent(callerPhone)}&caller_email=${encodeURIComponent(callerEmail)}&business_name=${encodeURIComponent(businessName)}&conference=${encodeURIComponent(conferenceName)}&caller_call_sid=${encodeURIComponent(callerCallSid)}&call_summary=${encodeURIComponent(callSummary)}${anonParam}`;
    const ownerStatusUrl = `${baseFunctionUrl}?action=status&role=owner&caller_call_sid=${encodeURIComponent(callerCallSid)}${anonParam}`;

    const ownerResponse = await twilioRequest(
      '/Calls.json',
      new URLSearchParams({
        To: transferTo,
        From: TWILIO_CALLER_ID,
        Url: ownerTwimlUrl,
        Method: 'POST',
        StatusCallback: ownerStatusUrl,
        StatusCallbackMethod: 'POST',
        StatusCallbackEvent: 'initiated ringing answered completed',
        Timeout: '30',
      }),
    );

    const ownerData = await ownerResponse.json().catch(() => null);
    if (!ownerResponse.ok) {
      await completeTwilioCall(callerCallSid);
      throw new Error(`Twilio call to owner failed [${ownerResponse.status}]: ${JSON.stringify(ownerData)}`);
    }

    console.log('Live transfer: conference bridge ready', {
      conferenceName,
      callerCallSid,
      ownerCallSid: ownerData?.sid ?? null,
      transferTo,
    });

    return jsonResponse({
      success: true,
      bridgeMode: 'conference',
      conferenceName,
      callerCallSid,
      ownerCallSid: ownerData?.sid ?? null,
      transferTo,
    });
  } catch (error: unknown) {
    console.error('Live transfer bridge error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});