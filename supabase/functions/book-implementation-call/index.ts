import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { bookPlatformCall, buildBookingInviteIcs } from '../_shared/platform-calendar.ts';
import { SLOT_MINUTES } from '../_shared/booking-slots.ts';
import { bookingAlert, bookingConfirmation, OWNER_MAILBOX, trySend } from '../_shared/hostinger-mail.ts';
import { buildBookingConfirmationSms, normalizePhoneE164 } from '../_shared/followup.ts';
import { isSmsOptedOut, trySendFollowupSms } from '../_shared/twilio-sms.ts';
const schema = z.object({ name:z.string().trim().min(1).max(100), email:z.string().trim().email().max(255), phone:z.string().trim().max(30).default(''), businessName:z.string().trim().max(150).default(''), notes:z.string().trim().max(1000).default(''), slotStart:z.string().datetime(), confirmed:z.literal(true), smsConsent:z.boolean().optional().default(false) });
Deno.serve(async req => {
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return json({error:'POST required'},405);
 try {
  const parsed=schema.safeParse(await req.json()); if(!parsed.success)return json({error:'Confirm your name, email and selected appointment time.'},400);
  const db=createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const result=await bookPlatformCall(db,parsed.data) as {ok?:boolean; bookingId?:string; slotStart?:string};
  let confirmationSms:'sent'|'failed'|'not_consented'|'no_phone'|'opted_out'|'unavailable'='not_consented';
  if(result.ok) {
   const inviteIcs = result.bookingId ? buildBookingInviteIcs({ name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone || undefined, businessName: parsed.data.businessName || undefined, notes: parsed.data.notes || undefined, slotStart: parsed.data.slotStart, bookingId: result.bookingId, organizerEmail: OWNER_MAILBOX }) : undefined;
   await Promise.all([trySend(bookingAlert(parsed.data)),trySend(bookingConfirmation(parsed.data, inviteIcs))]);
   // Confirmation text (follow-up pack): only with the form's explicit SMS
   // consent + a usable phone + no opt-out, exactly once — the row stamp
   // and the delivery-ledger template both guard a retry, and stamping
   // happens BEFORE the send so a crashed request can't double-text.
   const to=normalizePhoneE164(parsed.data.phone);
   if(parsed.data.smsConsent && to && result.bookingId) {
    try {
     if(await isSmsOptedOut(db,to)) confirmationSms='opted_out';
     else {
      const stamp=new Date().toISOString();
      const {data:claimed,error:claimErr}=await db.from('implementation_calls').update({confirmation_sms_sent_at:stamp}).eq('id',result.bookingId).is('confirmation_sms_sent_at',null).select('id');
      if(claimErr) confirmationSms='unavailable'; // followup-pack migration not applied yet
      else if(!claimed?.length) confirmationSms='sent'; // already claimed by an earlier attempt
      else {
       const sms=await trySendFollowupSms(db,{to,body:buildBookingConfirmationSms({slotStartIso:parsed.data.slotStart,durationMinutes:SLOT_MINUTES,name:parsed.data.name}),templateId:'booking_confirmation',bookingId:result.bookingId});
       confirmationSms=sms.sent?'sent':'failed';
       // A failed send releases the claim so the sweep/a retry can try once more.
       if(!sms.sent) await db.from('implementation_calls').update({confirmation_sms_sent_at:null}).eq('id',result.bookingId);
      }
     }
    } catch(e){ console.error('booking confirmation SMS failed',e instanceof Error?e.message:e); confirmationSms='failed'; }
   } else if(parsed.data.smsConsent && !to) confirmationSms='no_phone';
  }
  return json({...result,confirmationSms});
 } catch(e){return json({error:e instanceof Error?e.message:'Booking could not be confirmed'},409);}
});
