/**
 * WhatsApp Phase 1 — click-to-chat configuration (single source of truth).
 *
 * The floating WhatsApp button is a plain wa.me click-to-chat link: it
 * opens the visitor's own WhatsApp with a pre-filled message to the
 * pilot number. No API, no automation, no ban/ToS risk (official,
 * documented WhatsApp feature — see
 * ~/workspace/research_notes/whatsapp-brazil-options-20261116-1343/report.md).
 *
 * PILOT NUMBER: 786-244-9688 (secondary Telnyx number, Aspen Bridge) —
 * NOT the 877 flagship and NOT anyone's personal cell. Change the
 * number HERE (or via VITE_WHATSAPP_NUMBER) and nowhere else.
 * Digits only, international format, as wa.me requires.
 */
export const WHATSAPP_PILOT_NUMBER: string =
  (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined)?.replace(/\D/g, '') ||
  '17862449688';

/**
 * Master switch for the floating button. Defaults to ENABLED; set
 * VITE_WHATSAPP_BUTTON_ENABLED=false at build time to hide it.
 */
export const WHATSAPP_BUTTON_ENABLED: boolean =
  (import.meta.env.VITE_WHATSAPP_BUTTON_ENABLED as string | undefined) !== 'false';

/** Page-context source markers, keyed by route prefix. The matching
 *  localised suffix strings live in the locale files as
 *  whatsapp.sourceHome / whatsapp.sourceDemo / whatsapp.sourceRealtors,
 *  so the first message a visitor sends tells us which page they came
 *  from (wa.me itself carries no analytics). */
export const WHATSAPP_SOURCE_KEYS = [
  { prefix: '/agents/realtors', key: 'whatsapp.sourceRealtors' },
  { prefix: '/demo', key: 'whatsapp.sourceDemo' },
  { prefix: '/', key: 'whatsapp.sourceHome', exact: true },
] as const;

/** The i18n key for the source suffix of a given pathname, or null. */
export function whatsappSourceKey(pathname: string): string | null {
  for (const entry of WHATSAPP_SOURCE_KEYS) {
    if ('exact' in entry && entry.exact) {
      if (pathname === entry.prefix) return entry.key;
    } else if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      return entry.key;
    }
  }
  return null;
}

/** Build the wa.me click-to-chat URL for a pre-filled message. */
export function buildWhatsAppLink(message: string): string {
  return `https://wa.me/${WHATSAPP_PILOT_NUMBER}?text=${encodeURIComponent(message)}`;
}
