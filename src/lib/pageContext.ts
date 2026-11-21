import {
  PAGE_SECTIONS,
  sanitizePageContext,
  type PageContext,
} from '../../supabase/functions/_shared/page-context';

// Client half of PAGE AWARENESS (homepage-test item 6, 2026-11-21 —
// see supabase/functions/_shared/page-context.ts for the channel
// design). The canonical recognized set, labels and validator live
// in the shared module; this file only reads the browser's current
// location/title into that shape.
//
// The context is the visitor's CURRENT route: the pathname, the
// homepage section when the URL hash names a known one (the screens
// a homepage visitor scrolls through), and the document title. It
// rides the gemini-session mint as the `page` field and, during a
// live homepage-sales session, as {type:'page_context'} socket
// messages from GeminiConversation's page feed.
export function currentPageContext(): PageContext | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  return sanitizePageContext({
    path: window.location.pathname,
    section: (PAGE_SECTIONS as readonly string[]).includes(hash) ? hash : undefined,
    title: typeof document !== 'undefined' ? document.title : undefined,
  });
}

export type { PageContext };
