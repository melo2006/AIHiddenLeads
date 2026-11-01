import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

// Migration note: this function previously sent Supabase Auth emails through
// Lovable's proprietary email service (npm:@lovable.dev/email-js, LOVABLE_API_KEY).
// That service does not exist outside Lovable, so this file now renders the same
// React templates and sends them directly via the Resend API (RESEND_API_KEY).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Configuration
const SITE_NAME = "Ai Hidden Leads"
const ROOT_DOMAIN = "aihiddenleads.com"
const FROM_DOMAIN = "aihiddenleads.com"
const SITE_URL = `https://${ROOT_DOMAIN}`
const FROM = `${SITE_NAME} <noreply@${FROM_DOMAIN}>`
const RESEND_URL = 'https://api.resend.com/emails'

// Template mapping for preview mode
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

// Sample data for preview mode ONLY (not used in actual email sending).
// URLs are baked in at scaffold time from the project's real data.
// The sample email uses a fixed placeholder (RFC 6761 .test TLD) so the Go backend
// can always find-and-replace it with the actual recipient when sending test emails,
// even if the project's domain has changed since the template was scaffolded.
const SAMPLE_PROJECT_URL = "https://aihiddenleads.lovable.app"
const SAMPLE_EMAIL = "user@example.test"
const SAMPLE_DATA: Record<string, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    oldEmail: SAMPLE_EMAIL,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  reauthentication: {
    token: '123456',
  },
}

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function buildConfirmationUrl(emailData: Record<string, any>): string {
  const siteUrl = (emailData.site_url || SITE_URL).replace(/\/$/, '')
  const params = new URLSearchParams({
    token: emailData.token_hash ?? '',
    type: emailData.email_action_type ?? '',
    redirect_to: emailData.redirect_to ?? '',
  })
  return `${siteUrl}/auth/verify?${params.toString()}`
}

function buildTemplateElement(
  type: string,
  user: Record<string, any>,
  emailData: Record<string, any>,
): React.ReactElement {
  const confirmationUrl = buildConfirmationUrl(emailData)
  switch (type) {
    case 'signup':
      return React.createElement(SignupEmail, {
        siteName: SITE_NAME,
        siteUrl: SITE_URL,
        recipient: user.email,
        confirmationUrl,
      })
    case 'invite':
      return React.createElement(InviteEmail, {
        siteName: SITE_NAME,
        siteUrl: SITE_URL,
        confirmationUrl,
      })
    case 'magiclink':
      return React.createElement(MagicLinkEmail, {
        siteName: SITE_NAME,
        confirmationUrl,
      })
    case 'recovery':
      return React.createElement(RecoveryEmail, {
        siteName: SITE_NAME,
        confirmationUrl,
      })
    case 'email_change':
      return React.createElement(EmailChangeEmail, {
        siteName: SITE_NAME,
        oldEmail: user.email ?? '',
        email: user.email,
        newEmail: user.new_email ?? '',
        confirmationUrl,
      })
    case 'reauthentication':
      return React.createElement(ReauthenticationEmail, { token: emailData.token ?? '' })
    default:
      throw new Error(`Unknown email type: ${type}`)
  }
}

// Supabase Auth "Send Email" hook handler. Payload shape:
// { user: { email, new_email?, ... }, email_data: { email_action_type, token, token_hash, redirect_to, site_url } }
async function handleAuthEmail(req: Request): Promise<Response> {
  const hookSecret = Deno.env.get('AUTH_EMAIL_HOOK_SECRET')
  const provided = new URL(req.url).searchParams.get('secret')
  if (!hookSecret || provided !== hookSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON in request body' }, 400)
  }

  const user = payload?.user ?? {}
  const emailData = payload?.email_data ?? {}
  const type: string | undefined = emailData.email_action_type
  const to: string | undefined = user.email

  if (!type || !SUBJECTS[type] || !EMAIL_TEMPLATES[type]) {
    return jsonResponse({ error: `Unknown email type: ${type ?? 'missing'}` }, 400)
  }
  if (!to) {
    return jsonResponse({ error: 'Missing recipient email in payload' }, 400)
  }

  let html: string
  try {
    html = await renderAsync(buildTemplateElement(type, user, emailData))
  } catch (error) {
    return jsonResponse({ error: `Template render failed: ${error instanceof Error ? error.message : 'unknown error'}` }, 500)
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    return jsonResponse({ error: 'RESEND_API_KEY is not configured' }, 500)
  }

  let res: Response
  try {
    res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject: SUBJECTS[type], html }),
    })
  } catch (error) {
    return jsonResponse({ error: `Resend request failed: ${error instanceof Error ? error.message : 'unknown error'}` }, 500)
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      if (data && typeof data.message === 'string') detail = data.message
    } catch {
      // keep statusText
    }
    return jsonResponse({ error: `Resend error (${res.status}): ${detail}` }, 500)
  }

  return jsonResponse({}, 200)
}

// Preview endpoint handler - returns rendered HTML without sending email
async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: previewCorsHeaders })
  }

  const hookSecret = Deno.env.get('AUTH_EMAIL_HOOK_SECRET')
  const authHeader = req.headers.get('Authorization')

  if (!hookSecret || authHeader !== `Bearer ${hookSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type: string
  try {
    const body = await req.json()
    type = body.type
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]

  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sampleData = SAMPLE_DATA[type] || {}
  const html = await renderAsync(React.createElement(EmailTemplate, sampleData))

  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Handle CORS preflight for main endpoint
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Route to preview handler for /preview path
  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  return handleAuthEmail(req)
})
