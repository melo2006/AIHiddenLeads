// NICHE SUGGESTION PACKS (2026-11-18, wizard suggestions + service area):
// curated, industry-grounded CANDIDATES for the setup wizard's "Suggest for
// me" checklists. Every item is a question the owner answers by ticking —
// nothing here is a fact about the specific business until the owner
// accepts it, at which point the item's plain sentence is inserted into
// the owner's own editable knowledge / restrictions text. Sentences never
// carry prices, hours, guarantees, certifications or availability claims.
//
// The voice-agents suggestServices / suggestGuardrails actions merge these
// packs with AI-tailored candidates (pack first, deduplicated); when the
// AI is unavailable the pack alone is the graceful fallback.

export interface ChecklistItem {
  /** Stable id within its pack, e.g. "plumbing-drain-cleaning". */
  id: string;
  /** Short card label — the "Do you also offer X?" candidate. */
  label: string;
  /** Plain sentence inserted into the owner's text when accepted. */
  sentence: string;
}

export interface NicheChecklistPack {
  services: ChecklistItem[];
  guardrails: ChecklistItem[];
}

const item = (pack: string, slug: string, label: string, sentence: string): ChecklistItem => ({
  id: `${pack}-${slug}`,
  label,
  sentence,
});

const UNIVERSAL_GUARDRAILS: ChecklistItem[] = [
  item('universal', 'no-invented-prices', 'Never invent prices or discounts', 'Never quote prices, discounts or fees that we have not provided or published.'),
  item('universal', 'no-unconfirmed-promises', 'Never promise what we have not confirmed', 'Never promise appointment times, completion dates or results that the team has not confirmed.'),
  item('universal', 'take-a-message', 'When unsure, take a message', 'When a question is outside what you know, take the caller\'s name and number and let them know the team will follow up.'),
];

