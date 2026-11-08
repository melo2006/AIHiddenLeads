// bithuman-avatar — PRIVATE TEST ONLY. Not wired into the production app.
//
// Starts/stops a bitHuman cloud-avatar session (Essence 2, agent
// A84QFM9622 "Aspen bitHuman Test") inside a LiveKit room, so the private
// test page in ~/workspace/bithuman-test can drive the face with OUR
// Gemini Live audio — the bitHuman counterpart of supabase/functions/
// simli-avatar, whose shape this mirrors 1:1 (server-held provider secret
// in, short-lived session out; zod-validated discriminated-union body;
// CORS via @supabase/supabase-js; caller resolved from the bearer JWT and
// the protected voice_platform_roles table).
//
// Differences from simli-avatar, deliberate:
//  - BOTH actions require a signed-in platform admin. A Simli token is
//    free until its stream connects, but a bitHuman cloud-avatar session
//    bills ~4 credits/min from the moment it starts (idle included), so
//    there is no public action here — this function exists only for the
//    owner's private face test.
//  - Two provider secrets are held server-side: BITHUMAN_API_SECRET
//    (starts/ends the avatar session) and LIVEKIT_API_SECRET (signs the
//    LiveKit join tokens). Neither ever reaches the browser; the page
//    receives only per-session LiveKit tokens (1 h TTL, one room).
//
// LiveKit join tokens are plain HS256 JWTs, signed here with WebCrypto —
// the same crypto.subtle approach _shared/stripe.ts and
// retell-web-call already use in this repo; no new dependency.
//
// Docs: docs.bithuman.ai/platforms/livekit/cloud-avatar (session start,
// byte streams, endings), docs.bithuman.ai/api/rate-limits (the
// end-session route below), docs.bithuman.ai/pricing (cloud rate).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const BITHUMAN = 'https://api.bithuman.ai';
const AVATAR_IDENTITY = 'bithuman-avatar-agent'; // fixed by bitHuman's docs
const SENDER_IDENTITY = 'web-sender'; // the test page's participant identity
const TOKEN_TTL_SECONDS = 3600; // matches bitHuman's one-hour token pattern
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), agentId: z.string().max(80).default('A84QFM9622'), model: z.string().max(40).default('essence-2') }),
  z.object({ action: z.literal('end'), sessionId: z.string().min(1).max(120), roomName: z.string().max(120).optional() }),
]);

/* ---------------- LiveKit access tokens (HS256 JWT) ---------------- */
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (value: unknown) => b64url(enc.encode(JSON.stringify(value)));

interface LiveKitGrant {
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
}

/** Mints a LiveKit join token. `kind: 'agent'` and the attributes map are
 *  top-level JWT claims in LiveKit's token format (the server SDKs write
 *  them exactly this way); bitHuman reads `lk.publish_on_behalf` from the
 *  avatar token's attributes to learn which participant it takes audio
 *  from. */
async function livekitToken(opts: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  room: string;
  grant: LiveKitGrant;
  attributes?: Record<string, string>;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: opts.apiKey,
    sub: opts.identity,
    name: opts.identity,
    iat: now,
    nbf: now,
    exp: now + TOKEN_TTL_SECONDS,
    jti: `${opts.identity}-${crypto.randomUUID()}`,
    kind: 'agent',
    video: { roomJoin: true, room: opts.room, ...opts.grant },
  };
  if (opts.attributes) claims.attributes = opts.attributes;
  const unsigned = `${b64urlJson({ alg: 'HS256', typ: 'JWT' })}.${b64urlJson(claims)}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(opts.apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(signature))}`;
}

/** Ends a LiveKit room via the server Twirp API (deleting the room ends
 *  the avatar session — bitHuman's documented backstop: "the session ends
 *  when you remove bithuman-avatar-agent from the room or when the room
 *  closes"). Requires a token with the roomAdmin grant for that room. */
