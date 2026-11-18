// Phone-path transfer composition, localized (2026-11-17).
//
// The Nov 16 batch localized the WEBSITE path: manager-transfer.ts
// builds the caller announcement in the session language with the
// platform title rule, and handoff-briefing-voice.ts localizes the
// manager-leg briefing for browser handoffs. The PHONE paths never
// got the same treatment — telephony-voice composed its Twilio
// whisper frame and its caller-side transfer lines as fixed English
// (and spoke the configured transfer_name verbatim, personal name
// included), and telephony-stream composed its no-answer <Say> the
// same way. This module is the one wording set for the phone path,
// mirroring the website policy:
//   - session language (phone sessions start English; an explicit
//     in-call switch under LANGUAGE_POLICY changes it — the language
//     is reported by the model on the voice path and by the bridge
//     on the stream path, and rides telephony_calls.ai_usage as
//     transfer_language, the same no-schema-change pattern
//     telephony-stream already uses for latency / call reports);
//   - on platform (AI Hidden Leads) lines the spoken target is a
//     TITLE — "our sales director" / "nosso diretor de vendas" /
//     "nuestro director de ventas" / "notre directeur des ventes",
//     the same words as manager-transfer.ts — never the owner's
//     personal name,
//     whatever the saved config carries;
//   - a tenant line keeps its own configured role / manager name:
//     that is the tenant's business fact, exactly as the website
//     announcement treats config.transferManagerName.

import type { BriefingLanguage } from './handoff-briefing-voice.ts';

export type PhoneTransferLanguage = BriefingLanguage;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Normalize a language signal ('es', 'es-ES', 'Spanish',
 *  'pt-BR', 'Portuguese', 'en', …) to the phone line set's
 *  language. Anything unrecognized is English — the phone path's
 *  starting language. */
export function phoneLanguageFromSignal(value: unknown): PhoneTransferLanguage {
  const s = clean(value).toLowerCase();
  if (s.startsWith('fr') || s === 'french' || s === 'français' || s === 'francais') return 'fr';
  if (s.startsWith('pt') || s === 'portuguese' || s === 'português') return 'pt';
  if (s.startsWith('es') || s === 'spanish' || s === 'español') return 'es';
  return 'en';
}

/** The language a previous turn / the transfer action stamped on
 *  the call row (ai_usage.transfer_language). English when absent —
 *  phone sessions start in English. */
export function phoneTransferLanguageFromRow(aiUsage: unknown): PhoneTransferLanguage {
  if (aiUsage && typeof aiUsage === 'object') {
    return phoneLanguageFromSignal((aiUsage as Record<string, unknown>).transfer_language);
  }
  return 'en';
}

/** The spoken transfer target, website-policy precedence:
 *  a configured role wins; a platform line names the sales-director
 *  TITLE (never a personal name); a tenant line names its own
 *  configured manager; otherwise the generic manager, localized. */
export function phoneTransferTarget(
  input: { transferRole?: unknown; platformSales?: unknown; configuredName?: unknown },
  language: PhoneTransferLanguage,
): string {
  const role = clean(input.transferRole);
  if (role) return role;
  if (input.platformSales === true) {
    if (language === 'pt') return 'nosso diretor de vendas';
    if (language === 'es') return 'nuestro director de ventas';
    if (language === 'fr') return 'notre directeur des ventes';
    return 'our sales director';
  }
  const name = clean(input.configuredName);
  if (name && name !== 'the manager') return name;
  if (language === 'pt') return 'o gerente';
  if (language === 'es') return 'el gerente';
  if (language === 'fr') return 'le gérant';
  return 'the manager';
}

const WHISPER_FALLBACK_SUMMARY: Record<PhoneTransferLanguage, string> = {
  en: 'A caller asked to speak with you.',
  pt: 'Um chamador pediu para falar com você.',
  es: 'Una persona que llamó pidió hablar con usted.',
  fr: 'Une personne qui a appelé a demandé à vous parler.',
};

/** The whisper the manager leg hears before the caller is bridged:
 *  frame + the (already localized, model-composed) transfer summary
 *  + the connecting line. English wording is byte-identical to what
 *  telephony-voice spoke before this module existed. */
export function phoneWhisperText(summary: unknown, language: PhoneTransferLanguage): string {
  const s = clean(summary) || WHISPER_FALLBACK_SUMMARY[language];
  if (language === 'pt') return `Transferência da Aspen. ${s} Conectando agora.`;
  if (language === 'es') return `Transferencia de Aspen. ${s} Conectando ahora.`;
  if (language === 'fr') return `Transfert d'Aspen. ${s} Connexion en cours.`;
  return `Transfer from Aspen. ${s} Connecting now.`;
}

/** Caller-side announcement as the transfer dial starts. */
export function phoneConnectLine(target: string, language: PhoneTransferLanguage): string {
  if (language === 'pt') return `Vou conectar você com ${target} agora.`;
  if (language === 'es') return `Le conecto ahora con ${target}.`;
  if (language === 'fr') return `Je vous connecte avec ${target} à l'instant.`;
  return `Let me connect you with ${target}.`;
}

/** Caller-side line when the transfer target does not answer. */
export function phoneTransferUnavailableLine(target: string, language: PhoneTransferLanguage): string {
  if (language === 'pt') return `Desculpe, ${target} não está disponível no momento. Ligaremos de volta em breve. Adeus.`;
  if (language === 'es') return `Lo siento, ${target} no está disponible en este momento. Le devolveremos la llamada pronto. Adiós.`;
  if (language === 'fr') return `Désolé, ${target} n'est pas disponible pour le moment. Nous vous rappellerons bientôt. Au revoir.`;
  return `Sorry, ${target} is not available right now. We'll call you back soon. Goodbye.`;
}

/** Caller-side line when no transfer is available on the line. */
export function phoneFollowUpLine(language: PhoneTransferLanguage): string {
  if (language === 'pt') return 'Obrigado pela ligação. Alguém da nossa equipe entrará em contato em breve. Adeus.';
  if (language === 'es') return 'Gracias por llamar. Alguien de nuestro equipo se pondrá en contacto con usted pronto. Adiós.';
  if (language === 'fr') return 'Merci de votre appel. Quelqu\'un de notre équipe vous recontactera bientôt. Au revoir.';
  return 'Thanks for calling. Someone will follow up with you soon. Goodbye.';
}
