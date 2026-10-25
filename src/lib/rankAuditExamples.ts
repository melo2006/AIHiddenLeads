export type RankAuditMode = "maps" | "nationwide";
export interface RankAuditExample { id: string; name: string; website: string; location: string; keyword: string; mode: RankAuditMode; source: string }

// Public business examples, not customers, endorsements or measured rankings.
export const rankAuditExamples: RankAuditExample[] = [
  { id: "plumber", name: "South Florida Plumbing and Backflow", website: "https://www.sfplumbingandbackflow.com/fort-lauderdale-fl/", location: "Fort Lauderdale, FL", keyword: "plumber", mode: "maps", source: "https://www.sfplumbingandbackflow.com/fort-lauderdale-fl/" },
  { id: "manufacturer", name: "Industrial Technology", website: "https://industrialtech.com/", location: "3850 Byron Drive, Suite 3, Riviera Beach, FL 33404", keyword: "custom manufacturing", mode: "maps", source: "https://industrialtech.com/" },
  { id: "supplier", name: "Nationwide Industrial Supply", website: "https://www.nationwideindustrialsupply.com/", location: "", keyword: "industrial supplies", mode: "nationwide", source: "https://www.nationwideindustrialsupply.com/" },
  { id: "bank", name: "BankUnited", website: "https://www.bankunited.com/", location: "337 E Las Olas Blvd, Fort Lauderdale, FL 33301", keyword: "bank", mode: "maps", source: "https://www.bankunited.com/our-locations/florida" },
];

export function validateAuditInputs(mode: RankAuditMode, name: string, location: string, keyword: string, website: string) {
  if (!name.trim()) return "Enter the exact business or branch name.";
  if (!keyword.trim()) return "Enter a service customers search for, such as plumber or industrial supplies.";
  if (mode === "maps" && !location.trim()) return "Enter the branch address or city and state for the local map audit.";
  if (mode === "nationwide") {
    try { const url = new URL(website.startsWith("http") ? website : `https://${website}`); if (!url.hostname.includes(".")) throw new Error(); }
    catch { return "Enter the business website for the nationwide domain search."; }
  }
  return null;
}