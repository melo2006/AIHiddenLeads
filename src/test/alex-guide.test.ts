// @vitest-environment node
import { describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALEX_FACE_ID,
  ALEX_GREETING,
  ALEX_GUIDE_SLUG,
  ALEX_KNOWLEDGE,
  ALEX_SYSTEM_PROMPT,
  ALEX_VOICE,
  alexGuideConfig,
} from '../../supabase/functions/_shared/alex-guide';
import { openingFor, VOICES } from '../../supabase/functions/_shared/voice-config';
import { SIMLI_FACE_CATALOG } from '@/lib/simliFaceCatalog';
import { STEPS } from '@/components/setup-wizard/wizardModel';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const readFn = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', rel), 'utf8');

describe('Alex guide config', () => {
  test('identity: Alex, support specialist at AI Hidden Leads, Charon voice', () => {
    const c = alexGuideConfig();
    expect(c.name).toBe('Alex');
    expect(c.businessName).toBe('AI Hidden Leads');
    expect(c.voice).toBe('Charon');
    expect(ALEX_VOICE).toBe('Charon');
    expect(VOICES).toContain('Charon');
    expect(ALEX_GUIDE_SLUG).toBe('alex-guide');
    expect(c.guideSlug).toBe('alex-guide');
    expect(c.platformGuide).toBe(true);
    expect(c.homepageSales).toBe(false);
  });

  test('face: the Simli library Lukas preset, enabled', () => {
    const c = alexGuideConfig();
    expect(ALEX_FACE_ID).toBe('a36d66df-a23d-4569-996b-d0e990019857');
    expect(c.videoAvatar).toEqual({ enabled: true, provider: 'simli', faceId: ALEX_FACE_ID, position: 'bottom-right', size: 200, shape: 'circle' });
    const lukas = SIMLI_FACE_CATALOG.find(f => f.id === ALEX_FACE_ID);
    expect(lukas?.name).toBe('Lukas');
    expect(lukas?.image).toBeTruthy();
  });

  test('no transfer: the guide can never receive a handoff token', () => {
    const c = alexGuideConfig();
    expect(c.transferPhone).toBe('');
    expect(c.transferManagerName).toBe('');
    expect(c.avatarPath).toBe('');
  });

  test('greeting renders through the standard templating with no leftover placeholders', () => {
    const spoken = openingFor(alexGuideConfig(), 10);
    expect(spoken).toContain('Good morning');
    expect(spoken).toContain("I'm Alex");
    expect(spoken).toContain('AI Hidden Leads');
    expect(spoken).not.toMatch(/\{\w+\}/);
  });
});

