import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GeminiAgentWidget from '@/components/GeminiAgentWidget';
const mocks = vi.hoisted(() => ({ preload: vi.fn(), conversation: vi.fn() }));
vi.mock('@/lib/voicePreload', () => ({ preloadVoiceIdentity: mocks.preload }));
vi.mock('@/components/GeminiConversation', () => ({ default: (props: unknown) => { mocks.conversation(props); return null; } }));
vi.mock('@/components/FloatingPersonFrame', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/landing/demo-results/DraggableFloating', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/AspenSalesActions', () => ({ default: () => null }));
vi.mock('@/components/landing/demo-results/ChatWidget', () => ({ default: () => null }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
describe('early voice interaction', () => {
  it('waits for saved video settings before mounting an auto-starting conversation', async () => {
    let resolve: ((data: unknown) => void) | undefined;
    mocks.preload.mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<GeminiAgentWidget agentId="customer-agent" autoStart />);
    expect(mocks.conversation).not.toHaveBeenCalled();
    const videoAvatar = { enabled: true, provider: 'simli', faceId: 'saved-face' };
    await act(async () => { resolve?.({ id: 'customer-agent', name: 'Aspen', videoAvatar }); });
    await waitFor(() => expect(mocks.conversation).toHaveBeenCalled());
    expect(mocks.conversation.mock.lastCall?.[0]).toMatchObject({ autoStart: true, videoAvatar });
  });
});