import { chromaBackgroundId } from '../_shared/chroma-background.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { resolveDemoShare } from '../_shared/demo-share.ts';
import { workspaceAccess } from '../_shared/customer-payments.ts';
import { normalizeVideoAvatar, validFaceId } from '../_shared/video-avatar.ts';

const SIMLI = 'https://api.simli.ai';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('session'), agentId: z.string().max(80).optional(), shareToken: z.string().max(80).optional(), draft: z.boolean().optional(), faceId: z.string().max(80).optional() }),
  z.object({ action: z.literal('faces') }),
  z.object({ action: z.literal('createFace'), agentId: z.string().uuid().optional(), name: z.string().min(1).max(60), imageBase64: z.string().min(100).max(14_000_000), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']) }),
  z.object({ action: z.literal('avatarCredit'), agentId: z.string().uuid() }),
  z.object({ action: z.literal('status'), faceId: z.string().max(80) }),
  z.object({ action: z.literal('applyHomepage'), avatar: z.record(z.unknown()) }),
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const apiKey = Deno.env.get('SIMLI_API_KEY');
  // Warm-up only: wakes the function and caches the backdrop id on page load; never opens a Simli session.
  if (req.method === 'GET' && new URL(req.url).searchParams.get('ping') === '1') {
    if (apiKey) await chromaBackgroundId(apiKey).catch(() => null);
    return json({ ok: true });
  }
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!apiKey) return json({ error: 'Video avatar service is not configured' }, 503);
  try {
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'Invalid request' }, 400);
    const b = parsed.data;
    const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data: { user } } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
    const { data: role } = user ? await db.from('voice_platform_roles').select('role').eq('user_id', user.id).maybeSingle() : { data: null };
    const admin = role?.role === 'admin';
    const editorOf = async (agentId: string) => {
      const { data: a } = await db.from('voice_agents').select('*').eq('id', agentId).maybeSingle();
      if (!a || !user) return null;
      if (admin) return a;
      const { data: m } = await db.from('voice_memberships').select('id').eq('organization_id', a.organization_id).eq('user_id', user.id).eq('role', 'editor').maybeSingle();
      return m && await workspaceAccess(db, a.organization_id) ? a : null;
    };

    if (b.action === 'session') {
      let faceId = '';
      let publicSession = true;
      if (b.shareToken) {
        const a = await resolveDemoShare(db, b.shareToken);
        const v = normalizeVideoAvatar((a?.draft as Record<string, unknown> | undefined)?.videoAvatar);
        if (!a || !v.enabled) return json({ error: 'Video avatar is not enabled for this demo' }, 404);
        faceId = v.faceId;
      } else if (b.draft && b.agentId) {
        const a = await editorOf(b.agentId);
        if (!a) return json({ error: 'Access denied' }, 403);
        const v = normalizeVideoAvatar((a.draft as Record<string, unknown>).videoAvatar);
        faceId = admin && validFaceId(b.faceId) ? b.faceId : v.faceId;
        publicSession = false;
      } else if (admin && validFaceId(b.faceId)) {
        faceId = b.faceId; publicSession = false;
      } else {
        const id = b.agentId;
        if (id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(id)) return json({ error: 'Invalid agent' }, 400);
        const q = db.from('voice_agents').select('published');
        const { data: a } = await (id ? q.eq(/^[0-9a-f-]{36}$/i.test(id) ? 'id' : 'slug', id) : q.eq('slug', 'aspen-homepage')).maybeSingle();
        const v = normalizeVideoAvatar((a?.published as Record<string, unknown> | null)?.videoAvatar);
        if (!a?.published || !v.enabled) return json({ error: 'Video avatar is not enabled' }, 404);
        faceId = v.faceId;
      }
      // Public sessions get a shorter idle window so an abandoned tab stops using avatar minutes.
      // A flat key-green backdrop lets the browser cut the person out so she floats like the static photo.
      const backgroundId = await chromaBackgroundId(apiKey).catch(() => null);
      // Keep Simli's own square canvas (768): a smaller canvas crops a window out of the avatar's frame,
      // which is what cut Aspen in half. Only the backdrop is swapped for the key green.
      const config = { faceId, handleSilence: true, maxSessionLength: publicSession ? 1800 : 3600, maxIdleTime: publicSession ? 60 : 300, ...(backgroundId ? { background_id: backgroundId } : {}) };
      let res = await fetch(`${SIMLI}/compose/token`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-simli-api-key': apiKey }, body: JSON.stringify(config) });
      // Older (non Trinity-2) faces may reject the framing fields; retry with the face's own look.
      if (!res.ok && backgroundId && res.status === 422) res = await fetch(`${SIMLI}/compose/token`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-simli-api-key': apiKey }, body: JSON.stringify({ faceId, handleSilence: true, maxSessionLength: config.maxSessionLength, maxIdleTime: config.maxIdleTime }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session_token) return json({ error: String(data.detail || 'Simli refused the avatar session') }, res.status === 400 ? 400 : 502);
      const warnings: string[] = Array.isArray(data.warnings) ? data.warnings.map(String) : [];
      if (warnings.length) console.warn('simli token warnings', warnings);
      const token = String(data.session_token);
      const chromaKey = !!backgroundId && token.startsWith('trinity2') && !warnings.some(w => /background/i.test(w));
      return json({ sessionToken: token, faceId, chromaKey });
    }

    if (!user) return json({ error: 'Sign in required' }, 401);
    // Custom photo faces are a paid one-time add-on for customers; admins are exempt.
    const unusedCredit = async (agentId: string) => {
      const a = await editorOf(agentId); if (!a) return { agent: null, credit: null };
      const { data: ws } = await db.from('customer_workspaces').select('user_id,environment').eq('organization_id', a.organization_id).maybeSingle();
      if (!ws) return { agent: a, credit: null };
      const { data: credit } = await db.from('custom_avatar_credits').select('id').eq('user_id', ws.user_id).eq('environment', ws.environment).is('used_at', null).limit(1).maybeSingle();
      return { agent: a, credit };
    };
    if (b.action === 'avatarCredit') {
      if (admin) return json({ unlocked: true, admin: true });
      const { agent, credit } = await unusedCredit(b.agentId);
      if (!agent) return json({ error: 'Access denied' }, 403);
      return json({ unlocked: Boolean(credit) });
    }
    if (b.action === 'createFace') {
      let creditId: string | null = null;
      if (!admin) {
        if (!b.agentId) return json({ error: 'Access denied' }, 403);
        const { agent, credit } = await unusedCredit(b.agentId);
        if (!agent) return json({ error: 'Access denied' }, 403);
        if (!credit) return json({ error: 'Custom photo avatars are a $50 one-time add-on. Library avatars are free.' }, 402);
        creditId = credit.id;
      }
      const bytes = Uint8Array.from(atob(b.imageBase64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append('image', new Blob([bytes], { type: b.mimeType }), `face.${b.mimeType.split('/')[1]}`);
      const res = await fetch(`${SIMLI}/faces/trinity?face_name=${encodeURIComponent(b.name)}`, { method: 'POST', headers: { 'x-simli-api-key': apiKey }, body: form });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) return json({ error: 'No avatar generations left on the Simli plan.' }, 403);
      if (!res.ok) return json({ error: String(data.detail?.[0]?.msg || data.detail || 'Simli could not create this face') }, 502);
      if (creditId) await db.from('custom_avatar_credits').update({ used_at: new Date().toISOString(), face_id: String(data.face_id) }).eq('id', creditId).is('used_at', null);
      return json({ faceId: data.face_id, message: data.message, dispatchAfter: data.dispatch_after ?? null, warnings: data.warnings || [] });
    }
    if (b.action === 'status') {
      const res = await fetch(`${SIMLI}/faces/trinity/generation_status?face_id=${encodeURIComponent(b.faceId)}`, { headers: { 'x-simli-api-key': apiKey } });
      const data = await res.json().catch(() => ({}));
      return json({ status: data.status || 'not_found', queuePosition: data.queue_position ?? -1 });
    }
    if (!admin) return json({ error: 'Administrator access required' }, 403);
    if (b.action === 'faces') {
      const res = await fetch(`${SIMLI}/faces`, { headers: { 'x-simli-api-key': apiKey } });
      const data = await res.json().catch(() => []);
      if (!res.ok) return json({ error: 'Could not list Simli faces' }, 502);
      return json({ faces: (Array.isArray(data) ? data : []).map((f: Record<string, unknown>) => ({ id: f.id, name: f.name || f.face_name || 'Untitled face', version: f.simli_version ?? null })) });
    }
    // applyHomepage: explicit admin action updates the homepage/demo-room Aspen draft and live snapshot.
    const avatar = normalizeVideoAvatar(b.avatar);
    const { data: home } = await db.from('voice_agents').select('id,draft,published').eq('slug', 'aspen-homepage').maybeSingle();
    if (!home) return json({ error: 'Homepage assistant not found' }, 404);
    const { error } = await db.from('voice_agents').update({ draft: { ...(home.draft as object), videoAvatar: avatar }, ...(home.published ? { published: { ...(home.published as object), videoAvatar: avatar } } : {}) }).eq('id', home.id);
    if (error) throw error;
    return json({ success: true, avatar });
  } catch (e) {
    console.error('simli-avatar', e);
    return json({ error: 'Video avatar request failed' }, 500);
  }
});
