import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Auth email link regression (2026-11-20). The Send Email hook
// (supabase/functions/auth-email-hook) builds the confirmation URL for
// EVERY auth email — signup, invite, magic link, recovery, email
// change. gotrue sends email_data.site_url as the Auth server's own
// external URL (https://<project-ref>.supabase.co/auth/v1), and the
// builder appended /auth/verify, producing
// https://<ref>.supabase.co/auth/v1/auth/verify?... — a doubled path
// the gateway rejects with {"message":"No API key found in request"}.
// The owner hit exactly that page from the password-reset email and
// could not reset his password.
//
// The hook is a Deno module (npm: imports) so vitest cannot import it;
// following the repo's source-pin pattern (cf. welcome-email.test.ts)
// we read the source, extract the real buildConfirmationUrl, and
// execute it against production-shaped payloads.
const hook = readFileSync(
  path.join(__dirname, "..", "..", "supabase/functions/auth-email-hook/index.ts"),
  "utf8"
);

type EmailData = Record<string, string>;

function extractBuilder(): (emailData: EmailData) => string {
  const start = hook.indexOf("function buildConfirmationUrl");
  expect(start, "buildConfirmationUrl not found in auth-email-hook").toBeGreaterThan(-1);
  const open = hook.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < hook.length; i++) {
    if (hook[i] === "{") depth++;
    else if (hook[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end, "buildConfirmationUrl body not closed").toBeGreaterThan(open);
  // Strip the two TypeScript annotations from the signature so the
  // extracted source parses as plain JS; the body is annotation-free.
  const fnText = hook
    .slice(start, end + 1)
    .replace(": Record<string, any>", "")
    .replace(/\)\s*:\s*string\s*\{/, ") {");
  const factory = new Function(
    "Deno",
    `${fnText}\nreturn buildConfirmationUrl;`
  ) as (deno: unknown) => (emailData: EmailData) => string;
  return factory({ env: { get: () => undefined } });
}

const buildConfirmationUrl = extractBuilder();

const PROJECT = "https://mrtvqttecdfgphgxeygj.supabase.co";

describe("auth-email-hook confirmation URL", () => {
  it("never builds the doubled /auth/verify path again", () => {
    // Pinned to the buggy construction itself (`${base}/auth/verify?`);
    // the fix's comment legitimately names the old suffix in prose.
    expect(hook).not.toContain("}/auth/verify?");
    expect(hook).toContain("/auth/v1/verify");
  });

  it("builds the canonical verify URL from the production payload shape (site_url = auth base)", () => {
    const url = new URL(
      buildConfirmationUrl({
        site_url: `${PROJECT}/auth/v1`,
        token_hash: "hash123",
        email_action_type: "recovery",
        redirect_to: "https://aihiddenleads.com/update-password",
      })
    );
    expect(url.origin).toBe(PROJECT);
    expect(url.pathname).toBe("/auth/v1/verify");
    expect(url.searchParams.get("token")).toBe("hash123");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.searchParams.get("redirect_to")).toBe(
      "https://aihiddenleads.com/update-password"
    );
  });

  it("normalises a bare project base (no /auth/v1 suffix, trailing slash) to the same URL", () => {
    const fromBare = buildConfirmationUrl({
      site_url: `${PROJECT}/`,
      token_hash: "hash123",
      email_action_type: "recovery",
      redirect_to: "https://aihiddenleads.com/update-password",
    });
    const fromAuthBase = buildConfirmationUrl({
      site_url: `${PROJECT}/auth/v1`,
      token_hash: "hash123",
      email_action_type: "recovery",
      redirect_to: "https://aihiddenleads.com/update-password",
    });
    expect(fromBare).toBe(fromAuthBase);
    expect(fromBare).not.toContain("auth/v1/auth");
  });

  it("carries the right action type for the other auth emails sharing the builder", () => {
    for (const type of ["signup", "invite", "magiclink", "email_change"]) {
      const url = new URL(
        buildConfirmationUrl({
          site_url: `${PROJECT}/auth/v1`,
          token_hash: "tok",
          email_action_type: type,
          redirect_to: "https://aihiddenleads.com/auth/callback",
        })
      );
      expect(url.pathname).toBe("/auth/v1/verify");
      expect(url.searchParams.get("type")).toBe(type);
    }
  });
});
