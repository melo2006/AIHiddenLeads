import { useTranslation } from 'react-i18next';
import { buildWhatsAppLink, whatsappSourceKey } from '@/lib/whatsapp';

/**
 * WhatsApp Phase 1 floating click-to-chat button.
 *
 * A separate, instantly recognisable GREEN button that sits BESIDE the
 * Aspen launcher (bottom-right corner, offset to its left, vertically
 * centred on Aspen's idle bubble). It is rendered by GeminiAgentWidget
 * only on public platform surfaces and only while Aspen is closed or
 * minimised, so it can never overlap Aspen's open panel.
 *
 * The link is a plain wa.me click-to-chat URL: tapping opens the
 * visitor's own WhatsApp with the localised, page-tagged message
 * pre-filled (never auto-sent). Strings live in the locale files under
 * the `whatsapp` section (en / es / pt-BR, following the site's i18n
 * pattern); number + flag live in src/lib/whatsapp.ts.
 */
export default function WhatsAppFloatingButton() {
  const { t } = useTranslation();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const sourceKey = whatsappSourceKey(pathname);
  const message = sourceKey ? `${t('whatsapp.message')} ${t(sourceKey)}` : t('whatsapp.message');
  const label = t('whatsapp.label');

  return (
    <a
      data-testid="whatsapp-floating-button"
      href={buildWhatsAppLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('whatsapp.chatAria')}
      title={t('whatsapp.chatAria')}
      className="fixed flex flex-col items-center gap-1.5"
      style={{ right: '8.25rem', bottom: '1.375rem', zIndex: 'var(--layer-floating)' } as React.CSSProperties}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105" style={{ backgroundColor: '#25D366' }}>
        {/* WhatsApp-style glyph: white speech bubble + handset, inline
            SVG (no external asset). */}
        <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true" focusable="false">
          <path fill="#ffffff" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          <path fill="#25D366" transform="translate(6.4 6.4) scale(0.47)" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      </span>
      <span className="w-fit rounded-md bg-card/90 px-2 py-0.5 text-center text-xs font-semibold leading-tight text-foreground shadow-sm">{label}</span>
    </a>
  );
}
