// Carrier guide library (onboarding batch, 2026-11-12).
//
// THE single structured source for conditional (no-answer) call-forwarding
// instructions. Rendered by the setup wizard's phone step, the /help page,
// and Alex's training knowledge (alex-guide.ts renders the same data) — the
// three surfaces can never drift.
//
// Sourcing rule (Ron's, enforced in review): every step was verified on
// 2026-11-12 against the carrier's OWN official support pages; the source
// URLs are stored on each guide. Anything that could not be verified ships
// as the honest path (menu path, care line, or "we'll walk you through
// it") with `verified: false` — NEVER a guessed star code. Research file:
// ~/workspace/carrier-guides-research-2026-11-12.md (kept outside the repo).
//
// MVNO nuance: codes often mirror the host network, but each MVNO guide
// here was verified against the MVNO's own pages — several restrict or
// simply never publish conditional forwarding, and their entries say so.

export interface CarrierGuideSection {
  heading: string;
  steps: string[];
  note?: string;
}

export interface CarrierGuide {
  id: string;
  name: string;
  country: 'US' | 'CA';
  /** Host network for MVNOs — context only; steps are the MVNO's own. */
  hostNetwork?: string;
  /** True when a self-service no-answer forwarding path (or the menu path
   *  the carrier itself publishes) is verified from an official source. */
  verified: boolean;
  /** Whether conditional no-answer forwarding exists on this carrier at
   *  all, per its own documentation. 'unknown' = not published either way. */
  conditionalOffered: boolean | 'unknown';
  supportPhone?: string;
  sourceUrls: string[];
  /** One-line honest summary shown in pickers and search results. */
  summary: string;
  sections: CarrierGuideSection[];
  /** The honest path when self-service steps are not verified. */
  fallback?: string;
}

const FALLBACK_WALKTHROUGH =
  'We could not verify self-service steps from this carrier\'s own support pages, so we won\'t guess at codes. Call us at (877) 862-4949 and we\'ll walk you through it live — or ask your carrier for "conditional call forwarding" (forward when no answer).';

