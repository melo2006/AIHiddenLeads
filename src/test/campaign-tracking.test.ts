import { beforeEach, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { campaignVisit, PUBLIC_CAMPAIGN_PATHS, trackCampaignEvent } from '../lib/campaignTracking';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  invoke.mockResolvedValue({ error: null });
});

it.each(['/dashboard/wizard-preview', '/dashboard/voice-agents', '/setup', '/account', '/embed/business', '/shared-demo/token'])('never sends public milestones from private or tenant route %s', async path => {
  window.history.replaceState({}, '', path);
  for (const event of ['page_view', 'voice_started', 'voice_ended'] as const) await trackCampaignEvent(event);
  expect(invoke).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('campaign-visit')).toBeNull();
});

it.each(PUBLIC_CAMPAIGN_PATHS)('preserves public voice milestones on %s', async path => {
  window.history.replaceState({}, '', path);
  await trackCampaignEvent('voice_started');
  expect(invoke).toHaveBeenCalledWith('campaign-events', { body: expect.objectContaining({ event: 'voice_started', path }) });
});

it('normalizes campaign labels to the server accepted characters', async () => {
  window.history.replaceState({}, '', '/demo?utm_source=Facebook%2FTikTok&utm_campaign=Fall%20%26%20Winter');
  await trackCampaignEvent('scan_started');
  expect(invoke).toHaveBeenCalledWith('campaign-events', { body: expect.objectContaining({ source: 'FacebookTikTok', campaign: 'Fall  Winter' }) });
});

it('contains unexpected tracking failures instead of rejecting into the UI', async () => {
  window.history.replaceState({}, '', '/demo');
  invoke.mockRejectedValue(new Error('Network unavailable'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(trackCampaignEvent('voice_ended')).resolves.toBeUndefined();
  expect(warning).toHaveBeenCalledOnce();
  warning.mockRestore();
});

it('records prices as an observed homepage section, not a private or demo section',async()=>{
  window.history.replaceState({},'', '/');
  await trackCampaignEvent('section_view','pricing');
  expect(invoke).toHaveBeenCalledWith('campaign-events',{body:expect.objectContaining({event:'section_view',path:'/#pricing'})});
  invoke.mockClear();
  window.history.replaceState({},'', '/demo');
  await trackCampaignEvent('section_view','pricing');
  expect(invoke).not.toHaveBeenCalled();
});
it('does not attach a public visit identity to private voice tests',()=>{
  window.history.replaceState({},'', '/dashboard/telephony');
  expect(campaignVisit()).toBeNull();
});