async function deleteLiveKitRoom(livekitUrl: string, apiKey: string, apiSecret: string, room: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: apiKey,
    sub: 'bithuman-avatar-fn',
    name: 'bithuman-avatar-fn',
    iat: now,
    nbf: now,
    exp: now + 600,
    jti: `bithuman-avatar-fn-${crypto.randomUUID()}`,
    video: { roomAdmin: true, room },
  };
  const unsigned = `${b64urlJson({ alg: 'HS256', typ: 'JWT' })}.${b64urlJson(claims)}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(unsigned));
  const httpUrl = livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  const res = await fetch(`${httpUrl}/twirp/livekit.RoomService/DeleteRoom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${unsigned}.${b64url(new Uint8Array(signature))}` },
    body: JSON.stringify({ room }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  const bitHumanSecret = Deno.env.get('BITHUMAN_API_SECRET');
  const livekitUrl = Deno.env.get('LIVEKIT_URL');
  const livekitKey = Deno.env.get('LIVEKIT_API_KEY');
  const livekitSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!bitHumanSecret || !livekitUrl || !livekitKey || !livekitSecret) {
    return json({ error: 'bitHuman test service is not configured' }, 503);
  }
  try {
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'Invalid request' }, 400);
    const b = parsed.data;
    const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    // Private test: only the platform admin (the owner) may spend credits.
    // Same resolution path as simli-avatar: bearer JWT -> auth user ->
    // protected voice_platform_roles row.
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data: { user } } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
    if (!user) return json({ error: 'Sign in required' }, 401);
    const { data: role } = await db.from('voice_platform_roles').select('role').eq('user_id', user.id).maybeSingle();
    if (role?.role !== 'admin') return json({ error: 'Administrator access required' }, 403);

    if (b.action === 'start') {
      const roomName = `bithuman-test-${crypto.randomUUID()}`;
      // 1. The avatar's join token. lk.publish_on_behalf names the ONLY
      //    participant the avatar accepts audio from (our test page);
      //    without it the avatar would take audio from the first agent
      //    participant it sees.
      const avatarToken = await livekitToken({
        apiKey: livekitKey,
        apiSecret: livekitSecret,
        identity: AVATAR_IDENTITY,
        room: roomName,
        grant: { canPublish: true, canSubscribe: true, canPublishData: true },
        attributes: { 'lk.publish_on_behalf': SENDER_IDENTITY },
      });
      // 2. Start the cloud-avatar session from the server (takes the API
      //    secret). Response: { avatar_session_started: true, session_id,
      //    model, ... } — session_id is the handle that ends it.
      const res = await fetch(`${BITHUMAN}/v1/runtime-tokens/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-secret': bitHumanSecret },
        body: JSON.stringify({ mode: 'gpu', model: b.model, agent_id: b.agentId, livekit_url: livekitUrl, livekit_token: avatarToken, room_name: roomName }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok || data.avatar_session_started !== true || !data.session_id) {
        const detail = (data as { error?: { message?: string } }).error?.message || (data as { message?: string }).message;
        return json({ error: String(detail || 'bitHuman refused the avatar session') }, res.status === 400 || res.status === 403 ? res.status : 502);
      }
      // 3. The page's own join token: agent-kind (bitHuman requires the
      //    sender to be an agent participant; standard participants are
      //    treated as users and their audio is ignored). It publishes no
      //    media tracks — data (the byte streams) only — and subscribes
      //    to the avatar's republished audio+video.
      const senderToken = await livekitToken({
        apiKey: livekitKey,
        apiSecret: livekitSecret,
        identity: SENDER_IDENTITY,
        room: roomName,
        grant: { canPublish: false, canSubscribe: true, canPublishData: true },
      });
      return json({ livekitUrl, senderToken, roomName, sessionId: String(data.session_id) });
    }

    // action === 'end'
    // Primary route: POST /v1/runtime-sessions/{session_id}/end. The
    // wiring report flagged the exact route as unverified (Q6); it has
    // since been confirmed in bitHuman's own rate-limits doc, which
    // lists this route by name ("POST /v1/runtime-sessions/{session_id}/
    // end", Generate cost tier). Ending by session_id stops billing and
    // frees the concurrency slot at once.
    const res = await fetch(`${BITHUMAN}/v1/runtime-sessions/${encodeURIComponent(b.sessionId)}/end`, {
      method: 'POST',
      headers: { 'api-secret': bitHumanSecret },
    });
    if (res.ok) return json({ ended: true, via: 'runtime-sessions' });
    // Backstop (documented behavior, not a guess): the session also ends
    // when its room closes. If the end route ever disagrees, deleting
    // the room still stops the meter.
    if (b.roomName) {
      const deleted = await deleteLiveKitRoom(livekitUrl, livekitKey, livekitSecret, b.roomName).catch(() => false);
      if (deleted) return json({ ended: true, via: 'room-delete', note: `runtime-sessions end returned HTTP ${res.status}` });
    }
    return json({ error: `Could not end the bitHuman session (HTTP ${res.status}). It also ends on its own: ~10 min without audio, ~15 s after the last agent leaves the room, or when the room closes.` }, 502);
  } catch (e) {
    console.error('bithuman-avatar', e);
    return json({ error: 'bitHuman test request failed' }, 500);
  }
});