export const CARRIER_GUIDES: CarrierGuide[] = [
  {
    id: 'verizon',
    name: 'Verizon',
    country: 'US',
    verified: true,
    conditionalOffered: true,
    sourceUrls: [
      'https://www.verizon.com/support/knowledge-base-181139/',
      'https://www.verizon.com/support/call-forwarding-faqs/',
      'https://www.verizon.com/support/one-talk-web-portal-admin-guide/',
      'https://businessdigitalvoice.verizon.com/call-forwarding-troubleshooting/',
    ],
    summary: 'Dial *71 + the number. Fixed at 3–6 rings — the delay can\'t be changed on a mobile line.',
    sections: [
      {
        heading: 'Mobile lines',
        steps: [
          'Turn it ON: dial *71 followed by the 10-digit Aspen number (for example *71 8778624949). Verizon calls this Conditional Call Forwarding.',
          'Your phone rings first. If you don\'t answer after 3–6 rings — or your line is busy — the call forwards to Aspen instead of voicemail.',
          'The ring delay is fixed by Verizon (3–6 rings) and can\'t be set on a mobile line — pick the closest ring choice in the wizard and this still works.',
          'Turn it OFF: dial *73.',
        ],
      },
      {
        heading: 'Business lines',
        steps: [
          'Verizon Business Digital Voice: set forwarding in the User Portal or desk-phone menu — choose No Answer and set the number of seconds before the call forwards; turn it off in the same menu.',
          'One Talk: the Call Forward No Answer timeout is set in the admin web portal (default 5 rings / 30 seconds).',
          'Traditional business landlines: Busy Line / Do Not Answer forwarding is set up with Verizon\'s business office (a "fixed" option) or changeable by you (a "variable" option).',
        ],
        note: 'Star codes for business digital voice circulate on third-party sites but are not confirmed on Verizon\'s own pages — use the portal or menu.',
      },
    ],
  },
  {
    id: 'tmobile',
    name: 'T-Mobile',
    country: 'US',
    verified: true,
    conditionalOffered: true,
    sourceUrls: ['https://www.t-mobile.com/support/plans-features/self-service-short-codes'],
    summary: 'Dial **61*1 + the number + #, with an optional delay in seconds. Off: ##61#.',
    sections: [
      {
        heading: 'Mobile lines',
        steps: [
          'Turn it ON with a delay: dial **61*1<ASPEN NUMBER>**<SECONDS># — for example, for 20 seconds (about 4 rings): **61*18778624949**20#',
          'The delay can be 5, 10, 15, 20, 25 or 30 seconds. Each ring is about 5–6 seconds, so 4 rings ≈ 20 seconds.',
          'Turn it ON with the default delay: dial **61*1<ASPEN NUMBER>#',
          'Turn it OFF: dial ##61#. (##004# resets all conditional forwarding.)',
        ],
        note: 'T-Mobile\'s own page demonstrates the delay form with its voicemail number; the same standard GSM form is what you use with your Aspen number.',
      },
    ],
  },
  {
    id: 'att',
    name: 'AT&T',
    country: 'US',
    verified: true,
    conditionalOffered: true,
    supportPhone: '800.288.2020',
    sourceUrls: [
      'https://www.att.com/support/article/wireless/KM1011513',
      'https://www.att.com/support/article/u-verse-voice/KM1000459/',
      'https://www.att.com/support/article/home-phone/KM1000582/',
    ],
    summary: 'Wireless: use your phone\'s Call Forwarding menu (AT&T publishes no codes). AT&T Phone business lines: *92 on, *93# off.',
    sections: [
      {
        heading: 'AT&T Wireless (mobile)',
        steps: [
          'AT&T does not publish star codes for wireless forwarding — anyone who gives you a code for AT&T wireless is guessing. Use your phone\'s own menu instead.',
          'On your phone, open Settings → Phone (or Call settings) → Call Forwarding, and look for the "no answer / when unanswered" option.',
          'Enter your Aspen number as the forwarding destination and set the ring delay if your phone offers one (about 5–6 seconds per ring).',
          'Changes can only be made from the wireless phone itself — AT&T does not allow managing forwarding online.',
          'To turn it off, return to the same menu and remove the forwarding number.',
        ],
      },
      {
        heading: 'AT&T Phone / AT&T Phone for Business (digital lines)',
        steps: [
          'Turn No Answer forwarding ON: press *92, enter your Aspen number, then press #.',
          'Turn it OFF: press *93#.',
          'On AT&T IP Flexible Reach, the No Answer timer is *610 — enter the number of rings (each ring cycle is 6 seconds) — or set it in the portal under Call Forwarding – No Answer.',
        ],
      },
      {
        heading: 'Traditional AT&T home phone',
        steps: [
          'Busy / Don\'t Answer forwarding has no self-service code on traditional home phone — call AT&T at 800.288.2020 and ask them to turn on Don\'t Answer forwarding to your Aspen number.',
        ],
      },
    ],
  },
  {
    id: 'rogers',
    name: 'Rogers',
    country: 'CA',
    verified: true,
    conditionalOffered: true,
    sourceUrls: [
      'http://www.rogers.com/support/mobility/use-call-forwarding',
      'https://www.rogers.com/support/home-phone/how-to-set-up-call-features-using-star-codes-or-online-manager',
    ],
    summary: 'Mobile: *61*(number)# on, ##61# off. Home Phone: *92 on (fixed 4 rings), *93 off.',
    sections: [
      {
        heading: 'Mobile lines',
        steps: [
          'Turn it ON ("If There Is No Reply"): dial *61*(<ASPEN NUMBER>)# and press Send — for example *61*(8778624949)#',
          'Turn it OFF: dial ##61#. (Temporarily pause with #61#, reactivate with *61#, check status with *#61#.)',
          'Rogers does not publish a way to change the ring delay on mobile — the wizard ring choice won\'t apply on this carrier.',
        ],
        note: 'Rogers states conditional forwarding will not work while voicemail is activated on the line — if forwarding won\'t take, that is the first thing to check.',
      },
      {
        heading: 'Home Phone',
        steps: [
          'Turn it ON: dial *92, then the 10-digit Aspen number, accept the call and stay on the line at least 5 seconds. Calls forward after 4 rings (fixed).',
          'Turn it OFF: dial *93.',
        ],
        note: 'If the line has Rogers voicemail, these codes only toggle message-taking — the line must not subscribe to voicemail for forwarding to another number to work.',
      },
    ],
  },
  {
    id: 'bell',
    name: 'Bell',
    country: 'CA',
    verified: true,
    conditionalOffered: true,
    sourceUrls: [
      'https://support.bell.ca/mobility/rate_plans_features/how_to_use_call_forwarding_on_my_mobile_phone',
      'https://business.bell.ca/Support/medium-large/voice-unified-communications/total-connect/talk-package-features',
      'https://prd-business.bell.ca/support/web/resources/pdf/cloud/bell-total-connect-star-features.pdf',
    ],
    summary: 'Mobile: menu-only — choose "No Answer Transfer" in Call Settings. Bell Total Connect business: *92 on, *610 sets rings, *93 off.',
    sections: [
      {
        heading: 'Mobile lines',
        steps: [
          'Bell publishes no star codes for mobile — forwarding is set in the phone\'s menus.',
          'Open Call Settings → Call Forwarding and choose the no-answer option (Bell calls it No Answer Transfer: your phone rings first, then the call forwards).',
          'Enter your Aspen number. Bell confirms the change with a free text message.',
          'Turn it OFF: in the same menu choose Deactivate All, which restores voicemail as the answering point.',
          'Bell does not publish a ring-delay setting for mobile. Note: mobile call forwarding is a paid add-on or billed per minute on Bell.',
        ],
      },
      {
        heading: 'Bell Total Connect (business)',
        steps: [
          'Turn No Answer forwarding ON: dial *92, then enter your Aspen number.',
          'Set the delay: dial *610 — the No Answer Timer changes how many rings callers hear before forwarding.',
          'Turn it OFF: dial *93.',
        ],
      },
    ],
  },
  {
    id: 'telus',
    name: 'Telus',
    country: 'CA',
    verified: false,
    conditionalOffered: 'unknown',
    sourceUrls: [
      'https://www.telus.com/en/business/support/article/call-forward-mobile',
      'https://www.telus.com/en/support/article/use-call-forwarding-variable',
    ],
    summary: 'We could not verify the codes from Telus\'s own pages — we\'ll walk you through it.',
    sections: [],
    fallback: FALLBACK_WALKTHROUGH + ' Telus has also said forwarding is not available on prepaid plans, so if your line is prepaid, ask us about the port or new-number routes instead.',
  },
  {
    id: 'metro',
    name: 'Metro by T-Mobile',
    country: 'US',
    hostNetwork: 'T-Mobile',
    verified: false,
    conditionalOffered: 'unknown',
    supportPhone: '(888) 863-8768',
    sourceUrls: ['https://www.metrobyt-mobile.com/phone-plans/add-on-services'],
    summary: 'Metro publishes no forwarding steps or add-on on its own site — call Metro care and ask.',
    sections: [],
    fallback:
      'Metro by T-Mobile does not publish call-forwarding instructions (or a forwarding add-on) on its own site, and we won\'t assume the T-Mobile codes work on Metro. Call Metro customer care at (888) 863-8768 — or dial 611 from your Metro phone — and ask them to turn on conditional call forwarding (forward when no answer) to your Aspen number. If they can\'t, ask us about the port or new-number routes instead.',
  },
  {
    id: 'mint',
    name: 'Mint Mobile',
    country: 'US',
    hostNetwork: 'T-Mobile',
    verified: true,
    conditionalOffered: true,
    supportPhone: '866-416-1125',
    sourceUrls: ['https://www.mintmobile.com/help/how-to-turn-on-off-call-forwarding/'],
    summary: 'Dial **61*1 + the number + #. Off: ##61#. No delay setting published.',
    sections: [
      {
        heading: 'Mobile lines',
        steps: [
          'Turn it ON (only when you don\'t answer): dial **61*1<ASPEN NUMBER># — for example **61*18778624949#',
          'Turn it OFF: dial ##61#.',
          'Mint does not publish a ring-delay setting — don\'t use another carrier\'s delay code and expect it to be a Mint feature.',
        ],
      },
    ],
  },
  {
    id: 'consumer-cellular',
    name: 'Consumer Cellular',
    country: 'US',
    hostNetwork: 'AT&T / T-Mobile',
    verified: true,
    conditionalOffered: true,
    supportPhone: '(888) 345-5509',
    sourceUrls: [
      'https://www.consumercellular.com/api/Assets/documents/Manuals/ZTE%20Wireless%20Home%20Phone%20Base%20User%20Guide.pdf',
    ],
    summary: 'Mobile handsets: use the phone\'s Call Forwarding menu. Home Phone Base: **61* + number + #, ##61# off.',
    sections: [
      {
        heading: 'Mobile handsets',
        steps: [
          'Consumer Cellular\'s own phone guides set forwarding through the menus only: Settings → Call settings → Call forwarding, then choose the no-answer option and enter your Aspen number.',
          'No star codes are published for handsets, and the available options depend on the network your line is on. If the menu has no no-answer option, call Consumer Cellular at (888) 345-5509 and ask for conditional call forwarding.',
        ],
      },
      {
        heading: 'Home Phone Base devices',
        steps: [
          'Turn No Answer forwarding ON: dial **61*<ASPEN NUMBER># — you can add a no-answer delay in seconds before the final # (the guide\'s example uses 10 seconds; each ring is about 5–6 seconds).',
          'Turn it OFF: dial ##61#.',
        ],
        note: 'These codes are verified only for Consumer Cellular\'s Home Phone Base devices — not for mobile handsets.',
      },
    ],
  },
  {
    id: 'cricket',
    name: 'Cricket Wireless',
    country: 'US',
    hostNetwork: 'AT&T',
    verified: false,
    conditionalOffered: 'unknown',
    supportPhone: '1-800-274-2538',
    sourceUrls: ['https://www.cricketwireless.com/support/plans-and-features/features.html'],
    summary: 'Call Forwarding is included with Cricket plans, but Cricket publishes no setup codes — use the phone menu or call Cricket.',
    sections: [],
    fallback:
      'Call Forwarding is included with every current Cricket plan — but Cricket\'s own site publishes no setup codes, and the code families circulating online conflict, so we won\'t guess. Try your phone\'s Settings → Call Forwarding menu (choose the no-answer option), or call Cricket at 1-800-274-2538 (or 611 from your Cricket phone) and ask for conditional call forwarding to your Aspen number.',
  },
  {
    id: 'visible',
    name: 'Visible',
    country: 'US',
    hostNetwork: 'Verizon',
    verified: false,
    conditionalOffered: 'unknown',
    sourceUrls: ['https://www.visible.com/content/value/visible/en/help/about-visible/plan-features.html'],
    summary: 'Visible documents *71 for busy calls only — it does not state that unanswered calls forward. Off: *73.',
    sections: [
      {
        heading: 'Mobile lines — read this first',
        steps: [
          'Visible\'s own help page documents *71 + the number as forwarding "only when busy / on another line" — it does NOT say unanswered calls forward, and we won\'t promise it does.',
          'Its host network (Verizon) documents the same *71 code as covering busy OR unanswered calls, so in practice it may work — test it: set it up, call your number, let it ring out, and see whether Aspen answers.',
          'Turn forwarding OFF: dial *73.',
          'If the test call does not reach Aspen, use the port or new-number route instead — those are proven.',
        ],
      },
    ],
    fallback: FALLBACK_WALKTHROUGH,
  },
  {
    id: 'boost',
    name: 'Boost Mobile',
    country: 'US',
    hostNetwork: 'T-Mobile (primarily)',
    verified: false,
    conditionalOffered: 'unknown',
    supportPhone: '(833) 502-6678',
    sourceUrls: ['https://help.boostmobile.com/docs/network-enhancements'],
    summary: 'Boost publishes no conditional-forwarding procedure — try the phone menu, or call Boost care.',
    sections: [
      {
        heading: 'Mobile lines',
        steps: [
          'Boost\'s own help points to the phone menu: open the Phone app\'s Settings → Call Forwarding (on some phones under Supplementary Services / Call Settings), choose a forwarding option and enter the number.',
          'Boost publishes no conditional (no-answer) code or procedure, so if the menu has no no-answer option, conditional forwarding may not be available on your line.',
        ],
      },
    ],
    fallback:
      'If the menu path doesn\'t offer a no-answer option, call Boost Customer Care at (833) 502-6678 and ask whether conditional call forwarding is available on your line. If it isn\'t, the port or new-number routes will get Aspen answering your calls.',
  },
  {
    id: 'google-fi',
    name: 'Google Fi',
    country: 'US',
    hostNetwork: 'T-Mobile',
    verified: true,
    conditionalOffered: false,
    sourceUrls: ['https://support.google.com/fi/answer/6201380'],
    summary: 'Google Fi has no no-answer forwarding at all — its closest option rings all numbers at once.',
    sections: [
      {
        heading: 'What Fi offers instead',
        steps: [
          'Google Fi does not offer conditional (no-answer) forwarding — its only choices, set on fi.google.com or in the Google Fi app, are: Don\'t forward, Ring all numbers, or Always forward.',
          '"Ring all numbers" rings your phone and the forwarding number at the same time — if you add your Aspen number there, Aspen can pick up when you don\'t, but your phone and Aspen ring together rather than Aspen waiting for your rings.',
          'For the true "your phone rings first, then Aspen" behaviour, the port or new-number route is the right fit for Fi customers.',
          'Turn forwarding off: in the app or on fi.google.com choose "Don\'t forward", or remove the forwarding number.',
        ],
      },
    ],
  },
  {
    id: 'straight-talk',
    name: 'Straight Talk',
    country: 'US',
    hostNetwork: 'mostly Verizon (varies by SIM)',
    verified: false,
    conditionalOffered: 'unknown',
    supportPhone: '1-877-430-2355',
    sourceUrls: ['https://support.straighttalk.com/en/brands/Nokia/STSAG960U1C/faq/1647737/'],
    summary: 'Only all-calls forwarding is documented (*72 on, *73 off), and only in select areas/handsets. No-answer forwarding is not published.',
    sections: [],
    fallback:
      'Straight Talk\'s own support documents only immediate all-calls forwarding (*72 + number on, *73 off) — and warns it is "only available in select areas and on select handsets". It does not publish a no-answer option, so we won\'t guess one. Call Straight Talk at 1-877-430-2355 and ask about conditional call forwarding for your line — or use the port or new-number route, which is proven.',
  },
  {
    id: 'tracfone',
    name: 'Tracfone',
    country: 'US',
    hostNetwork: 'Verizon / AT&T / T-Mobile (by SIM)',
    verified: false,
    conditionalOffered: 'unknown',
    supportPhone: '1-800-867-7183',
    sourceUrls: ['https://support.tracfone.com/en/brands/Samsung/TFSAS215DC/faq/1647737/'],
    summary: 'Only all-calls forwarding is documented (*72 on, *73 off), with a select-areas/handsets caveat. No-answer forwarding is not published.',
    sections: [],
    fallback:
      'Tracfone\'s own support documents only immediate all-calls forwarding (*72 + number on, *73 off) and warns your options may vary by area and handset. It does not publish a no-answer option. Call Tracfone at 1-800-867-7183 and ask about conditional call forwarding — or use the port or new-number route, which is proven.',
  },
  {
    id: 'xfinity-mobile',
    name: 'Xfinity Mobile',
    country: 'US',
    hostNetwork: 'Verizon',
    verified: false,
    conditionalOffered: 'unknown',
    sourceUrls: ['https://www.xfinity.com/support/articles/forward-calls-with-call-forwarding'],
    summary: 'We could not verify the steps from Xfinity\'s own pages yet — we\'ll walk you through it.',
    sections: [],
    fallback: FALLBACK_WALKTHROUGH + ' Xfinity Mobile runs on Verizon\'s network, but we verify every carrier from its own pages before printing codes — this entry gets its verified steps as soon as Xfinity\'s article is confirmed.',
  },
  {
    id: 'spectrum-mobile',
    name: 'Spectrum Mobile',
    country: 'US',
    hostNetwork: 'Verizon',
    verified: false,
    conditionalOffered: 'unknown',
    supportPhone: '866-782-2681',
    sourceUrls: ['https://enterprise.spectrum.com/content/dam/spectrum/enterprise/en/pdfs/support/user-guides/spectrum-business-voice-user-guide.pdf'],
    summary: 'We could not verify mobile steps from Spectrum\'s own pages yet — we\'ll walk you through it.',
    sections: [],
    fallback: FALLBACK_WALKTHROUGH + ' (Spectrum Business Voice lines do publish *72 / *73 for all-calls forwarding in Spectrum\'s official business guide — but that is not a no-answer procedure, and it is not the mobile product.)',
  },
];

