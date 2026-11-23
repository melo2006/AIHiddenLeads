import { rankTone } from "./demoRankGrid";

// Marketing illustrations only; never live measurements or forecast results.
export const homepageMapComparison = Array.from({ length: 25 }, (_, index) => {
  const beforeRank = index === 12 ? 1 : 14 + index % 8;
  const afterRank = [0, 4, 24].includes(index) ? 4 + index % 3 : 1 + index % 3;
  return { index, row: Math.floor(index / 5), col: index % 5, beforeRank, afterRank, beforeTone: rankTone(beforeRank), afterTone: rankTone(afterRank) };
});