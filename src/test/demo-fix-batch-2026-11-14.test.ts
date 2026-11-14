// @vitest-environment node
// Demo fix batch (2026-11-14) — source guards for the layers a jsdom
// mount cannot prove: page-level stacking, DemoSite's first-paint
// seed + screenshot stability, the server chroma verdict, and the
// locale templates (with the Aspen byte-identity check Ron required).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESENTER_CUTOUTS, presenterPortraitImage, SIMLI_FACE_CATALOG } from '@/lib/simliFaceCatalog';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const FRANK = 'b3f85f7f-57ea-4f24-b1f6-a57229b4fae1';
const MONICA_FACE = 'e0d7b128-40a7-4d03-ac84-ef4c54b92450';
const BLACK_LADY = '9344d4c1-6b69-43e7-a73f-ddc15d1a3f75';
const SARA = 'f735e62c-dce7-4c0b-8e85-1c7e21774c45';

describe('item 1 — layering: the widget always stacks above page content', () => {
  const css = read('src/index.css');
  it('Leaflet containers are stacking-trapped so their z-1000 controls cannot paint over the z-60 widget', () => {
    expect(css).toContain('.leaflet-container { isolation: isolate; }');
  });
  it('the floating layer scale itself is untouched (dialogs still above the widget)', () => {
    expect(css).toContain('--layer-floating: 60;');
    expect(css).toContain('--layer-modal: 71;');
  });
});

describe('item 2 — transparent backgrounds for the new personas', () => {
  it('cutout assets exist for Frank, Monica and Black Professional Lady', () => {
    for (const id of [FRANK, MONICA_FACE, BLACK_LADY]) {
      expect(fs.existsSync(path.join(__dirname, '..', 'assets', 'simli', `${id}-cutout.webp`))).toBe(true);
      expect(PRESENTER_CUTOUTS[id]).toBeTruthy();
    }
  });
  it('the widget resolver prefers the cutout; faces without one keep their catalog photo', () => {
    const frankCatalog = SIMLI_FACE_CATALOG.find(f => f.id === FRANK)?.image;
    expect(presenterPortraitImage(FRANK)).toBeTruthy();
    expect(presenterPortraitImage(FRANK)).not.toBe(frankCatalog);
    expect(presenterPortraitImage(SARA)).toBe(SIMLI_FACE_CATALOG.find(f => f.id === SARA)?.image);
    expect(presenterPortraitImage(undefined)).toBeUndefined();
  });
  it('both widget portrait paths resolve through the cutout-aware helper', () => {
    expect(read('src/components/landing/demo-results/AspenDemoWidget.tsx')).toContain('presenterPortraitImage(PERSONAS[presenter].portraitFaceId)');
    expect(read('src/components/GeminiAgentWidget.tsx')).toContain('presenterPortraitImage(FRANK_FACE_ID)');
  });
  it('the live-stream chroma verdict only claims keying when the backdrop was actually applied', () => {
    const fn = read('supabase/functions/simli-avatar/index.ts');
    expect(fn).toContain('let backgroundApplied = !!backgroundId;');
    expect(fn).toContain('backgroundApplied = false;');
    expect(fn).toContain('const chromaKey = backgroundApplied &&');
  });
  it('SimliAvatar marks its media as the Stage 3 live-face source (canvas + video)', () => {
    expect(occurrences(read('src/components/SimliAvatar.tsx'), 'data-live-face-source')).toBe(2);
  });
});

describe('item 3 — presenter name everywhere', () => {
  it('the voice pre-start card was already name-templated; the demo seed now feeds it the presenter from frame one', () => {
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    expect(en.voice.consentTitle).toBe('Try a live demo with {{name}}');
    expect(read('src/pages/DemoSite.tsx')).toContain('leadId: searchParams.get("leadId") ?? undefined');
  });
  it('the typed chat threads presenterName into its greeting, consent card and composer', () => {
    const chat = read('src/components/landing/demo-results/ChatWidget.tsx');
    expect(chat).toContain('t("chat.greetingBody", { businessName, name: presenterDisplayName })');
    expect(chat).toContain('t("chat.consentTitle", { name: presenterDisplayName })');
    expect(chat).toContain('presenterName?: string;');
    expect(read('src/components/landing/demo-results/AspenDemoWidget.tsx')).toContain('presenterName={presenterName}');
  });
  it('locale templates name the presenter — and render byte-identical English for Aspen', () => {
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    expect(en.chat.greetingBody.replace('{{name}}', 'Aspen')).toBe(
      "I'm Aspen, the AI assistant for {{businessName}}. This is a live demo of how AI chat + AI voice can work on your website to answer questions, capture leads, and book appointments.\n\nTap a suggestion below or ask me anything.",
    );
    expect(en.chat.consentTitle).toBe('Try {{name}} chat');
    expect(en.chat.placeholder).toBe('Ask {{name}} anything...');
    expect(en.voice.videoFallback).toBe('Video needs a faster connection — you’re talking with {{name}} by voice.');
    for (const loc of ['es.json', 'pt-BR.json']) {
      const l = JSON.parse(read(`src/i18n/locales/${loc}`));
      expect(l.chat.greetingBody).toContain('{{name}}');
      expect(l.chat.consentTitle).toContain('{{name}}');
      expect(l.voice.videoFallback).toContain('{{name}}');
      expect(l.voice.embeddedMicNotice).toContain('{{name}}');
    }
  });
  it('session-lifecycle copy in the conversation names the current speaker', () => {
    const conv = read('src/components/GeminiConversation.tsx');
    expect(conv).toContain('t("voice.videoFallback", { name: speakerName })');
    expect(conv).toContain('t("voice.embeddedMicNotice", { name })');
  });
});

