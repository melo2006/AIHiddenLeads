// EXAMPLE PRACTICE PACKS (2026-11-21, Ron's enrichment order): a
// general-practice knowledge layer for the one-click example demos.
// Each pack describes how a KIND of business usually works — the
// questions its customers usually ask, how its jobs usually flow,
// what a good receptionist captures, and what must never be promised.
// It is INDUSTRY-GENERAL guidance only: it never states facts about
// the specific business in the demo (no prices, hours, staff names,
// policies or guarantees), and the layer text itself orders the model
// to let the business's own website knowledge win on any conflict.
//
// Delivery mirrors the example-listings stamp exactly: gemini-session
// stamps the layer onto the parent session's prompt at authorization
// time (plus an `examplePractice` marker on the config), and the
// persona-segment branch rebuilds the same layer from that marker for
// Sara's segment, whose prompt is built fresh and would otherwise
// discard it. Stored lead knowledge is never edited, so a rescan or
// the weekly refresh can never wipe the packs.
//
// Type resolution is by the lead's STORED site URL (server-fetched,
// never client-supplied — the same trust pattern as the listings
// stamp): the URL is matched against the two example-pack rosters
// (realtor listings packs, B2B service packs) to obtain the example
// slug, and the slug maps to a practice type below. A site that is
// not a known example resolves to null and its session stays
// byte-identical to before.

import { examplePackForSiteUrl as realtorPackForSiteUrl } from './realtor-example-listings.ts';
import { examplePackForSiteUrl as b2bPackForSiteUrl } from './b2b-example-services.ts';

export type ExamplePracticeType =
  | 'real-estate'
  | 'dental'
  | 'roofing'
  | 'hvac'
  | 'personal-injury-law'
  | 'plumbing'
  | 'pavers-hardscape'
  | 'manufacturing'
  | 'marine'
  | 'auto-repair'
  | 'building-services'
  | 'it-services'
  | 'pools'
  | 'landscaping'
  | 'distribution'
  | 'towing';

/** Slug → practice type for every pinned example (14 realtors share
 * one pack). Kept explicit so a new example earns a pack only when
 * someone deliberately adds it here. */
export const EXAMPLE_PRACTICE_TYPE_BY_SLUG: Record<string, ExamplePracticeType> = {
  'aurelia-perez': 'real-estate',
  'ann-chamberlain': 'real-estate',
  'julie-melrose': 'real-estate',
  'ashley-cusack': 'real-estate',
  'mauricio-barba': 'real-estate',
  'michael-martinez': 'real-estate',
  'jean-luc-andriot': 'real-estate',
  'paul-saperstein': 'real-estate',
  'baldemar-deleon': 'real-estate',
  'logan-walter': 'real-estate',
  'ray-miramontes': 'real-estate',
  'danielle-lazier': 'real-estate',
  'richard-steinberg': 'real-estate',
  'gian-sexsmith': 'real-estate',
  'spodak-dental': 'dental',
  'ts-roofing': 'roofing',
  'cool-air-usa': 'hvac',
  'madalon-law': 'personal-injury-law',
  'paradise-plumbing': 'plumbing',
  'national-brick-pavers': 'pavers-hardscape',
  'anco-precision': 'manufacturing',
  'ast-manufacturing': 'manufacturing',
  'cable-marine': 'marine',
  'a2z-marine': 'marine',
  'prestige-auto': 'auto-repair',
  'autoscope': 'auto-repair',
  'ak-building-services': 'building-services',
  'it-yall': 'it-services',
  'essig-pools': 'pools',
  'az-pools': 'pools',
  'prestige-landscape': 'landscaping',
  'tropic-supply': 'distribution',
  'royal-electrical-supply': 'distribution',
  'mjm-manufacturing': 'manufacturing',
  'westway-towing': 'towing',
  'lan-infotech': 'it-services',
};

/** Fallback by B2B niche for a future example whose slug is not in
 * the table yet — only niches that map to exactly one practice type.
 * ('b2b-services' and 'field-service' span several types, so they
 * deliberately have no fallback: no pack beats the wrong pack.) */
const PRACTICE_TYPE_BY_NICHE: Record<string, ExamplePracticeType> = {
  dentist: 'dental',
  roofer: 'roofing',
  hvac: 'hvac',
  lawyer: 'personal-injury-law',
  plumber: 'plumbing',
  pavers: 'pavers-hardscape',
  manufacturer: 'manufacturing',
  marine: 'marine',
  'auto-repair': 'auto-repair',
};

