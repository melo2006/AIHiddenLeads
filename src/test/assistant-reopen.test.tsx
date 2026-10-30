import { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiAgentWidget from '@/components/GeminiAgentWidget';
import AspenDemoWidget from '@/components/landing/demo-results/AspenDemoWidget';

const calls = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('@/lib/voicePreload', () => ({ preloadVoiceIdentity: async () => ({ name: 'Aspen', businessName: 'Test' }) }));
vi.mock('@/components/GeminiConversation', () => ({ default: function Conversation() {
  useEffect(() => { calls.start(); return () => { calls.stop(); }; }, []);
  return null;
} }));
vi.mock('@/components/landing/demo-results/DraggableFloating', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/AspenSalesActions', () => ({ default: () => null }));
vi.mock('@/components/landing/demo-results/ChatWidget', () => ({ default: () => null }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function Demo() {
  const [requested, setRequested] = useState(false);
  return <AspenDemoWidget businessName="Test" businessNiche="general" websiteUrl="https://example.com" businessInfo="Test" voiceRequested={requested} onClosed={() => setRequested(false)} />;
}

describe.each([
  ['homepage', () => <GeminiAgentWidget floating />],
  ['customer', () => <GeminiAgentWidget agentId="customer" />],
  ['demo', () => <Demo />],
] as const)('%s assistant recovery', (_, makeWidget) => {
  it('ends the call on X and starts again from the retained bubble', async () => {
    render(makeWidget());
    if (screen.queryByRole('button', { name: 'Talk to Aspen' })) fireEvent.click(screen.getByRole('button', { name: 'Talk to Aspen' }));
    await waitFor(() => expect(calls.start).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));
    expect(calls.stop).toHaveBeenCalledTimes(1);
    expect(calls.start).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Aspen' }));
    await waitFor(() => expect(calls.start).toHaveBeenCalledTimes(2));
  });
  it('preserves the same call through minimize and expand', async () => {
    render(makeWidget());
    if (screen.queryByRole('button', { name: 'Talk to Aspen' })) fireEvent.click(screen.getByRole('button', { name: 'Talk to Aspen' }));
    await waitFor(() => expect(calls.start).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Minimize assistant' }));
    expect(calls.stop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Expand assistant' }));
    expect(calls.start).toHaveBeenCalledTimes(1);
    expect(calls.stop).not.toHaveBeenCalled();
  });
});