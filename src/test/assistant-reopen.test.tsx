import { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeminiAgentWidget from '@/components/GeminiAgentWidget';
import AspenDemoWidget from '@/components/landing/demo-results/AspenDemoWidget';

const calls = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('@/lib/voicePreload', () => ({ preloadVoiceIdentity: async () => ({ name: 'Aspen', businessName: 'Test' }) }));
vi.mock('@/components/GeminiConversation', () => ({ default: function Conversation({ windowControls }: { windowControls?: React.ReactNode }) {
  useEffect(() => { calls.start(); return () => { calls.stop(); }; }, []);
  // The real conversation renders the shell's window-controls row inside
  // its panel via this slot (2026-11-12 panel layout fix) — the mock
  // honors the same contract so the Minimize/End buttons exist.
  return <>{windowControls}</>;
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

// Three-stage chrome (Ron, 2026-11-08): the dash ("Minimize") collapses the
// widget WITHOUT unmounting the conversation, and tapping the bubble
// restores that same call — no new session is started. (The conversation is
// mocked here, so no live-session Stage 3 bar appears; the minimized state
// falls back to the reopen launcher, which is what these cycles exercise.
// The X now ENDS the conversation and is covered in widget-chrome-layout.)
describe.each([
  ['homepage', () => <GeminiAgentWidget floating />],
  ['customer', () => <GeminiAgentWidget agentId="customer" />],
  ['demo', () => <Demo />],
] as const)('%s assistant recovery', (_, makeWidget) => {
  it('collapses to the bubble on Minimize with the call preserved, and reopening restores the same call', async () => {
    render(makeWidget());
    if (screen.queryByRole('button', { name: 'Talk to Aspen' })) fireEvent.click(screen.getByRole('button', { name: 'Talk to Aspen' }));
    await waitFor(() => expect(calls.start).toHaveBeenCalledTimes(1));
    // No legacy chrome exists alongside the X.
    expect(screen.queryByRole('button', { name: 'Close assistant' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Minimize assistant' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand assistant' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    // The conversation was never unmounted: no stop, no second start.
    expect(calls.stop).not.toHaveBeenCalled();
    expect(calls.start).toHaveBeenCalledTimes(1);
    // In the bubble the X is gone; the bubble itself is the way back in.
    expect(screen.queryByRole('button', { name: 'Minimize' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Talk to Aspen' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Minimize' })).toBeTruthy());
    expect(calls.start).toHaveBeenCalledTimes(1);
    expect(calls.stop).not.toHaveBeenCalled();
  });
  it('keeps the same call through repeated collapse and reopen cycles', async () => {
    render(makeWidget());
    if (screen.queryByRole('button', { name: 'Talk to Aspen' })) fireEvent.click(screen.getByRole('button', { name: 'Talk to Aspen' }));
    await waitFor(() => expect(calls.start).toHaveBeenCalledTimes(1));
    for (let cycle = 0; cycle < 2; cycle++) {
      fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
      expect(calls.stop).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Talk to Aspen' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Minimize' })).toBeTruthy());
    }
    expect(calls.start).toHaveBeenCalledTimes(1);
    expect(calls.stop).not.toHaveBeenCalled();
  });
});
