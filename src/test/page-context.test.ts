// @vitest-environment node
// PAGE AWARENESS (homepage-test item 6, 2026-11-21) — the shared
// page-context module: the recognized set, the one validator every
// hop uses, and the prompt/note text builders. Mechanical tests
// only; the session/proxy/client wiring is source-pinned in
// page-awareness-wiring.test.ts, and the knowledge content in
// page-knowledge.test.ts.
import { describe, expect, it } from 'vitest';
import {
  PAGE_AWARENESS_INSTRUCTION,
  PUBLIC_PAGE_PATHS,
  isPublicPagePath,
  pageContextLine,
  pageContextUpdateNote,
  pageLabel,
  samePageContext,
  sanitizePageContext,
} from '../../supabase/functions/_shared/page-context';
import { PUBLIC_CAMPAIGN_PATHS } from '@/lib/campaignTracking';
import { PUBLIC_PATHS } from '../../supabase/functions/_shared/report-context';

describe('recognized page set', () => {
  it('includes /plans and every public marketing route', () => {
    for (const path of ['/', '/plans', '/demo', '/demo/br', '/demo-site', '/book', '/checkout', '/checkout/return', '/agents/realtors', '/setup', '/account', '/help', '/marketing', '/privacy', '/terms']) {
      expect(PUBLIC_PAGE_PATHS).toContain(path);
      expect(isPublicPagePath(path)).toBe(true);
    }
    expect(isPublicPagePath('/services/google-maps-boost')).toBe(true);
  });

  it('rejects private, tenant and malformed paths', () => {
    for (const path of ['/dashboard', '/dashboard/calls', '/crm', '/agent/abc', '/embed/abc', '/cal/xyz', '/services/a/b', '', 'plans', 'https://aihiddenleads.com/plans', null, undefined, 42]) {
      expect(isPublicPagePath(path)).toBe(false);
    }
  });

  it('is deliberately wider than the campaign milestone sets, which keep their exact membership', () => {
    // Page context widening must never widen what counts as a
    // campaign conversion: both milestone sets stay exactly as they
    // were, and /plans is in neither.
    expect(PUBLIC_CAMPAIGN_PATHS).toEqual(['/', '/demo', '/demo-site', '/checkout', '/checkout/return', '/book', '/agents/realtors']);
    expect(PUBLIC_PATHS).toEqual(['/', '/demo', '/demo-site', '/checkout', '/checkout/return', '/book', '/agents/realtors']);
    expect(PUBLIC_CAMPAIGN_PATHS).not.toContain('/plans');
    expect(PUBLIC_PATHS).not.toContain('/plans');
  });
});

describe('sanitizePageContext', () => {
  it('accepts a full payload and keeps path, known section and a scrubbed title', () => {
    expect(sanitizePageContext({ path: '/plans', title: 'Plans — AI Hidden Leads' })).toEqual({ path: '/plans', title: 'Plans — AI Hidden Leads' });
    expect(sanitizePageContext({ path: '/', section: 'pricing' })).toEqual({ path: '/', section: 'pricing' });
  });

  it('strips query, hash and a trailing slash from the path', () => {
    expect(sanitizePageContext({ path: '/plans?plan=growth' })).toEqual({ path: '/plans' });
    expect(sanitizePageContext({ path: '/book#top' })).toEqual({ path: '/book' });
    expect(sanitizePageContext({ path: '/demo/' })).toEqual({ path: '/demo' });
    expect(sanitizePageContext({ path: '/' })).toEqual({ path: '/' });
  });

  it('drops an unknown section and an unrecognized path outright', () => {
    expect(sanitizePageContext({ path: '/', section: 'admin-panel' })).toEqual({ path: '/' });
    expect(sanitizePageContext({ path: '/dashboard' })).toBeNull();
    expect(sanitizePageContext({ path: '/plans', section: 42 })).toEqual({ path: '/plans' });
    expect(sanitizePageContext(null)).toBeNull();
    expect(sanitizePageContext('/plans')).toBeNull();
    expect(sanitizePageContext({})).toBeNull();
  });

  it('scrubs quotes, control characters and excess length from the title', () => {
    const out = sanitizePageContext({ path: '/', title: '  My "Site"\n\tTitle  ' });
    expect(out?.title).toBe('My Site Title');
    const long = sanitizePageContext({ path: '/', title: 'x'.repeat(300) });
    expect(long?.title?.length).toBe(120);
    expect(sanitizePageContext({ path: '/', title: '   ' })).toEqual({ path: '/' });
  });
});

describe('labels, line and notes', () => {
  it('labels the plans page as the page that lists the plans', () => {
    expect(pageLabel({ path: '/plans' })).toContain('Premium, Professional and Platinum');
    expect(pageLabel({ path: '/services/seo' })).toBe('one of our service pages');
    expect(pageLabel({ path: '/agents/realtors' })).toContain('realtors page');
  });

  it('the setup line names the page, its path and its section', () => {
    const line = pageContextLine({ path: '/', section: 'pricing' });
    expect(line).toContain('The visitor is currently viewing');
    expect(line).toContain('(/)');
    expect(line).toContain('the pricing section');
    expect(pageContextLine({ path: '/plans' })).toContain('(/plans)');
  });

  it('the tab note says the page opened in a new tab and the visitor is still here', () => {
    const note = pageContextUpdateNote({ path: '/plans' }, 'tab', { path: '/' });
    expect(note).toContain('NEW browser tab');
    expect(note).toContain('still here');
    expect(note).toContain('not something the visitor said');
  });

  it('a same-page section note tells her not to announce it', () => {
    const note = pageContextUpdateNote({ path: '/', section: 'faq' }, 'nav', { path: '/' });
    expect(note).toContain('scrolled to the frequently asked questions section');
    expect(note).toContain('You do not need to announce it');
  });

  it('a navigation note names the new page', () => {
    const note = pageContextUpdateNote({ path: '/book' }, 'nav', { path: '/' });
    expect(note).toContain('now viewing');
    expect(note).toContain('(/book)');
  });

  it('the instruction block bounds what she may claim to see', () => {
    expect(PAGE_AWARENESS_INSTRUCTION).toContain('system notes, NOT something the visitor said');
    expect(PAGE_AWARENESS_INSTRUCTION).toContain('NEW browser tab');
    expect(PAGE_AWARENESS_INSTRUCTION).toContain('Never claim to see anything about their screen beyond the page updates');
  });
});

describe('samePageContext', () => {
  it('compares path, section and title', () => {
    expect(samePageContext({ path: '/' }, { path: '/' })).toBe(true);
    expect(samePageContext({ path: '/', section: 'faq' }, { path: '/' })).toBe(false);
    expect(samePageContext({ path: '/plans' }, { path: '/' })).toBe(false);
    expect(samePageContext(null, null)).toBe(true);
    expect(samePageContext({ path: '/' }, null)).toBe(false);
    expect(samePageContext(null, { path: '/' })).toBe(false);
  });
});