describe('Alex greeting and prompt content', () => {
  test('greeting: honest AI guide, 6 steps, 10–15 minutes, what to have handy', () => {
    expect(ALEX_GREETING).toContain('{timeGreeting}');
    expect(ALEX_GREETING).toContain('{agentName}');
    expect(ALEX_GREETING).toContain('{businessName}');
    expect(ALEX_GREETING).toContain('support specialist');
    expect(ALEX_GREETING).toContain("I'm an AI guide");
    expect(ALEX_GREETING).toContain('6 short steps');
    expect(ALEX_GREETING).toContain('10 to 15 minutes');
    expect(ALEX_GREETING).toContain('website address');
    expect(ALEX_GREETING).toContain('business email');
    expect(ALEX_GREETING).toContain('FAQs, price list or document');
    expect(ALEX_GREETING).toContain('all optional');
  });

  test('greeting: the payoff and the snippet reassurance, then the step question', () => {
    expect(ALEX_GREETING).toContain('your own assistant answering visitors right on your website');
    expect(ALEX_GREETING).toContain('one small copy-and-paste snippet');
    expect(ALEX_GREETING).toContain('WordPress, Wix and plain HTML are all covered');
    expect(ALEX_GREETING).toContain("I'll stay right here with you for it");
    expect(ALEX_GREETING).toContain('nothing on your site changes except adding that snippet');
    expect(ALEX_GREETING).toContain('you can remove it any time');
    expect(ALEX_GREETING).toContain('Which step are you on');
    expect(ALEX_GREETING).toContain('step 1, Your business');
  });

  test('knowledge: one named section per wizard step, in wizard order, plus install', () => {
    expect(STEPS).toHaveLength(6);
    let last = -1;
    for (const step of STEPS) {
      const at = ALEX_KNOWLEDGE.indexOf(step.title);
      expect(at, `section for step "${step.title}"`).toBeGreaterThan(last);
      last = at;
    }
    expect(ALEX_KNOWLEDGE).toContain('--- Install: putting the assistant on the real website ---');
    expect(ALEX_KNOWLEDGE).toContain('before the closing body tag');
    expect(ALEX_KNOWLEDGE).toContain('WordPress or Wix instructions');
  });

  test('knowledge: the known stuck points are covered', () => {
    expect(ALEX_KNOWLEDGE).toContain('leave the website blank');
    expect(ALEX_KNOWLEDGE).toContain('Learning from a website takes a little while');
    expect(ALEX_KNOWLEDGE).toContain('fill in automatically');
    expect(ALEX_KNOWLEDGE).toContain('This whole step is optional');
    expect(ALEX_KNOWLEDGE).toContain('Video uses extra voice minutes');
    expect(ALEX_KNOWLEDGE).toContain('test uses the saved draft');
    expect(ALEX_KNOWLEDGE).toContain('only after publishing do the install steps appear');
  });

  test('prompt: one step at a time, exact next click, setup only', () => {
    expect(ALEX_SYSTEM_PROMPT).toContain('ONE step at a time');
    expect(ALEX_SYSTEM_PROMPT).toContain('exact next click');
    expect(ALEX_SYSTEM_PROMPT).toContain('You guide SETUP only');
    expect(ALEX_SYSTEM_PROMPT).toContain('steer back to the step they are on');
    expect(ALEX_SYSTEM_PROMPT).toContain('PER-STEP REFERENCE');
  });

  test('prompt: no invented prices, no credentials, human route is honest', () => {
    expect(ALEX_SYSTEM_PROMPT).toContain('Premium $99/month');
    expect(ALEX_SYSTEM_PROMPT).toContain('Professional $199/month');
    expect(ALEX_SYSTEM_PROMPT).toContain('Platinum $349/month');
    expect(ALEX_SYSTEM_PROMPT).toContain('50% off for the first 3 months');
    expect(ALEX_SYSTEM_PROMPT).toContain('custom photo avatar is $50 one-time');
    expect(ALEX_SYSTEM_PROMPT).toContain('Never ask for a password');
    expect(ALEX_SYSTEM_PROMPT).toContain('You cannot transfer this call');
    expect(ALEX_SYSTEM_PROMPT).toContain('(877) 862-4949');
    expect(ALEX_SYSTEM_PROMPT).toContain('the team can call them back');
  });
});

describe('guide branch: auth + quota behavior (source pins)', () => {
  const session = readFn('gemini-session/index.ts');

  test('schema accepts guide: alex and the branch runs before every other branch', () => {
    expect(session).toContain("guide:z.enum(['alex']).optional()");
    const guideAt = session.indexOf("b.guide==='alex'");
    expect(guideAt).toBeGreaterThan(-1);
    expect(guideAt).toBeLessThan(session.indexOf('b.share'));
    expect(guideAt).toBeLessThan(session.indexOf('b.leadId'));
  });

  test('anonymous guide requests are refused; signed-in users get the guide config', () => {
    const branch = session.slice(session.indexOf("b.guide==='alex'"), session.indexOf('config=alexGuideConfig();') + 'config=alexGuideConfig();'.length);
    expect(branch).toContain("if(!user) return json({error:'Sign in to use the setup guide'},401)");
    expect(branch).toContain('config=alexGuideConfig()');
    // The tenant subscription gate must not be CALLED on the guide branch.
    expect(branch).not.toContain('workspaceAccess(db');
  });

  test('quota stays the shared class machinery — visitor for non-admins, never a free pass', () => {
    expect(session).toContain("quotaClass:b.share?'visitor':voiceQuotaClass(role?.role==='admin',b.preview)");
    const limit = readFn('_shared/voice-session-limit.ts');
    expect(limit).toContain("return isAdmin ? 'admin_test' : preview ? 'audition' : 'visitor'");
  });

  test('simli token branch: guide face is fixed server-side and requires sign-in', () => {
    const simli = readFn('simli-avatar/index.ts');
    expect(simli).toContain("guide: z.enum(['alex']).optional()");
    const branch = simli.slice(simli.indexOf("b.guide === 'alex'"), simli.indexOf('b.shareToken'));
    expect(branch).toContain("if (!user) return json({ error: 'Sign in to use the setup guide' }, 401)");
    expect(branch).toContain('faceId = ALEX_FACE_ID');
    // A client-supplied faceId is never honored on the guide branch.
    expect(branch).not.toContain('b.faceId');
  });

  test('client forwards the guide flag on both session requests', () => {
    const convo = read('components/GeminiConversation.tsx');
    expect(convo).toContain('guide?: "alex"');
    expect(convo).toContain('verification, invite, guide }');
    expect(convo).toContain('guide={guide}');
    const avatar = read('components/SimliAvatar.tsx');
    expect(avatar).toContain('guide?: "alex"');
    expect(avatar).toContain('faceId: faceOverride, guide }');
  });
});

