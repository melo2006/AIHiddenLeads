import { describe, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn().mockResolvedValue({data: {id:'home', name:'Aspen', businessName:'AI Hidden Leads', avatarUrl:''}}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{functions:{invoke}}}));
import { preloadVoiceIdentity } from '@/lib/voicePreload';
describe('browsing preparation', () => {
  it('loads only public identity and health checks, never a session or microphone', async () => {
    await preloadVoiceIdentity();
    expect(invoke.mock.calls.map(c=>c[0])).toEqual(['gemini-live-proxy?ping=1','gemini-session?ping=1','simli-avatar?ping=1','voice-agent-public']);
    for (const call of invoke.mock.calls) {
      expect(call[1]).toEqual({method:'GET'});
    }
    expect(document.querySelector('link[rel="preconnect"][href="https://api.simli.ai"]')).not.toBeNull();
  });
});