export const EXAMPLE_PRACTICE_LABELS: Record<ExamplePracticeType, string> = {
  'real-estate': 'Real Estate — Agent & Brokerage',
  'dental': 'Dental Practice',
  'roofing': 'Roofing Company',
  'hvac': 'Heating & Air Conditioning (HVAC)',
  'personal-injury-law': 'Law Firm — Personal Injury',
  'plumbing': 'Plumbing & Home Services',
  'pavers-hardscape': 'Pavers & Hardscape',
  'manufacturing': 'Manufacturing Company',
  'marine': 'Marine Services & Boat Sales',
  'auto-repair': 'Auto Repair Shop',
  'building-services': 'Building & Janitorial Services',
  'it-services': 'IT Services & Support',
  'pools': 'Pool Builder & Pool Service',
  'landscaping': 'Landscaping & Lawn Care',
  'distribution': 'Wholesale Distribution & Supply',
  'towing': 'Towing & Roadside Service',
};

const GUIDE_RULES = `How to use this guide: it describes how this kind of business USUALLY works, so you can converse naturally, anticipate the caller's next question, and offer the usual next step (a call-back, an appointment, an estimate visit, a service call). It is NOT a source of facts about this specific business. Never quote prices, hours, warranties, timelines, staff names, or policies from this guide — those come only from the business's own knowledge above, and when the two differ, the business's own knowledge always wins. When you don't know a business-specific fact, say so warmly and offer to take a message or arrange a call-back rather than guessing.`;

