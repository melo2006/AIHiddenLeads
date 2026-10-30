import { supabase } from '@/integrations/supabase/client';

type SessionReader = {
  getSession: () => Promise<{
    data: { session: { access_token: string } | null };
    error: unknown;
  }>;
};

// Await restored/refreshed auth before issuing a public demo capability. This
// header proves identity only; the server still checks the protected role table.
export async function voiceSessionHeaders(auth: SessionReader = supabase.auth) {
  const { data, error } = await auth.getSession();
  if (error) throw new Error('Your sign-in could not be restored. Please sign in again before starting the demo.');
  return data.session
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : undefined;
}