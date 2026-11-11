// Business-name variants for Google Places lookups (demo-rank-audit).
//
// Dogfooding finding (own-site SEO audit, 2026-11-11): the maps audit
// hard-failed for our own brand typed as "AiHiddenLeads" — Google Places
// only locates it as "AI Hidden Leads". Prospects type their business name
// slightly differently from their listing all the time (camel-case domains,
// dropped or added legal suffixes), so the audit now retries a failure with
// a small, ordered set of conservative variants before giving up:
//   1. the name exactly as typed;
//   2. camel-case split ("AiHiddenLeads" -> "Ai Hidden Leads",
//      "Smith&Co" -> "Smith & Co");
//   3. with a common legal suffix stripped ("Acme Roofing LLC" ->
//      "Acme Roofing") — or, if none is present, "LLC" appended
//      ("Acme Roofing" -> "Acme Roofing LLC");
//   4. camel-split + suffix change combined.
// Duplicates and no-ops are removed; the list is capped at MAX_NAME_VARIANTS
// so a lookup costs at most 3 Places calls total. Failures stay failures —
// variants only ever change the query text, never the result.

export const MAX_NAME_VARIANTS = 3;

const SUFFIX_RE = /\s*[,.]?\s*(llc|l\.l\.c\.|inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|llp|pllc)\s*$/i;

export function splitCamelName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(&)([A-Za-z])/g, "$1 $2 $3")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripLegalSuffix(name: string): string {
  return name.replace(SUFFIX_RE, "").replace(/[\s,]+$/, "").trim();
}

export function hasLegalSuffix(name: string): boolean {
  return SUFFIX_RE.test(name.trim());
}

/**
 * Ordered, de-duplicated lookup variants for a business name, starting with
 * the name exactly as typed and capped at MAX_NAME_VARIANTS entries.
 */
export function businessNameVariants(rawName: string): string[] {
  const name = (rawName || "").replace(/\s+/g, " ").trim();
  if (!name) return [];
  const out: string[] = [];
  const push = (v: string) => {
    const t = (v || "").replace(/\s+/g, " ").trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  push(name);
  const split = splitCamelName(name);
  push(split);
  const base = hasLegalSuffix(name) ? stripLegalSuffix(name) : `${name} LLC`;
  push(base);
  const splitBase = hasLegalSuffix(split) ? stripLegalSuffix(split) : `${split} LLC`;
  push(splitBase);
  return out.slice(0, MAX_NAME_VARIANTS);
}
