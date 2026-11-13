import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { workspaceAccess } from '../_shared/customer-payments.ts';

// Voice cloning via ElevenLabs Instant Voice Cloning (IVC):
// POST https://api.elevenlabs.io/v1/voices/add — multipart form-data with
// `name` + `files[]`, header `xi-api-key`. Returns { voice_id } immediately.
// The key lives ONLY in the ELEVENLABS_API_KEY Supabase secret; never log it.
// Storage: cloned_voice_id / cloned_voice_name / cloned_voice_status columns
// on voice_agents (migration 20261113120000_voice_clone.sql, additive). All
// reads/writes tolerate the columns being absent (SQL not applied yet) and
// degrade to "no clone stored" instead of failing the panel.
const ELEVENLABS = 'https://api.elevenlabs.io';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const AUDIO_MIME = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/ogg'] as const;
const EXT: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get'), agentId: z.string().uuid() }),
  z.object({ action: z.literal('create'), agentId: z.string().uuid(), name: z.string().min(1).max(80), audioBase64: z.string().min(100).max(14_000_000), mimeType: z.enum(AUDIO_MIME) }),
  // Admin-only direct management: attach an existing ElevenLabs voice by ID
  // (e.g. cloned outside the panel) or detach the stored clone entirely.
  z.object({ action: z.literal('setId'), agentId: z.string().uuid(), voiceId: z.string().min(8).max(120), name: z.string().min(1).max(80).optional() }),
  z.object({ action: z.literal('remove'), agentId: z.string().uuid() }),
]);

type CloneState = { id: string; name: string; status: string } | null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'Invalid request' }, 400);
    const b = parsed.data;
    const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data: { user } } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
    if (!user) return json({ error: 'Sign in required' }, 401);
    const { data: role } = await db.from('voice_platform_roles').select('role').eq('user_id', user.id).maybeSingle();
    const admin = role?.role === 'admin';

    const { data: agent } = await db.from('voice_agents').select('id,organization_id').eq('id', b.agentId).maybeSingle();
    if (!agent) return json({ error: 'Agent not found' }, 404);
    if (!admin) {
      const { data: m } = await db.from('voice_memberships').select('id').eq('organization_id', agent.organization_id).eq('user_id', user.id).eq('role', 'editor').maybeSingle();
      if (!m || !(await workspaceAccess(db, agent.organization_id))) return json({ error: 'Access denied' }, 403);
    }

    // The $50 custom add-on covers BOTH the photo avatar and the voice clone,
    // so entitlement = a purchased credit for the workspace owner (any state —
    // the photo path marks it used; that must not lock the voice half out).
    const purchased = async () => {
      if (admin) return true;
      const { data: ws } = await db.from('customer_workspaces').select('user_id,environment').eq('organization_id', agent.organization_id).maybeSingle();
      if (!ws) return false;
      const { data: credit } = await db.from('custom_avatar_credits').select('id').eq('user_id', ws.user_id).eq('environment', ws.environment).limit(1).maybeSingle();
      return Boolean(credit);
    };

    const readState = async (): Promise<CloneState> => {
      const { data, error } = await db.from('voice_agents').select('cloned_voice_id,cloned_voice_name,cloned_voice_status').eq('id', agent.id).maybeSingle();
      if (error || !data?.cloned_voice_id) return null;
      return { id: String(data.cloned_voice_id), name: String(data.cloned_voice_name || 'My voice'), status: String(data.cloned_voice_status || 'ready') };
    };
    const writeState = async (state: { id?: string | null; name?: string; status: string }) => {
      const patch: Record<string, unknown> = { cloned_voice_status: state.status };
      if (state.id !== undefined) patch.cloned_voice_id = state.id;
      if (state.name !== undefined) patch.cloned_voice_name = state.name;
      const { error } = await db.from('voice_agents').update(patch).eq('id', agent.id);
      if (error) console.error('voice-clone-create: state write failed (migration applied?)', error.message);
    };

    if (b.action === 'get') {
      return json({ unlocked: await purchased(), admin, clonedVoice: await readState() });
    }

    if (b.action === 'setId' || b.action === 'remove') {
      if (!admin) return json({ error: 'Administrator access required' }, 403);
      if (b.action === 'setId') {
        const name = b.name || 'Cloned voice';
        await writeState({ id: b.voiceId, name, status: 'ready' });
        return json({ clonedVoice: { id: b.voiceId, name, status: 'ready' } });
      }
      await writeState({ id: null, name: '', status: 'none' });
      return json({ clonedVoice: null });
    }

    // action === 'create'
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) return json({ error: 'Voice cloning is not configured' }, 503);
    if (!(await purchased())) return json({ error: 'Voice cloning is part of the $50 custom avatar + voice add-on. Library voices are free.' }, 402);

    await writeState({ name: b.name, status: 'creating' });
    const bytes = Uint8Array.from(atob(b.audioBase64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('name', b.name);
    form.append('files', new Blob([bytes], { type: b.mimeType }), `voice-sample.${EXT[b.mimeType] || 'mp3'}`);
    const res = await fetch(`${ELEVENLABS}/v1/voices/add`, { method: 'POST', headers: { 'xi-api-key': apiKey }, body: form });
    const data = await res.json().catch(() => ({})) as { voice_id?: string; detail?: unknown };
    if (!res.ok || !data.voice_id) {
      await writeState({ status: 'failed' });
      const detail = typeof data.detail === 'string' ? data.detail
        : (data.detail as { message?: string } | undefined)?.message;
      console.error('voice-clone-create: ElevenLabs refused the clone', res.status, detail || '');
      return json({ error: detail || 'ElevenLabs could not clone this voice. Try a quieter, longer recording.' }, 502);
    }
    await writeState({ id: String(data.voice_id), name: b.name, status: 'ready' });
    return json({ clonedVoice: { id: String(data.voice_id), name: b.name, status: 'ready' } });
  } catch (e) {
    console.error('voice-clone-create', e instanceof Error ? e.message : 'failed');
    return json({ error: 'Voice cloning request failed' }, 500);
  }
});
