// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// REGRESSION GUARD (Publish #44 regression round 3 follow-up, 2026-11-14):
// the two Frank pinned leads' records store the pinned map's CANONICAL
// domains (michaelmartinezrealtor.com / paulsapersteinhomes.com) and
// must keep them — gemini-session's example-pack lookup matches the
// stored URL's canonical host, and the demo loader keys the pinned
// reveal off the stored URL. If any scan or refresh ever dragged a
// row's website_url to a different host (e.g. a rescan invoked with a
// vanity-domain entry link), the presenter/listings stamps and the
// reveal bookkeeping would break. So scan-website skips the
// website_url write for pinned leads entirely, and
// refresh-example-leads re-asserts the pinned map value after each
// scan it triggers.
//
// These are source pins (the repo's established pattern for the Deno
// edge functions, cf. fullpage-capture.test.ts): the functions are
// Deno entrypoints and cannot be imported into vitest.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const scanSource = read("../../supabase/functions/scan-website/index.ts");
const refreshSource = read("../../supabase/functions/refresh-example-leads/index.ts");

const occurrences = (source: string, needle: string) => source.split(needle).length - 1;

describe("scan-website preserves pinned example leads' website_url", () => {
  it("knows the pinned leadIds from BOTH shared pinned maps", () => {
    expect(scanSource).toContain(
      "import { REALTOR_EXAMPLE_PINNED_LEADS } from '../_shared/realtor-example-pinned-leads.ts';",
    );
    expect(scanSource).toContain(
      "import { B2B_EXAMPLE_PINNED_LEADS } from '../_shared/b2b-example-pinned-leads.ts';",
    );
    expect(scanSource).toContain("...REALTOR_EXAMPLE_PINNED_LEADS.map((entry) => entry.leadId),");
    expect(scanSource).toContain("...B2B_EXAMPLE_PINNED_LEADS.map((entry) => entry.leadId),");
  });

  it("derives the pinned flag from the scanned leadId inside the handler", () => {
    expect(scanSource).toContain("const isPinnedExampleLead = isPinnedExampleLeadId(leadId);");
  });

  it("routes EVERY website_url write on a lead row through the pinned guard", () => {
    // Both lead-row saves (early preview save + final save) spread the
    // guarded write; a pinned lead's payload omits website_url entirely.
    expect(occurrences(scanSource, "...websiteUrlWriteFor(isPinnedExampleLead, formattedUrl),")).toBe(2);
    // The only raw `website_url: formattedUrl` left in the file is the
    // guard helper itself, whose pinned arm is the empty object.
    expect(occurrences(scanSource, "website_url: formattedUrl")).toBe(1);
    expect(scanSource).toContain("isPinnedExampleLead ? {} : { website_url: formattedUrl };");
  });
});

describe("refresh-example-leads leaves a pinned lead's website_url at the pinned map value", () => {
  it("still reads the pinned row before scanning (stored URL is the scan input)", () => {
    expect(refreshSource).toContain(".select('id, website_url, scan_status')");
  });

  it("re-asserts the pinned map URL (target.url) AFTER invoking the scan", () => {
    const scanInvokeAt = refreshSource.indexOf("functions/v1/scan-website");
    const restoreAt = refreshSource.indexOf(".update({ website_url: target.url })");
    expect(scanInvokeAt).toBeGreaterThan(-1);
    expect(restoreAt).toBeGreaterThan(scanInvokeAt);
    expect(refreshSource).toContain("websiteUrlPreserved = !restoreError;");
  });
});
