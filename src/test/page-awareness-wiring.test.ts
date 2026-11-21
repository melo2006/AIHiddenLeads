// @vitest-environment node
// PAGE AWARENESS — WIRING (homepage-test item 6, 2026-11-21). The
// Deno functions cannot run under vitest, so the session stamp, the
// proxy composition + page_context handler, and the client feed are
// source-pinned here, in the guarded-search tests' style. The
// mechanical behavior lives in page-context.test.ts; the knowledge
// content in page-knowledge.test.ts.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('gemini-session — mint schema and page stamp', () => {
  const session = read('supabase/functions/gemini-session/index.ts');

  it('the mint schema accepts a page payload beside the campaign payload', () => {
    expect(session).toContain('page:z.object({path:z.string().max(100),section:z.string().max(40).optional(),title:z.string().max(160).optional()}).nullable().optional()');
  });

  it('the stamp re-validates server-side and falls back to the campaign entryPath', () => {
    expect(session).toContain("import { sanitizePageContext } from '../_shared/page-context.ts';");
    expect(session).toContain("if(agent.slug==='aspen-homepage') {");
    expect(session).toContain('const pageContext = sanitizePageContext(b.page) ?? (b.campaign?.entryPath ? sanitizePageContext({ path: b.campaign.entryPath }) : null);');
    expect(session).toContain('if(pageContext) config.pageContext = pageContext;');
  });
});

describe('gemini-live-proxy — setup block and page_context handler', () => {
  const proxy = read('supabase/functions/gemini-live-proxy/index.ts');

  it('imports the shared page-context module', () => {
    expect(proxy).toContain("from '../_shared/page-context.ts'");
    expect(proxy).toContain('PAGE_AWARENESS_INSTRUCTION');
    expect(proxy).toContain('pageContextUpdateNote');
  });

  it('page awareness is sales-only: simulations never carry it', () => {
    expect(proxy).toContain("const pageAwarenessSession = config.homepageSales === true && config.simulation !== true");
    expect(proxy).toContain('let currentPageContext: PageContext | null = pageAwarenessSession ? sanitizePageContext(config.pageContext) : null');
  });

  it('the block rides after the composed prompt; the pinned prompt template and setup suffix are untouched', () => {
    expect(proxy).toContain('${CAPTURE_RITUAL_POLICY}\\n${CARD_REPRESENT_POLICY}`');
    expect(proxy).toContain('${prompt}${pagePromptBlock}\\n${languageLockFor(startLanguage, config.languageSource');
    expect(proxy).toContain('${managerTransferBlock}${overageBlock}` }] }');
    expect(proxy).toContain('prompt.length + pagePromptBlock.length + COMPRESSION_SETUP_SUFFIX_CHARS');
  });

  it('the page_context handler validates, dedupes, paces and stands down over farewells and open cards', () => {
    expect(proxy).toContain("msg.type === 'page_context' && pageAwarenessSession && !preview");
    expect(proxy).toContain('const nextPageContext = sanitizePageContext(msg)');
    expect(proxy).toContain('!samePageContext(nextPageContext, currentPageContext)');
    expect(proxy).toContain('const noteBlocked = !begun || farewellHandled || farewellTimer !== undefined || visitorRequestedEnd || pendingActions.size > 0');
    expect(proxy).toContain('now - lastPageNoteAt >= PAGE_NOTE_MIN_INTERVAL_MS && pageNoteCount < PAGE_NOTE_MAX_PER_SESSION');
    expect(proxy).toContain("pageContextUpdateNote(nextPageContext, via, previousPageContext)");
  });
});

describe('client — mint payload, page feed and sales-nav announcements', () => {
  const conversation = read('src/components/GeminiConversation.tsx');
  const actions = read('src/components/AspenSalesActions.tsx');
  const pageLib = read('src/lib/pageContext.ts');

  it('the mint carries the current page beside the campaign visit', () => {
    expect(conversation).toContain('campaign:campaignVisit(), page: currentPageContext(),');
    expect(pageLib).toContain('export function currentPageContext()');
  });

  it('the feed starts only for authorized homepage-sales sessions and reports changes debounced', () => {
    expect(conversation).toContain('if (authorized.homepageSales === true && !preview) startPageFeed(ws);');
    expect(conversation).toContain("ws.send(JSON.stringify({ type: 'page_context', ...ctx, ...(via ? { via } : {}) }))");
    expect(conversation).toContain('if (!next || samePageContext(next, feed.last)) return;');
  });

  it('the feed self-terminates when its socket is no longer the live one', () => {
    expect(conversation).toContain('if (pageFeedRef.current !== feed || wsRef.current !== ws) { stopPageFeed(); return; }');
  });

  it('sales actions announce their new-tab destinations and still open in a new tab', () => {
    expect(actions).toContain("window.dispatchEvent(new CustomEvent('aspen-sales-nav', { detail: { path } }))");
    expect(actions).toContain("onClick={announceSalesNav('/plans')}");
    expect(actions).toContain("onClick={announceSalesNav('/book')}");
    expect(actions).toContain("onClick={announceSalesNav('/demo')}");
    expect(actions).toContain('target="_blank"');
    expect(conversation).toContain("window.addEventListener('aspen-sales-nav', onSalesNav);");
    expect(conversation).toContain("sendPageContext(feed.ws, ctx, 'tab')");
  });
});

describe('VPS voice proxy closure', () => {
  it('deploy.sh copies page-context.ts with the proxy closure', () => {
    const deploy = read('voice-proxy-server/deploy.sh');
    expect(deploy).toContain('  page-context.ts');
  });
});