describe('widget mount: wizard only, visually distinct, no double-mount', () => {
  const setup = read('pages/CustomerSetup.tsx');
  const widget = read('components/GeminiAgentWidget.tsx');

  test('CustomerSetup mounts the guide ONLY in the setup view', () => {
    expect(setup).toContain('<GeminiAgentWidget guide="alex" floating/>');
    expect(setup.match(/GeminiAgentWidget/g)).toHaveLength(3); // import path + specifier + the one mount
    expect(setup.match(/<GeminiAgentWidget/g)).toHaveLength(1); // exactly one mount, in the setup view
    // The dashboard branch renders the agent editor, never the guide.
    const dashboardAt = setup.indexOf('dashboard?<VoiceAgentsView');
    const guideAt = setup.indexOf('<GeminiAgentWidget guide="alex" floating/>');
    expect(dashboardAt).toBeGreaterThan(-1);
    expect(guideAt).toBeGreaterThan(dashboardAt);
  });

  test('no other page mounts the guide', () => {
    for (const page of ['pages/Index.tsx', 'pages/TryDemo.tsx', 'pages/AgentEmbed.tsx', 'pages/ClientVoiceAgent.tsx']) {
      expect(read(page), page).not.toContain('guide="alex"');
    }
  });

  test('guide widget: static Lukas identity, specialist label, no sales actions, no prewarm', () => {
    expect(widget).toContain("export const ALEX_GUIDE_LABEL = 'Alex — Support Specialist'");
    expect(widget).toContain('ALEX_GUIDE_LABEL');
    expect(widget).toContain('SIMLI_FACE_CATALOG.find(f => f.id === ALEX_FACE_ID)');
    expect(widget).toContain("name:'Alex',businessName:'AI Hidden Leads'");
    expect(widget).toContain('!isGuide && (!agentId || leadId || prospectId)');
    expect(widget).toContain('floating && !agentId && !isGuide');
    // The guide never joins the homepage open-event or the tenant identity preload.
    expect(widget).toContain('if(agentId || isGuide || !floating)return');
    expect(widget).toContain("if(isGuide){setIdentity(");
  });

  test('guide session passes no tenant agentId, so it can never double as the customer agent', () => {
    expect(widget).toContain('agentId={isGuide ? undefined : identity.id || agentId}');
    expect(widget).toContain('guide={guide}');
    expect(widget).toContain('videoAvatar={isGuide ? identity.videoAvatar');
  });

  test('guide mode passes the Lukas portrait as the frame/conversation avatarUrl', () => {
    // faceUrl is the single value threaded into BOTH FloatingPersonFrame (the
    // idle bubble) and GeminiConversation (the pre-live PersonPortrait). In
    // guide mode it must be the guide identity's avatarUrl — the Lukas catalog
    // portrait set by the guide effect — never undefined (Aspen fallback).
    expect(widget).toContain("const faceUrl = isGuide ? (identity.avatarUrl || undefined) : agentId ? identity.avatarUrl : undefined;");
    expect(widget).toContain('<FloatingPersonFrame name={identity.name} avatarUrl={faceUrl}');
    expect(widget).toContain('avatarUrl={faceUrl}');
    // The guide identity's avatarUrl IS the Lukas catalog portrait.
    expect(widget).toContain("avatarUrl:alexPortrait || ''");
    const lukas = SIMLI_FACE_CATALOG.find(f => f.id === ALEX_FACE_ID);
    expect(lukas?.image).toBeTruthy();
  });

  test('non-guide faceUrl paths unchanged: tenant uses its record, platform Aspen stays undefined', () => {
    // The ternary keeps the pre-fix semantics for both non-guide paths:
    // agentId → identity.avatarUrl verbatim (a tenant '' keeps the mic icon);
    // no agentId and no guide → undefined (the frame's Aspen-asset fallback).
    const line = widget.split('\n').find(l => l.includes('const faceUrl =')) || '';
    expect(line).toContain('agentId ? identity.avatarUrl : undefined');
    // The frame's fallback semantics themselves are untouched.
    const frame = read('components/FloatingPersonFrame.tsx');
    expect(frame).toContain('const bubblePhoto = avatarUrl === undefined ? aspenIdleBeckon : avatarUrl;');
    expect(frame).toContain('const src = avatarUrl || (animated ? aspenIdleBeckon : aspenPortrait);');
  });
});
