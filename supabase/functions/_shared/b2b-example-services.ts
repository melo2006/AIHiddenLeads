// B2B EXAMPLE SERVICES PACKS (2026-11-13): for each of the 16 one-click
// demo examples in the general-business set, the services the simulated
// Aspen leads with when a demo session runs on that site — the analog of
// the realtor listings packs. Services were extracted from each
// business's own website and are marked source: "site"; where a real
// service was only evidenced off-site (a third-party profile of the
// business), it is marked source: "sample" — the marking lives in the
// data, honestly. This is the Edge runtime copy; the client-side
// canonical copy lives in src/data/b2bExampleServices.ts and a parity
// test (src/test/b2b-example-services.test.ts) keeps them in step.
export interface ExampleService {
  /** The service the way the business's own site names it. */
  name: string;
  /** Short descriptor in the site's own spirit — what Aspen says when a caller asks "do you do X?". */
  descriptor: string;
  /** "site" = extracted from the business's own website; "sample" = real service evidenced only off-site, marked honestly in the data. */
  source: 'site' | 'sample';
}

export interface B2BExamplePack {
  slug: string;
  url: string;
  businessName: string;
  /** Composition slot key: dentist | roofer | hvac | lawyer | plumber | pavers | manufacturer | marine | auto-repair | b2b-services | field-service */
  niche: string;
  nicheLabel: string;
  city: string;
  state: string;
  /** Hours as the business's own site shows them, when it shows them. */
  hours?: string;
  /** Service area as the business's own site describes it. */
  serviceArea?: string;
  services: ExampleService[];
}

