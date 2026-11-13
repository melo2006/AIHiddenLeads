// @vitest-environment node
// Fix 4 (Batch 1, 2026-11-12) — Twilio callback gateway fix.
//
// Root cause, proven from production logs: Twilio's callback POST to
// browser-voice-handoff (?action=browser) got 401
// UNAUTHORIZED_NO_AUTH_HEADER from the Supabase GATEWAY, because
// supabase/config.toml carried no [functions.browser-voice-handoff]
// entry and verify_jwt therefore defaulted to true — Twilio sends no
// Supabase JWT. The function itself already authenticates every path
// (Twilio signature for callbacks, the server-issued single-use
// handoff capability for the JSON actions), so the config entry is
// the whole fix. These pins keep the entry, the in-function auth, and
// the deploy route (the workflow's `supabase functions deploy --yes`
// reads config.toml — no workflow change) from regressing.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('Fix 4 — config.toml gateway entry', () => {
  it('browser-voice-handoff deploys with verify_jwt = false', () => {
    const toml = read('supabase/config.toml');
    const entry = toml.indexOf('[functions.browser-voice-handoff]');
    expect(entry).toBeGreaterThan(-1);
    const block = toml.slice(entry, entry + 400);
    expect(block).toContain('verify_jwt = false');
  });

  it('the entry carries the established-style explanation comment', () => {
    const toml = read('supabase/config.toml');
    expect(toml).toContain('Twilio callbacks carry no Supabase JWT');
    expect(toml).toContain('401 (UNAUTHORIZED_NO_AUTH_HEADER)');
    expect(toml).toContain('single-use handoff capability');
  });

  it('the deploy workflow reads config.toml (no per-function JWT flags)', () => {
    const workflow = read('.github/workflows/supabase-deploy.yml');
    expect(workflow).toContain('supabase functions deploy --yes');
    expect(workflow).not.toContain('--no-verify-jwt');
  });
});

describe('Fix 4 — auth audit pins (the function authenticates every path itself)', () => {
  const src = read('supabase/functions/browser-voice-handoff/index.ts');

  it('every ?action= callback is Twilio-signature validated against the exact public URL', () => {
    expect(src).toContain('twilio.validateRequest');
    expect(src).toContain('Invalid Twilio signature');
    // The validated URL includes the query string (apikey is not authorization).
    expect(src).toContain('const publicUrl=`${base}${url.search}`');
    expect(src).toContain('apikey is not authorization');
  });

  it('callbacks require POST + the Twilio form content type before validation', () => {
    expect(src).toContain("if(req.method!=='POST')return json({error:'POST required'},405);");
    expect(src).toContain("application/x-www-form-urlencoded");
  });

  it('the browser callback additionally binds the handoff capability, the client identity and the CallSid shape', () => {
    expect(src).toContain("params.From!==`client:handoff_${handoff.id}`");
    expect(src).toContain('token_hash');
  });

  it('the JSON actions authenticate ONLY via the server-issued handoff capability', () => {
    expect(src).toContain("z.enum(['token','status','cancel'])");
    expect(src).toContain('A valid browser voice session is required');
    // The capability is looked up by hash with an expiry check.
    expect(src).toContain("eq('token_hash',await sha256(parsed.data.handoffToken))");
    expect(src).toContain("gt('expires_at',new Date().toISOString())");
  });

  it('no client-supplied telephone target exists anywhere in the function', () => {
    // The dial target always comes from the saved handoff row that
    // gemini-session created from the agent config — never the body.
    expect(src).toContain('To:handoff.target_phone');
    expect(src).not.toContain('targetPhone');
    expect(src).not.toContain('bodySchema=z.object({action:z.enum([\'token\',\'status\',\'cancel\']),handoffToken:z.string().min(32).max(200),phone');
  });

  it('the token action is single-use (refused once the handoff left not_requested)', () => {
    expect(src).toContain("if(h.status!=='not_requested')return json({error:'This handoff has already been used'},409);");
  });
});
