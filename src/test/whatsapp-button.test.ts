// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildWhatsAppLink, WHATSAPP_BUTTON_ENABLED, WHATSAPP_PILOT_NUMBER, whatsappSourceKey } from '../lib/whatsapp';

describe('WhatsApp Phase 1 click-to-chat config', () => {
  it('targets the 786 pilot number, never the 877 flagship', () => {
    expect(WHATSAPP_PILOT_NUMBER).toBe('17862449688');
    expect(WHATSAPP_PILOT_NUMBER).not.toContain('8778624949');
  });

  it('is enabled by default', () => {
    expect(WHATSAPP_BUTTON_ENABLED).toBe(true);
  });

  it('builds a wa.me link with the pre-filled message url-encoded', () => {
    expect(buildWhatsAppLink("Hi AiHiddenLeads, I'd like to learn more. (from the homepage)")).toBe(
      "https://wa.me/17862449688?text=Hi%20AiHiddenLeads%2C%20I'd%20like%20to%20learn%20more.%20(from%20the%20homepage)",
    );
  });

  it('tags the page source by route', () => {
    expect(whatsappSourceKey('/')).toBe('whatsapp.sourceHome');
    expect(whatsappSourceKey('/demo')).toBe('whatsapp.sourceDemo');
    expect(whatsappSourceKey('/demo/br')).toBe('whatsapp.sourceDemo');
    expect(whatsappSourceKey('/agents/realtors')).toBe('whatsapp.sourceRealtors');
    expect(whatsappSourceKey('/plans')).toBeNull();
  });
});