export const B2B_EXAMPLE_PACKS: B2BExamplePack[] = [
  {
    slug: "spodak-dental",
    url: "https://www.spodakdental.com/",
    businessName: "Spodak Dental Group",
    niche: "dentist",
    nicheLabel: "Dental practice",
    city: "Delray Beach",
    state: "FL",
    hours: "Monday - Thursday: 9 a.m. - 5 p.m. / Friday: 8 a.m. - 4 p.m. / Saturday: Emergency Appointments Only",
    serviceArea: "Delray Beach, Boca Raton and all of South Florida",
    services: [
      { name: "Preventative Dental Care", descriptor: "Routine exams and cleanings — the check-ups that keep small problems small.", source: "site" },
      { name: "Dental Implants", descriptor: "Permanent tooth replacement, planned and placed in-house.", source: "site" },
      { name: "All-on-4", descriptor: "Teeth in a day — a full arch of implants in a single treatment plan.", source: "site" },
      { name: "Invisalign", descriptor: "Clear aligners that straighten teeth without brackets or wires.", source: "site" },
      { name: "Ceramic Crowns", descriptor: "Ceramic crowns, including same-day CEREC crowns from the on-site lab.", source: "site" },
      { name: "Porcelain Veneers", descriptor: "Porcelain veneers for smile enhancement.", source: "site" },
      { name: "Root Canal Therapy", descriptor: "Endodontics in-house — no referral across town.", source: "site" },
      { name: "Periodontal (Gum) Care", descriptor: "Gum care including LANAP laser gum disease treatment and Perio Protect.", source: "site" },
      { name: "Wisdom Teeth / Oral Surgery", descriptor: "Extractions and oral surgery in-house.", source: "site" },
      { name: "KoR Teeth Whitening", descriptor: "KoR power whitening for a visibly brighter smile.", source: "site" },
    ],
  },
  {
    slug: "ts-roofing",
    url: "https://www.tsroofingsystems.com/",
    businessName: "T&S Roofing Systems",
    niche: "roofer",
    nicheLabel: "Roofing company",
    city: "Miami",
    state: "FL",
    hours: "Monday – Friday: 8:00 AM – 6:00 PM / Saturday: 10:00 AM – 3:00 PM / Sunday: By Appointment",
    serviceArea: "All of Miami-Dade County and Broward County — from Key Biscayne to Pompano Beach",
    services: [
      { name: "Roof Replacement", descriptor: "Tile, shingle, metal and flat systems — free detailed estimate, permits and HOA approvals handled.", source: "site" },
      { name: "Roof Repair", descriptor: "Leaks, storm damage and general wear, diagnosed and repaired.", source: "site" },
      { name: "Commercial Roofing", descriptor: "TPO, modified bitumen and built-up flat systems, plus sloped tile, metal and shingle.", source: "site" },
      { name: "Emergency Tarping", descriptor: "Storm and emergency tarping to cover a damaged roof fast.", source: "site" },
      { name: "Metal Roofing", descriptor: "Metal roof systems built for South Florida wind resistance.", source: "site" },
      { name: "Tile Roofing", descriptor: "Concrete and clay tile roofing — recommended for South Florida wind resistance.", source: "site" },
      { name: "Shingle Roofing", descriptor: "Architectural shingle roofing.", source: "site" },
      { name: "Flat Roofing", descriptor: "Flat roof systems for homes and commercial buildings.", source: "site" },
      { name: "Roof Maintenance", descriptor: "Ongoing roof maintenance to catch problems before they leak.", source: "site" },
      { name: "Skylight Installation and Replacement", descriptor: "New skylights and skylight replacement.", source: "site" },
    ],
  },
  {
    slug: "cool-air-usa",
    url: "https://www.coolairusa.com/",
    businessName: "Cool Air USA",
    niche: "hvac",
    nicheLabel: "HVAC company",
    city: "Lauderhill",
    state: "FL",
    hours: "Call 24/7 · Visit hours: every day 7am–9pm",
    serviceArea: "Broward, Miami-Dade & Palm Beach Counties — 87 cities and towns",
    services: [
      { name: "AC Repair", descriptor: "Emergency repairs on all major brands — Rheem, Daikin, Carrier, Lennox and more.", source: "site" },
      { name: "AC Installation / New Systems", descriptor: "Permitted installations with load calculation and a fixed-price digital estimate.", source: "site" },
      { name: "AC Maintenance", descriptor: "Spring and fall tune-ups that prevent breakdowns before the heat hits.", source: "site" },
      { name: "Emergency Service", descriptor: "Real people answer 24/7 — nights, weekends and holidays.", source: "site" },
      { name: "Commercial HVAC", descriptor: "HVAC for offices, stores and restaurants, including after-hours work.", source: "site" },
      { name: "Duct Cleaning", descriptor: "Duct cleaning for cleaner air and better airflow.", source: "site" },
      { name: "Duct Work", descriptor: "Duct repair and balancing — fixing leaky and undersized duct runs.", source: "site" },
      { name: "Membership Plans", descriptor: "Scheduled tune-ups, drain-line flushes, filter replacement and 10% off repairs.", source: "site" },
      { name: "Thermostat Services", descriptor: "Thermostat setup and installation.", source: "site" },
      { name: "Indoor Air Quality", descriptor: "Indoor air quality solutions including UV light systems.", source: "sample" },
    ],
  },
  {
    slug: "madalon-law",
    url: "https://madalonlaw.com/",
    businessName: "Madalon Injury Law",
    niche: "lawyer",
    nicheLabel: "Personal injury law firm",
    city: "Fort Lauderdale",
    state: "FL",
    hours: "Available 24 hours a day by phone",
    serviceArea: "Fort Lauderdale, Miami-Dade, Broward and Palm Beach counties — throughout Florida",
    services: [
      { name: "Car Accidents", descriptor: "Motor-vehicle injury claims, handled on a contingency basis — no fee unless they win.", source: "site" },
      { name: "Slip & Fall / Premises Liability", descriptor: "Injuries on unsafe property.", source: "site" },
      { name: "Wrongful Death", descriptor: "Fatal-injury claims for families.", source: "site" },
      { name: "Medical Malpractice", descriptor: "Provider negligence cases.", source: "site" },
      { name: "Workers' Compensation", descriptor: "Work-related injuries, including hearing loss.", source: "site" },
      { name: "Nursing Home Abuse & Neglect", descriptor: "Elder injury and neglect cases.", source: "site" },
      { name: "Birth Injury", descriptor: "Delivery-related injury claims.", source: "site" },
      { name: "Bicycle Accidents", descriptor: "Cyclist injury claims.", source: "site" },
      { name: "Boating & Cruise Ship Accidents", descriptor: "Maritime and vacation injury claims.", source: "site" },
      { name: "Construction Accidents", descriptor: "Jobsite injury claims.", source: "site" },
    ],
  },
  {
    slug: "paradise-plumbing",
    url: "https://paradiseplumbingandac.com/",
    businessName: "Paradise Plumbing, Air & Electric",
    niche: "plumber",
    nicheLabel: "Plumbing company",
    city: "Fort Lauderdale",
    state: "FL",
    hours: "Open 24 hours, 7 days a week",
    serviceArea: "Broward County and the South Florida Tri-County area",
    services: [
      { name: "Plumbing Repair", descriptor: "Repair, replacement, installation and diagnostics — residential and commercial, with emergency service.", source: "site" },
      { name: "Drain Cleaning", descriptor: "Clog removal, inspections and preventative maintenance.", source: "site" },
      { name: "Hydro Jetting", descriptor: "High-pressure sewer cleaning that scrubs grease, scale and roots from pipe walls.", source: "site" },
      { name: "Sewer Camera Inspection", descriptor: "Diagnosing hidden sewer issues without excavation.", source: "site" },
      { name: "Sewer Repair", descriptor: "Sewer repair, replacement and maintenance, with emergency service.", source: "site" },
      { name: "Water Heater Services", descriptor: "Repair, replacement and installation, including tankless service and efficiency upgrades.", source: "site" },
      { name: "Faucet Repair & Fixtures", descriptor: "Kitchen, bathroom, utility and commercial fixture work.", source: "site" },
      { name: "Leak Detection", descriptor: "Finding the leaks you can't see before they become damage.", source: "site" },
      { name: "Pipe Replacement", descriptor: "Replacing aging and failing pipework.", source: "site" },
      { name: "Slab Leaks / Hydro Excavation", descriptor: "Slab leak specialties and hydro excavation.", source: "sample" },
    ],
  },
  {
    slug: "national-brick-pavers",
    url: "https://www.bricksandblocks.com/",
    businessName: "National Brick Pavers",
    niche: "pavers",
    nicheLabel: "Paver & hardscape company",
    city: "Pompano Beach",
    state: "FL",
    hours: "Mo-Th 07:30-15:30, Fr 07:30-13:30, Sa-Su Closed",
    serviceArea: "Broward and Palm Beach Counties",
    services: [
      { name: "Paver Driveways", descriptor: "Brick and concrete paver driveway installation.", source: "site" },
      { name: "Pool Decks & Patios", descriptor: "Pool deck and patio installation and renovation.", source: "site" },
      { name: "Outdoor Kitchens / Outdoor Living", descriptor: "Custom outdoor living builds, including outdoor kitchens.", source: "site" },
      { name: "Retaining Walls", descriptor: "Retaining and ornamental walls.", source: "site" },
      { name: "Tile and Stone", descriptor: "Tile, stone, pool coping and tile work.", source: "site" },
      { name: "Paver Repairs", descriptor: "Repairs of existing paver work, including re-sanding.", source: "site" },
      { name: "Artificial Turf", descriptor: "Artificial turf installation.", source: "site" },
      { name: "Pressure Cleaning & Sealing", descriptor: "Paver maintenance — cleaning, re-sanding and sealing.", source: "site" },
      { name: "Walkways", descriptor: "Brick and stone walks and steps installation.", source: "site" },
      { name: "Pool Renovations", descriptor: "Pool renovations including Diamond Brite, ponds and waterfalls.", source: "site" },
    ],
  },
  {
    slug: "anco-precision",
    url: "https://www.ancoprecision.com/",
    businessName: "Anco Precision Inc.",
    niche: "manufacturer",
    nicheLabel: "CNC machining / contract manufacturer",
    city: "Deerfield Beach",
    state: "FL",
    hours: "Mon–Fri: 08:00-16:30",
    serviceArea: "Online machine shop based in Deerfield Beach, FL — customers send drawings and CAD files from anywhere",
    services: [
      { name: "CNC Milling", descriptor: "Custom milled parts for prototypes, replacement parts and production runs.", source: "site" },
      { name: "CNC Turning", descriptor: "Shafts, bushings, spacers and similar round parts.", source: "site" },
      { name: "Screw Machining", descriptor: "Efficient repeat production for higher-volume turned components.", source: "site" },
      { name: "Wire EDM", descriptor: "Detailed profiles and intricate features where conventional cutting falls short.", source: "site" },
      { name: "3D Printing", descriptor: "Prototype parts built directly from 3D CAD models.", source: "site" },
      { name: "CAD Design & Reverse Engineering", descriptor: "A sketch, sample or incomplete drawing turned into manufacturing-ready CAD.", source: "site" },
      { name: "Replacement Parts & Reverse Engineering", descriptor: "Reproducing discontinued or unavailable components from a part or sample.", source: "site" },
      { name: "Emergency & Rush Machining", descriptor: "Priority support for equipment-down and urgent repair parts.", source: "site" },
      { name: "Fixtures, Jigs & Tooling", descriptor: "Custom fixtures, nests, soft jaws, locating plates and production tooling.", source: "site" },
      { name: "Small-Batch Production", descriptor: "Low-volume and repeat production without high-volume commitments.", source: "site" },
    ],
  },
  {
    slug: "ast-manufacturing",
    url: "https://astmanufacturing.com/",
    businessName: "AST Manufacturing",
    niche: "manufacturer",
    nicheLabel: "Sheet-metal fabrication + CNC machining",
    city: "Grand Prairie",
    state: "TX",
    serviceArea: "Delivery across Dallas–Fort Worth plus Waco, Austin, Mineral Wells and Houston",
    services: [
      { name: "Precision Laser Cutting", descriptor: "Fiber laser cutting on Amada equipment, held to print tolerances.", source: "site" },
      { name: "CNC Machining & Milling", descriptor: "3- and 4-axis Haas machining centers with automation.", source: "site" },
      { name: "CNC Press Brake Forming", descriptor: "Cut parts formed to final specification — no second vendor.", source: "site" },
      { name: "CNC Routing", descriptor: "Metal and composite routing, large-format sheets, multiple setups.", source: "site" },
      { name: "Band Saw Cutting", descriptor: "Bar, tube, pipe and structural shapes cut to length.", source: "site" },
      { name: "3D Printing", descriptor: "Prove a prototype or fixture before cutting metal.", source: "site" },
      { name: "Custom Metal Assembly", descriptor: "Forming and assembly close out the job — the finished product ships.", source: "site" },
      { name: "Concept Design through Production", descriptor: "Prototypes, individual components and complete assemblies under one roof.", source: "site" },
      { name: "Instant Quoting", descriptor: "Send a DXF, STEP or dimensioned PDF plus quantity and get price and lead time.", source: "site" },
    ],
  },
  {
    slug: "cable-marine",
    url: "https://www.cablemarine.com/",
    businessName: "Cable Marine",
    niche: "marine",
    nicheLabel: "Yacht repair boatyard",
    city: "Fort Lauderdale",
    state: "FL",
    serviceArea: "Two Fort Lauderdale yards (East: 1517 SE 16th Street · West: 2491 SW SR 84) serving South Florida",
    services: [
      { name: "Mechanical / Technical", descriptor: "Engines, transmissions, steering and running gear — service and repair.", source: "site" },
      { name: "Electrical", descriptor: "Troubleshooting, rewiring, navigation and power system installation.", source: "site" },
      { name: "Hydraulics", descriptor: "Steering, thrusters, davits and stabilizers — design, install, maintain.", source: "site" },
      { name: "Systems Integration", descriptor: "Mechanical, electrical, hydraulic and electronic systems made to work as one.", source: "site" },
      { name: "Fiberglass & Composite", descriptor: "Structural repair — hulls, decks, bulkheads, stringers — plus minor repair, customization and restorations.", source: "site" },
      { name: "Haul & Bottom", descriptor: "Survey haul-outs, transport load/offload, antifouling and underwater metal coatings.", source: "site" },
      { name: "Finish Work / Paint", descriptor: "Full repaints, touch-ups, faux finish and precision caulking.", source: "site" },
      { name: "Carpentry", descriptor: "Fine woodwork, custom interiors and cabinetry, glass and window repair/replacement, restorations.", source: "site" },
      { name: "Refits", descriptor: "From total yacht restoration to small upgrades.", source: "site" },
      { name: "Pre-Market Preparation", descriptor: "Working with brokers and surveyors to ready a yacht for sale.", source: "site" },
    ],
  },
  {
    slug: "a2z-marine",
    url: "http://a2zmarine4less.com/",
    businessName: "A2Z Marine 4 Less",
    niche: "marine",
    nicheLabel: "Marine services (mobile available)",
    city: "Fort Lauderdale",
    state: "FL",
    hours: "Mon–Sat: 8:00 AM – 6:00 PM",
    serviceArea: "All locations within a 200-mile radius of Fort Lauderdale — Broward, Miami-Dade, Palm Beach, the Treasure Coast, the Florida Keys and the Gulf Coast; mobile service available",
    services: [
      { name: "Bottom Paint (Antifouling)", descriptor: "Protects the hull against fouling and improves performance — from $35/ft.", source: "site" },
      { name: "Service & Maintenance", descriptor: "Inboard and outboard engines, outdrives and electrical systems — from $135/hr.", source: "site" },
      { name: "Boat Buying & Selling", descriptor: "Inspection and paperwork included.", source: "site" },
      { name: "Professional Detailing", descriptor: "Washing, waxing, gelcoat polishing and interior cleaning — from $10/ft.", source: "site" },
      { name: "Marine Salvage & Boat Removal", descriptor: "From docks, homes, storage or the water, within 24 hours.", source: "site" },
      { name: "Boat Storage", descriptor: "Dry storage with 24/7 surveillance and monthly plans — from $199.", source: "site" },
      { name: "Boat Transport", descriptor: "Overland throughout Florida and the US, fully insured — from $149.", source: "site" },
      { name: "Boat Trailer Service", descriptor: "Brakes, lights, axles, tires and bearings — from $99/hr.", source: "site" },
      { name: "Marine Upholstery", descriptor: "Seats, cushions, bolsters and custom canvas — from $349.", source: "site" },
      { name: "Flooring & Non-Skid", descriptor: "SeaDek, synthetic teak, carpet and Hydroturf — from $40/ft².", source: "site" },
    ],
  },
  {
    slug: "prestige-auto",
    url: "https://prestige.tires/",
    businessName: "Prestige Auto Repairs & Tires",
    niche: "auto-repair",
    nicheLabel: "Auto repair shop (European, exotic & EV)",
    city: "Fort Lauderdale",
    state: "FL",
    hours: "Fort Lauderdale: Mon–Sat 8 AM – 7 PM, closed Sunday · Oakland Park: Open 7 days, 8 AM – 7 PM, 24-hour key drop-off",
    serviceArea: "Fort Lauderdale and Oakland Park — drivers come from about 30 miles around",
    services: [
      { name: "Full Synthetic Oil Change", descriptor: "OEM-quality filter, fluid top-off and a multi-point photo inspection.", source: "site" },
      { name: "Check Engine & Safety Scan", descriptor: "Free Level 1 diagnostic — all-module scan, warning lights, brake, tire and alignment check.", source: "site" },
      { name: "Brake Repair", descriptor: "Pads, rotors, calipers and brake fluid.", source: "site" },
      { name: "Car A/C Repair", descriptor: "Recharge and repair for R134a and R1234yf systems.", source: "site" },
      { name: "Tires & Alignment", descriptor: "Tires, alignment checks and service.", source: "site" },
      { name: "European & Exotic Service", descriptor: "Ferrari, Lamborghini, McLaren, Bentley, Rolls-Royce, Maserati, Aston Martin, BMW, Mercedes-Benz, Porsche, Audi and Land Rover — factory-level diagnostics.", source: "site" },
      { name: "Tesla & EV Service", descriptor: "Suspension, brakes, tires, A/C and diagnostics (EV batteries not serviced).", source: "site" },
      { name: "Collision, Body & Paint", descriptor: "In-house body and paint, with insurance-claim documentation.", source: "site" },
      { name: "Digital Photo Inspection & Written Estimates", descriptor: "Every finding photographed and sent to the customer's phone before approval.", source: "site" },
      { name: "Fleet & Business Accounts", descriptor: "Priority scheduling, consolidated billing and photo-documented estimates.", source: "site" },
    ],
  },
  {
    slug: "autoscope",
    url: "https://www.autoscopecarcare.com/",
    businessName: "Autoscope European Car Care",
    niche: "auto-repair",
    nicheLabel: "European auto repair shop",
    city: "Dallas",
    state: "TX",
    hours: "Monday–Friday 7:30 AM – 6:00 PM; Closed Saturday & Sunday (both locations)",
    serviceArea: "Dallas (White Rock) and Plano — serving Dallas, Plano and surrounding communities",
    services: [
      { name: "Pre-Purchase Inspection", descriptor: "A thorough inspection before committing to a used European car.", source: "site" },
      { name: "Tires & Alignments", descriptor: "Balance, align and fit the correct tires.", source: "site" },
      { name: "Oil Change Service", descriptor: "Manufacturer-spec oil and filters, on schedule.", source: "site" },
      { name: "Check Engine Light", descriptor: "Reads the factory computer systems to find the real cause, not just the symptom.", source: "site" },
      { name: "Transmission Service", descriptor: "Automatic transmissions of European drivetrains.", source: "site" },
      { name: "Maintenance & Repairs", descriptor: "Preventative care every six months.", source: "site" },
      { name: "Electrical & Battery", descriptor: "From battery swaps to tracing complex electrical faults.", source: "site" },
      { name: "Suspension & Brakes", descriptor: "Diagnose and restore stopping and handling.", source: "site" },
      { name: "Air Conditioning (A/C)", descriptor: "Climate system service.", source: "site" },
      { name: "Performance Services", descriptor: "Track alignments, big-brake kits and exhaust.", source: "site" },
    ],
  },
  {
    slug: "ak-building-services",
    url: "https://www.akbuildingservices.com/",
    businessName: "AK Building Services",
    niche: "b2b-services",
    nicheLabel: "Commercial cleaning / janitorial (B2B)",
    city: "Fort Lauderdale",
    state: "FL",
    hours: "Mon-Fri 9am-6pm (24/7 emergency support)",
    serviceArea: "Miami-Dade, Broward, Palm Beach and Martin Counties, Central Florida and the Treasure Coast — offices in Fort Lauderdale, West Palm Beach and Orlando",
    services: [
      { name: "Office Cleaning", descriptor: "Clean, professional workspaces — break rooms, kitchens, trash removal, vacuuming and bathroom sanitation.", source: "site" },
      { name: "Medical Facility Cleaning", descriptor: "Hygiene and compliance cleaning for hospitals, clinics and labs.", source: "site" },
      { name: "School & University Cleaning", descriptor: "Daily and weekly cleaning and sanitizing of classrooms, bathrooms and kitchens.", source: "site" },
      { name: "Condominium Cleaning", descriptor: "Common areas, clubhouse cleaning, pool maintenance and after-hours maintenance calls.", source: "site" },
      { name: "Carpet & Floor Care", descriptor: "Deep cleaning, stripping, waxing, buffing, polishing and tile & grout cleaning.", source: "site" },
      { name: "Green Cleaning", descriptor: "LEED-certified program with Green Seal products, HEPA vacuums and microfiber.", source: "site" },
      { name: "Emergency Services", descriptor: "Same-day and 24/7 response for floods, leaks, mold and overflowing toilets.", source: "site" },
      { name: "Construction Clean-Up", descriptor: "Dust-free clean-up during and after construction, window etching removal and polishing.", source: "site" },
      { name: "Day Porter / Day Cleaning", descriptor: "A daytime program ideal for small businesses — no nighttime keys or codes needed.", source: "site" },
      { name: "Nighttime Janitorial Services", descriptor: "Day or night scheduling; every staff member background-checked.", source: "site" },
    ],
  },
  {
    slug: "it-yall",
    url: "https://www.ityall.com/",
    businessName: "IT Y'ALL",
    niche: "b2b-services",
    nicheLabel: "Managed IT services for SMBs (B2B)",
    city: "Dallas",
    state: "TX",
    hours: "Mon–Fri: 08:00-18:00 (24/7 IT services promoted)",
    serviceArea: "Dallas–Fort Worth and greater Texas — Dallas, Fort Worth, Arlington, Plano, Irving, Garland, Grand Prairie, McKinney, Austin, Houston",
    services: [
      { name: "Monthly Managed IT Support", descriptor: "Flat-rate plans with unlimited support and no hidden fees.", source: "site" },
      { name: "Remote & Onsite Support", descriptor: "Fast remote fixes; on-site across DFW for complex problems.", source: "site" },
      { name: "IT Consulting", descriptor: "Strategy and execution to keep a business at the forefront.", source: "site" },
      { name: "Cloud Services", descriptor: "Cloud storage, backup and cybersecurity via Microsoft — no on-site hardware.", source: "site" },
      { name: "Microsoft 365", descriptor: "Setup, securing, licensing and migration, plus Teams, email and file support.", source: "site" },
      { name: "Cyber Security", descriptor: "Prevention against malware, viruses, hackers and human error.", source: "site" },
      { name: "Data Backup & Recovery", descriptor: "Remote automatic backups plus disaster recovery.", source: "site" },
      { name: "IT Audit", descriptor: "Evaluates systems, finds inefficiencies and streamlines the network.", source: "site" },
      { name: "Hourly Help Desk", descriptor: "Hourly help without a monthly plan.", source: "site" },
      { name: "Custom Web & SaaS Development", descriptor: "Design, build and scale secure software.", source: "site" },
    ],
  },
  {
    slug: "essig-pools",
    url: "https://essigpools.com/",
    businessName: "Essig Pools",
    niche: "field-service",
    nicheLabel: "Pool builder / pool service crews",
    city: "Miramar",
    state: "FL",
    serviceArea: "All of South Florida — Miami, Fort Lauderdale, Boca Raton, Parkland, Aventura, Coral Gables, Coral Springs, Davie, Deerfield Beach and more",
    services: [
      { name: "New Pools", descriptor: "Custom new pool construction with a lifetime structural warranty — its Smart Pool is built with Shotcrete, 15% stronger than Florida Code.", source: "site" },
      { name: "Commercial Pools", descriptor: "Commercial pool construction.", source: "site" },
      { name: "Renovations", descriptor: "Pool and outdoor renovations and revitalization.", source: "site" },
      { name: "Repairs", descriptor: "Repairs from a full in-house service department.", source: "site" },
      { name: "Warranty Service", descriptor: "A dedicated warranty department.", source: "site" },
      { name: "Energy Saving Upgrades", descriptor: "Energy-saving pool upgrades.", source: "site" },
      { name: "Smart Pool", descriptor: "Its signature stronger, safer, easy-maintain pool package.", source: "site" },
      { name: "Water Features", descriptor: "Waterfalls, fun jets and fountains.", source: "site" },
      { name: "Outdoor Kitchens", descriptor: "Custom outdoor kitchens.", source: "site" },
      { name: "Pergolas", descriptor: "Shade structures with TV connections, fans and screens.", source: "site" },
    ],
  },
  {
    slug: "prestige-landscape",
    url: "https://www.prestigelandscapedesign.com/",
    businessName: "Prestige Landscape & Design",
    niche: "field-service",
    nicheLabel: "Landscaping / hardscaping crews",
    city: "Dallas",
    state: "TX",
    serviceArea: "Across the DFW area — Dallas plus Richardson, Garland, Mesquite and the Lakewood, Preston Hollow, Highland Park and Lake Highlands neighborhoods",
    services: [
      { name: "Residential Landscaping", descriptor: "Custom design, paver patios and hardscaping for curb appeal.", source: "site" },
      { name: "Commercial Landscaping", descriptor: "For offices, retail centers and HOAs — durability, safety and visual impact.", source: "site" },
      { name: "Pavers", descriptor: "Patio, walkway and driveway paver installation.", source: "site" },
      { name: "Irrigation", descriptor: "Sprinkler installation, smart-controller upgrades and drip systems.", source: "site" },
      { name: "Maintenance", descriptor: "Seasonal upkeep and bed touch-ups.", source: "site" },
      { name: "Concrete", descriptor: "Reinforced driveways and walkways with broom finishes.", source: "site" },
      { name: "Sod & Turf", descriptor: "Sod installation plus pet-friendly synthetic turf.", source: "site" },
      { name: "Landscape Designs", descriptor: "2D plans and photorealistic 3D renderings before building.", source: "site" },
      { name: "Landscape Lighting", descriptor: "Low-voltage LED path and accent lighting.", source: "site" },
      { name: "Drainage", descriptor: "French drains, regrading and downspout tie-ins.", source: "site" },
    ],
  },
];