describe('item 4 — Saperstein transient: pinned presenter + preview stable from first paint', () => {
  const site = read('src/pages/DemoSite.tsx');
  it('the first captured screenshot wins for the whole session (merges never swap the base URL)', () => {
    expect(site).toContain('screenshot: current.screenshot || record.website_screenshot || null');
    expect(site).toContain('screenshotTablet: current.screenshotTablet || record.screenshot_tablet || null');
    expect(site).toContain('screenshotMobile: current.screenshotMobile || record.screenshot_mobile || null');
  });
  it('the screenshot cache key is the stable leadId, not the ever-changing record version', () => {
    expect(site).toContain('leadData?.leadId || leadData?.previewVersion || undefined');
  });
  it('a pinned example never re-enters the scanning curtain mid-demo', () => {
    expect(site).toContain('const shouldHoldScanningState = isScanning && !isPinnedExample;');
  });
  it('the widget is keyed on the normalized URL so a spelling-only merge cannot remount it', () => {
    expect(site).toContain('key={homepageUrl + (gateRequested ? `:${gatePhase}` : "")}');
    expect(site).toContain('leadId={leadData.leadId || leadIdParam || undefined}');
  });
});

describe('item 5 + refinement A — chat box layouts and the horizontal control row', () => {
  const conv = read('src/components/GeminiConversation.tsx');
  const frame = read('src/components/FloatingPersonFrame.tsx');
  const css = read('src/index.css');
  it('focus is reported to the shell from the captions state', () => {
    expect(conv).toContain('focus: faceFirst && !captions');
    expect(conv).toContain('data-testid="aspen-focus-dock"');
    expect(conv).toContain('sessionStorage.getItem("aspen-widget-captions")');
  });
  it('focus geometry: shell widens ~24%, livebox grows ~25% (desktop and compact)', () => {
    expect(css).toContain('.aspen-person-expanded.aspen-person-focus { width: 348px; }');
    expect(css).toContain('.aspen-person-shell.aspen-person-focus .aspen-person-livebox { width: 293px; height: 235px; }');
    expect(css).toContain('.aspen-person-shell.aspen-person-focus .aspen-person-livebox { width: 234px; height: 188px; }');
  });
  it('the six voice controls never wrap into a stack', () => {
    expect(conv).toContain('voice-controls flex w-full min-w-0 flex-nowrap');
    expect(conv).not.toContain('voice-controls flex flex-wrap');
    expect(css).toContain('.aspen-person-shell .voice-controls { flex-wrap: nowrap; }');
  });
  it('stage 3 face is 66px (+18% over 56px, inside the 15–20% band) with the live mirror', () => {
    expect(frame).toContain('data-testid="stage3-live-face"');
    expect(frame).toContain('h-[66px] w-[66px]');
    expect(frame).not.toContain('relative h-14 w-14 shrink-0 rounded-full');
    expect(frame).toContain("h-[42px] w-[42px]");
  });
  it('both widgets pass the focus flag into the frame', () => {
    expect(read('src/components/GeminiAgentWidget.tsx')).toContain('focus={shellState?.focus ?? false}');
    // AspenDemoWidget gates the flag to voice mode (type/chat fix,
    // 2026-11-14): focus is a voice layout — the stale shell snapshot
    // must not widen the shell while the visitor is in Type mode.
    expect(read('src/components/landing/demo-results/AspenDemoWidget.tsx')).toContain("focus={mode === 'voice' ? (shellState?.focus ?? false) : false}");
  });
});
