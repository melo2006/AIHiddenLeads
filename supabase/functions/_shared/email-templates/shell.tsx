/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Button,
  Column,
  Img,
  Row,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

// Shared branded shell for the Supabase Auth emails (2026-11-20, owner
// ask): every user-facing email wears the house template — logo header
// on top, the email's own content in the middle, and the compact
// free-demo promo block below the content. Values mirror
// ../email-shell.ts (the string-built shell) so both email lanes look
// identical; this file stays self-contained like the other templates.

export const EMAIL_SITE_URL = 'https://aihiddenleads.com'
// The logo asset the live site itself serves (public/logo.png).
export const EMAIL_LOGO_URL = `${EMAIL_SITE_URL}/logo.png`
export const EMAIL_DEMO_URL = `${EMAIL_SITE_URL}/demo`

export const PROMO_SLOGAN = 'Never miss a call — or a lead — again.'
export const PROMO_PITCH =
  'See your own AI video avatar — a voice receptionist with video — live on your website, free. ' +
  'Just enter your website address, your name and your email, and we\u2019ll show your own avatar ' +
  'running on your site in under 2 minutes. No credit card required.'
export const PROMO_CTA_LABEL = 'Try it free on your website'

const GREEN = '#10B981'
const INK = '#0f172a'

export const BrandHeader = () => (
  <Section style={headerSection}>
    <Row>
      <Column style={headerLogoCol}>
        <Img
          src={EMAIL_LOGO_URL}
          width="36"
          height="36"
          alt="AI Hidden Leads"
          style={headerLogo}
        />
      </Column>
      <Column>
        <Text style={headerBrand}>
          AI Hidden <span style={{ color: GREEN }}>Leads</span>
        </Text>
      </Column>
    </Row>
  </Section>
)

export const PromoFooter = () => (
  <Section style={promoSection}>
    <Text style={promoSlogan}>{PROMO_SLOGAN}</Text>
    <Text style={promoText}>{PROMO_PITCH}</Text>
    <Button style={promoButton} href={EMAIL_DEMO_URL}>
      {PROMO_CTA_LABEL}
    </Button>
  </Section>
)

const headerSection = {
  borderBottom: `3px solid ${GREEN}`,
  padding: '0 0 12px',
  margin: '0 0 20px',
}
const headerLogoCol = { width: '44px' }
const headerLogo = { display: 'block', border: '0' }
const headerBrand = {
  fontSize: '20px',
  lineHeight: '24px',
  fontWeight: '800' as const,
  color: INK,
  margin: '0',
}
const promoSection = {
  backgroundColor: '#ecfdf5',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '24px 0 8px',
}
const promoSlogan = {
  fontSize: '15px',
  fontWeight: '800' as const,
  color: INK,
  margin: '0 0 6px',
}
const promoText = {
  fontSize: '13px',
  lineHeight: '1.6',
  color: INK,
  margin: '0 0 12px',
}
const promoButton = {
  backgroundColor: GREEN,
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '700' as const,
  borderRadius: '8px',
  padding: '11px 18px',
  textDecoration: 'none',
}
