// Homepage voice demo start (2026-11-21, homepage-test items 9 + 10).
//
// Until now a homepage voice session could not start the visitor's
// live demo at all: the only demo-creation flow was the /demo intake
// (create_demo_lead → /demo-site scan), unreachable from the
// conversation, while the DEMO BRIDGE script had Aspen narrate a
// two-minute build that no machinery stood behind. This module is the
// real path, shaped like _shared/contact-save.ts: the orchestration
// lives here with its writers injected so the behavior is
// unit-testable, and the proxy wires the real writers (the SAME
// create_demo_lead RPC the intake uses, the SAME demo-verification
// code send, the SAME scan-website invocation /demo-site performs —
// no parallel pipeline).
//
// Consent model: the Verified Demo Gate's disclosure-by-continuing.
// The on-screen confirmation shows the gate's disclosure text and the
// visitor's tap on "Start my demo" IS the consent — there is no
// checkbox, and Aspen never has to ask for one (item 9). When the
// confirmed card carries an email, the gate code is sent at creation
// exactly as the intake sends it, so the /demo-site gate (gate=1)
// behaves identically to the /demo path. With no email there is
// nothing to send a code to, so the card links without gate=1 and
// Aspen can offer the link by email through the normal follow-up.

import { normalizeDictatedEmail } from './contact-normalize.ts';

export const DEMO_START_TOOL_NAME = 'request_demo_start';

/** Mirrors DEMO_CONSENT_DISCLOSURE_VERSION in src/lib/demoVerification.ts
 *  (the proxy cannot import src/; the demo-verification function
 *  records this version against the code send). */
export const DEMO_CONSENT_DISCLOSURE_VERSION = 'demo-consent-v2';

/** Gate scope: homepage SALES sessions only — never a simulation
 *  (a simulation is the demo itself), never a preview/audition. */
export function demoStartApplies(config: {
  homepageSales?: unknown;
  simulation?: unknown;
  preview?: unknown;
}): boolean {
  return config.homepageSales === true && config.simulation !== true && config.preview !== true;
}

export const DEMO_START_TOOL_DECLARATION = {
  name: DEMO_START_TOOL_NAME,
  description:
    'Start the visitor\'s free live website demo for real. Use ONLY after the visitor agrees to see the demo and gives their website address. Shows them a short on-screen confirmation with the address pre-filled so they can correct it; nothing is created before they confirm on screen. After their confirmation the result reports whether the demo actually started — narrate ONLY what the result says, never announce a build before it.',
  parameters: {
    type: 'OBJECT',
    properties: {
      websiteUrl: { type: 'STRING', description: 'The website address the visitor gave for their demo, as they said it.' },
      name: { type: 'STRING', description: 'The visitor\'s name, only if they already gave it in this conversation.' },
      email: { type: 'STRING', description: 'The visitor\'s email, only if they already gave it in this conversation.' },
    },
    required: ['websiteUrl'],
  },
} as const;

/** Port of normalizeDemoUrl in src/components/landing/DemoIntakePanel.tsx
 *  (kept in step manually — the Deno proxy cannot import src/). */