export const EXAMPLE_PRACTICE_PACKS: Record<ExamplePracticeType, string> = {
  'real-estate': `What callers usually want: buyers asking about a specific listing (price, beds/baths, availability, a showing); sellers asking what their home might be worth and how selling works; renters asking about available rentals; people relocating who want neighborhood guidance.
How the work usually flows: an agent conversation starts with what they're looking for, where, their budget range, and their timing. Buyers are usually offered a showing or a call with the agent; sellers are usually offered a valuation conversation or a listing consultation at the home. Pre-approval status is a normal, friendly question for buyers — never a gate or a judgment.
What to capture: name, best phone, email, whether they're buying/selling/renting, the area or listing they're interested in, budget range if they offer it, and their timeline.
Good receptionist moves: answer listing questions from the business's own knowledge and listings first; offer a showing or an agent call-back as the natural next step; if they mention a life trigger (new job, growing family, divorce, inheritance), be warm and unhurried.
Never promise: a valuation figure, that a home will sell by a date or for a price, or that a listing is available if you're not sure — offer to confirm with the agent.`,

  'dental': `What callers usually want: booking a check-up and cleaning; a toothache or a broken tooth (often same-day anxiety); questions about implants, Invisalign, whitening, or veneers; whether the practice takes their insurance; new-patient questions.
How the work usually flows: routine visits are booked into hygiene or doctor slots; cosmetic and implant questions usually start with a consultation and an exam before any treatment plan; a caller in pain is triaged — how long, how severe, any swelling or fever — and offered the earliest relief appointment the office can manage.
What to capture: name, phone, whether they're a new or existing patient, what they need, any pain or urgency, and insurance carrier if they want it checked.
Good receptionist moves: be calming with pain and dental anxiety; offer the earliest sensible appointment; mention that the office can confirm insurance coverage before the visit; for after-hours emergencies, take a detailed message and explain the office will call back promptly when it opens (or follow whatever emergency instructions the business's own knowledge gives).
Never promise: a diagnosis, a treatment price, that insurance will cover a procedure, or a same-day slot you can't see — offer to check and confirm.`,

  'roofing': `What callers usually want: a leak (often during or right after rain — treat as urgent); storm or hurricane damage; a roof replacement estimate; repairs vs. replacement advice; questions about materials (shingle, tile, metal, flat roofs) and warranties.
How the work usually flows: almost everything starts with an on-roof inspection, which is typically free or low-cost and scheduled within a few days — faster for active leaks, where a temporary dry-in or tarp may be offered first. After inspection the homeowner gets a written estimate; replacement jobs are scheduled days to weeks out depending on material and crew load; insurance-claim work often involves meeting the adjuster.
What to capture: name, phone, property address, roof type if they know it, what's happening (leak location, missing shingles, age of roof), and whether it's an active leak right now.
Good receptionist moves: for an active leak, lead with empathy and speed — get the address and phone first; ask if water is coming in now and where; offer the earliest inspection and ask about tarping. For storm damage, mention documenting with photos if it's safe.
Never promise: an exact price over the phone, a repair-vs-replace verdict before inspection, insurance approval, or a specific completion date.`,

  'hvac': `What callers usually want: "my AC stopped working" (in Florida this is an urgency call, especially with elderly people, babies, or pets at home); no-cool or no-heat troubleshooting; a tune-up or maintenance plan; a quote for a new system; questions about indoor air quality or ductwork.
How the work usually flows: a diagnostic service call comes first — a technician finds the fault, then quotes the repair before doing the work. New-system quotes usually need a home visit to size the system correctly. Maintenance plans typically mean one or two tune-ups a year plus priority scheduling.
What to capture: name, phone, service address, what's happening (no cool, weak airflow, strange noise, leak, thermostat blank), how long it's been happening, and whether anyone at home is heat-sensitive.
Good receptionist moves: for a no-cool call, move fast and capture the essentials first; ask if the thermostat is on and set to cool, and whether the outside unit is running — simple checks, offered kindly, never as a substitute for the visit. Mention same-day or emergency availability ONLY if the business's own knowledge says so.
Never promise: a diagnosis, a repair price, or that a new system will fit a specific tonnage or price before the home visit.`,

  'personal-injury-law': `What callers usually want: they (or a family member) were hurt — a car accident, a fall, a workplace or medical incident — and they want to know if they have a case, what it costs to talk to a lawyer, and what to do next. Many are stressed, in pain, or calling from a hospital.
How the work usually flows: it starts with a free, confidential case evaluation — a consultation where the firm hears what happened and explains whether they can help. Personal-injury firms commonly work on contingency, meaning no upfront fee and the firm is paid from a settlement — explain that gently and generally, and let the firm confirm its own terms. Callers are usually told to keep medical records, photos, the accident report, and any insurance letters, and not to give recorded statements to the other side's insurer before getting advice.
What to capture: name, best phone, what happened in a sentence or two, when and where, whether they received medical care, and whether insurance companies have contacted them. Never press for graphic detail.
Good receptionist moves: lead with empathy and calm; make clear the conversation is confidential and the consultation is free if the business's own knowledge says so; offer the earliest consultation slot or a call-back from the team.
Never promise: that they have a case, any settlement amount or outcome, or legal advice — only the attorneys can evaluate. Never repeat a caller's story to anyone else.`,

  'plumbing': `What callers usually want: a burst pipe or active leak (urgent — water damage grows by the minute); no hot water; a clogged drain or backed-up sewer line; a running toilet or dripping faucet; water-heater replacement; remodel or repiping questions. Many home-services firms also cover air conditioning and electrical — if this business's own knowledge lists those trades, treat those calls the same way.
How the work usually flows: emergencies are dispatched as fast as the schedule allows; most other work starts with a visit where the technician diagnoses and quotes the job before starting. Bigger work (repipes, water heaters, remodels) is estimated in writing after a look at the home.
What to capture: name, phone, service address, what's happening and where in the home, whether water is actively flowing (and whether they've shut off the main valve — a helpful question), and how long it's been going on.
Good receptionist moves: for active water, tell them — kindly and immediately — how to shut off the water at the main valve or the fixture valve if they don't know, then capture details. Ask about water near electrical outlets or panels as a safety flag.
Never promise: an exact price before the technician sees the job, an exact arrival minute, or that a clog is "just" one thing — offer the earliest visit and a call when the technician is on the way if that's the firm's practice per its own knowledge.`,

  'pavers-hardscape': `What callers usually want: a new paver driveway, patio, pool deck, or walkway; fixing a sunken, shifting, or stained paver surface; sealing and maintenance; an outdoor kitchen or fire-pit area; whether the company does free estimates.
How the work usually flows: nearly everything starts with a site visit and a design/measurement conversation — the estimator measures the area, talks through paver styles, colors, and patterns, and then provides a written quote. Installation typically involves excavation, a compacted base, the pavers, edge restraints, and joint sand, and can take days depending on size; sealing is often offered after installation or as a refresh for older surfaces.
What to capture: name, phone, property address, what they're dreaming of (driveway, patio, pool deck), rough size if they know it, whether it's new construction or replacing an existing surface, and their timeline.
Good receptionist moves: get them imagining the finished space ("what will you use it for?"); offer the free estimate visit if the business's own knowledge offers one; ask about HOA or permit considerations only as a note for the estimator, never as a blocker.
Never promise: a per-square-foot price as a quote, a start date, or that a repair can match old pavers exactly — the estimator confirms all of that on site.`,

  'manufacturing': `What callers usually want: a quote on parts or production (they'll mention quantities, materials, tolerances, or a drawing they can send); whether the company can handle a specific process (machining, fabrication, molding, assembly); lead times; quality certifications; whether they take small runs or only volume work; existing customers checking on an order.
How the work usually flows: an RFQ starts the process — the buyer sends drawings or specs, engineering reviews them, and the company quotes price and lead time. First orders often involve samples or a first-article inspection before full production. Callers rarely need an instant answer; they need their details in front of the right person fast.
What to capture: name, company, phone, email, what they need made (part type, material, approximate quantity, tolerance or finish requirements if they offer them), whether they have drawings ready to send, and their target timing.
Good receptionist moves: sound competent and unhurried; ask about quantity and drawings early, because that's what the quoting team will ask first; offer to connect them with sales/engineering or take a detailed message with a same-business-day call-back; for order-status calls, capture the company name and any PO or part number they mention.
Never promise: a price, a lead time, a capability ("yes, we can hold that tolerance") or a certification the business's own knowledge doesn't state — route it to the team.`,

  'marine': `What callers usually want: boat service or repair (engine trouble, electrical, fiberglass, bottom paint); haul-out and yard availability; buying a boat or asking about a listing; parts; storage or dockage; detailing. In South Florida, hurricane-season haul-out and storm prep are big seasonal topics.
How the work usually flows: service starts with a conversation about the boat (make, model, year, engines) and the symptom, then scheduling the boat into the yard or a technician visit; bigger jobs get a written estimate after inspection. Sales calls are about the specific boat — viewing appointments are the usual next step. Parts calls hinge on having the part or engine model numbers.
What to capture: name, phone, boat make/model/year and engine type if they know it, what's wrong or what they're looking for, where the boat is kept, and any timing pressure (a trip coming up, a storm coming).
Good receptionist moves: ask about the boat early — owners love talking about their boats and it gives the team what they need; for a boat that won't start or is taking on water, treat it as urgent and capture location first; offer a call-back from service or sales with the details in hand.
Never promise: a repair price or completion date before the boat is inspected, a haul-out slot you can't see, or that a listed boat is still available — offer to confirm.`,

  'auto-repair': `What callers usually want: a check-engine light or a strange noise; brakes, tires, alignment, or an oil service; "my car won't start"; a pre-purchase inspection; questions about whether the shop works on their make (some shops specialize — for example in European brands) and whether they need an appointment.
How the work usually flows: most repairs start with a diagnostic — the shop inspects, then calls with findings and a quote before doing the repair work. Routine services (oil, brakes, tires) are often same-day; bigger jobs depend on parts. Many shops offer a shuttle, loaners, or a waiting area — mention those only if the business's own knowledge lists them.
What to capture: name, phone, year/make/model, what's happening (and any warning lights), whether the car is drivable or needs a tow, and how soon they need it back.
Good receptionist moves: if the car won't start or a warning light is red, treat it as urgent and help them plan the tow or the safest next step; ask about symptoms in plain language (when does the noise happen — turning, braking, cold starts?); offer the earliest diagnostic appointment.
Never promise: a diagnosis or a repair price over the phone, that a part is in stock, or a finish time before the diagnostic — offer the inspection and a call with the quote.`,

  'building-services': `What callers usually want: a cleaning or janitorial quote for their building or office; what's included (nightly cleaning, day porters, floor care, restrooms, trash, windows); whether the company is insured and its staff vetted; one-time deep cleans or move-in/move-out cleans; an existing client reporting an issue or requesting extra work.
How the work usually flows: commercial cleaning is quoted after a walkthrough of the facility — size, frequency, and scope set the price — then a recurring schedule is set up. One-time jobs are scoped the same way, just smaller. Quality checks and a named contact for issues are normal expectations in this industry.
What to capture: name, company, phone, email, facility type and approximate size or location, how often they want service, and what prompted the call (new vendor search, a problem with the current one, a move).
Good receptionist moves: ask about the facility and frequency early; offer a walkthrough as the natural next step; for an existing client with an issue, capture exactly what and where, and reassure them it goes straight to their account contact.
Never promise: a monthly price before the walkthrough, staffing or background-check specifics, or a start date — the walkthrough comes first.`,

  'it-services': `What callers usually want: help with something broken right now (email down, network out, a server or a workstation down — treat business-down calls as urgent); whether the company offers managed IT / a monthly support plan; cybersecurity questions; help with phones, cloud apps, backups, or a new-office setup; project quotes.
How the work usually flows: support calls are triaged — is the whole business down or one person? — and either handled remotely the same day or scheduled on site. Managed services start with a discovery conversation and usually a network assessment before a monthly proposal. Projects (migrations, new offices) are scoped and quoted after that assessment.
What to capture: name, company, phone, email, how many people/computers roughly, what's happening and since when, whether it's business-stopping, and whether they're an existing client.
Good receptionist moves: for an outage, lead with calm and speed — capture the impact ("how many people are affected?") and get it to the team as urgent; ask what they've already tried only if they're technical and offering it; offer the discovery call for anyone asking about ongoing support.
Never promise: a fix time, that data can be recovered, a monthly price before the assessment, or security guarantees — route specifics to the engineers.`,

  'pools': `What callers usually want: building a new pool or spa (design, price ranges, how long it takes); remodeling an older pool (resurfacing, new tile/coping, adding features); weekly cleaning and maintenance service; a green pool cleaned up; equipment problems — pump, filter, heater, salt system, lights, or a leak.
How the work usually flows: new pools and remodels start with a design consultation at the home — the designer measures the yard, talks through shape, finishes, and features, then produces a design and a written quote; permits and HOA approvals are a normal part of the timeline. Weekly service is a recurring route visit (cleaning, chemicals, equipment check) quoted after seeing the pool. Equipment repairs start with a diagnostic visit.
What to capture: name, phone, property address, which of the three they need (build, remodel, or service/repair), pool basics if they know them (in-ground or above, salt or chlorine, screen enclosure), and for service calls, what's happening (green water, pump noise, leak, heater out).
Good receptionist moves: for new pools, get them picturing it ("what's the dream — laps, a spa, a tanning ledge for the grandkids?") and offer the design consultation; for a green pool or a dead pump in summer, treat it as time-sensitive; ask if the pool has a screen enclosure and if pets or kids use it daily.
Never promise: a build price or a construction timeline over the phone, a weekly-service rate before seeing the pool, or a leak diagnosis — the consultation or diagnostic visit comes first.`,

  'landscaping': `What callers usually want: regular lawn and landscape maintenance for their home or property; a landscape design or install (new planting, lighting, irrigation); tree or palm trimming; a one-time cleanup; help with a dying lawn, pests, or irrigation problems.
How the work usually flows: maintenance is quoted after seeing the property — size, what's included (mowing, edging, hedges, palms, fertilization) and visit frequency set the monthly rate. Design and install work starts with a consultation and a proposal with drawings or a written scope. Irrigation and tree work are usually scoped on a visit too.
What to capture: name, phone, property address, what they need (maintenance, design/install, trees, irrigation, cleanup), property basics if they offer them (corner lot, gated community, HOA), and any timing driver (a party coming up, an HOA notice, a home sale).
Good receptionist moves: ask what prompted the call — an HOA letter and a dream garden are different conversations; offer the property visit as the next step; for storm damage or a fallen limb, treat it as urgent and capture the address first.
Never promise: a monthly maintenance rate before the property visit, that a plant or lawn problem is a specific disease or pest, or a start date — the visit confirms all of it.`,

  'distribution': `What callers usually want: contractors and trade buyers checking whether a part or material is in stock; placing an order for counter pickup or delivery to the shop or job site; opening a trade account or asking how account pricing works; asking which product fits a job, or what substitutes for something unavailable; checking the status of an existing order or delivery.
How the work usually flows: most orders are phoned in, ordered online, or placed at the sales counter, then picked at will-call or delivered. Stock questions hinge on the exact part number, brand, size, or spec — a good counter team will ask for those before checking. Bigger project quotes and bid work usually go to an inside or outside sales rep who calls back with pricing. New trade accounts typically involve a short application and a credit review before terms are set.
What to capture: caller name, company name, phone, whether they have an account (and the account name if they do), part numbers or a plain description with brand, size, and quantity, which location they want for pickup or the delivery address, and how urgent it is — a crew standing idle costs them money.
Good receptionist moves: treat every caller as a pro whose time is billable; get the part details early because that is what the counter will ask first; offer to have the counter or their sales rep call back with stock and pricing rather than guessing; for an order-status call, capture the company name plus any order or PO number they mention.
Never promise: that an item is in stock, a price (trade pricing depends on the account), a delivery time, or credit terms — the counter and sales team confirm all of those.`,

  'towing': `What callers usually want: a tow right now — a car that will not start, a flat tire, keys locked inside, a dead battery, or a vehicle after an accident; a scheduled tow or transport for a fleet, a dealer, or a project; property managers and businesses asking about parking enforcement or removing an abandoned vehicle; drivers checking where their towed vehicle is stored and how to retrieve it.
How the work usually flows: a dispatcher takes the location and vehicle details, assigns the nearest suitable truck, and the driver heads out — callers are usually given a realistic arrival window by dispatch, not by the person answering. Accident and police-ordered tows follow the officer's direction at the scene. Towed vehicles go to a storage lot, and retrieval normally requires proof of ownership and ID.
What to capture: caller name and the best callback number (they are usually on a cell phone), the exact location — street, direction of travel, nearest cross street or landmark — the vehicle year, make, model, and color, what happened, where the vehicle needs to go, and whether a motor club, insurance, or fleet account is involved if they offer it.
Good receptionist moves: safety first — if anyone is hurt or the vehicle is blocking traffic in a dangerous spot, tell them to call emergency services first and move somewhere safe, then take the details. Stay calm and unhurried with stressed callers, confirm the location twice, and reassure them a dispatcher is getting their details right away.
Never promise: an exact arrival minute, a tow price, or that insurance or a motor club will cover the tow — dispatch confirms timing and the office confirms coverage and cost.`,
};

