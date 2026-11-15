export type RankAuditMode = "maps" | "nationwide";
export interface RankAuditExample { id: string; name: string; website: string; location: string; keyword: string; mode: RankAuditMode; source: string; industry: string; category: string }

// Public business examples, not customers, endorsements or measured rankings.
export const rankAuditExamples: RankAuditExample[] = [
  { id: "cleaning", name: "Willing Cleaning Company", website: "https://willingcleaningco.com/", location: "Grand Rapids, MI", keyword: "commercial cleaning", mode: "maps", source: "https://willingcleaningco.com/", industry: "Commercial cleaning", category: "Commercial cleaning" },
  { id: "manufacturer", name: "ARZ Machining Inc.", website: "https://www.arzmachining.com/", location: "Grafton, WI", keyword: "CNC machine shop", mode: "maps", source: "https://www.arzmachining.com/", industry: "B2B / industrial", category: "Contract machining" },
  { id: "hvac", name: "Shobu’s Refrigeration & Air Conditioning, Inc.", website: "https://www.shobusac.com/", location: "Kapolei, HI", keyword: "commercial HVAC service", mode: "maps", source: "https://www.shobusac.com/solutions/commercial-hvac-oahu", industry: "HVAC", category: "Commercial HVAC · Oʻahu" },
  { id: "supplier", name: "Seal-Tec", website: "https://www.seal-tec.com/", location: "Grand Rapids, MI", keyword: "industrial packaging supplies", mode: "nationwide", source: "https://www.seal-tec.com/", industry: "B2B / industrial", category: "Industrial packaging" },
];

export function validateAuditInputs(mode: RankAuditMode, name: string, location: string, keyword: string, website: string) {
  if (!name.trim()) return "rankAudit.errName";
  if (!keyword.trim()) return "rankAudit.errKeyword";
  if (mode === "maps" && !location.trim()) return "rankAudit.errLocation";
  if (mode === "nationwide") {
    try { const url = new URL(website.startsWith("http") ? website : `https://${website}`); if (!url.hostname.includes(".")) throw new Error(); }
    catch { return "rankAudit.errWebsite"; }
  }
  return null;
}