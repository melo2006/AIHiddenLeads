// REALTOR EXAMPLE LISTINGS PACKS (Batch 2, 2026-11-12): for each of the
// 14 one-click demo examples on /agents/realtors, the listings the
// simulated Aspen leads with when a demo session runs on that site.
// Site listings were extracted from each agent's own pages and are
// marked source: "site"; where a site's own listings were thin or
// unreachable, plausible properties for that city fill the pack, marked
// source: "sample" — the marking lives in the data, honestly. This is
// the Edge runtime copy; the client-side canonical copy lives in
// src/data/realtorExampleListings.ts and a parity test
// (src/test/realtor-example-listings.test.ts) keeps them in step.
import { buildRealtorDiscoveryLayer, buildVerbalCaptureConfirmation } from './realtor-discovery.ts';
export type ExampleListingType = 'house' | 'condo' | 'townhouse' | 'land' | 'multi';

export interface ExampleListing {
  address: string;
  area: string;
  type: ExampleListingType;
  beds?: number;
  baths?: number;
  garage?: number;
  pool?: boolean;
  waterView?: boolean;
  sqft?: number;
  yearBuilt?: number;
  renovated?: string;
  hoaMonthly?: number;
  parking?: string;
  features?: string;
  price?: number;
  status?: string;
  /** Short human name for the listing, the way the agent's site would say it ("the Pinecrest estate on SW 67th Court") — Aspen names listings by descriptor. */
  descriptor: string;
  /** The listing's own tagline / first line, for human colour when presenting it. */
  tagline: string;
  /** "site" = extracted from the agent's own website; "sample" = plausible fill for that city, marked honestly in the data. */
  source: 'site' | 'sample';
}

export interface RealtorExamplePack {
  slug: string;
  url: string;
  agentName: string;
  city: string;
  listings: ExampleListing[];
}