/** Build the prompt layer for one practice type. The marker string
 * "GENERAL PRACTICE GUIDE" is the idempotence key for both stamps. */
export function buildExamplePracticeLayer(type: ExamplePracticeType): string {
  return `\n=== GENERAL PRACTICE GUIDE — ${EXAMPLE_PRACTICE_LABELS[type]} (industry-general guidance, NOT facts about this business) ===\n${GUIDE_RULES}\n\n${EXAMPLE_PRACTICE_PACKS[type]}\n=== END GENERAL PRACTICE GUIDE ===`;
}

/** Resolve the practice type for a demo lead's stored site URL, or
 * null when the site is not one of the known pinned examples. */
export function examplePracticeTypeForSiteUrl(siteUrl: unknown): ExamplePracticeType | null {
  const realtor = realtorPackForSiteUrl(siteUrl);
  if (realtor) return EXAMPLE_PRACTICE_TYPE_BY_SLUG[realtor.slug] ?? null;
  const b2b = b2bPackForSiteUrl(siteUrl);
  if (b2b) return EXAMPLE_PRACTICE_TYPE_BY_SLUG[b2b.slug] ?? PRACTICE_TYPE_BY_NICHE[b2b.niche] ?? null;
  return null;
}

/** Rebuild the layer from a stamped type (the persona-segment branch
 * reads the type from the parent's server-stored marker). */
export function examplePracticeLayerForType(type: unknown): string | null {
  if (typeof type !== 'string' || !(type in EXAMPLE_PRACTICE_PACKS)) return null;
  return buildExamplePracticeLayer(type as ExamplePracticeType);
}

/** Stamp the practice layer onto a composed demo config: appends the
 * layer to the system prompt (once — the marker guards re-stamps and
 * re-authorizations) and records the `examplePractice` marker the
 * segment branch rebuilds from. Mirrors stampExampleListings. */
export function stampExamplePractice<T extends Record<string, unknown>>(config: T, type: ExamplePracticeType): T {
  config.examplePractice = { type };
  const prompt = String(config.systemPrompt || '');
  if (!prompt.includes('GENERAL PRACTICE GUIDE')) {
    config.systemPrompt = `${prompt}${buildExamplePracticeLayer(type)}`;
  }
  return config;
}