export const NICHE_PACKS: Record<string, NicheChecklistPack> = {
  plumbing: {
    services: [
      item('plumbing', 'emergency-repairs', 'Emergency repairs', 'We handle emergency plumbing repairs.'),
      item('plumbing', 'drain-cleaning', 'Drain cleaning & unclogging', 'We offer drain cleaning and unclogging.'),
      item('plumbing', 'water-heaters', 'Water heater install & repair', 'We install and repair water heaters.'),
      item('plumbing', 'leak-repair', 'Leak detection & repair', 'We find and repair leaks.'),
      item('plumbing', 'repiping', 'Repiping', 'We offer repiping services.'),
      item('plumbing', 'fixtures', 'Bathroom & kitchen fixtures', 'We install and repair bathroom and kitchen plumbing fixtures.'),
    ],
    guardrails: [
      item('plumbing', 'no-sight-unseen-price', 'Never quote a final price sight-unseen', 'Never quote an exact final price before a technician has seen the problem in person.'),
      item('plumbing', 'gas-smell', 'Gas smell = leave and call 911', 'If a caller reports smelling gas, tell them to leave the building and call 911 or their gas company first.'),
      item('plumbing', 'no-diy-gas-electrical', 'Never walk callers through gas/electrical DIY', 'Never advise a caller to attempt repairs involving gas lines or electrical work themselves.'),
      item('plumbing', 'no-same-day-promise', 'Never promise same-day completion', 'Never promise same-day completion; offer the earliest available appointment instead.'),
    ],
  },
  hvac: {
    services: [
      item('hvac', 'ac-repair', 'AC repair', 'We repair air conditioning systems.'),
      item('hvac', 'heating-repair', 'Heating repair', 'We repair heating systems and furnaces.'),
      item('hvac', 'installation', 'System installation & replacement', 'We install and replace heating and cooling systems.'),
      item('hvac', 'maintenance-plans', 'Maintenance plans & tune-ups', 'We offer maintenance plans and seasonal tune-ups.'),
      item('hvac', 'ductwork', 'Ductwork services', 'We install, repair and clean ductwork.'),
      item('hvac', 'indoor-air', 'Indoor air quality', 'We offer indoor air quality solutions such as filtration and purification.'),
    ],
    guardrails: [
      item('hvac', 'no-sight-unseen-price', 'Never quote a final price sight-unseen', 'Never quote an exact final price before a technician has inspected the system in person.'),
      item('hvac', 'no-co-advice', 'Carbon monoxide = leave and call 911', 'If a caller reports a carbon monoxide alarm or symptoms, tell them to leave the building and call 911 first.'),
      item('hvac', 'no-refrigerant-diy', 'Never walk callers through refrigerant DIY', 'Never advise a caller to handle refrigerant or open sealed system components themselves.'),
      item('hvac', 'no-efficiency-guarantee', 'Never guarantee energy savings', 'Never guarantee specific energy savings or lower bills from a new system.'),
    ],
  },
  roofing: {
    services: [
      item('roofing', 'replacement', 'Roof replacement', 'We replace roofs.'),
      item('roofing', 'repair', 'Roof repair', 'We repair roof leaks and storm damage.'),
      item('roofing', 'inspections', 'Roof inspections', 'We offer roof inspections and written condition reports.'),
      item('roofing', 'commercial', 'Commercial roofing', 'We service commercial and flat roofs.'),
      item('roofing', 'tarping', 'Emergency tarping', 'We provide emergency tarping for damaged roofs.'),
      item('roofing', 'gutters', 'Gutters & drainage', 'We install and repair gutters and drainage.'),
    ],
    guardrails: [
      item('roofing', 'no-price-before-inspection', 'Never price a roof before inspection', 'Never quote a roof price before an in-person inspection of the roof.'),
      item('roofing', 'no-insurance-promises', 'Never promise insurance will pay', 'Never promise that an insurance claim will be approved or what it will cover.'),
      item('roofing', 'no-lifetime-claims', 'Never claim a lifetime roof', 'Never describe a roof or repair as lasting a lifetime or being maintenance-free.'),
      item('roofing', 'no-climb-advice', 'Never advise callers to climb on the roof', 'Never advise a caller to climb onto a damaged roof themselves; offer an inspection instead.'),
    ],
  },
  homeservices: {
    services: [
      item('homeservices', 'repairs', 'Repairs & troubleshooting', 'We diagnose and repair problems in the home.'),
      item('homeservices', 'installation', 'Installation work', 'We install new fixtures, equipment and systems.'),
      item('homeservices', 'maintenance', 'Preventive maintenance', 'We offer preventive maintenance visits.'),
      item('homeservices', 'emergency', 'Emergency call-outs', 'We handle urgent and emergency call-outs.'),
      item('homeservices', 'inspections', 'Inspections & estimates', 'We provide inspections and written estimates.'),
      item('homeservices', 'commercial', 'Commercial work', 'We also serve commercial customers.'),
    ],
    guardrails: [
      item('homeservices', 'no-sight-unseen-price', 'Never quote a final price sight-unseen', 'Never quote an exact final price before we have seen the job in person.'),
      item('homeservices', 'safety-first', 'Safety emergencies first', 'If a caller describes an immediate safety danger, tell them to call 911 first.'),
      item('homeservices', 'no-same-day-promise', 'Never promise same-day completion', 'Never promise same-day completion; offer the earliest available appointment instead.'),
    ],
  },
  dental: {
    services: [
      item('dental', 'cleanings', 'Exams & cleanings', 'We provide routine dental exams and cleanings.'),
      item('dental', 'implants', 'Dental implants', 'We offer dental implants.'),
      item('dental', 'cosmetic', 'Cosmetic dentistry', 'We offer cosmetic dentistry such as veneers and whitening.'),
      item('dental', 'ortho', 'Orthodontics / clear aligners', 'We offer orthodontic treatment and clear aligners.'),
      item('dental', 'emergency', 'Emergency dental care', 'We see patients for dental emergencies.'),
      item('dental', 'restorative', 'Crowns & restorative care', 'We provide crowns and restorative dental care.'),
    ],
    guardrails: [
      item('dental', 'no-diagnosis', 'Never diagnose on a call', 'Never diagnose a dental condition or recommend specific treatment on a call; book an examination instead.'),
      item('dental', 'no-insurance-promises', 'Never promise insurance coverage', 'Never promise that insurance will cover a treatment or what a patient will owe.'),
      item('dental', 'no-pain-guarantee', 'Never guarantee pain-free treatment', 'Never guarantee that a procedure will be painless or promise specific results.'),
      item('dental', 'urgent-symptoms', 'Severe symptoms = urgent care first', 'If a caller reports uncontrolled bleeding, facial swelling or trouble breathing, advise them to seek urgent care or call 911 first.'),
    ],
  },
  medical: {
    services: [
      item('medical', 'appointments', 'Appointments & scheduling', 'We schedule appointments for new and existing patients.'),
      item('medical', 'checkups', 'Check-ups & preventive care', 'We provide routine check-ups and preventive care.'),
      item('medical', 'followups', 'Follow-up visits', 'We book follow-up and review visits.'),
      item('medical', 'referrals', 'Referrals', 'We help patients with referrals to specialists.'),
      item('medical', 'telehealth', 'Telehealth visits', 'We offer telehealth appointments where appropriate.'),
    ],
    guardrails: [
      item('medical', 'no-diagnosis', 'Never diagnose or advise treatment', 'Never diagnose a condition, interpret results or recommend treatment on a call; book a clinician instead.'),
      item('medical', 'emergency-911', 'Emergencies = call 911', 'If a caller describes an emergency, tell them to call 911 or go to the nearest emergency room.'),
      item('medical', 'no-records-sharing', 'Never share patient information', 'Never share a patient\'s information or confirm their treatment with anyone else.'),
      item('medical', 'no-insurance-promises', 'Never promise insurance coverage', 'Never promise that insurance will cover a visit or procedure.'),
    ],
  },
  legal: {
    services: [
      item('legal', 'consultations', 'Initial consultations', 'We offer initial consultations for new clients.'),
      item('legal', 'personal-injury', 'Personal injury matters', 'We handle personal injury matters.'),
      item('legal', 'family', 'Family law matters', 'We handle family law matters such as divorce and custody.'),
      item('legal', 'estate', 'Estate planning', 'We prepare wills and estate plans.'),
      item('legal', 'business', 'Business & contract matters', 'We advise on business and contract matters.'),
      item('legal', 'real-estate-law', 'Real estate closings & disputes', 'We handle real estate closings and property disputes.'),
    ],
    guardrails: [
      // Ron's law red line (2026-11-13): never say "you have a case".
      item('legal', 'never-you-have-a-case', 'Never say "you have a case"', 'Never tell a caller that they have a case, and never predict the outcome of any legal matter.'),
      item('legal', 'no-legal-advice', 'Never give legal advice on a call', 'Never give specific legal advice on a call; gather the facts and let an attorney respond.'),
      item('legal', 'no-fee-quotes', 'Never quote legal fees', 'Never quote legal fees beyond what we have published; explain that fees depend on the matter.'),
      item('legal', 'no-client-info', 'Never share client information', 'Never share another client\'s information or confirm who our clients are.'),
      item('legal', 'no-deadline-promises', 'Never promise deadlines', 'Never promise filing dates or deadlines that an attorney has not confirmed.'),
    ],
  },
  realestate: {
    services: [
      item('realestate', 'buyers', 'Buyer representation', 'We help buyers find and purchase homes.'),
      item('realestate', 'sellers', 'Seller representation & listings', 'We list and market homes for sellers.'),
      item('realestate', 'valuations', 'Home valuations', 'We provide home valuation consultations.'),
      item('realestate', 'investment', 'Investment properties', 'We work with property investors.'),
      item('realestate', 'relocation', 'Relocation help', 'We help clients relocating into the area.'),
      item('realestate', 'property-management', 'Property management', 'We manage rental properties.'),
    ],
    guardrails: [
      item('realestate', 'no-value-promises', 'Never promise a sale price', 'Never promise what a home will sell for or how quickly it will sell.'),
      item('realestate', 'no-legal-tax-advice', 'Never give legal or tax advice', 'Never give legal or tax advice; suggest the caller speak with their attorney or accountant.'),
      item('realestate', 'fair-housing', 'Never steer by protected characteristics', 'Never describe neighborhoods or suggest areas based on race, religion, family status or other protected characteristics.'),
      item('realestate', 'no-off-market-claims', 'Never invent listings', 'Never claim a property is available, or invent listings, prices or details that we have not provided.'),
    ],
  },
  restaurant: {
    services: [
      item('restaurant', 'reservations', 'Reservations', 'We take table reservations.'),
      item('restaurant', 'takeout', 'Takeout & pickup', 'We offer takeout and pickup orders.'),
      item('restaurant', 'delivery', 'Delivery', 'We offer delivery.'),
      item('restaurant', 'catering', 'Catering', 'We cater events and parties.'),
      item('restaurant', 'private-events', 'Private events & large groups', 'We host private events and large groups.'),
      item('restaurant', 'gift-cards', 'Gift cards', 'We sell gift cards.'),
    ],
    guardrails: [
      item('restaurant', 'no-wait-promises', 'Never promise a wait time', 'Never promise an exact wait time or that a table will be ready at a specific minute.'),
      item('restaurant', 'allergy-care', 'Allergies = flag for the kitchen', 'Never guarantee a dish is free of an allergen; flag allergy requests clearly for the kitchen team.'),
      item('restaurant', 'no-menu-invention', 'Never invent menu items or prices', 'Never invent menu items, ingredients or prices that we have not provided.'),
    ],
  },
  salon: {
    services: [
      item('salon', 'hair', 'Haircuts & styling', 'We offer haircuts and styling.'),
      item('salon', 'color', 'Color services', 'We offer hair coloring services.'),
      item('salon', 'nails', 'Nails', 'We offer manicures and pedicures.'),
      item('salon', 'skin', 'Facials & skin care', 'We offer facials and skin care treatments.'),
      item('salon', 'massage', 'Massage', 'We offer massage treatments.'),
      item('salon', 'bridal', 'Bridal & event styling', 'We offer styling for weddings and events.'),
    ],
    guardrails: [
      item('salon', 'no-results-guarantee', 'Never guarantee results', 'Never guarantee a specific result from a treatment or color service.'),
      item('salon', 'no-medical-skin-advice', 'Never advise on skin conditions', 'Never diagnose or advise on skin or scalp conditions; suggest the client see a professional.'),
      item('salon', 'no-price-invention', 'Never invent prices', 'Never quote prices for services or add-ons that we have not provided.'),
    ],
  },
  auto: {
    services: [
      item('auto', 'diagnostics', 'Diagnostics', 'We run vehicle diagnostics.'),
      item('auto', 'brakes', 'Brake service', 'We service and replace brakes.'),
      item('auto', 'oil-maintenance', 'Oil changes & maintenance', 'We perform oil changes and scheduled maintenance.'),
      item('auto', 'tires', 'Tires & alignment', 'We sell, fit and align tires.'),
      item('auto', 'ac-auto', 'Auto AC service', 'We service vehicle air conditioning.'),
      item('auto', 'transmission', 'Transmission service', 'We service transmissions.'),
    ],
    guardrails: [
      item('auto', 'no-diagnosis-by-phone', 'Never diagnose by phone', 'Never diagnose a vehicle problem or quote its repair cost over the phone before an inspection.'),
      item('auto', 'no-drive-unsafe', 'Unsafe to drive = say so', 'If a caller describes a problem that makes the vehicle unsafe to drive, tell them not to drive it and offer towing or the earliest appointment.'),
      item('auto', 'no-parts-promises', 'Never promise parts availability', 'Never promise that a part is in stock or a completion time before the shop confirms it.'),
    ],
  },
  insurance: {
    services: [
      item('insurance', 'auto-insurance', 'Auto insurance', 'We provide auto insurance quotes and policies.'),
      item('insurance', 'home-insurance', 'Home insurance', 'We provide home insurance quotes and policies.'),
      item('insurance', 'business-insurance', 'Business insurance', 'We provide insurance for businesses.'),
      item('insurance', 'life-insurance', 'Life insurance', 'We provide life insurance policies.'),
      item('insurance', 'claims-help', 'Claims help', 'We help clients start and follow up on claims.'),
      item('insurance', 'policy-reviews', 'Policy reviews', 'We offer policy reviews to check coverage and price.'),
    ],
    guardrails: [
      item('insurance', 'no-coverage-promises', 'Never promise coverage', 'Never promise that a claim will be covered or that a policy includes something it may not.'),
      item('insurance', 'no-binding', 'Never bind coverage on a call', 'Never tell a caller they are insured or that coverage is bound until the team confirms it.'),
      item('insurance', 'no-rate-guarantees', 'Never guarantee a rate', 'Never guarantee a premium or renewal rate.'),
    ],
  },
  financial: {
    services: [
      item('financial', 'tax-prep', 'Tax preparation', 'We prepare individual and business tax returns.'),
      item('financial', 'bookkeeping', 'Bookkeeping', 'We provide bookkeeping services.'),
      item('financial', 'payroll', 'Payroll services', 'We run payroll for businesses.'),
      item('financial', 'planning', 'Financial planning', 'We offer financial planning consultations.'),
      item('financial', 'business-advisory', 'Business advisory', 'We advise businesses on finances and growth.'),
    ],
    guardrails: [
      item('financial', 'no-tax-advice', 'Never give specific tax advice on a call', 'Never give specific tax or investment advice on a call; book a consultation with an advisor instead.'),
      item('financial', 'no-refund-promises', 'Never promise a refund amount', 'Never promise a tax refund amount or a filing outcome.'),
      item('financial', 'no-returns-guarantee', 'Never guarantee returns', 'Never guarantee investment returns or savings amounts.'),
      item('financial', 'no-client-info', 'Never share client information', 'Never share another client\'s financial information with anyone.'),
    ],
  },
  cleaning: {
    services: [
      item('cleaning', 'recurring', 'Recurring cleaning contracts', 'We provide recurring scheduled cleaning.'),
      item('cleaning', 'deep-clean', 'Deep cleaning', 'We provide one-time deep cleaning.'),
      item('cleaning', 'move', 'Move-in / move-out cleaning', 'We provide move-in and move-out cleaning.'),
      item('cleaning', 'floor-care', 'Floor care', 'We provide floor care including stripping, waxing and carpet cleaning.'),
      item('cleaning', 'facilities', 'Medical & industrial facilities', 'We clean medical and industrial facilities.'),
      item('cleaning', 'post-construction', 'Post-construction cleaning', 'We provide post-construction cleanup.'),
    ],
    guardrails: [
      item('cleaning', 'no-price-sight-unseen', 'Never price without a walkthrough', 'Never quote a final cleaning price before a walkthrough or the details we require.'),
      item('cleaning', 'no-stain-guarantees', 'Never guarantee stain removal', 'Never guarantee that a stain or damage can be fully removed.'),
      item('cleaning', 'no-unapproved-areas', 'Never add unapproved areas', 'Never agree to clean areas or handle items that are not in the agreed scope.'),
    ],
  },
  industrial: {
    services: [
      item('industrial', 'contract-manufacturing', 'Contract manufacturing', 'We provide contract manufacturing.'),
      item('industrial', 'machining', 'CNC machining', 'We provide CNC machining services.'),
      item('industrial', 'fabrication', 'Custom fabrication', 'We provide custom fabrication to specification.'),
      item('industrial', 'prototyping', 'Prototyping', 'We build prototypes and short pre-production runs.'),
      item('industrial', 'assembly', 'Assembly & packaging', 'We provide assembly and packaging services.'),
      item('industrial', 'equipment-maintenance', 'Equipment maintenance & repair', 'We maintain and repair industrial equipment.'),
    ],
    guardrails: [
      item('industrial', 'no-quote-without-specs', 'Never quote without specs', 'Never quote production prices or timelines without drawings or specifications.'),
      item('industrial', 'no-delivery-promises', 'Never promise delivery dates', 'Never promise a delivery date before the production team confirms capacity.'),
      item('industrial', 'no-customer-ip', 'Never share customer designs', 'Never share another customer\'s designs, drawings or pricing.'),
      item('industrial', 'no-minimums', 'Never commit to minimums', 'Never commit to minimum order quantities or stocking levels we have not approved.'),
    ],
  },
  generic: {
    services: [
      item('generic', 'core-service', 'Core services', 'We provide the core services listed on our website.'),
      item('generic', 'consultations', 'Consultations', 'We offer consultations for new customers.'),
      item('generic', 'estimates', 'Estimates', 'We provide estimates before work begins.'),
      item('generic', 'maintenance', 'Maintenance & support', 'We offer ongoing maintenance and support.'),
      item('generic', 'commercial', 'Commercial customers', 'We serve commercial customers.'),
    ],
    guardrails: [...UNIVERSAL_GUARDRAILS],
  },
};