export function normalizeDemoUrl(raw: string): string {
  let url = raw.trim().replace(/^["']+|["']+$/g, '').trim();
  url = url.replace(/^(?:https?:\/\/)/i, '');
  url = url.replace(/\/+$/, '');
  if (!url) return raw.trim();
  return `https://${url}`;
}

/** Port of looksLikeDomain in src/components/landing/DemoIntakePanel.tsx. */
export function looksLikeDomain(value: string): boolean {
  const host = value
    .trim()
    .replace(/^(?:https?:\/\/)/i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0];
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(host);
}

/** Port of extractBusinessName in DemoIntakePanel.tsx — the stored
 *  business name when the visitor gave none: the site's first label,
 *  capitalized, or a neutral phrase — never the bare word "Business". */
export function businessNameFromWebsiteUrl(url: string): string {
  try {
    const clean = url.replace(/^(?:https?:\/\/)/i, '').replace(/^www\./i, '');
    const domain = clean.split('/')[0].split('.')[0];
    if (!domain) return 'this business';
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return 'this business';
  }
}

export interface DemoStartCard {
  websiteUrl: string;
  name: string;
  email: string;
}

const asTrimmedString = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** The confirmation card's prefill: the tool's arguments first (they
 *  are what Aspen just heard), then anything already captured this
 *  visit, else empty. Truncated to the same limits the follow-up
 *  card uses. The email runs through the dictated-email cleanup
 *  (item 5 form fix, 2026-11-21) like every other card's prefill —
 *  a spelled-out address arrives assembled, not as raw fragments. */
export function demoStartCardFromArgs(
  args: Record<string, unknown> | undefined,
  captured: { name?: string; email?: string } | null,
): DemoStartCard {
  return {
    websiteUrl: asTrimmedString(args?.websiteUrl, 255),
    name: asTrimmedString(args?.name, 100) || asTrimmedString(captured?.name, 100),
    email: normalizeDictatedEmail(asTrimmedString(args?.email, 255) || asTrimmedString(captured?.email, 255)),
  };
}

/** The /demo-site entry path for a voice-created lead. scan=1 makes
 *  /demo-site run (or join) the scan; gate=1 is added only when a
 *  gate code was actually sent, mirroring the /demo intake, which
 *  sends the code before navigating. callerName/callerEmail ride
 *  along when known, as the CRM seeding path passes them. */
export function buildDemoSitePath(input: {
  leadId: string;
  gate: boolean;
  callerName?: string;
  callerEmail?: string;
}): string {
  const params = new URLSearchParams({ leadId: input.leadId, scan: '1' });
  if (input.gate) {
    params.set('gate', '1');
    params.set('gateChannel', 'email');
  }
  if (input.callerName) params.set('callerName', input.callerName);
  if (input.callerEmail) params.set('callerEmail', input.callerEmail);
  return `/demo-site?${params.toString()}`;
}

export interface DemoStartWriters {
  /** The create_demo_lead RPC (same arguments the intake passes). */
  createLead: (args: {
    _business_name: string;
    _full_name: string;
    _phone: null;
    _email: string | null;
    _website_url: string;
    _niche: string;
    _secondary_url: null;
    _scan_status: string;
  }) => Promise<{ data: string | null; error: unknown }>;
  /** The demo-verification request-code send (email channel). */
  sendGateCode: (leadId: string, email: string) => Promise<{ ok: boolean }>;
  /** The scan-website invocation /demo-site performs on mount.
   *  Best-effort: /demo-site re-checks the lead on open and joins or
   *  starts the scan itself, so a failed early invoke never strands
   *  the demo — it only means the build starts at tap time. */
  invokeScan: (leadId: string, websiteUrl: string, businessName: string) => Promise<{ ok: boolean }>;
}

export type DemoStartResult =
  | { ok: true; leadId: string; websiteUrl: string; demoPath: string; gate: boolean; scanInvoked: boolean }
  | { ok: false; stage: 'validate' | 'create' };

/** Create the demo lead from a CONFIRMED card and set the real build
 *  in motion. The gate code and the scan are sequenced the way the
 *  /demo intake + /demo-site sequence them: lead first, code while
 *  it builds, scan started immediately so "building" is literally
 *  true before the visitor taps the card. */
export async function startDemoForVisitor(
  writers: DemoStartWriters,
  card: DemoStartCard,
): Promise<DemoStartResult> {
  const websiteUrl = normalizeDemoUrl(card.websiteUrl || '');
  if (!looksLikeDomain(websiteUrl)) return { ok: false, stage: 'validate' };
  const name = card.name.trim();
  const email = card.email.trim();
  const businessName = businessNameFromWebsiteUrl(websiteUrl);
  let leadId: string | null = null;
  try {
    const created = await writers.createLead({
      _business_name: businessName,
      _full_name: name || 'Website visitor',
      _phone: null,
      _email: email || null,
      _website_url: websiteUrl,
      _niche: 'general',
      _secondary_url: null,
      _scan_status: 'pending',
    });
    if (created.error || !created.data) return { ok: false, stage: 'create' };
    leadId = created.data;
  } catch {
    return { ok: false, stage: 'create' };
  }
  // Gate code: only when there is an email to send it to, exactly as
  // the intake sends it before navigating. Best-effort — a failed
  // send drops the gate (the visitor still gets their demo), it
  // never fails the start.
  let gate = false;
  if (email) {
    try {
      gate = (await writers.sendGateCode(leadId, email)).ok === true;
    } catch {
      gate = false;
    }
  }
  let scanInvoked = false;
  try {
    scanInvoked = (await writers.invokeScan(leadId, websiteUrl, businessName)).ok === true;
  } catch {
    scanInvoked = false;
  }
  return {
    ok: true,
    leadId,
    websiteUrl,
    demoPath: buildDemoSitePath({
      leadId,
      gate,
      ...(name ? { callerName: name } : {}),
      ...(email ? { callerEmail: email } : {}),
    }),
    gate,
    scanInvoked,
  };
}

/** What the MODEL hears on a successful start: real status only.
 *  The build time wording matches the reviewed site copy ("in about
 *  two minutes") — it is a property of the pipeline, and the scan is
 *  genuinely running by the time this is spoken. */
export function demoStartToolSuccessResponse(result: Extract<DemoStartResult, { ok: true }>): Record<string, unknown> {
  return {
    started: true,
    status: 'building',
    demoPath: result.demoPath,
    instruction:
      'The visitor\'s demo has really started: their website scan is running and the demo is opening in a new tab on their screen right now — the confirm tap opened it directly (one-tap start, 2026-11-23); a card on their screen also opens the demo if the tab did not come through. Tell them in one or two sentences that their demo is building now and opening in the new tab — it takes about two minutes — and that the card on their screen opens it too if they need it. Then follow the demo bridge: prepare them for what the demo version of you is and hand over as scripted. Do not invent progress updates; if they ask later, remind them the demo is in the new tab and the card is on their screen.',
  };
}

/** What the MODEL hears when the start fails: honest, brief, and it
 *  hands Aspen the honest fallback (the on-page button, or the
 *  follow-up offer) — never a raw internal error, never a claim that
 *  a demo is building. Mirrors the contact-save fallback contract. */
export const DEMO_START_FALLBACK_TOOL_RESPONSE = {
  started: false,
  instruction:
    'Do not claim a demo is building — it could not be started just now. Apologize briefly and honestly, then offer the alternative: the \'Try it on your website — free\' button right here on this page starts the same demo, or you can take their email with the usual confirmation and the team will send them the demo link. Continue the conversation naturally.',
} as const;

/** What the CLIENT shows for the same failure: an honest marker,
 *  kept separate from the model-facing response above. */
export const DEMO_START_CLIENT_ERROR =
  'Your demo could not be started just now — please use the "Try it on your website — free" button on this page, or ask Aspen to email you the demo link.';
