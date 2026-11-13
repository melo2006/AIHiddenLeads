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
      { address: "2720 NE 49th Street", area: "Coral Ridge Isles, Fort Lauderdale", type: "house", beds: 3, baths: 2, garage: 2, pool: true, waterView: false, price: 925000, descriptor: "the Coral Ridge Isles house on NE 49th Street", tagline: "Pool home in a quiet, boater-friendly neighborhood.", source: "sample" },
      { address: "620 SE 12th Street #5", area: "Rio Vista, Fort Lauderdale", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 615000, descriptor: "the Rio Vista condo on SE 12th Street", tagline: "Boutique-building condo living in Rio Vista.", source: "sample" },
      { address: "4181 NW 5th Street #307", area: "Plantation", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 319000, descriptor: "the Plantation condo on NW 5th Street", tagline: "An affordable 2 bed, 2 bath in the heart of Plantation.", source: "sample" },
      { address: "1830 Radius Drive #1121", area: "Hollywood", type: "condo", beds: 1, baths: 1, pool: true, waterView: false, price: 389000, descriptor: "the Hollywood condo at Radius", tagline: "Resort-style amenities near Young Circle in Hollywood.", source: "sample" },
      { address: "2900 NE 14th Street #903", area: "Galt Ocean Mile, Fort Lauderdale", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, price: 699000, descriptor: "the Galt Ocean Mile condo on NE 14th Street", tagline: "On the sand at the Galt Ocean Mile \u2014 Intracoastal behind, ocean in front.", source: "sample" },
    ],
  },
  {
    slug: "ashley-cusack",
    url: "https://ashleycusack.com/",
    agentName: "Ashley Cusack",
    city: "Coral Gables",
    listings: [
      { address: "1245 Algardi Avenue", area: "Coral Gables", type: "house", price: 2495000, descriptor: "the house at 1245 Algardi Avenue in the Gables", tagline: "Old Spanish charm on one of Coral Gables' prettiest streets.", source: "site" },
      { address: "1225 Algardi Avenue", area: "Coral Gables", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 2195000, descriptor: "the Algardi Avenue neighbor at 1225", tagline: "Four beds with a pool, a few doors down on Algardi.", source: "sample" },
      { address: "718 Anastasia Avenue", area: "Coral Gables", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 1650000, descriptor: "the Anastasia Avenue house", tagline: "Classic Gables cottage living near the Biltmore.", source: "sample" },
      { address: "1300 Asturia Avenue", area: "Coral Gables", type: "house", beds: 5, baths: 4, garage: 2, pool: true, waterView: false, price: 3350000, descriptor: "the Asturia Avenue estate", tagline: "Five beds of gracious Gables living with a resort pool.", source: "sample" },
      { address: "515 Barbarossa Avenue", area: "Coral Gables", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: true, price: 4895000, descriptor: "the Barbarossa Avenue waterfront", tagline: "On the Coral Gables waterway \u2014 dock your boat out back.", source: "sample" },
      { address: "2610 Columbus Boulevard", area: "Coral Gables", type: "house", beds: 3, baths: 3, garage: 1, pool: true, waterView: false, price: 1875000, descriptor: "the Columbus Boulevard house", tagline: "Updated and move-in ready in the heart of the Gables.", source: "sample" },
      { address: "1607 Algeciras Avenue", area: "Coral Gables", type: "house", beds: 4, baths: 3, garage: 2, pool: false, waterView: false, price: 2050000, descriptor: "the Algeciras Avenue house", tagline: "Tree-lined street, generous rooms, true Gables character.", source: "sample" },
      { address: "925 Anastasia Avenue #4", area: "Coral Gables", type: "condo", beds: 2, baths: 2, pool: false, waterView: false, price: 785000, descriptor: "the Anastasia Avenue condo", tagline: "A low-maintenance way into Coral Gables \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "5812 Maynada Street", area: "Coral Gables", type: "house", beds: 5, baths: 5, garage: 2, pool: true, waterView: false, price: 3950000, descriptor: "the Maynada Street estate", tagline: "South Gables scale \u2014 five beds, five baths, and a summer kitchen.", source: "sample" },
      { address: "3401 Pine Tree Drive", area: "Miami Beach", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: true, price: 5250000, descriptor: "the Pine Tree Drive house on Miami Beach", tagline: "Bay-side Miami Beach living on storied Pine Tree Drive.", source: "sample" },
    ],
  },
  {
    slug: "aurelia-perez",
    url: "https://www.aureliaperez.com/",
    agentName: "Aurelia Perez",
    city: "Fort Lauderdale",
    listings: [
      { address: "412 Las Olas Isle", area: "Las Olas Isles, Fort Lauderdale", type: "house", waterView: true, price: 2450000, descriptor: "the waterfront home at 412 Las Olas Isle", tagline: "Point lot on the water in the Las Olas Isles, minutes from the beach and Las Olas Boulevard.", source: "site" },
      { address: "2300 SE 11th Street", area: "Rio Vista, Fort Lauderdale", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 1895000, descriptor: "the Rio Vista house on SE 11th Street", tagline: "Classic Rio Vista living with a pool and room to entertain.", source: "sample" },
      { address: "2100 S Ocean Lane #1205", area: "Point of Americas, Fort Lauderdale", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, price: 875000, descriptor: "the ocean-view condo at Point of Americas", tagline: "Wake up to the inlet and the ocean \u2014 2 bed, 2 bath with resort amenities.", source: "sample" },
      { address: "1615 SE 15th Street", area: "Harbor Beach, Fort Lauderdale", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 1249000, descriptor: "the Harbor Beach house on SE 15th Street", tagline: "A block from the sand in one of Fort Lauderdale's favorite neighborhoods.", source: "sample" },
      { address: "900 NE 18th Avenue #204", area: "Victoria Park, Fort Lauderdale", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 549000, descriptor: "the Victoria Park condo on NE 18th Avenue", tagline: "Easy-care 2 bed, 2 bath in the heart of Victoria Park.", source: "sample" },
      { address: "3040 NE 47th Street", area: "Coral Ridge, Fort Lauderdale", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: true, price: 3295000, descriptor: "the Coral Ridge waterfront on NE 47th Street", tagline: "Deep-water dockage and sunset views in Coral Ridge.", source: "sample" },
      { address: "1318 SE 12th Street", area: "Rio Vista, Fort Lauderdale", type: "house", beds: 3, baths: 3, garage: 1, pool: true, waterView: false, price: 1475000, descriptor: "the second Rio Vista house, on SE 12th Street", tagline: "Charming Rio Vista cottage feel with a private pool.", source: "sample" },
      { address: "401 SW 4th Avenue #1500", area: "Downtown Fort Lauderdale", type: "condo", beds: 1, baths: 1, pool: true, waterView: true, price: 429000, descriptor: "the downtown high-rise condo on SW 4th Avenue", tagline: "River views and downtown at your feet \u2014 a smart starter or pied-\u00e0-terre.", source: "sample" },
      { address: "2525 NE 32nd Street", area: "Coral Ridge Country Club, Fort Lauderdale", type: "house", beds: 5, baths: 4, garage: 3, pool: true, waterView: false, price: 2750000, descriptor: "the Country Club house on NE 32nd Street", tagline: "Five beds on the golf course side of Coral Ridge Country Club.", source: "sample" },
      { address: "1700 S Ocean Boulevard #8B", area: "Lauderdale Beach, Fort Lauderdale", type: "condo", beds: 3, baths: 3, pool: true, waterView: true, price: 1675000, descriptor: "the beachfront condo on South Ocean Boulevard", tagline: "Direct ocean frontage \u2014 watch the sunrise from every room.", source: "sample" },
    ],
  },
  {
    slug: "baldemar-deleon",
    url: "https://www.baldemardeleon.com/",
    agentName: "Baldemar De Leon",
    city: "Dallas",
    listings: [
      { address: "9639 Brentgate Drive", area: "Dallas", type: "house", beds: 4, baths: 3, price: 699000, descriptor: "the Brentgate Drive house", tagline: "4 bed, 3 bath family home in Dallas \u2014 active now.", source: "sample" },
      { address: "5860 Marina Drive #24", area: "Garland", type: "condo", beds: 3, baths: 2, waterView: true, price: 325000, descriptor: "the Marina Drive condo in Garland", tagline: "Lake Ray Hubbard living in Garland.", source: "sample" },
      { address: "1213 Hampton Drive", area: "Forney", type: "house", beds: 4, baths: 3, price: 465000, status: "Pending", descriptor: "the Hampton Drive house in Forney", tagline: "Four beds in Forney \u2014 currently pending.", source: "sample" },
      { address: "7423 Meadowbrook Drive", area: "Dallas", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 525000, descriptor: "the Meadowbrook Drive house", tagline: "Classic 3 bed in a leafy Dallas neighborhood.", source: "sample" },
      { address: "6118 Mercedes Avenue", area: "Lakewood, Dallas", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: false, price: 1175000, descriptor: "the Mercedes Avenue house in Lakewood", tagline: "Lakewood living near White Rock Lake \u2014 pool included.", source: "sample" },
      { address: "4321 Cole Avenue #1204", area: "Uptown Dallas", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 489000, descriptor: "the Uptown condo on Cole Avenue", tagline: "Uptown high-rise living \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "10215 Rosser Road", area: "Dallas", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 649000, descriptor: "the Rosser Road house", tagline: "Updated 4 bed with a pool in north Dallas.", source: "sample" },
      { address: "2914 Mapleleaf Lane", area: "Dallas", type: "townhouse", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 415000, descriptor: "the Mapleleaf Lane townhouse", tagline: "Low-maintenance townhouse in Dallas proper.", source: "sample" },
      { address: "8810 Lakemont Drive", area: "Dallas", type: "house", beds: 5, baths: 5, garage: 3, pool: true, waterView: true, price: 1395000, descriptor: "the Lakemont Drive house", tagline: "Five beds near the lake with room for everyone.", source: "sample" },
      { address: "1515 Main Street #3801", area: "Downtown Dallas", type: "condo", beds: 3, baths: 3, pool: true, waterView: false, price: 925000, descriptor: "the downtown penthouse on Main Street", tagline: "Skyline views from a Main Street penthouse floor.", source: "sample" },
    ],
  },
  {
    slug: "danielle-lazier",
    url: "https://daniellelazier.com/",
    agentName: "Danielle Lazier",
    city: "San Francisco",
    listings: [
      { address: "3861 20th Street", area: "Noe Valley, San Francisco", type: "house", beds: 3, baths: 3, price: 2895000, descriptor: "the Noe Valley house on 20th Street", tagline: "Sunny Noe Valley Victorian living \u2014 3 bed, 3 bath.", source: "sample" },
      { address: "2150 Leavenworth Street", area: "Russian Hill, San Francisco", type: "house", beds: 4, baths: 4, waterView: true, price: 4650000, descriptor: "the Russian Hill house on Leavenworth", tagline: "Bay glimpses and classic bones on Russian Hill.", source: "sample" },
      { address: "3655 Fillmore Street #204", area: "Marina District, San Francisco", type: "condo", beds: 2, baths: 2, waterView: false, price: 1495000, descriptor: "the Marina condo on Fillmore Street", tagline: "2 bed, 2 bath a stroll from the Marina Green.", source: "sample" },
      { address: "1177 California Street #1705", area: "Nob Hill, San Francisco", type: "condo", beds: 2, baths: 2, waterView: true, price: 1275000, descriptor: "the Nob Hill condo on California Street", tagline: "High-floor views over Nob Hill and downtown.", source: "sample" },
      { address: "2820 Scott Street", area: "Pacific Heights, San Francisco", type: "house", beds: 5, baths: 5, waterView: true, price: 7950000, descriptor: "the Pacific Heights house on Scott Street", tagline: "Five beds of Pacific Heights grandeur.", source: "sample" },
      { address: "4348 26th Street", area: "Noe Valley, San Francisco", type: "house", beds: 4, baths: 3, waterView: false, price: 3395000, descriptor: "the second Noe Valley house, on 26th Street", tagline: "Four beds above Noe Valley with a garden level.", source: "sample" },
      { address: "88 King Street #912", area: "Mission Bay, San Francisco", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 1095000, descriptor: "the Mission Bay condo on King Street", tagline: "Modern 2 bed, 2 bath across from the ballpark.", source: "sample" },
      { address: "145 Gardenside Drive", area: "Glen Park, San Francisco", type: "house", beds: 3, baths: 3, waterView: false, price: 2175000, descriptor: "the Glen Park house on Gardenside Drive", tagline: "Village living in Glen Park \u2014 3 bed, 3 bath.", source: "sample" },
      { address: "3011 Fillmore Street #3", area: "Cow Hollow, San Francisco", type: "condo", beds: 2, baths: 2, waterView: false, price: 1695000, descriptor: "the Cow Hollow flat on Fillmore", tagline: "A classic San Francisco flat in Cow Hollow.", source: "sample" },
      { address: "3964 Cesar Chavez Street", area: "Mission District, San Francisco", type: "house", beds: 3, baths: 3, waterView: false, price: 1995000, descriptor: "the Mission house on Cesar Chavez", tagline: "Sun and space in the Mission \u2014 3 bed, 3 bath.", source: "sample" },
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
      { address: "2245 E 2700 S", area: "Sugar House, Salt Lake City", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 689000, descriptor: "the Sugar House house on 2700 South", tagline: "Classic Sugar House brick \u2014 3 bed, 2 bath.", source: "sample" },
      { address: "1873 E Herbert Avenue", area: "Salt Lake City", type: "house", beds: 4, baths: 3, garage: 2, pool: false, waterView: false, price: 925000, descriptor: "the Herbert Avenue house", tagline: "Four beds in the avenues-adjacent east bench.", source: "sample" },
      { address: "456 E Capitol Boulevard", area: "Capitol Hill, Salt Lake City", type: "house", beds: 3, baths: 2, garage: 1, pool: false, waterView: true, price: 765000, descriptor: "the Capitol Hill house", tagline: "Historic Capitol Hill charm with downtown views.", source: "sample" },
      { address: "3120 E Louise Avenue", area: "Millcreek", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 849000, descriptor: "the Louise Avenue house in Millcreek", tagline: "Pool and mountain views in Millcreek.", source: "sample" },
      { address: "88 W Broadway #706", area: "Downtown Salt Lake City", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 465000, descriptor: "the downtown condo on Broadway", tagline: "Lock-and-leave 2 bed, 2 bath in downtown Salt Lake.", source: "sample" },
      { address: "2750 E Parleys Way", area: "Salt Lake City", type: "house", beds: 5, baths: 4, garage: 3, pool: false, waterView: false, price: 1275000, descriptor: "the Parleys Way house", tagline: "Five beds at the mouth of Parleys Canyon.", source: "sample" },
      { address: "1353 E Tomahawk Drive", area: "Salt Lake City", type: "house", beds: 4, baths: 3, garage: 2, pool: false, waterView: false, price: 798000, descriptor: "the Tomahawk Drive house", tagline: "East-bench living on Tomahawk Drive \u2014 4 bed, 3 bath.", source: "sample" },
    ],
  },
  {
    slug: "jean-luc-andriot",
    url: "https://jeanlucandriot.com/",
    agentName: "Jean-Luc Andriot",
    city: "Boca Raton",
    listings: [
      { address: "500 SE Mizner Boulevard #A209", area: "Townsend Place, Downtown Boca Raton", type: "condo", beds: 2, baths: 3, garage: 2, sqft: 1802, descriptor: "the Townsend Place condo on SE Mizner Boulevard", tagline: "A gated, amenity-rich downtown condo just steps from Mizner Park shops and minutes from the beach.", source: "site" },
      { address: "100 SE Mizner Boulevard #712", area: "Downtown Boca Raton", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 725000, descriptor: "the downtown condo on SE Mizner Boulevard", tagline: "Walk to Mizner Park \u2014 2 bed, 2 bath with amenities.", source: "sample" },
      { address: "5800 NE Spanish Trail", area: "Boca Raton", type: "house", beds: 4, baths: 4, garage: 3, pool: true, waterView: false, price: 3495000, descriptor: "the Spanish Trail estate", tagline: "East Boca estate living with a pool and 3-car garage.", source: "sample" },
      { address: "2490 Tecumseh Drive", area: "Boca Raton", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 1875000, descriptor: "the Tecumseh Drive house", tagline: "Four beds in Royal Oak Hills with a private pool.", source: "sample" },
      { address: "720 E Camino Street", area: "Boca Raton", type: "house", beds: 3, baths: 3, garage: 2, pool: false, waterView: false, price: 1425000, descriptor: "the Camino Street house", tagline: "Old Floresta charm on Camino Street.", source: "sample" },
      { address: "300 SE Mizner Boulevard #907", area: "Downtown Boca Raton", type: "condo", beds: 3, baths: 3, pool: true, waterView: true, price: 1195000, descriptor: "the Mizner Boulevard penthouse-floor condo", tagline: "Three beds high above downtown Boca.", source: "sample" },
      { address: "1750 Spanish River Road", area: "Boca Raton", type: "house", beds: 5, baths: 5, garage: 3, pool: true, waterView: true, price: 6950000, descriptor: "the Spanish River Road waterfront", tagline: "Intracoastal frontage on Spanish River Road.", source: "sample" },
      { address: "451 Camino Gardens Lane", area: "Boca Raton", type: "townhouse", beds: 3, baths: 3, garage: 2, pool: true, waterView: false, price: 975000, descriptor: "the Camino Gardens townhouse", tagline: "Townhouse ease in Camino Gardens, near the beach.", source: "sample" },
      { address: "899 Camino Real #12B", area: "Boca Raton", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 565000, descriptor: "the Camino Real condo", tagline: "A 2 bed, 2 bath way into east Boca.", source: "sample" },
      { address: "2240 NE Spanish Trail", area: "Boca Raton", type: "house", beds: 5, baths: 4, garage: 2, pool: true, waterView: false, price: 2350000, descriptor: "the second Spanish Trail house, on NE Spanish Trail", tagline: "Five beds of family living in east Boca Raton.", source: "sample" },
    ],
  },
  {
    slug: "logan-walter",
    url: "https://loganwalter.com/",
    agentName: "Logan Walter",
    city: "Dallas",
    listings: [
      { address: "5714 Mercedes Avenue", area: "Lakewood, Dallas", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: false, price: 1295000, descriptor: "the Mercedes Avenue house in Lakewood", tagline: "Lakewood living near White Rock Lake \u2014 pool and 4 beds.", source: "sample" },
      { address: "1209 Province Lane", area: "Frisco", type: "house", beds: 5, baths: 5, garage: 3, pool: true, waterView: false, price: 975000, descriptor: "the Province Lane house in Frisco", tagline: "Five beds in Frisco's top school zones.", source: "sample" },
      { address: "3304 Crown Ridge Court", area: "Celina", type: "house", beds: 5, baths: 5, garage: 4, pool: true, waterView: false, price: 1425000, descriptor: "the Crown Ridge Court house in Celina", tagline: "Acreage and a resort backyard in Celina.", source: "sample" },
      { address: "4812 Swiss Avenue", area: "Swiss Avenue, Dallas", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: false, price: 1875000, descriptor: "the Swiss Avenue historic house", tagline: "Historic-district grandeur on Swiss Avenue.", source: "sample" },
      { address: "2323 N Houston Street #907", area: "Victory Park, Dallas", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 565000, descriptor: "the Victory Park high-rise condo", tagline: "High-rise views over Victory Park \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "6911 Lakeshore Drive", area: "Dallas", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: true, price: 1150000, descriptor: "the Lakeshore Drive house", tagline: "On the lake side of Dallas with a private pool.", source: "sample" },
      { address: "1520 Norwick Drive", area: "Parker", type: "house", beds: 5, baths: 5, garage: 4, pool: true, waterView: false, price: 1650000, descriptor: "the Norwick Drive estate in Parker", tagline: "Estate acreage in Parker Ranch country.", source: "sample" },
      { address: "4400 McKinney Avenue #1201", area: "Uptown Dallas", type: "condo", beds: 3, baths: 3, pool: true, waterView: false, price: 825000, descriptor: "the McKinney Avenue condo in Uptown", tagline: "Uptown living \u2014 3 bed, 3 bath with skyline views.", source: "sample" },
      { address: "3807 Cedar Sage Court", area: "Anna", type: "house", beds: 4, baths: 4, garage: 3, pool: false, waterView: false, price: 685000, descriptor: "the Cedar Sage Court house in Anna", tagline: "Newer 4 bed in fast-growing Anna.", source: "sample" },
      { address: "5601 Maple Springs Boulevard", area: "Dallas", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 895000, descriptor: "the Maple Springs house", tagline: "Updated 4 bed with a pool in north Dallas.", source: "sample" },
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
      { address: "1235 Asturia Avenue", area: "Coral Gables", type: "house", beds: 4, baths: 4, garage: 2, pool: true, waterView: false, price: 3675000, descriptor: "the second Asturia Avenue house", tagline: "Pool, privacy and Gables architecture on Asturia.", source: "sample" },
      { address: "5421 Orduna Drive", area: "Coral Gables", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 2295000, descriptor: "the Orduna Drive house", tagline: "Family-sized and pool-ready in south Gables.", source: "sample" },
      { address: "2611 De Soto Boulevard", area: "Coral Gables", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: true, price: 1995000, descriptor: "the De Soto Boulevard house", tagline: "Overlooking the waterway on De Soto Boulevard.", source: "sample" },
      { address: "60 Edgewater Drive #4B", area: "Coral Gables", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, price: 925000, descriptor: "the Edgewater Drive condo", tagline: "Bay views from Edgewater Drive \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "912 Algardi Avenue", area: "Coral Gables", type: "house", beds: 3, baths: 3, garage: 1, pool: true, waterView: false, price: 1795000, descriptor: "the Algardi Avenue house", tagline: "Old Gables soul with a private pool on Algardi.", source: "sample" },
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
      { address: "6600 W Atlantic Avenue #210", area: "Delray Beach", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 329000, descriptor: "the West Atlantic Avenue condo", tagline: "An easy 2 bed, 2 bath in west Delray.", source: "sample" },
      { address: "15325 Via Fontana", area: "Delray Beach", type: "house", beds: 3, baths: 2, garage: 2, pool: true, waterView: true, price: 685000, descriptor: "the Via Fontana house", tagline: "Lake-view pool home in a 55+ Delray community.", source: "sample" },
      { address: "7240 Clunie Place", area: "Delray Beach", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 915000, descriptor: "the Clunie Place house", tagline: "Four beds with a pool in west Delray Beach.", source: "sample" },
      { address: "10950 Poinciana Drive", area: "Boynton Beach", type: "house", beds: 3, baths: 2, garage: 2, pool: false, waterView: false, price: 565000, descriptor: "the Boynton Beach house on Poinciana Drive", tagline: "Solid 3 bed value in Boynton Beach.", source: "sample" },
      { address: "5025 Wellesley Park Drive #43", area: "Boynton Beach", type: "condo", beds: 2, baths: 2, pool: true, waterView: false, price: 289000, descriptor: "the Wellesley Park condo", tagline: "Starter or snowbird condo under $300K in Boynton.", source: "sample" },
      { address: "13817 Packard Terrace", area: "Delray Beach", type: "house", beds: 3, baths: 2, garage: 2, pool: true, waterView: false, price: 629000, descriptor: "the Packard Terrace house", tagline: "Pool home in a family-friendly Delray neighborhood.", source: "sample" },
      { address: "2255 S Ocean Boulevard #12", area: "Highland Beach", type: "condo", beds: 2, baths: 2, pool: true, waterView: true, price: 749000, descriptor: "the Highland Beach ocean condo", tagline: "On the sand in Highland Beach \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "6495 Las Casitas Drive", area: "Boynton Beach", type: "townhouse", beds: 3, baths: 3, garage: 1, pool: false, waterView: false, price: 475000, descriptor: "the Las Casitas townhouse", tagline: "Three-bed townhouse living in Boynton Beach.", source: "sample" },
      { address: "17741 Scarsdale Way", area: "Boca Raton", type: "house", beds: 4, baths: 3, garage: 2, pool: true, waterView: false, price: 1050000, descriptor: "the Scarsdale Way house in Boca", tagline: "Country-club community living in west Boca.", source: "sample" },
      { address: "3910 S Ocean Boulevard #PH2", area: "Highland Beach", type: "condo", beds: 3, baths: 4, pool: true, waterView: true, price: 1650000, descriptor: "the Highland Beach penthouse", tagline: "Penthouse views over the ocean in Highland Beach.", source: "sample" },
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
      { address: "1150 Park Avenue #8C", area: "Upper East Side, New York", type: "condo", beds: 3, baths: 3, waterView: false, price: 3850000, descriptor: "the second Park Avenue residence, at 1150", tagline: "Classic Park Avenue living \u2014 3 bed, 3 bath.", source: "sample" },
      { address: "320 West End Avenue #12A", area: "Upper West Side, New York", type: "condo", beds: 2, baths: 2, waterView: true, price: 1875000, descriptor: "the West End Avenue two-bedroom", tagline: "A 2 bed, 2 bath with river glimpses on the Upper West Side.", source: "sample" },
      { address: "40 East 84th Street #5D", area: "Upper East Side, New York", type: "condo", beds: 2, baths: 2, waterView: false, price: 1695000, descriptor: "the East 84th Street co-op", tagline: "Museum-block living on East 84th \u2014 2 bed, 2 bath.", source: "sample" },
      { address: "188 East 70th Street #3B", area: "Lenox Hill, New York", type: "condo", beds: 1, baths: 1, waterView: false, price: 725000, descriptor: "the East 70th Street one-bedroom", tagline: "A Lenox Hill starter or pied-\u00e0-terre under $750K.", source: "sample" },
      { address: "245 East 93rd Street #26C", area: "Upper East Side, New York", type: "condo", beds: 3, baths: 3, waterView: false, price: 2450000, descriptor: "the East 93rd Street residence", tagline: "High-floor 3 bed, 3 bath with city views.", source: "sample" },
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
 * is not one of the 13 known examples. */
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
export const REALTOR_EXAMPLE_SIMULATION_SCRIPT = `SIMULATION SCRIPT — OWNER-APPROVED WORDING (follow it for the listings conversation in this simulation: use the quoted lines as written, keep everything around them warm and natural, and never stack questions — one question at a time, and let the visitor lead):
DOOR-OPENER: your greeting stays clean, with no listing dump up front. Early on, once the visitor has said what they are calling about, you may ask at most ONE soft door-opener, exactly: "Are you calling about one of our listings today?" If they say no or change the subject, drop it and help with whatever they asked.
THE LISTING MOMENT: once the visitor shows any interest in listings, name the top listings from NAME THESE FIRST above — two or three of them — each by its descriptor (street, neighbourhood and one feature, the way {agentName}'s own site headlines it), with a touch of its tagline. If this session's list holds more than three listings, finish with "and a few others on the site". If the list holds exactly one listing, feature that one on its own. Never read out the whole list.
THEY PICK ONE: answer from that listing's real details in the list above — beds, baths, size, features, price, status — and nothing beyond them, then close toward a showing: "What day suits you?" and take it into the normal booking path.
NOT ONE OF OURS: if the visitor asks about a property that is not in the list above, be honest first: "That one's not among {agentName}'s listings." Then offer two paths. Path one: "Give me the exact address, and {agentName} will search it and call you back." Path two — when it sounds urgent, or the visitor is at or near the property: in a real call you would transfer them, but in this simulation narrate it instead, exactly: "In a real call I'd whisper a summary and transfer you to {agentName} right now — this is a simulation, so let me take your name and number instead." Then take their name and number, and offer to line up a showing.
THE DEMO-GUIDE INVITE: the person watching is most likely {agentName} or a colleague testing how this would sound on their site. When the visitor is browsing or the conversation is winding down — or right after you name the listings and they have not picked one — invite them to test you, exactly: "Ask me about a specific property — try the first one on the list."
JUST BROWSING: if the visitor is only looking around, keep it light — no interrogation, no string of questions. Answer what they ask, leave the door open with the demo-guide invite, and let them go gracefully.
`;

function formatListingLine(l: ExampleListing): string {
  const bits: string[] = [l.descriptor, `${l.address}, ${l.area}`, l.type];
  if (l.beds) bits.push(`${l.beds} bed`);
  if (l.baths) bits.push(`${l.baths} bath`);
  if (l.sqft) bits.push(`${l.sqft.toLocaleString('en-US')} sq ft`);
  if (l.garage) bits.push(`${l.garage}-car garage`);
  if (l.pool) bits.push('pool');
  if (l.waterView) bits.push('water view');
  if (l.price) bits.push(`$${l.price.toLocaleString('en-US')}`);
  if (l.status) bits.push(l.status);
  return `- ${bits.join(' · ')} — ${l.tagline}`;
}

/** The EXAMPLE LISTINGS LAYER for one example pack: the facts block,
 * flow structure and the owner-approved simulation script appended to
 * a sample simulation's system prompt by stampExampleListings. The
 * script slots in via REALTOR_EXAMPLE_SIMULATION_SCRIPT, with its
 * {agentName} placeholders replaced by this pack's agent name. */
export function buildExampleListingsLayer(pack: RealtorExamplePack): string {
  const top = topExampleListings(pack, 3).map((l) => l.descriptor).join('; ');
  const lines = pack.listings.map(formatListingLine).join('\n');
  const script = REALTOR_EXAMPLE_SIMULATION_SCRIPT.replace(/\{agentName\}/g, pack.agentName);
  return `EXAMPLE LISTINGS LAYER — THIS SIMULATION RUNS ON ${pack.agentName.toUpperCase()}'S OWN WEBSITE: this session is a one-click example simulation from our realtors page, so you are answering as the receptionist for ${pack.agentName} in ${pack.city}, on their own website, and the visitor is most likely the agent (or a colleague) testing how you would sound on their site. The listings below are ${pack.agentName}'s own active listings for this simulation. Treat them as YOUR listings: when the visitor asks what is for sale, what listings you have, or about homes in an area, answer concretely from this list — beds, baths, features and prices — and lead with the agent's own listings first, naming each the way their site does, by its descriptor.
NAME THESE FIRST: ${top}.
THE LISTINGS:
${lines}
HOW THE LISTINGS CONVERSATION FLOWS (structure — keep it conversational, never question-heavy; where the approved script below gives an exact line, use that line): the greeting stays clean, with no listing dump up front. After the introduction, offer one soft prompt about listings, then name the top listings above by descriptor, adapting the count to how many listings there are. If the visitor asks about a property that is NOT on this list, say plainly that it is not one of ${pack.agentName}'s own listings, and offer the two paths: take the exact address and arrange a search with a callback, or a transfer to ${pack.agentName} right now when it is urgent or they are at the property (in this simulation, narrate that transfer — see the script below). If the visitor picks one of the listings, move toward arranging a showing — day and time.
${script}Never invent listings, prices, beds, baths or features beyond this list and the site knowledge already in this session; if a detail is not here, say you will confirm it with ${pack.agentName}.`;
}

/** Applies the EXAMPLE LISTINGS STAMP to a simulation config (mutates
 * and returns it): records which example the session simulates and
 * appends the listings layer to the system prompt, idempotently.
 * gemini-session calls this ONLY for a session the client marked
 * sample=1 whose lead/prospect site URL (fetched server-side) matches
 * one of the 13 example packs. Every other session is untouched. */
export function stampExampleListings<T extends Record<string, unknown>>(config: T, pack: RealtorExamplePack): T {
  config.exampleListings = { slug: pack.slug, agentName: pack.agentName, listings: pack.listings.length };
  const prompt = String(config.systemPrompt || '');
  if (!prompt.includes('EXAMPLE LISTINGS LAYER')) {
    config.systemPrompt = `${prompt}\n${buildExampleListingsLayer(pack)}`;
  }
  return config;
}