export function carrierGuide(id: string | undefined): CarrierGuide | undefined {
  return CARRIER_GUIDES.find((g) => g.id === id);
}

/** Fill the <ASPEN NUMBER> placeholders in a guide's steps with the real
 *  assigned number, formatted for dialling. Display-only: the stored data
 *  keeps the placeholders. */
export function fillAspenNumber(text: string, aspenNumber: string | undefined): string {
  if (!aspenNumber) return text.replace(/<ASPEN NUMBER>/g, '(your Aspen number)');
  const digits = aspenNumber.replace(/\D/g, '');
  return text.replace(/<ASPEN NUMBER>/g, digits);
}

/** Compact plain-text rendering for Alex's knowledge: same data, spoken
 *  format. Unverified carriers render their honest fallback — Alex must
 *  never recite a code this library does not carry as verified. */
export function renderCarrierGuidesText(): string {
  return CARRIER_GUIDES.map((g) => {
    const head = `--- ${g.name}${g.hostNetwork ? ` (runs on ${g.hostNetwork})` : ''} ---`;
    if (!g.verified) {
      return `${head}\nNOT VERIFIED from ${g.name}'s own support pages — never give the customer a star code for this carrier. ${g.fallback || FALLBACK_WALKTHROUGH}${g.supportPhone ? ` Carrier support: ${g.supportPhone}.` : ''}`;
    }
    const body = g.sections
      .map((s) => `${s.heading}:\n${s.steps.map((t) => `- ${fillAspenNumber(t, undefined).replace('(your Aspen number)', 'their Aspen number')}`).join('\n')}${s.note ? `\nNote: ${s.note}` : ''}`)
      .join('\n');
    return `${head}\n${body}`;
  }).join('\n\n');
}