/** Normalize a site URL for example matching: host without "www." plus
 * path without a trailing slash, lowercased. The demo flow stores the
 * site URL on the lead row in several shapes (www / non-www, trailing
 * slash or not), so both sides go through this before comparing. */
export function normalizeExampleSiteUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return '';
  }
}

/** The example pack for a simulated site's URL, or null when the site
 * is not one of the 16 known B2B examples. */
export function examplePackForSiteUrl(siteUrl: unknown): B2BExamplePack | null {
  const key = normalizeExampleSiteUrl(siteUrl);
  if (!key) return null;
  return B2B_EXAMPLE_PACKS.find((p) => normalizeExampleSiteUrl(p.url) === key) ?? null;
}

/** The example pack for a stamped slug, or null. */
export function examplePackBySlug(slug: unknown): B2BExamplePack | null {
  if (typeof slug !== 'string' || !slug) return null;
  return B2B_EXAMPLE_PACKS.find((p) => p.slug === slug) ?? null;
}

/** The services to name first in the simulation: the business's OWN
 * site-sourced services lead, in pack order; off-site-evidenced ones
 * fill only when a site had fewer real services than requested. */
export function topExampleServices(pack: B2BExamplePack, count = 3): ExampleService[] {
  const own = pack.services.filter((s) => s.source === 'site');
  const fill = pack.services.filter((s) => s.source !== 'site');
  return [...own, ...fill].slice(0, count);
}