export const REALTOR_EXAMPLE_PACKS: RealtorExamplePack[] = [
  {
    slug: "ann-chamberlain",
    url: "https://www.annchamberlain.com/",
    agentName: "Ann Chamberlain",
    city: "Fort Lauderdale",
    listings: [
      { address: "100 N Federal Highway #1409", area: "Downtown Fort Lauderdale", type: "condo", descriptor: "the high-rise condo at 100 North Federal Highway", tagline: "Skyline and river views from the 14th floor, downtown.", source: "site" },
      { address: "1340 S Ocean Boulevard #303", area: "Pompano Beach", type: "condo", waterView: true, descriptor: "the oceanfront condo on South Ocean Boulevard in Pompano Beach", tagline: "Across from the sand on South Ocean Boulevard.", source: "site" },
      { address: "4900 N Ocean Boulevard #1209", area: "Lauderdale-By-The-Sea", type: "condo", waterView: true, descriptor: "the Lauderdale-By-The-Sea condo on North Ocean Boulevard", tagline: "Beach-town living in Lauderdale-By-The-Sea.", source: "site" },
      { address: "5431 NE 22nd Terrace", area: "Fort Lauderdale", type: "house", descriptor: "the house on NE 22nd Terrace", tagline: "A single-family home east of US-1 in Fort Lauderdale.", source: "site" },
      { address: "95 NE 41st Street", area: "Oakland Park", type: "house", descriptor: "the Oakland Park property on NE 41st Street", tagline: "In growing Oakland Park, minutes to Wilton Manors and the beach.", source: "site" },
      { address: "2720 NE 49th Street", area: "Coral Ridge Isles, Fort Lauderdale", type: "house", beds: 3, baths: 2, garage: 2, pool: true, waterView: false, price: 925000, sqft: 1800, yearBuilt: 1973, renovated: "original condition — a blank canvas for your own finish", parking: "2-car garage plus driveway", features: "private pool, garden tub in the primary bath, screened balcony", descriptor: "the Coral Ridge Isles house on NE 49th Street", tagline: "Pool home in a quiet, boater-friendly neighborhood.", source: "sample" },
      { address: "620 SE 12th Street #5", area: "Rio Vista, Fort Lauderdale", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 615000, sqft: 1100, yearBuilt: 2009, renovated: "original condition — a blank canvas for your own finish", hoaMonthly: 465, parking: "1 garage space", features: "resort-style pool and amenities, community clubhouse", descriptor: "the Rio Vista condo on SE 12th Street", tagline: "Boutique-building condo living in Rio Vista.", source: "sample" },
      { address: "4181 NW 5th Street #307", area: "Plantation", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 319000, sqft: 1130, yearBuilt: 1980, renovated: "2023", hoaMonthly: 510, parking: "1 covered assigned space", features: "resort-style pool and amenities, chef's kitchen with quartz counters, walk-in closets", descriptor: "the Plantation condo on NW 5th Street", tagline: "An affordable 2 bed, 2 bath in the heart of Plantation.", source: "sample" },
      { address: "1830 Radius Drive #1121", area: "Hollywood", type: "condo", beds: 1, baths: 1, pool: true, waterView: false, price: 389000, sqft: 840, yearBuilt: 1983, renovated: "2020 — updated throughout", hoaMonthly: 450, parking: "1 garage space", features: "resort-style pool and amenities, in-unit laundry, wood-look floors throughout", descriptor: "the Hollywood condo at Radius", tagline: "Resort-style amenities near Young Circle in Hollywood.", source: "sample" },
      { address: "2900 NE 14th Street #903", area: "Galt Ocean Mile, Fort Lauderdale", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, price: 699000, sqft: 1100, yearBuilt: 1993, renovated: "2022 — kitchen and baths updated", hoaMonthly: 545, parking: "1 garage space", features: "water views, resort-style pool and amenities, walk-in closets", descriptor: "the Galt Ocean Mile condo on NE 14th Street", tagline: "On the sand at the Galt Ocean Mile \u2014 Intracoastal behind, ocean in front.", source: "sample" },
    ],
  },
  {
    slug: "ashley-cusack",
    url: "https://ashleycusack.com/",
    agentName: "Ashley Cusack",
    city: "Coral Gables",
    listings: [
      { address: "1245 Algardi Avenue", area: "Coral Gables", type: "house", price: 2495000, descriptor: "the house at 1245 Algardi Avenue in the Gables", tagline: "Old Spanish charm on one of Coral Gables' prettiest streets.", source: "site" },
      { address: "1225 Algardi Avenue", area: "Coral Gables", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 2195000, sqft: 2190, yearBuilt: 2003, renovated: "2022 — kitchen and baths updated", parking: "2-car garage plus driveway", features: "private pool, walk-in closets, primary suite retreat", descriptor: "the Algardi Avenue neighbor at 1225", tagline: "Four beds with a pool, a few doors down on Algardi.", source: "sample" },
      { address: "718 Anastasia Avenue", area: "Coral Gables", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 1650000, sqft: 1700, yearBuilt: 2009, renovated: "original condition — a blank canvas for your own finish", parking: "2-car garage plus driveway", features: "garden tub in the primary bath", descriptor: "the Anastasia Avenue house", tagline: "Classic Gables cottage living near the Biltmore.", source: "sample" },
      { address: "1300 Asturia Avenue", area: "Coral Gables", type: "house", beds: 5, baths: 4, garage: 2, pool: true, waterView: false, price: 3350000, sqft: 3380, yearBuilt: 1990, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "2-car garage plus driveway", features: "private pool, hurricane impact windows, chef's kitchen with quartz counters", descriptor: "the Asturia Avenue estate", tagline: "Five beds of gracious Gables living with a resort pool.", source: "sample" },
      { address: "515 Barbarossa Avenue", area: "Coral Gables", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: true, price: 4895000, sqft: 2490, yearBuilt: 2007, renovated: "2022 — kitchen and baths updated", parking: "2-car garage plus driveway", features: "water views, private pool, open-plan living", descriptor: "the Barbarossa Avenue waterfront", tagline: "On the Coral Gables waterway \u2014 dock your boat out back.", source: "sample" },
      { address: "2610 Columbus Boulevard", area: "Coral Gables", type: "house", beds: 3, baths: 3, garage: 1, pool: true, waterView: false, price: 1875000, sqft: 1580, yearBuilt: 1986, renovated: "2023", hoaMonthly: 140, parking: "1-car garage plus driveway", features: "private pool, chef's kitchen with quartz counters, marina access nearby", descriptor: "the Columbus Boulevard house", tagline: "Updated and move-in ready in the heart of the Gables.", source: "sample" },
      { address: "1607 Algeciras Avenue", area: "Coral Gables", type: "house", beds: 4, baths: 3, garage: 2, pool: false, waterView: false, price: 2050000, sqft: 2470, yearBuilt: 2002, renovated: "2021 — renovated kitchen, baths and floors", parking: "2-car garage plus driveway", features: "covered patio, primary suite retreat", descriptor: "the Algeciras Avenue house", tagline: "Tree-lined street, generous rooms, true Gables character.", source: "sample" },
      { address: "925 Anastasia Avenue #4", area: "Coral Gables", type: "condo", beds: 2, baths: 2, pool: false, waterView: false, price: 785000, sqft: 1100, yearBuilt: 1968, renovated: "2023", hoaMonthly: 490, parking: "1 covered assigned space", features: "chef's kitchen with quartz counters", descriptor: "the Anastasia Avenue condo", tagline: "A low-maintenance way into Coral Gables \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "5812 Maynada Street", area: "Coral Gables", type: "house", beds: 5, baths: 5, garage: 2, pool: true, waterView: false, price: 3950000, sqft: 3060, yearBuilt: 2002, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "2-car garage plus driveway", features: "private pool, screened balcony, wood-look floors throughout", descriptor: "the Maynada Street estate", tagline: "South Gables scale \u2014 five beds, five baths, and a summer kitchen.", source: "sample" },
      { address: "3401 Pine Tree Drive", area: "Miami Beach", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: true, price: 5250000, sqft: 2400, yearBuilt: 1997, renovated: "2020 — updated throughout", parking: "2-car garage plus driveway", features: "water views, private pool, in-unit laundry", descriptor: "the Pine Tree Drive house on Miami Beach", tagline: "Bay-side Miami Beach living on storied Pine Tree Drive.", source: "sample" },
    ],
  },
  {
    slug: "aurelia-perez",
    url: "https://www.aureliaperez.com/",
    agentName: "Aurelia Perez",
    city: "Fort Lauderdale",
    listings: [
      { address: "412 Las Olas Isle", area: "Las Olas Isles, Fort Lauderdale", type: "house", waterView: true, price: 2450000, descriptor: "the waterfront home at 412 Las Olas Isle", tagline: "Point lot on the water in the Las Olas Isles, minutes from the beach and Las Olas Boulevard.", source: "site" },
      { address: "2300 SE 11th Street", area: "Rio Vista, Fort Lauderdale", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 1895000, sqft: 2490, yearBuilt: 2013, renovated: "original condition — a blank canvas for your own finish", parking: "2-car garage plus driveway", features: "private pool, community clubhouse", descriptor: "the Rio Vista house on SE 11th Street", tagline: "Classic Rio Vista living with a pool and room to entertain.", source: "sample" },
      { address: "2100 S Ocean Lane #1205", area: "Point of Americas, Fort Lauderdale", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, price: 875000, sqft: 1150, yearBuilt: 1972, renovated: "2023", hoaMonthly: 685, parking: "1 covered assigned space", features: "Ocean and inlet views, resort pool and spa, fitness center, 24-hour concierge and valet", descriptor: "the ocean-view condo at Point of Americas", tagline: "Wake up to the inlet and the ocean \u2014 2 bed, 2 bath with resort amenities.", source: "sample" },
      { address: "1615 SE 15th Street", area: "Harbor Beach, Fort Lauderdale", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 1249000, sqft: 1710, yearBuilt: 1982, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "2-car garage plus driveway", features: "screened balcony, garden tub in the primary bath", descriptor: "the Harbor Beach house on SE 15th Street", tagline: "A block from the sand in one of Fort Lauderdale's favorite neighborhoods.", source: "sample" },
      { address: "900 NE 18th Avenue #204", area: "Victoria Park, Fort Lauderdale", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 549000, sqft: 1140, yearBuilt: 1992, renovated: "2023", hoaMonthly: 485, parking: "1 assigned space plus guest parking", features: "resort-style pool and amenities, marina access nearby, in-unit laundry", descriptor: "the Victoria Park condo on NE 18th Avenue", tagline: "Easy-care 2 bed, 2 bath in the heart of Victoria Park.", source: "sample" },
      { address: "3040 NE 47th Street", area: "Coral Ridge, Fort Lauderdale", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: true, price: 3295000, sqft: 2350, yearBuilt: 1978, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "2-car garage plus driveway", features: "water views, private pool, screened balcony", descriptor: "the Coral Ridge waterfront on NE 47th Street", tagline: "Deep-water dockage and sunset views in Coral Ridge.", source: "sample" },
      { address: "1318 SE 12th Street", area: "Rio Vista, Fort Lauderdale", type: "house", beds: 3, baths: 3, garage: 1, pool: true, waterView: false, price: 1475000, sqft: 1660, yearBuilt: 1983, renovated: "2020 — updated throughout", parking: "1-car garage plus driveway", features: "private pool, in-unit laundry, garden tub in the primary bath", descriptor: "the second Rio Vista house, on SE 12th Street", tagline: "Charming Rio Vista cottage feel with a private pool.", source: "sample" },
      { address: "401 SW 4th Avenue #1500", area: "Downtown Fort Lauderdale", type: "condo", beds: 1, baths: 1, pool: true, waterView: true, price: 429000, sqft: 800, yearBuilt: 1979, renovated: "original condition — a blank canvas for your own finish", hoaMonthly: 405, parking: "2 assigned spaces", features: "water views, resort-style pool and amenities, garden tub in the primary bath", descriptor: "the downtown high-rise condo on SW 4th Avenue", tagline: "River views and downtown at your feet \u2014 a smart starter or pied-\u00e0-terre.", source: "sample" },
      { address: "2525 NE 32nd Street", area: "Coral Ridge Country Club, Fort Lauderdale", type: "house", beds: 5, baths: 4, garage: 3, pool: true, waterView: false, price: 2750000, sqft: 3250, yearBuilt: 1980, renovated: "2021 — renovated kitchen, baths and floors", hoaMonthly: 145, parking: "3-car garage plus driveway", features: "private pool, wood-look floors throughout, hurricane impact windows", descriptor: "the Country Club house on NE 32nd Street", tagline: "Five beds on the golf course side of Coral Ridge Country Club.", source: "sample" },
      { address: "1700 S Ocean Boulevard #8B", area: "Lauderdale Beach, Fort Lauderdale", type: "condo", beds: 3, baths: 3, pool: true, waterView: true, price: 1675000, sqft: 1650, yearBuilt: 1988, renovated: "2021 — renovated kitchen, baths and floors", hoaMonthly: 705, parking: "1 covered assigned space", features: "water views, resort-style pool and amenities, wood-look floors throughout", descriptor: "the beachfront condo on South Ocean Boulevard", tagline: "Direct ocean frontage \u2014 watch the sunrise from every room.", source: "sample" },
    ],
  },
  {
    slug: "baldemar-deleon",
    url: "https://www.baldemardeleon.com/",
    agentName: "Baldemar De Leon",
    city: "Dallas",
    listings: [
      { address: "9639 Brentgate Drive", area: "Dallas", type: "house", beds: 4, baths: 3, price: 699000, sqft: 2190, yearBuilt: 1977, renovated: "original condition — a blank canvas for your own finish", parking: "Street and driveway parking", features: "garden tub in the primary bath, marina access nearby", descriptor: "the Brentgate Drive house", tagline: "4 bed, 3 bath family home in Dallas \u2014 active now.", source: "sample" },
      { address: "5860 Marina Drive #24", area: "Garland", type: "condo", beds: 3, baths: 2, waterView: true, price: 325000, sqft: 1760, yearBuilt: 2006, renovated: "2021 — renovated kitchen, baths and floors", hoaMonthly: 825, parking: "1 assigned space plus guest parking", features: "water views, covered patio, community clubhouse", descriptor: "the Marina Drive condo in Garland", tagline: "Lake Ray Hubbard living in Garland.", source: "sample" },
      { address: "1213 Hampton Drive", area: "Forney", type: "house", beds: 4, baths: 3, price: 465000, status: "Pending", sqft: 2400, yearBuilt: 2015, renovated: "original condition — a blank canvas for your own finish", parking: "Street and driveway parking", features: "garden tub in the primary bath, wood-look floors throughout", descriptor: "the Hampton Drive house in Forney", tagline: "Four beds in Forney \u2014 currently pending.", source: "sample" },
      { address: "7423 Meadowbrook Drive", area: "Dallas", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 525000, sqft: 1710, yearBuilt: 2002, renovated: "2023", hoaMonthly: 80, parking: "2-car garage plus driveway", features: "chef's kitchen with quartz counters, primary suite retreat", descriptor: "the Meadowbrook Drive house", tagline: "Classic 3 bed in a leafy Dallas neighborhood.", source: "sample" },
      { address: "6118 Mercedes Avenue", area: "Lakewood, Dallas", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: false, price: 1175000, sqft: 2160, yearBuilt: 1978, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "2-car garage plus driveway", features: "private pool, hurricane impact windows, covered patio", descriptor: "the Mercedes Avenue house in Lakewood", tagline: "Lakewood living near White Rock Lake \u2014 pool included.", source: "sample" },
      { address: "4321 Cole Avenue #1204", area: "Uptown Dallas", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 489000, sqft: 1190, yearBuilt: 2000, renovated: "2021 — renovated kitchen, baths and floors", hoaMonthly: 540, parking: "1 covered assigned space", features: "resort-style pool and amenities, wood-look floors throughout, hurricane impact windows", descriptor: "the Uptown condo on Cole Avenue", tagline: "Uptown high-rise living \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "10215 Rosser Road", area: "Dallas", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 649000, sqft: 2370, yearBuilt: 1984, renovated: "2019 — fresh paint, new appliances and updated baths", hoaMonthly: 95, parking: "2-car garage plus driveway", features: "private pool, screened balcony, hurricane impact windows", descriptor: "the Rosser Road house", tagline: "Updated 4 bed with a pool in north Dallas.", source: "sample" },
      { address: "2914 Mapleleaf Lane", area: "Dallas", type: "townhouse", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 415000, sqft: 1600, yearBuilt: 1964, renovated: "2021 — renovated kitchen, baths and floors", hoaMonthly: 185, parking: "1 assigned space plus driveway", features: "wood-look floors throughout, covered patio", descriptor: "the Mapleleaf Lane townhouse", tagline: "Low-maintenance townhouse in Dallas proper.", source: "sample" },
      { address: "8810 Lakemont Drive", area: "Dallas", type: "house", beds: 5, baths: 5, garage: 3, pool: true, waterView: true, price: 1395000, sqft: 3220, yearBuilt: 1967, renovated: "2022 — kitchen and baths updated", parking: "3-car garage plus driveway", features: "water views, private pool, open-plan living", descriptor: "the Lakemont Drive house", tagline: "Five beds near the lake with room for everyone.", source: "sample" },
      { address: "1515 Main Street #3801", area: "Downtown Dallas", type: "condo", beds: 3, baths: 3, pool: true, waterView: false, price: 925000, sqft: 1730, yearBuilt: 2006, renovated: "2021 — renovated kitchen, baths and floors", hoaMonthly: 795, parking: "1 assigned space plus guest parking", features: "resort-style pool and amenities, covered patio, community clubhouse", descriptor: "the downtown penthouse on Main Street", tagline: "Skyline views from a Main Street penthouse floor.", source: "sample" },
    ],
  },
  {
    slug: "danielle-lazier",
    url: "https://daniellelazier.com/",
    agentName: "Danielle Lazier",
    city: "San Francisco",
    listings: [
      { address: "3861 20th Street", area: "Noe Valley, San Francisco", type: "house", beds: 3, baths: 3, price: 2895000, sqft: 1700, yearBuilt: 1971, renovated: "2022 — kitchen and baths updated", hoaMonthly: 215, parking: "Circular driveway", features: "open-plan living, walk-in closets", descriptor: "the Noe Valley house on 20th Street", tagline: "Sunny Noe Valley Victorian living \u2014 3 bed, 3 bath.", source: "sample" },
      { address: "2150 Leavenworth Street", area: "Russian Hill, San Francisco", type: "house", beds: 4, baths: 4, waterView: true, price: 4650000, sqft: 2160, yearBuilt: 1966, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "Circular driveway", features: "water views, hurricane impact windows, in-unit laundry", descriptor: "the Russian Hill house on Leavenworth", tagline: "Bay glimpses and classic bones on Russian Hill.", source: "sample" },
      { address: "3655 Fillmore Street #204", area: "Marina District, San Francisco", type: "condo", beds: 2, baths: 2, waterView: false, price: 1495000, sqft: 1130, yearBuilt: 1996, renovated: "2019 — fresh paint, new appliances and updated baths", hoaMonthly: 580, parking: "1 covered assigned space", features: "hurricane impact windows", descriptor: "the Marina condo on Fillmore Street", tagline: "2 bed, 2 bath a stroll from the Marina Green.", source: "sample" },
      { address: "1177 California Street #1705", area: "Nob Hill, San Francisco", type: "condo", beds: 2, baths: 2, waterView: true, price: 1275000, sqft: 1250, yearBuilt: 2006, renovated: "2021 — renovated kitchen, baths and floors", hoaMonthly: 570, parking: "1 assigned space plus guest parking", features: "water views, covered patio, community clubhouse", descriptor: "the Nob Hill condo on California Street", tagline: "High-floor views over Nob Hill and downtown.", source: "sample" },
      { address: "2820 Scott Street", area: "Pacific Heights, San Francisco", type: "house", beds: 5, baths: 5, waterView: true, price: 7950000, sqft: 3090, yearBuilt: 1959, renovated: "2020 — updated throughout", parking: "Driveway parking for several cars", features: "water views, primary suite retreat, open-plan living", descriptor: "the Pacific Heights house on Scott Street", tagline: "Five beds of Pacific Heights grandeur.", source: "sample" },
      { address: "4348 26th Street", area: "Noe Valley, San Francisco", type: "house", beds: 4, baths: 3, waterView: false, price: 3395000, sqft: 2280, yearBuilt: 2005, renovated: "original condition — a blank canvas for your own finish", parking: "Street and driveway parking", features: "garden tub in the primary bath, wood-look floors throughout", descriptor: "the second Noe Valley house, on 26th Street", tagline: "Four beds above Noe Valley with a garden level.", source: "sample" },
      { address: "88 King Street #912", area: "Mission Bay, San Francisco", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 1095000, sqft: 1260, yearBuilt: 2009, renovated: "original condition — a blank canvas for your own finish", hoaMonthly: 580, parking: "2 assigned spaces", features: "resort-style pool and amenities, garden tub in the primary bath", descriptor: "the Mission Bay condo on King Street", tagline: "Modern 2 bed, 2 bath across from the ballpark.", source: "sample" },
      { address: "145 Gardenside Drive", area: "Glen Park, San Francisco", type: "house", beds: 3, baths: 3, waterView: false, price: 2175000, sqft: 1630, yearBuilt: 1961, renovated: "2022 — kitchen and baths updated", hoaMonthly: 75, parking: "Circular driveway", features: "open-plan living, walk-in closets", descriptor: "the Glen Park house on Gardenside Drive", tagline: "Village living in Glen Park \u2014 3 bed, 3 bath.", source: "sample" },
      { address: "3011 Fillmore Street #3", area: "Cow Hollow, San Francisco", type: "condo", beds: 2, baths: 2, waterView: false, price: 1695000, sqft: 1140, yearBuilt: 1974, renovated: "2023", hoaMonthly: 555, parking: "1 assigned space plus guest parking", features: "marina access nearby, chef's kitchen with quartz counters", descriptor: "the Cow Hollow flat on Fillmore", tagline: "A classic San Francisco flat in Cow Hollow.", source: "sample" },
      { address: "3964 Cesar Chavez Street", area: "Mission District, San Francisco", type: "house", beds: 3, baths: 3, waterView: false, price: 1995000, sqft: 1700, yearBuilt: 1991, renovated: "2022 — kitchen and baths updated", hoaMonthly: 215, parking: "Circular driveway", features: "open-plan living, walk-in closets", descriptor: "the Mission house on Cesar Chavez", tagline: "Sun and space in the Mission \u2014 3 bed, 3 bath.", source: "sample" },
    ],
  },
  {
    slug: "gian-sexsmith",
    url: "https://sexsmithrealty.com/",
    agentName: "Gian Sexsmith",
    city: "Salt Lake City",
    listings: [
      { address: "Millstream Lane", area: "Wasatch Hills / Millcreek", type: "house", sqft: 2950, price: 1049000, status: "Active", descriptor: "the East Bench rambler on Millstream Lane", tagline: "Tucked away on a gentle corner lot along peaceful Millstream Lane \u2014 top-tier Millcreek living.", source: "site" },
      { address: "Millcreek", area: "Millcreek", type: "townhouse", beds: 4, baths: 4, sqft: 3125, price: 825000, status: "Active", descriptor: "the 2021-built Millcreek twinhome", tagline: "Modern 2021-built twinhome \u2014 4 bed, 4 bath over three levels, minutes from Sugar House.", source: "site" },
      { address: "Bountiful East Bench", area: "Bountiful", type: "land", price: 149000, status: "Active", descriptor: "the Bountiful East Bench land", tagline: "15 acres on Bountiful's East Bench, above the Bountiful 'B' \u2014 raw land, bring your vision.", source: "site" },
      { address: "2245 E 2700 S", area: "Sugar House, Salt Lake City", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 689000, sqft: 1760, yearBuilt: 2009, renovated: "original condition — a blank canvas for your own finish", parking: "2-car garage plus driveway", features: "community clubhouse, chef's kitchen with quartz counters", descriptor: "the Sugar House house on 2700 South", tagline: "Classic Sugar House brick \u2014 3 bed, 2 bath.", source: "sample" },
      { address: "1873 E Herbert Avenue", area: "Salt Lake City", type: "house", beds: 4, baths: 3, garage: 2, pool: false, waterView: false, price: 925000, sqft: 2260, yearBuilt: 1985, renovated: "2020 — updated throughout", parking: "2-car garage plus driveway", features: "in-unit laundry, garden tub in the primary bath", descriptor: "the Herbert Avenue house", tagline: "Four beds in the avenues-adjacent east bench.", source: "sample" },
      { address: "456 E Capitol Boulevard", area: "Capitol Hill, Salt Lake City", type: "house", beds: 3, baths: 2, garage: 1, pool: false, waterView: true, price: 765000, sqft: 1810, yearBuilt: 2010, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "1-car garage plus driveway", features: "water views, hurricane impact windows, community clubhouse", descriptor: "the Capitol Hill house", tagline: "Historic Capitol Hill charm with downtown views.", source: "sample" },
      { address: "3120 E Louise Avenue", area: "Millcreek", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 849000, sqft: 2350, yearBuilt: 1968, renovated: "2021 — renovated kitchen, baths and floors", hoaMonthly: 180, parking: "2-car garage plus driveway", features: "private pool, wood-look floors throughout, covered patio", descriptor: "the Louise Avenue house in Millcreek", tagline: "Pool and mountain views in Millcreek.", source: "sample" },
      { address: "88 W Broadway #706", area: "Downtown Salt Lake City", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 465000, sqft: 1110, yearBuilt: 1971, renovated: "2020 — updated throughout", hoaMonthly: 520, parking: "1 garage space", features: "resort-style pool and amenities, in-unit laundry, marina access nearby", descriptor: "the downtown condo on Broadway", tagline: "Lock-and-leave 2 bed, 2 bath in downtown Salt Lake.", source: "sample" },
      { address: "2750 E Parleys Way", area: "Salt Lake City", type: "house", beds: 5, baths: 4, garage: 3, pool: false, waterView: false, price: 1275000, sqft: 3510, yearBuilt: 2008, renovated: "2021 — renovated kitchen, baths and floors", parking: "3-car garage plus driveway", features: "wood-look floors throughout, garden tub in the primary bath", descriptor: "the Parleys Way house", tagline: "Five beds at the mouth of Parleys Canyon.", source: "sample" },
      { address: "1353 E Tomahawk Drive", area: "Salt Lake City", type: "house", beds: 4, baths: 3, garage: 2, pool: false, waterView: false, price: 798000, sqft: 2420, yearBuilt: 2007, renovated: "original condition — a blank canvas for your own finish", parking: "2-car garage plus driveway", features: "garden tub in the primary bath, wood-look floors throughout", descriptor: "the Tomahawk Drive house", tagline: "East-bench living on Tomahawk Drive \u2014 4 bed, 3 bath.", source: "sample" },
    ],
  },
  {
    slug: "jean-luc-andriot",
    url: "https://jeanlucandriot.com/",
    agentName: "Jean-Luc Andriot",
    city: "Boca Raton",
    listings: [
      { address: "500 SE Mizner Boulevard #A209", area: "Townsend Place, Downtown Boca Raton", type: "condo", beds: 2, baths: 3, garage: 2, sqft: 1802, descriptor: "the Townsend Place condo on SE Mizner Boulevard", tagline: "A gated, amenity-rich downtown condo just steps from Mizner Park shops and minutes from the beach.", source: "site" },
      { address: "100 SE Mizner Boulevard #712", area: "Downtown Boca Raton", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 725000, sqft: 1160, yearBuilt: 1968, renovated: "2023", hoaMonthly: 585, parking: "1 assigned space plus guest parking", features: "resort-style pool and amenities, marina access nearby", descriptor: "the downtown condo on SE Mizner Boulevard", tagline: "Walk to Mizner Park \u2014 2 bed, 2 bath with amenities.", source: "sample" },
      { address: "5800 NE Spanish Trail", area: "Boca Raton", type: "house", beds: 4, baths: 4, garage: 3, pool: true, waterView: false, price: 3495000, sqft: 2370, yearBuilt: 2009, renovated: "original condition — a blank canvas for your own finish", parking: "3-car garage plus driveway", features: "private pool, garden tub in the primary bath, marina access nearby", descriptor: "the Spanish Trail estate", tagline: "East Boca estate living with a pool and 3-car garage.", source: "sample" },
      { address: "2490 Tecumseh Drive", area: "Boca Raton", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 1875000, sqft: 2440, yearBuilt: 1980, renovated: "2021 — renovated kitchen, baths and floors", parking: "2-car garage plus driveway", features: "private pool, covered patio, screened balcony", descriptor: "the Tecumseh Drive house", tagline: "Four beds in Royal Oak Hills with a private pool.", source: "sample" },
      { address: "720 E Camino Street", area: "Boca Raton", type: "house", beds: 3, baths: 3, garage: 2, pool: false, waterView: false, price: 1425000, sqft: 1600, yearBuilt: 1994, renovated: "2023", parking: "2-car garage plus driveway", features: "marina access nearby, chef's kitchen with quartz counters", descriptor: "the Camino Street house", tagline: "Old Floresta charm on Camino Street.", source: "sample" },
      { address: "300 SE Mizner Boulevard #907", area: "Downtown Boca Raton", type: "condo", beds: 3, baths: 3, pool: true, waterView: true, price: 1195000, sqft: 1710, yearBuilt: 1971, renovated: "2020 — updated throughout", hoaMonthly: 755, parking: "2 assigned spaces", features: "water views, resort-style pool and amenities, primary suite retreat", descriptor: "the Mizner Boulevard penthouse-floor condo", tagline: "Three beds high above downtown Boca.", source: "sample" },
      { address: "1750 Spanish River Road", area: "Boca Raton", type: "house", beds: 5, baths: 5, garage: 3, pool: true, waterView: true, price: 6950000, sqft: 3180, yearBuilt: 1962, renovated: "2023", parking: "3-car garage plus driveway", features: "water views, private pool, chef's kitchen with quartz counters", descriptor: "the Spanish River Road waterfront", tagline: "Intracoastal frontage on Spanish River Road.", source: "sample" },
      { address: "451 Camino Gardens Lane", area: "Boca Raton", type: "townhouse", beds: 3, baths: 3, garage: 2, pool: true, waterView: false, price: 975000, sqft: 1700, yearBuilt: 2013, renovated: "original condition — a blank canvas for your own finish", hoaMonthly: 245, parking: "1 assigned space plus driveway", features: "private pool, community clubhouse, open-plan living", descriptor: "the Camino Gardens townhouse", tagline: "Townhouse ease in Camino Gardens, near the beach.", source: "sample" },
      { address: "899 Camino Real #12B", area: "Boca Raton", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 565000, sqft: 1140, yearBuilt: 1977, renovated: "2020 — updated throughout", hoaMonthly: 480, parking: "2 assigned spaces", features: "resort-style pool and amenities, primary suite retreat, open-plan living", descriptor: "the Camino Real condo", tagline: "A 2 bed, 2 bath way into east Boca.", source: "sample" },
      { address: "2240 NE Spanish Trail", area: "Boca Raton", type: "house", beds: 5, baths: 4, garage: 2, pool: true, waterView: false, price: 2350000, sqft: 3060, yearBuilt: 2013, renovated: "2020 — updated throughout", parking: "2-car garage plus driveway", features: "private pool, primary suite retreat, screened balcony", descriptor: "the second Spanish Trail house, on NE Spanish Trail", tagline: "Five beds of family living in east Boca Raton.", source: "sample" },
    ],
  },
  {
    slug: "julie-melrose",
    url: "https://www.juliemelrose.com/",
    agentName: "Julie Melrose",
    city: "Fort Lauderdale",
    listings: [
      { address: "4270 NW 40th Street #211", area: "Lauderdale Lakes", type: "condo", beds: 2, baths: 2, sqft: 1150, price: 180000, descriptor: "the Garnet Condo unit on NW 40th Street in Lauderdale Lakes", tagline: "A 2 bed, 2 bath in the Garnet Condo 55+ community — new AC, tiled patio, hurricane shutters.", source: "site" },
      { address: "410 Lakeview Drive #103", area: "Bonaventure, Weston", type: "condo", beds: 2, baths: 2, waterView: true, sqft: 1256, price: 349000, descriptor: "the Lakeview Drive condo in Weston", tagline: "Canal views from the screened patio in Weston's Bonaventure community.", source: "site" },
      { address: "1431 SW 27th Court", area: "Edgewood, Fort Lauderdale", type: "house", beds: 3, baths: 2, sqft: 1084, price: 430000, descriptor: "the Edgewood house on SW 27th Court, on the double lot", tagline: "A 3 bed, 2 bath on a rare 9,474 square foot double lot — no HOA, minutes to Las Olas.", source: "site" },
      { address: "8226 NW 8th Place Unit #6", area: "Plantation", type: "townhouse", beds: 4, baths: 2.5, garage: 1, pool: true, sqft: 2080, price: 290000, descriptor: "the Jacaranda townhouse on NW 8th Place in Plantation", tagline: "A corner-unit 4 bed, 2.5 bath in Townhouses at Jacaranda — two pools, tennis, clubhouse.", source: "site" },
      { address: "4712 NW 41st Avenue", area: "Tamarac Lakes, Lauderdale Lakes", type: "house", beds: 2, waterView: true, price: 349900, descriptor: "the waterfront house on NW 41st Avenue in Tamarac Lakes", tagline: "Turnkey and updated on the water in the 55+ Tamarac Lakes community.", source: "site" },
      { address: "4508 NW 43rd Terrace", area: "Tamarac", type: "house", beds: 2, baths: 1, garage: 1, sqft: 806, price: 245000, descriptor: "the Tamarac house on NW 43rd Terrace", tagline: "Priced below market in a quiet Tamarac 55+ community — a downsizer or investor play.", source: "site" },
      { address: "Hawaiian Gardens Phase 1 #302", area: "Lauderdale Lakes", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, sqft: 944, price: 149000, descriptor: "the Hawaiian Gardens condo in Lauderdale Lakes", tagline: "Fully furnished and turnkey in the 55+ Hawaiian Gardens — lake views from the enclosed patio.", source: "site" },
      { address: "2916 NE 37th Street", area: "Coral Ridge, Fort Lauderdale", type: "house", beds: 3, baths: 2, garage: 2, pool: true, waterView: false, price: 875000, sqft: 1750, yearBuilt: 1958, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "2-car garage plus driveway", features: "private pool, hurricane impact windows", descriptor: "the Coral Ridge house on NE 37th Street", tagline: "Pool living a short ride from the beach in Coral Ridge.", source: "sample" },
      { address: "815 Middle River Drive", area: "Wilton Manors", type: "house", beds: 3, baths: 2, garage: 2, pool: true, waterView: true, price: 1195000, sqft: 1780, yearBuilt: 1977, renovated: "2022 — kitchen and baths updated", hoaMonthly: 135, parking: "2-car garage plus driveway", features: "water views, private pool, walk-in closets", descriptor: "the Wilton Manors house on Middle River Drive", tagline: "On the Middle River with dockage — the Five Points lifestyle.", source: "sample" },
      { address: "2100 S Ocean Boulevard #405", area: "Lauderdale Beach, Fort Lauderdale", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, price: 649000, sqft: 1180, yearBuilt: 1997, renovated: "original condition — a blank canvas for your own finish", hoaMonthly: 555, parking: "1 garage space", features: "water views, resort-style pool and amenities, community clubhouse", descriptor: "the Lauderdale Beach condo on South Ocean Boulevard", tagline: "Direct ocean views in Lauderdale Beach — 2 bed, 2 bath.", source: "sample" },
    ],
  },
  {
    slug: "logan-walter",
    url: "https://loganwalter.com/",
    agentName: "Logan Walter",
    city: "Dallas",
    listings: [
      { address: "5714 Mercedes Avenue", area: "Lakewood, Dallas", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: false, price: 1295000, sqft: 2350, yearBuilt: 2003, renovated: "2022 — kitchen and baths updated", parking: "2-car garage plus driveway", features: "private pool, open-plan living, garden tub in the primary bath", descriptor: "the Mercedes Avenue house in Lakewood", tagline: "Lakewood living near White Rock Lake \u2014 pool and 4 beds.", source: "sample" },
      { address: "1209 Province Lane", area: "Frisco", type: "house", beds: 5, baths: 5, garage: 3, pool: true, waterView: false, price: 975000, sqft: 3380, yearBuilt: 1985, renovated: "2020 — updated throughout", parking: "3-car garage plus driveway", features: "private pool, primary suite retreat, open-plan living", descriptor: "the Province Lane house in Frisco", tagline: "Five beds in Frisco's top school zones.", source: "sample" },
      { address: "3304 Crown Ridge Court", area: "Celina", type: "house", beds: 5, baths: 5, garage: 4, pool: true, waterView: false, price: 1425000, sqft: 3090, yearBuilt: 1975, renovated: "2022 — kitchen and baths updated", parking: "4-car garage plus driveway", features: "private pool, walk-in closets, chef's kitchen with quartz counters", descriptor: "the Crown Ridge Court house in Celina", tagline: "Acreage and a resort backyard in Celina.", source: "sample" },
      { address: "4812 Swiss Avenue", area: "Swiss Avenue, Dallas", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: false, price: 1875000, sqft: 2350, yearBuilt: 1966, renovated: "2023", hoaMonthly: 145, parking: "2-car garage plus driveway", features: "private pool, chef's kitchen with quartz counters, marina access nearby", descriptor: "the Swiss Avenue historic house", tagline: "Historic-district grandeur on Swiss Avenue.", source: "sample" },
      { address: "2323 N Houston Street #907", area: "Victory Park, Dallas", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 565000, sqft: 1170, yearBuilt: 1996, renovated: "2019 — fresh paint, new appliances and updated baths", hoaMonthly: 510, parking: "1 assigned space plus guest parking", features: "resort-style pool and amenities, screened balcony", descriptor: "the Victory Park high-rise condo", tagline: "High-rise views over Victory Park \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "6911 Lakeshore Drive", area: "Dallas", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: true, price: 1150000, sqft: 2490, yearBuilt: 2011, renovated: "2022 — kitchen and baths updated", parking: "2-car garage plus driveway", features: "water views, private pool, walk-in closets", descriptor: "the Lakeshore Drive house", tagline: "On the lake side of Dallas with a private pool.", source: "sample" },
      { address: "1520 Norwick Drive", area: "Parker", type: "house", beds: 5, baths: 5, garage: 4, pool: true, waterView: false, price: 1650000, sqft: 3220, yearBuilt: 1985, renovated: "original condition — a blank canvas for your own finish", parking: "4-car garage plus driveway", features: "private pool, garden tub in the primary bath", descriptor: "the Norwick Drive estate in Parker", tagline: "Estate acreage in Parker Ranch country.", source: "sample" },
      { address: "4400 McKinney Avenue #1201", area: "Uptown Dallas", type: "condo", beds: 3, baths: 3, pool: true, waterView: false, price: 825000, sqft: 1800, yearBuilt: 2004, renovated: "2023", hoaMonthly: 835, parking: "1 assigned space plus guest parking", features: "resort-style pool and amenities, marina access nearby, garden tub in the primary bath", descriptor: "the McKinney Avenue condo in Uptown", tagline: "Uptown living \u2014 3 bed, 3 bath with skyline views.", source: "sample" },
      { address: "3807 Cedar Sage Court", area: "Anna", type: "house", beds: 4, baths: 4, garage: 3, pool: false, waterView: false, price: 685000, sqft: 2190, yearBuilt: 1968, renovated: "2021 — renovated kitchen, baths and floors", parking: "3-car garage plus driveway", features: "covered patio", descriptor: "the Cedar Sage Court house in Anna", tagline: "Newer 4 bed in fast-growing Anna.", source: "sample" },
      { address: "5601 Maple Springs Boulevard", area: "Dallas", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 895000, sqft: 2490, yearBuilt: 1991, renovated: "original condition — a blank canvas for your own finish", parking: "2-car garage plus driveway", features: "private pool, community clubhouse, in-unit laundry", descriptor: "the Maple Springs house", tagline: "Updated 4 bed with a pool in north Dallas.", source: "sample" },
    ],
  },
  {
    slug: "mauricio-barba",
    url: "https://miamisignaturehomes.com/",
    agentName: "Mauricio J. Barba",
    city: "Coral Gables",
    listings: [
      { address: "1140 Asturia Avenue", area: "Coral Gables", type: "house", beds: 5, baths: 5, sqft: 3386, price: 4200000, descriptor: "the Asturia Avenue house in the Gables", tagline: "5 bed, 5 bath and 3,386 square feet of classic Coral Gables.", source: "site" },
      { address: "3023 SW 16th Terrace", area: "Miami", type: "house", beds: 4, baths: 6, sqft: 3251, price: 1850000, descriptor: "the house on SW 16th Terrace", tagline: "4 bed, 6 bath over 3,251 square feet \u2014 space for everyone.", source: "site" },
      { address: "33 San Sebastian Avenue", area: "Coral Gables", type: "house", beds: 2, baths: 2, sqft: 1121, price: 1469000, descriptor: "the San Sebastian Avenue house at number 33", tagline: "A charming 2 bed, 2 bath in the heart of the Gables.", source: "site" },
      { address: "721 Biltmore Way #601", area: "Coral Gables", type: "condo", beds: 3, baths: 3, sqft: 2270, price: 1390000, descriptor: "the Biltmore Way condo", tagline: "3 bed, 3 bath condo living on Biltmore Way.", source: "site" },
      { address: "29 San Sebastian Avenue", area: "Coral Gables", type: "house", beds: 2, baths: 2, sqft: 1011, price: 1180000, descriptor: "the other San Sebastian house, at number 29", tagline: "2 bed, 2 bath \u2014 an easy way into Coral Gables.", source: "site" },
      { address: "1235 Asturia Avenue", area: "Coral Gables", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: false, price: 3675000, sqft: 2470, yearBuilt: 1983, renovated: "2020 — updated throughout", parking: "2-car garage plus driveway", features: "private pool, primary suite retreat, covered patio", descriptor: "the second Asturia Avenue house", tagline: "Pool, privacy and Gables architecture on Asturia.", source: "sample" },
      { address: "5421 Orduna Drive", area: "Coral Gables", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 2295000, sqft: 2510, yearBuilt: 2003, renovated: "2020 — updated throughout", parking: "2-car garage plus driveway", features: "private pool, primary suite retreat, screened balcony", descriptor: "the Orduna Drive house", tagline: "Family-sized and pool-ready in south Gables.", source: "sample" },
      { address: "2611 De Soto Boulevard", area: "Coral Gables", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: true, price: 1995000, sqft: 1630, yearBuilt: 1985, renovated: "original condition — a blank canvas for your own finish", parking: "2-car garage plus driveway", features: "water views, community clubhouse, covered patio", descriptor: "the De Soto Boulevard house", tagline: "Overlooking the waterway on De Soto Boulevard.", source: "sample" },
      { address: "60 Edgewater Drive #4B", area: "Coral Gables", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, price: 925000, sqft: 1230, yearBuilt: 2000, renovated: "2021 — renovated kitchen, baths and floors", hoaMonthly: 615, parking: "1 assigned space plus guest parking", features: "water views, resort-style pool and amenities, covered patio", descriptor: "the Edgewater Drive condo", tagline: "Bay views from Edgewater Drive \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "912 Algardi Avenue", area: "Coral Gables", type: "house", beds: 3, baths: 3, garage: 1, pool: true, waterView: false, price: 1795000, sqft: 1610, yearBuilt: 1998, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "1-car garage plus driveway", features: "private pool, hurricane impact windows, covered patio", descriptor: "the Algardi Avenue house", tagline: "Old Gables soul with a private pool on Algardi.", source: "sample" },
    ],
  },
  {
    slug: "michael-martinez",
    url: "https://michaelmartinezrealtor.com/",
    agentName: "Michael Martinez",
    city: "Coral Gables",
    listings: [
      { address: "10860 SW 67th Court", area: "Pinecrest", type: "house", beds: 7, baths: 9, sqft: 8381, price: 16500000, descriptor: "the Pinecrest estate on SW 67th Court", tagline: "7 bed, 9 bath, 8,381 square feet \u2014 Pinecrest at its grandest.", source: "site" },
      { address: "5901 SW 107th Street", area: "Pinecrest", type: "house", beds: 7, baths: 10, sqft: 9644, price: 16500000, descriptor: "the estate on SW 107th Street", tagline: "Nearly 10,000 square feet with 7 beds and 10 baths.", source: "site" },
      { address: "6645 SW 102nd Street", area: "Pinecrest", type: "house", beds: 9, baths: 10, sqft: 12584, price: 15995000, descriptor: "the SW 102nd Street compound", tagline: "9 beds and 12,584 square feet \u2014 a true family compound.", source: "site" },
      { address: "5825 SW 111th Terrace", area: "Pinecrest", type: "house", beds: 7, baths: 8, sqft: 7921, price: 11500000, descriptor: "the house on SW 111th Terrace", tagline: "7 bed, 8 bath resort living in Pinecrest.", source: "site" },
      { address: "6600 SW 116th Street", area: "Pinecrest", type: "house", beds: 7, baths: 9, sqft: 8474, price: 10500000, descriptor: "the SW 116th Street estate", tagline: "8,474 square feet of estate living on 116th.", source: "site" },
      { address: "13120 Old Cutler Road", area: "Pinecrest", type: "house", beds: 7, baths: 8, sqft: 7954, price: 9250000, status: "Pending", descriptor: "the Old Cutler Road estate at 13120", tagline: "Old Cutler frontage, 7 beds \u2014 currently pending.", source: "site" },
      { address: "9400 Old Cutler Road", area: "Coral Gables", type: "house", beds: 6, baths: 8, sqft: 8226, price: 8750000, descriptor: "the Coral Gables estate on Old Cutler", tagline: "6 bed, 8 bath on Old Cutler Road in the Gables.", source: "site" },
      { address: "3551 Crystal Court", area: "Miami", type: "house", beds: 5, baths: 6, sqft: 4647, price: 7250000, descriptor: "the Crystal Court house", tagline: "5 bed, 6 bath tucked away on Crystal Court.", source: "site" },
      { address: "7502 SW 102nd Street", area: "Pinecrest", type: "house", beds: 6, baths: 8, sqft: 5805, price: 6995000, descriptor: "the second house on SW 102nd Street", tagline: "6 beds and 5,805 square feet in Pinecrest.", source: "site" },
      { address: "2678 Tigertail Avenue #302", area: "Coconut Grove, Miami", type: "condo", beds: 3, baths: 3, sqft: 1646, price: 2900000, descriptor: "the Tigertail Avenue condo in the Grove", tagline: "3 bed, 3 bath condo living in Coconut Grove.", source: "site" },
    ],
  },
  {
    slug: "paul-saperstein",
    url: "https://paulsapersteinhomes.com/",
    agentName: "Paul Saperstein",
    city: "Delray Beach",
    listings: [
      { address: "6600 W Atlantic Avenue #210", area: "Delray Beach", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 329000, sqft: 1140, yearBuilt: 1979, renovated: "original condition — a blank canvas for your own finish", hoaMonthly: 550, parking: "2 assigned spaces", features: "resort-style pool and amenities, garden tub in the primary bath, walk-in closets", descriptor: "the West Atlantic Avenue condo", tagline: "An easy 2 bed, 2 bath in west Delray.", source: "sample" },
      { address: "15325 Via Fontana", area: "Delray Beach", type: "house", beds: 3, baths: 2, garage: 2, pool: true, waterView: true, price: 685000, sqft: 1680, yearBuilt: 1989, renovated: "2020 — updated throughout", hoaMonthly: 230, parking: "2-car garage plus driveway", features: "water views, private pool, in-unit laundry", descriptor: "the Via Fontana house", tagline: "Lake-view pool home in a 55+ Delray community.", source: "sample" },
      { address: "7240 Clunie Place", area: "Delray Beach", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 915000, sqft: 2350, yearBuilt: 1964, renovated: "2019 — fresh paint, new appliances and updated baths", parking: "2-car garage plus driveway", features: "private pool, hurricane impact windows, community clubhouse", descriptor: "the Clunie Place house", tagline: "Four beds with a pool in west Delray Beach.", source: "sample" },
      { address: "10950 Poinciana Drive", area: "Boynton Beach", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 565000, sqft: 1800, yearBuilt: 1971, renovated: "2020 — updated throughout", parking: "2-car garage plus driveway", features: "in-unit laundry, garden tub in the primary bath", descriptor: "the Boynton Beach house on Poinciana Drive", tagline: "Solid 3 bed value in Boynton Beach.", source: "sample" },
      { address: "5025 Wellesley Park Drive #43", area: "Boynton Beach", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 289000, sqft: 1120, yearBuilt: 1980, renovated: "2023", hoaMonthly: 570, parking: "1 assigned space plus guest parking", features: "resort-style pool and amenities, marina access nearby, open-plan living", descriptor: "the Wellesley Park condo", tagline: "Starter or snowbird condo under $300K in Boynton.", source: "sample" },
      { address: "13817 Packard Terrace", area: "Delray Beach", type: "house", beds: 3, baths: 2, garage: 2, pool: true, waterView: false, price: 629000, sqft: 1710, yearBuilt: 2008, renovated: "2019 — fresh paint, new appliances and updated baths", hoaMonthly: 215, parking: "2-car garage plus driveway", features: "private pool, hurricane impact windows, in-unit laundry", descriptor: "the Packard Terrace house", tagline: "Pool home in a family-friendly Delray neighborhood.", source: "sample" },
      { address: "2255 S Ocean Boulevard #12", area: "Highland Beach", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, price: 749000, sqft: 1220, yearBuilt: 1984, renovated: "2019 — fresh paint, new appliances and updated baths", hoaMonthly: 595, parking: "1 assigned space plus guest parking", features: "water views, resort-style pool and amenities, screened balcony", descriptor: "the Highland Beach ocean condo", tagline: "On the sand in Highland Beach \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "6495 Las Casitas Drive", area: "Boynton Beach", type: "townhouse", beds: 3, baths: 3, garage: 1, pool: false, waterView: false, price: 475000, sqft: 1630, yearBuilt: 1961, renovated: "original condition — a blank canvas for your own finish", hoaMonthly: 215, parking: "1 assigned space plus driveway", features: "community clubhouse, garden tub in the primary bath", descriptor: "the Las Casitas townhouse", tagline: "Three-bed townhouse living in Boynton Beach.", source: "sample" },
      { address: "17741 Scarsdale Way", area: "Boca Raton", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 1050000, sqft: 2230, yearBuilt: 1984, renovated: "2023", parking: "2-car garage plus driveway", features: "private pool, marina access nearby, hurricane impact windows", descriptor: "the Scarsdale Way house in Boca", tagline: "Country-club community living in west Boca.", source: "sample" },
      { address: "3910 S Ocean Boulevard #PH2", area: "Highland Beach", type: "condo", beds: 3, baths: 4, pool: true, waterView: true, price: 1650000, sqft: 1700, yearBuilt: 1978, renovated: "2019 — fresh paint, new appliances and updated baths", hoaMonthly: 780, parking: "1 assigned space plus guest parking", features: "water views, resort-style pool and amenities, screened balcony", descriptor: "the Highland Beach penthouse", tagline: "Penthouse views over the ocean in Highland Beach.", source: "sample" },
    ],
  },
  {
    slug: "ray-miramontes",
    url: "https://mira-realestate.com/",
    agentName: "Ray Miramontes",
    city: "Long Beach",
    listings: [
      { address: "1140 E Ocean Boulevard #301", area: "Long Beach", type: "condo", beds: 1, baths: 1, sqft: 690, price: 509999, descriptor: "the Ocean Boulevard condo in Long Beach", tagline: "Ocean Boulevard condo living \u2014 1 bed, 1 bath in Long Beach.", source: "site" },
      { address: "14101 Bayside", area: "Norwalk", type: "house", beds: 1, baths: 1, sqft: 848, price: 409999, descriptor: "the Bayside house in Norwalk", tagline: "A 1 bed, 1 bath starter in Norwalk under $410K.", source: "site" },
      { address: "2615 E Washington Street", area: "Carson", type: "house", beds: 3, baths: 2, sqft: 1300, price: 749999, descriptor: "the Washington Street house in Carson", tagline: "3 bed, 2 bath family home in Carson.", source: "site" },
      { address: "1045 E 3rd Street #4", area: "Long Beach", type: "condo", beds: 2, baths: 2, sqft: 898, price: 564999, descriptor: "the 3rd Street condo in Long Beach", tagline: "2 bed, 2 bath condo in the heart of Long Beach.", source: "site" },
      { address: "794 N Ethan Way", area: "Anaheim", type: "house", beds: 2, sqft: 1540, price: 719999, descriptor: "the Ethan Way house in Anaheim", tagline: "2 beds and 1,540 square feet in Anaheim.", source: "site" },
      { address: "2239 Pacific Avenue #C", area: "Costa Mesa", type: "condo", beds: 3, sqft: 1766, price: 1025000, status: "Pending", descriptor: "the Pacific Avenue condo in Costa Mesa", tagline: "3 beds near the coast in Costa Mesa \u2014 currently pending.", source: "site" },
      { address: "15223 Carnell", area: "Whittier", type: "house", beds: 3, baths: 2, sqft: 1269, price: 849900, status: "Active Under Contract", descriptor: "the Carnell house in Whittier", tagline: "3 bed, 2 bath in Whittier \u2014 active under contract.", source: "site" },
      { address: "8201 Summertime", area: "Culver City", type: "house", beds: 2, baths: 2, sqft: 916, price: 579000, descriptor: "the Summertime house in Culver City", tagline: "A 2 bed, 2 bath foothold in Culver City.", source: "site" },
      { address: "2746 Easy", area: "Long Beach", type: "house", beds: 3, baths: 2, sqft: 1352, price: 749900, descriptor: "the Easy Street house in Long Beach", tagline: "3 bed, 2 bath and 1,352 square feet in Long Beach.", source: "site" },
      { address: "16434 Whittier Boulevard #6", area: "Whittier", type: "condo", beds: 3, baths: 2, sqft: 1440, price: 719999, descriptor: "the Whittier Boulevard condo", tagline: "3 bed, 2 bath condo space on Whittier Boulevard.", source: "site" },
    ],
  },
  {
    slug: "richard-steinberg",
    url: "https://www.therichardsteinbergteam.com/",
    agentName: "Richard Steinberg",
    city: "New York",
    listings: [
      { address: "781 5th Avenue, Floor 17", area: "Lenox Hill, New York", type: "condo", price: 14900000, descriptor: "the entire 17th floor at 781 Fifth Avenue", tagline: "The entire 17th floor of the Sherry-Netherland \u2014 panoramic views over Fifth Avenue and Central Park.", source: "site" },
      { address: "550 Park Avenue, Unit 3W", area: "Lenox Hill, New York", type: "condo", price: 4750000, descriptor: "the Park Avenue co-op at 550", tagline: "Pre-war co-op elegance \u2014 11-foot ceilings and four exposures at 550 Park Avenue.", source: "site" },
      { address: "450 West End Avenue, Unit 3B", area: "Upper West Side, New York", type: "condo", beds: 3, baths: 2.5, price: 2995000, descriptor: "the West End Avenue co-op", tagline: "Meticulously renovated 3 bed, 2.5 bath in an Emery Roth co-op on West End Avenue.", source: "site" },
      { address: "472 West 144th Street, Unit 1", area: "Hamilton Heights, New York", type: "townhouse", price: 1250000, descriptor: "the Hamilton Heights brownstone residence", tagline: "Flexible 2\u20133 bedroom parlor-and-garden residence on a brownstone-lined street in Hamilton Heights.", source: "site" },
      { address: "167 East 61st Street, Unit 7D", area: "Lenox Hill, New York", type: "condo", beds: 1, baths: 1.5, price: 999999, descriptor: "the East 61st Street pied-\u00e0-terre", tagline: "Renovated 1 bed, 1.5 bath with a private terrace in Lenox Hill.", source: "site" },
      { address: "1150 Park Avenue #8C", area: "Upper East Side, New York", type: "condo", beds: 3, baths: 3, waterView: false, price: 3850000, sqft: 1550, yearBuilt: 1992, renovated: "2023", hoaMonthly: 745, parking: "1 assigned space plus guest parking", features: "marina access nearby, in-unit laundry", descriptor: "the second Park Avenue residence, at 1150", tagline: "Classic Park Avenue living \u2014 3 bed, 3 bath.", source: "sample" },
      { address: "320 West End Avenue #12A", area: "Upper West Side, New York", type: "condo", beds: 2, baths: 2, waterView: true, price: 1875000, sqft: 1240, yearBuilt: 2007, renovated: "2020 — updated throughout", hoaMonthly: 600, parking: "1 garage space", features: "water views, in-unit laundry, garden tub in the primary bath", descriptor: "the West End Avenue two-bedroom", tagline: "A 2 bed, 2 bath with river glimpses on the Upper West Side.", source: "sample" },
      { address: "40 East 84th Street #5D", area: "Upper East Side, New York", type: "condo", beds: 2, baths: 2, waterView: false, price: 1695000, sqft: 1160, yearBuilt: 1972, renovated: "2019 — fresh paint, new appliances and updated baths", hoaMonthly: 510, parking: "1 assigned space plus guest parking", features: "screened balcony, marina access nearby", descriptor: "the East 84th Street co-op", tagline: "Museum-block living on East 84th \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "188 East 70th Street #3B", area: "Lenox Hill, New York", type: "condo", beds: 1, baths: 1, waterView: false, price: 725000, sqft: 820, yearBuilt: 1997, renovated: "original condition — a blank canvas for your own finish", hoaMonthly: 445, parking: "1 garage space", features: "community clubhouse, hurricane impact windows", descriptor: "the East 70th Street one-bedroom", tagline: "A Lenox Hill starter or pied-\u00e0-terre under $750K.", source: "sample" },
      { address: "245 East 93rd Street #26C", area: "Upper East Side, New York", type: "condo", beds: 3, baths: 3, waterView: false, price: 2450000, sqft: 1560, yearBuilt: 1986, renovated: "2023", hoaMonthly: 725, parking: "1 covered assigned space", features: "chef's kitchen with quartz counters, wood-look floors throughout", descriptor: "the East 93rd Street residence", tagline: "High-floor 3 bed, 3 bath with city views.", source: "sample" },
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
 * is not one of the 14 known examples. */
export function examplePackForSiteUrl(siteUrl: unknown): RealtorExamplePack | null {
  const key = normalizeExampleSiteUrl(siteUrl);
  if (!key) return null;
  return REALTOR_EXAMPLE_PACKS.find((p) => normalizeExampleSiteUrl(p.url) === key) ?? null;
}

/** The example pack for a stamped slug, or null. The persona-segment
 * branch (gemini-session) reads the slug from the PARENT session's
 * stamped exampleListings marker — server-stored state, never a
 * client-supplied value — to rebuild the listings layer for Sara's
 * segment prompt (Scalone batch Item 1). */
export function examplePackBySlug(slug: unknown): RealtorExamplePack | null {
  if (typeof slug !== 'string' || !slug) return null;
  return REALTOR_EXAMPLE_PACKS.find((p) => p.slug === slug) ?? null;
}

/** The listings to name first in the simulation: the agent's OWN
 * listings (source "site") lead, in pack order; samples fill only when
 * a site had fewer real listings than the requested count. */
export function topExampleListings(pack: RealtorExamplePack, count = 3): ExampleListing[] {
  const own = pack.listings.filter((l) => l.source === 'site');
  const fill = pack.listings.filter((l) => l.source !== 'site');
  return [...own, ...fill].slice(0, count);
}

// SIMULATION SCRIPT (Batch 2): the owner-approved simulation script —
// the soft listings door-opener, the listing moment, the showing close,
// the not-my-listing narration line for the simulation and the
// demo-guide invitation. Ron approved this flow on 2026-11-12 (card tap
// + text confirm) and it is locked: change the wording only on his
// say-so. The {agentName} placeholders are replaced with the pack's
// agent name when the layer is built (buildExampleListingsLayer), so
// Aspen always names the agent whose site the simulation runs on.
// REVISION (2026-11-14, Ron-directed, from his live Frank/Martinez
// test, session 43f03e82): the no-match branch is split in two — a
// criteria search with no match (collect criteria fully BEFORE
// answering; plain no-match wording about the criteria; capture the
// criteria + callback number; never demand an exact address from a
// searching buyer) vs one specific named property that is not ours
// (the honest "not among" line lives only there), and the
// exact-address ask is scoped to SELLERS naming their own property.
// REVISION (2026-11-22, Ron-directed after his full Aurelia Perez
// test): three sections added on his say-so — SELL THE LISTING,
// DON'T READ IT (the full MLS-style fact block, price early, "why
// this one", never invent a missing fact); QUALIFY LIKE A REALTOR
// (progressive one-at-a-time qualification, deferring to the
// discovery layer's sequence in presenter builds); and OTHER
// UNITS, NEARBY LISTINGS AND COMPARABLES (the honest no-access
// fallback with the pull-and-send value path). Every prior section
// and the two presenter string-replace sentences are preserved
// byte-exact.
export const REALTOR_EXAMPLE_SIMULATION_SCRIPT = `SIMULATION SCRIPT — OWNER-APPROVED WORDING (follow it for the listings conversation in this simulation: use the quoted lines as written, keep everything around them warm and natural, and never stack questions — one question at a time, and let the visitor lead):
DOOR-OPENER: your greeting stays clean, with no listing dump up front. Early on, once the visitor has said what they are calling about, you may ask at most ONE soft door-opener, exactly: "Are you calling about one of our listings today?" If they say no or change the subject, drop it and help with whatever they asked.
ASK WHAT THEY'RE LOOKING FOR — FIRST (2026-11-13, Ron's Andriot retest): before pitching ANY listing, ask ONE preference question and let the answer choose what you pitch: what are they looking for — a condo, a house, a townhouse or a high-rise? Near the water? How many bedrooms? One question, warmly put ("Tell me what you're picturing — a condo, a house, near the water?"), never an interrogation. If they have already told you what they want, skip the question and use what they said.
COLLECT THE CRITERIA BEFORE YOU ANSWER (2026-11-14, Ron's Martinez retest): criteria usually arrive piece by piece — the area in one breath ("listings in Coconut Grove"), the beds and baths in the next, the budget after that. While the visitor is still giving you their criteria, only acknowledge each piece warmly and keep collecting ("Coconut Grove — got it"), asking for the next missing piece if you need one. NEVER begin a "yes, we have…" or "yes, we currently have…" answer before their criteria are complete: starting a yes and then flipping to a no when the last piece lands is the worst sound in this conversation. Answer ONCE, when the picture is complete (or the visitor says that is everything): pitch the match if there is one, or take the no-match path below if there is not.
THE LISTING MOMENT — FEATURE-FIRST, NEVER ADDRESS-FIRST (2026-11-13, Ron's Andriot retest: bare address recitals — "one here on 135 SW 15th Street, another on…" — are banned): pitch the one or two listings from the list above that best match what they asked for (or, when they have no preference yet, the top listings from NAME THESE FIRST), the way a real realtor sells: FEATURE FIRST — the property type, the beds and baths, the size, the neighbourhood, and its standout feature from its tagline ("a three-bed pool home in Coral Ridge Isles — nearly nineteen hundred square feet, with a two-car garage"). The street address comes LAST, as a closing detail ("— it's the one on NE 49th Street"), never as the headline, and never as a read-out list of addresses. If this session's list holds more than three listings, finish with "and a few others on the site". If the list holds exactly one listing, feature that one on its own. Never read out the whole list.
THEY PICK ONE: answer from that listing's real details in the list above — beds, baths, size, features, price, status — and nothing beyond them, then close toward a showing: "What day suits you?" and take it into the normal booking path.
NO MATCH FOR THEIR CRITERIA: if the visitor is SEARCHING BY CRITERIA — an area, beds and baths, a budget — and nothing in the list above fits what they asked for, say so plainly, about the CRITERIA, in words like: "Right now I don't have a match for that among {agentName}'s current listings." Never say "that one is not among the listings" to a criteria searcher — they never named a specific property, so there is no "that one". And never ask a searching visitor for "the exact address" — a buyer searching by criteria does not have one. Instead, capture the search: read their criteria back to confirm them (the area, the beds and baths, the budget), offer that {agentName} will search for them and call them back, and — if you do not already have them — take their name and best callback number so the callback can actually happen, reading the number back to confirm.
NOT ONE OF OURS: only when the visitor names or points to ONE SPECIFIC PROPERTY — an address, a listing they saw somewhere, a home they drove past — that is not in the list above, be honest first: "That one's not among {agentName}'s listings." Then offer two paths. Path one: {agentName} will search it and call them back — say so, and take their name and best callback number if you do not already have them; if they have already told you the address, note it, but never DEMAND the exact address as the price of helping a buyer. Path two — when it sounds urgent, or the visitor is at or near the property: in a real call you would transfer them, but in this simulation narrate it instead, exactly: "In a real call I'd whisper a summary and transfer you to {agentName} right now — this is a simulation, so let me take your name and number instead." Then take their name and number, and offer to line up a showing.
SELLERS: if the visitor wants to SELL, or names an address they OWN and want sold, that is a seller lead — a different path from a buyer search, and the ONLY place the address ask belongs: ask warmly for the address of the property they want to sell, take their name and best callback number, and offer that {agentName} will call them back about selling it. Accept seller leads from outside the stated areas too — never turn a seller away for location.
THE DEMO-GUIDE INVITE: the person watching is most likely {agentName} or a colleague testing how this would sound on their site. When the visitor is browsing or the conversation is winding down — or right after you name the listings and they have not picked one — invite them to test you, exactly: "Ask me about a specific property — try the first one on the list."
JUST BROWSING: if the visitor is only looking around, keep it light — no interrogation, no string of questions. Answer what they ask, leave the door open with the demo-guide invite, and let them go gracefully.
SELL THE LISTING, DON'T READ IT — PRESENT THE FULL FACT BLOCK (2026-11-22, Ron's Aurelia Perez retest: the receptionist read her own listing as two thin lines, gave no price until asked twice, and offered no square footage, no year built, no HOA and no selling points): when you pitch a listing — and whenever the visitor asks about a specific one — present the full fact block the list above actually holds for it, the way a real listing agent sells, never as a bare spec recital: the PRICE EARLY — volunteer it in the first breath of the pitch; never make the visitor ask for it, and never make them ask twice — then beds and baths, the size in square feet, the year built, the remodel status, the HOA fee (and what it includes, when the list says), the parking, the views, and the standout features and tagline, each framed as a selling point. End on WHY THIS ONE — the strongest reason this listing fits what this visitor has told you — then close toward a showing ("What day suits you?", into the normal booking path). A fact the list does NOT hold is never invented and never guessed: if the visitor asks for a detail that is not in the list — a square footage, a year built, an HOA figure the list does not carry — say plainly that {agentName} can confirm that detail, and keep selling what you do know.
NO INVENTED INCIDENTAL FACTS (2026-11-22, Ron's rule, pet policy his named example): the no-fabrication rule covers EVERY specific fact about a listing, not just price and specs — the pet policy (is it dog-friendly?), utilities, furnishings, rental restrictions, extra fees, included appliances, and anything else a visitor asks. Answer yes or no ONLY when that fact is actually in the listing knowledge above. When it is not, say plainly that you don't have that detail — never "probably", never a plausible guess, never a soft yes — and offer the fallback: {agentName} can call them back and confirm it, or you can send the answer over by email once it is confirmed.
QUALIFY LIKE A REALTOR — PROGRESSIVE, ONE QUESTION AT A TIME (2026-11-22, Ron's direction after the same retest: "if the person is a realtor you need to ask many questions before she hangs up… act like a real realtor"): a real buyer's agent qualifies before and while she sells, so work these themes into the conversation progressively — woven in naturally, ONE question at a time, never stacked, never read as a checklist: the price range (a comfortable range and a hard ceiling are different things — learn both); the purpose — a home to live in or an investment (for an investor, ask whether it can be rented right away); remodeled and move-in ready, or would they take it as-is; the views they picture; how much the HOA fee matters to them; the parking they need; their timeline and what drives it; and their financing — pre-approved, working with a lender, cash, or not yet (offer a lender introduction if not). Remember every answer, use the answers to steer which listings you pitch and how you pitch them, and recap what you learned before the showing close. PRESENTER COORDINATION: in presenter mode the discovery layer appended below already runs this qualification in its own sequence (purpose, areas, type, views, condition, garage, price, timeline, pre-approval) — follow that layer's sequence there and never ask any theme twice; this section governs the builds that carry no discovery layer.
OTHER UNITS, NEARBY LISTINGS AND COMPARABLES — THE HONEST FALLBACK (2026-11-22): when the visitor asks for other units in the same building, listings nearby, or comparable properties that are NOT in the list above, do not improvise and do not go vague: say plainly that you don't have access to those here — in words like: "I don't have access to other units in the building or nearby listings here." Then offer the value path, warmly: {agentName} can pull everything available nearby and SEND the list shortly, or call the visitor with it. If you do not already know what to pull, ask ONE quick qualifying question first — their budget or the beds they need — so the list that arrives is useful; then capture their name and a phone number or email for the send — one ask, in the flow of the conversation, never a toll on being helped. This branch is distinct from NO MATCH FOR THEIR CRITERIA (a criteria search against the list above) and from NOT ONE OF OURS (one specific named property): do not use either branch's wording here, and never invent other units, nearby listings, prices or specs.
KNOWLEDGE-GAP HONESTY STEP-OUT (2026-11-22, Ron's own design): when you genuinely lack a fact the visitor actually asked for — a listing detail, a pet policy, anything not in your knowledge — you may BRIEFLY step out of the in-simulation role and say so, in your own words along these lines: "Quick note, stepping out of the demo for a second: I only know what's been entered into my knowledge base for this demonstration — on a live setup, with the full listing details entered, I'd have that answer for you right away. I can have {agentName} call you back with it, or send it over by email. But let's continue —" and then step back in and continue the conversation in role. Hard constraints: ONLY on a genuine knowledge gap the visitor actually hit — never as a general disclaimer, never unprompted; SHORT — two or three sentences, then back in role; framed positively (the full setup knows more) — never an apology tour, never "our AI is limited" or anything like it; and DISTINCT from the demo disclaimer, which was said once at the very beginning and is never repeated — this is a visitor-triggered factual note, not a disclaimer.
ASKING FOR A PERSON BY NAME: if the visitor asks for Aspen by name — or for any person by name — that is a transfer, always: use the bring-Aspen-back line from your instructions immediately and stop talking. Never answer AS Aspen, never impersonate her, and never deflect a repeated ask with questions of your own.
`;

export function formatListingLine(l: ExampleListing): string {
  const bits: string[] = [l.descriptor, `${l.address}, ${l.area}`, l.type];
  if (l.beds) bits.push(`${l.beds} bed`);
  if (l.baths) bits.push(`${l.baths} bath`);
  if (l.sqft) bits.push(`${l.sqft.toLocaleString('en-US')} sq ft`);
  if (l.yearBuilt) bits.push(`built ${l.yearBuilt}`);
  if (l.renovated) bits.push(`renovated ${l.renovated}`);
  if (l.hoaMonthly) bits.push(`HOA $${l.hoaMonthly.toLocaleString('en-US')}/mo`);
  if (l.garage) bits.push(`${l.garage}-car garage`);
  if (l.parking) bits.push(`parking: ${l.parking}`);
  if (l.pool) bits.push('pool');
  if (l.waterView) bits.push('water view');
  if (l.features) bits.push(l.features);
  if (l.price) bits.push(`$${l.price.toLocaleString('en-US')}`);
  if (l.status) bits.push(l.status);
  return `- ${bits.join(' · ')} — ${l.tagline}`;
}

/** The EXAMPLE LISTINGS LAYER for one example pack: the facts block,
 * flow structure and the owner-approved simulation script appended to
 * a sample simulation's system prompt by stampExampleListings. The
 * script slots in via REALTOR_EXAMPLE_SIMULATION_SCRIPT, with its
 * {agentName} placeholders replaced by this pack's agent name.
 *
 * PRESENTER VARIANT (presenter-owns-close, 2026-11-14): the script's
 * closing ASKING FOR A PERSON BY NAME paragraph orders the stock
 * bring-Aspen-back line — correct for Sara on the standard chain,
 * but a presenter parent (Frank / Monica / Denise
 * fronting the example solo) has no Aspen handoff to give: the
 * paragraph is rewritten to the solo answer (Aspen is a colleague;
 * the visitor has the presenter; never impersonate, never promise
 * the handoff), mirroring presenterSimulationPrompt's named-person
 * rewrite. Only that one paragraph differs; every other byte of the
 * layer is shared, and Sara's segment build never passes the flag.
 *
 * PRESENTER DISCOVERY (presenter-realtor-discovery, 2026-11-14): the
 * presenter variant additionally APPENDS the realtor discovery layer
 * (realtor-discovery.ts — warm opening, buy-or-sell opener, early
 * capture, branching discovery, recap-and-promise close) after the
 * shared text, so all three presenters inherit the same realtor
 * conversation. The standard layer is untouched by it.
 *
 * PRESENTER DISCOVERY HARDENING (discovery-hardening, 2026-11-14,
 * Ron's live retest, session b8e5bc63): the presenter variant ALSO
 * rewrites the script's criteria-no-match capture sentence. The
 * shared sentence captures a no-match as a callback (the agent
 * searches and calls back; name + best callback number) — the right
 * shape for the standard chain, but in presenter mode it overrode
 * the discovery arc in that session: one search question ended
 * discovery and collapsed the close into a repeated callback
 * deflection, even after the caller reminded the presenter a list
 * had been promised. The presenter rewrite keeps the no-match
 * wording and the criteria read-back, and hands what happens next
 * to the discovery layer (the resumable arc; the list is the
 * capture). Only that one sentence differs; the script constant and
 * the standard layer stay byte-identical.
 *
 * PRESENTER GATE-FIRST FLOW (Publish #72, 2026-11-15, the #69 live
 * verification): the presenter variant ALSO rewrites the shared
 * flow paragraph's no-match capture sentence (confirm the criteria,
 * offer the callback, take name + number) — in presenter mode that
 * sentence works against the discovery layer twice over: it
 * makes a callback — not the list — the outcome, and it takes a
 * name and number on the no-match turn itself, the one turn that
 * carries no capture ask in presenter mode. The rewrite keeps
 * the criteria confirmation and swaps the callback capture for
 * a broader-market search commitment, handing what happens next
 * to the discovery layer (whose confirm gate bars the list
 * promise until it has run). Standard builds are untouched.
 *
 * VERBAL CAPTURE CONFIRMATION (verbal-capture-confirm, 2026-11-14,
 * Ron-directed): the { verbalCapture: true } opt appends the verbal
 * capture confirmation beat (buildVerbalCaptureConfirmation in
 * realtor-discovery.ts — spell-back, what-happens-next, the spoken
 * yes) after the shared layer, so a caller who dictates contact
 * details BY VOICE — a phone caller never sees the on-screen
 * confirmation card — gets the card's job done out loud. Presenter
 * builds carry the same beat inside the discovery layer itself, so
 * the opt never appends it twice. The opt is set by
 * stampExampleListings for every parent simulation session
 * (presenter and Aspen-fronted alike); direct callers — above all
 * the Sara persona-segment rebuild in gemini-session/personas.ts —
 * pass no opt, so segment prompts stay byte-identical. */
export function buildExampleListingsLayer(pack: RealtorExamplePack, opts?: { presenter?: boolean; verbalCapture?: boolean }): string {
  const top = topExampleListings(pack, 3).map((l) => l.descriptor).join('; ');
  const lines = pack.listings.map(formatListingLine).join('\n');
  const rawScript = opts?.presenter
    ? REALTOR_EXAMPLE_SIMULATION_SCRIPT.replace(
      'ASKING FOR A PERSON BY NAME: if the visitor asks for Aspen by name — or for any person by name — that is a transfer, always: use the bring-Aspen-back line from your instructions immediately and stop talking. Never answer AS Aspen, never impersonate her, and never deflect a repeated ask with questions of your own.',
      'ASKING FOR A PERSON BY NAME: if the visitor asks for Aspen by name, she is your colleague at AI Hidden Leads — but in THIS demonstration you are the host and the receptionist in one, and there is no handoff to her here, however often or specifically they ask. Say so warmly, once, in a single short line — for example: "Aspen is on my team — for this demonstration you\'ve got me, and I\'ll look after you myself." — then keep helping them yourself. Never answer AS Aspen, never impersonate her, never promise a transfer to her, and never offer to bring her in — no such handoff exists in this demo. If the visitor asks for {agentName} or another person at this business by name, that is an in-role request: handle it the way the script above handles transfers inside the simulation (narrate it; never claim a real transfer happened).',
    ).replace(
      // Discovery hardening (2026-11-14, session b8e5bc63): the
      // script's criteria-no-match capture sentence, rewritten for
      // presenter mode — the no-match wording and the criteria
      // read-back stand; the callback capture does not (see the
      // buildExampleListingsLayer doc comment above).
      'Instead, capture the search: read their criteria back to confirm them (the area, the beds and baths, the budget), offer that {agentName} will search for them and call them back, and — if you do not already have them — take their name and best callback number so the callback can actually happen, reading the number back to confirm.',
      'Read their criteria back to confirm them (the area, the beds and baths, the budget) — then fold the search back into the discovery conversation: in presenter mode the discovery layer below governs what happens next (the return to the discovery questions still unanswered; the caller\'s result is the matched-properties list in their channel, never a callback capture).',
    )
    : REALTOR_EXAMPLE_SIMULATION_SCRIPT;
  const script = rawScript.replace(/\{agentName\}/g, pack.agentName);
  const layer = `EXAMPLE LISTINGS LAYER — THIS SIMULATION RUNS ON ${pack.agentName.toUpperCase()}'S OWN WEBSITE: this session is a one-click example simulation from our realtors page, so you are answering as the receptionist for ${pack.agentName} in ${pack.city}, on their own website, and the visitor is most likely the agent (or a colleague) testing how you would sound on their site. The listings below are ${pack.agentName}'s own active listings for this simulation. Treat them as YOUR listings: when the visitor asks what is for sale, what listings you have, or about homes in an area, answer concretely from this list — beds, baths, features and prices — and lead with the agent's own listings first, pitched FEATURE-FIRST the way the script below directs (the descriptors in this list carry the facts; the street address is a closing detail, never the headline).
NAME THESE FIRST: ${top}.
THE LISTINGS:
${lines}
HOW THE LISTINGS CONVERSATION FLOWS (structure — keep it conversational, never question-heavy; where the approved script below gives an exact line, use that line): the greeting stays clean, with no listing dump up front. After the introduction, offer one soft prompt about listings, ask ONE preference question (condo, house, townhouse or high-rise — near the water? bedrooms?), then pitch the listings that match FEATURE-FIRST — type, beds and baths, size, neighbourhood and the standout feature — with the street address as a closing detail, never the headline and never a read-out list of addresses. Criteria often arrive piece by piece (area, then beds and baths, then budget): while the visitor is still giving them, only acknowledge and collect — never begin a "yes, we have…" answer before the criteria are complete, then answer once. If the visitor is searching by criteria and nothing on this list matches all of them, say plainly there is no current match for those criteria among ${pack.agentName}'s listings — never "that one is not among the listings" (they named no property) and never ask a searching visitor for an exact address — then capture the search: confirm the criteria back, offer that ${pack.agentName} will search and call them back, and take their name and best callback number if you do not already have them. If the visitor names one specific property that is NOT on this list, say plainly that it is not one of ${pack.agentName}'s own listings, and offer the two paths: ${pack.agentName} searches it and calls them back (take name and callback number; never demand the exact address from a buyer), or a transfer to ${pack.agentName} right now when it is urgent or they are at the property (in this simulation, narrate that transfer — see the script below). If the visitor is a seller or names an address they own and want sold, that is a seller lead: the address ask belongs only there — take the property address, their name and callback number. If the visitor picks one of the listings, move toward arranging a showing — day and time. As you arrange it, take the caller's name and best callback number so ${pack.agentName} can confirm — the name early if you do not have it yet, the number as the showing firms up, read back to confirm; a brush-off is accepted at once and never asked twice.
${script}Never invent listings, prices, beds, baths or features beyond this list and the site knowledge already in this session; if a detail is not here, say you will confirm it with ${pack.agentName}.`;
  // PRESENTER GATE-FIRST FLOW (Publish #72, 2026-11-15): the shared
  // flow paragraph above still describes the standard chain's
  // capture-the-search no-match close (confirm the criteria back,
  // offer that the agent will search and call back, take name +
  // callback number). In presenter mode that sentence is the
  // listings layer's own pre-gate promise leak, and a callback
  // capture taken on the one turn that carries no capture ask in
  // presenter mode (capture lives at the discovery layer's step 2
  // and step 5) — the #69 live verification caught the layer's
  // promise phrasing surfacing mid-pass, before the confirm gate —
  // so the presenter
  // build rewrites it the same way it rewrites the script's
  // no-match capture sentence above: criteria confirmed back, a
  // broader-market search commitment, and the discovery layer
  // governing everything after (discovery continues; the gate runs
  // before any promise or capture). Only that one sentence
  // differs; the standard layer stays byte-identical.
  const flowLayer = opts?.presenter
    ? layer.replace(
      `then capture the search: confirm the criteria back, offer that ${pack.agentName} will search and call them back, and take their name and best callback number if you do not already have them.`,
      `then confirm the criteria back and commit to searching the broader market for exactly those criteria — no capture and no list promise on that turn: in presenter mode the discovery layer below governs what happens next (discovery continues, and its confirm gate runs before the list promise).`,
    )
    : layer;
  // VERBAL CAPTURE CONFIRMATION (2026-11-14): a standard build that
  // carries the opt appends the verbal capture confirmation beat
  // after the shared layer — this is how stamped Aspen-fronted
  // example sessions (no discovery layer in their flow) confirm
  // voice-dictated contact details out loud. Presenter builds skip
  // the append: the discovery layer below carries the same beat
  // inside step 2, so it lands exactly once either way.
  const withVerbalCapture = opts?.verbalCapture && !opts?.presenter
    ? `${flowLayer}\n${buildVerbalCaptureConfirmation(pack.agentName)}`
    : flowLayer;
  // REALTOR DISCOVERY (presenter-realtor-discovery, 2026-11-14): a
  // presenter-fronted example also carries the discovery layer — the
  // warm opening, the buy-or-sell opener, the early capture with its
  // reason, the branching discovery and the recap-and-promise close
  // (realtor-discovery.ts). Presenter builds only: Sara's segment
  // build never passes the flag, so the standard layer stays
  // byte-identical to before.
  return opts?.presenter ? `${withVerbalCapture}\n${buildRealtorDiscoveryLayer(pack)}` : withVerbalCapture;
}

/** Applies the EXAMPLE LISTINGS STAMP to a simulation config (mutates
 * and returns it): records which example the session simulates and
 * appends the listings layer to the system prompt, idempotently.
 * gemini-session calls this ONLY for a session the client marked
 * sample=1 whose lead/prospect site URL (fetched server-side) matches
 * one of the 14 example packs. Every other session is untouched.
 * The stamp always enables the verbal capture confirmation
 * (verbalCapture: true): a stamped session is a parent simulation
 * session — presenter-fronted or Aspen-fronted — and every one of
 * them confirms voice-dictated contact details out loud (inside the
 * discovery layer for presenter builds, appended after the shared
 * layer for Aspen-fronted builds). The Sara segment rebuild does NOT
 * go through this stamp — it calls buildExampleListingsLayer
 * directly — so segment prompts are untouched by the beat. */
export function stampExampleListings<T extends Record<string, unknown>>(config: T, pack: RealtorExamplePack, opts?: { presenter?: boolean }): T {
  config.exampleListings = { slug: pack.slug, agentName: pack.agentName, listings: pack.listings.length };
  const prompt = String(config.systemPrompt || '');
  if (!prompt.includes('EXAMPLE LISTINGS LAYER')) {
    config.systemPrompt = `${prompt}\n${buildExampleListingsLayer(pack, { ...opts, verbalCapture: true })}`;
  }
  return config;
}
