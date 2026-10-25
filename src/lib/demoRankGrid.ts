export interface AuditContext { businessName: string; city?: string; niche?: string }
export type RankTone = "good" | "warning" | "bad";
export const auditOffers = { founder: 99, mapsBoost: 149, monthlyLeads: 50 } as const;
export const rankTone = (rank: number): RankTone => rank <= 3 ? "good" : rank <= 10 ? "warning" : "bad";

// Stable illustrative values, never measured or inferred Google rankings.
export function simulatedRankGrid(context: AuditContext) {
  const identity = [context.businessName, context.city, context.niche].join("|").toLowerCase();
  let seed = 2166136261;
  for (const char of identity) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return Array.from({ length: 25 }, (_, index) => {
    const row = Math.floor(index / 5);
    const col = index % 5;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const distance = Math.abs(row - 2) + Math.abs(col - 2);
    const rank = distance === 0 ? 1 + seed % 3 : Math.min(20, 1 + distance * 3 + seed % 5);
    return { row, col, rank, tone: rankTone(rank) };
  });
}