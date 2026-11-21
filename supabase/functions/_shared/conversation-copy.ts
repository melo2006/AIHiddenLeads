// Pure copy-link resolution for the conversation-records edge function.
// No Deno / Supabase runtime imports: this module is unit-tested from
// src/test under vitest/node, so it must only rely on standard globals
// (crypto, TextEncoder, Date). The db client is passed in, following the
// resolveDemoShare pattern in demo-share.ts.
//
// Extracted verbatim from the `copy` branch of
// supabase/functions/conversation-records/index.ts (2026-11-21). That
// branch previously had no executing test — only the deployed bundle
// exercised it — so when the deployed bundle diverged from source it
// returned HTTP 500 for valid private copy links and nothing caught it.

/** Token length bounds, mirrored by the request schema in
 *  conversation-records/index.ts (z.string().min(50).max(100)). Real
 *  tokens are two concatenated UUIDs = 72 chars (see sendRecordCopy). */
export const COPY_TOKEN_MIN_LENGTH = 50;
export const COPY_TOKEN_MAX_LENGTH = 100;

export const validCopyToken = (token: unknown): token is string =>
  typeof token === 'string' &&
  token.length >= COPY_TOKEN_MIN_LENGTH &&
  token.length <= COPY_TOKEN_MAX_LENGTH;

/** SHA-256 hex of the raw token — identical algorithm to `digest` in
 *  _shared/conversation-records.ts and `sha256` in _shared/demo-share.ts.
 *  Copy links are stored only as this hash (conversation_copy_links.token_hash). */
export async function sha256Hex(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ConversationCopyRecord {
  business_name: string | null;
  transcript: unknown;
  summary: { summary: string; needs: string[]; nextSteps: string[] } | null;
  summary_status: string | null;
  created_at: string;
}

export type CopyResolution =
  | { status: 200; record: ConversationCopyRecord }
  | { status: 404; error: string };

/**
 * Resolves a private copy token to its conversation record.
 * Unknown, expired and revoked tokens are indistinguishable — all 404
 * with the same message, exactly as the handler has always behaved.
 * A link whose record has vanished 404s with 'Conversation unavailable'.
 * The stored summary's admin-only outreachDraft is stripped here: the
 * recipient copy exposes only summary / needs / nextSteps.
 */
export async function resolveConversationCopy(
  db: any,
  token: string,
  now: Date = new Date(),
): Promise<CopyResolution> {
  const { data: link } = await db
    .from('conversation_copy_links')
    .select('record_id')
    .eq('token_hash', await sha256Hex(token))
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
    .maybeSingle();
  if (!link) return { status: 404, error: 'This private link has expired or was revoked.' };
  const { data: r } = await db
    .from('conversation_records')
    .select('business_name,transcript,summary,summary_status,created_at')
    .eq('id', link.record_id)
    .single();
  if (!r) return { status: 404, error: 'Conversation unavailable' };
  return {
    status: 200,
    record: {
      ...r,
      summary: r.summary
        ? { summary: r.summary.summary, needs: r.summary.needs, nextSteps: r.summary.nextSteps }
        : null,
    },
  };
}
