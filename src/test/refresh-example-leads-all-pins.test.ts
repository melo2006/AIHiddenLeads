// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// COVERAGE PIN (2026-11-21): refresh-example-leads originally iterated
// ONLY the realtor pinned roster, so the 36 B2B pinned examples had no
// refresh path and their stored knowledge could only age. The function
// now builds ONE unified roster from both shared pinned maps and the
// per-lead flow (scan in place + pinned-URL re-assert + the realtor
// pins' conditional fact assertions) runs off that roster.
//
// Source pins, per the repo's established pattern for Deno edge
// functions (cf. pinned-website-url-preservation.test.ts).

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const refreshSource = read("../../supabase/functions/refresh-example-leads/index.ts");
const cronDocSource = read("../../supabase/migrations/20261113170000_example_leads_refresh.sql");

describe("refresh-example-leads covers every pinned example", () => {
  it("imports BOTH shared pinned maps", () => {
    expect(refreshSource).toContain("REALTOR_EXAMPLE_PINNED_LEADS");
    expect(refreshSource).toContain(
      "import { B2B_EXAMPLE_PINNED_LEADS } from '../_shared/b2b-example-pinned-leads.ts';",
    );
  });

  it("builds one unified roster and filters targets from it", () => {
    expect(refreshSource).toContain("const ALL_EXAMPLE_PINNED_LEADS: ExampleRefreshTarget[] = [");
    expect(refreshSource).toContain("...REALTOR_EXAMPLE_PINNED_LEADS,");
    expect(refreshSource).toContain("...B2B_EXAMPLE_PINNED_LEADS.map((entry) => ({");
    expect(refreshSource).toContain("const targets = ALL_EXAMPLE_PINNED_LEADS.filter((entry) =>");
  });

  it("keeps the secret gate ahead of any roster work", () => {
    const gate = refreshSource.indexOf("x-example-refresh-secret");
    const rosterUse = refreshSource.indexOf("const targets = ALL_EXAMPLE_PINNED_LEADS.filter");
    expect(gate).toBeGreaterThan(-1);
    expect(rosterUse).toBeGreaterThan(gate);
  });

  it("the arming SQL names slugs from both rosters (incl. julie-melrose)", () => {
    expect(cronDocSource).toContain("('julie-melrose'),");
    expect(cronDocSource).toContain("('cable-marine'),");
    expect(cronDocSource).toContain("('chiangwell-medical')");
  });
});
