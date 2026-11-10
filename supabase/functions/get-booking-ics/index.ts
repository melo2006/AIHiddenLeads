import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveBookingInviteIcs } from '../_shared/booking-ics.ts';

// Serves the calendar invite (.ics) for ONE booking, keyed by its
// unguessable booking UUID — the target of the short link in the booking
// confirmation SMS (https://aihiddenleads.com/cal/<bookingId>). The SPA
// route fetches this and turns the response into a download; the invite
// bytes are rebuilt from the stored booking by _shared/booking-ics.ts so
// they match the confirmation email's attachment exactly.
// Public by design (verify_jwt = false in supabase/config.toml): the
// booking id is the capability, same data the confirmation email carries.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'GET or POST required' }, 405);
  try {
    const url = new URL(req.url);
    let bookingId = url.searchParams.get('bookingId') ?? url.searchParams.get('id') ?? '';
    if (!bookingId && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { bookingId?: unknown; id?: unknown };
      bookingId = String(body.bookingId ?? body.id ?? '');
    }
    const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const result = await resolveBookingInviteIcs(db, bookingId);
    if (!result.ok) return json({ error: result.error }, result.status);
    return new Response(result.ics, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': result.contentType,
        'Content-Disposition': result.contentDisposition,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Calendar invite unavailable' }, 500);
  }
});