/** Industry-name aliases → pack key. First match wins; order matters. */
const ALIASES: [RegExp, string][] = [
  [/plumb/, 'plumbing'],
  [/hvac|heating|air condition|cooling/, 'hvac'],
  [/roof/, 'roofing'],
  [/dental|dentist|orthodon/, 'dental'],
  [/legal|law firm|attorney|lawyer/, 'legal'],
  [/real estate|realty|realtor|property management/, 'realestate'],
  [/restaurant|cafe|café|food|dining|pizza|catering/, 'restaurant'],
  [/salon|spa|barber|beauty/, 'salon'],
  [/auto|mechanic|vehicle|tire|car repair/, 'auto'],
  [/insurance/, 'insurance'],
  [/financial|accounting|tax|bookkeeping|mortgage|lending/, 'financial'],
  [/cleaning|janitorial|maid/, 'cleaning'],
  [/manufactur|industrial|machining|fabrication|b2b/, 'industrial'],
  [/medical|clinic|health|therapy|vet/, 'medical'],
  [/home service|handyman|electric|landscap|pest|garage door|locksmith|painting|remodel/, 'homeservices'],
];

/** Resolve the checklist pack for an industry (+ optional sub-niche) name. */
export function packForIndustry(industry?: string, subNiche?: string): { key: string; pack: NicheChecklistPack } {
  const hay = `${industry || ''} ${subNiche || ''}`.toLowerCase();
  for (const [re, key] of ALIASES) if (re.test(hay)) return { key, pack: NICHE_PACKS[key] };
  return { key: 'generic', pack: NICHE_PACKS.generic };
}

const normLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Merge pack items with AI-tailored candidates: pack first (grounded),
 * AI items appended when they don't duplicate a pack label, capped.
 * AI items keep the same shape; their ids are namespaced "ai-".
 */
export function mergeChecklistItems(packItems: ChecklistItem[], aiItems: ChecklistItem[], cap = 8): ChecklistItem[] {
  const seen = new Set(packItems.map((i) => normLabel(i.label)));
  const out = [...packItems];
  for (const ai of aiItems) {
    if (out.length >= cap) break;
    const key = normLabel(ai.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ai);
  }
  return out.slice(0, cap);
}

/** Parse a model reply that should be a JSON array of {label, sentence}. */
export function parseChecklistJson(text: string): ChecklistItem[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const raw = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry, i) => {
      if (!entry || typeof entry !== 'object') return [];
      const { label, sentence } = entry as { label?: unknown; sentence?: unknown };
      if (typeof label !== 'string' || typeof sentence !== 'string') return [];
      const cleanLabel = label.trim().slice(0, 80);
      const cleanSentence = sentence.trim().slice(0, 300);
      if (!cleanLabel || !cleanSentence) return [];
      return [{ id: `ai-${i}-${normLabel(cleanLabel).replace(/ /g, '-').slice(0, 40)}`, label: cleanLabel, sentence: cleanSentence }];
    });
  } catch { return []; }
}