function formatServiceLine(s: ExampleService): string {
  return `- ${s.name} — ${s.descriptor}`;
}

/** The EXAMPLE SERVICES LAYER for one B2B example pack: the facts block
 * appended to a sample simulation's system prompt, so the persona can
 * answer "what do you offer / do you do X in my area" from the
 * business's real services, hours and service area instead of generic
 * filler. */
export function buildExampleServicesLayer(pack: B2BExamplePack): string {
  const lines: string[] = [
    `EXAMPLE SERVICES — ${pack.businessName} (${pack.nicheLabel}, ${pack.city}, ${pack.state}):`,
    `These are the business's real services, from its own website. When the visitor asks what the business offers, whether it does something specific, or what it would cost to get started, answer from this list first — name the top services before anything generic:`,
    ...pack.services.map(formatServiceLine),
  ];
  if (pack.hours) lines.push(`Hours (from the site): ${pack.hours}`);
  if (pack.serviceArea) lines.push(`Service area (from the site): ${pack.serviceArea}`);
  lines.push(
    `If the visitor asks about something not on this list, be honest that it is not listed among ${pack.businessName}'s services on its site, and offer to take their name and number so the business can confirm — never invent a service, a price or a guarantee the site does not state.`,
  );
  return lines.join('\n');
}
