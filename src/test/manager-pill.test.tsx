import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BrowserVoiceHandoff from '@/components/BrowserVoiceHandoff';

// The compact Manager pill (2026-11-11): same BrowserVoiceHandoff transfer
// machinery, rendered as a phone-icon + "Manager" pill for the voice
// control row. These tests pin the label, the pill styling hooks and the
// action wiring (click -> server token request -> onActive(true)).
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (_fn: string, opts: { body: { action: string; handoffToken: string } }) =>
    opts.body.action === 'token'
      ? { data: { token: 'twilio-token' }, error: null }
      : { data: { status: 'awaiting_owner' }, error: null }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@twilio/voice-sdk', () => ({
  Device: class {
    on() {}
    audio = { setInputDevice: async () => {} };
    async connect() { return { on: () => {}, removeAllListeners: () => {}, disconnect: () => {} }; }
    destroy() {}
  },
  Call: class {},
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('BrowserVoiceHandoff pill variant', () => {
  it('renders a compact pill labelled Manager (aria-label keeps the full action name)', () => {
    const view = render(<BrowserVoiceHandoff pill token="tok-1" onActive={vi.fn()} microphone="default" />);
    const button = view.getByLabelText('Talk to manager');
    expect(button.textContent?.trim()).toBe('Manager');
    expect(button.className).toContain('aspen-manager-pill');
    expect(button.className).toContain('rounded-full');
    // >=40px tap target: the pill forces a 44px minimum height even where
    // the small-viewport control-row rule would shrink row buttons.
    expect(button.className).toContain('!min-h-11');
  });

  it('clicking the pill starts the same manager transfer (token request + onActive)', async () => {
    const onActive = vi.fn();
    const view = render(<BrowserVoiceHandoff pill token="tok-1" onActive={onActive} microphone="default" />);
    fireEvent.click(view.getByLabelText('Talk to manager'));
    await waitFor(() => expect(onActive).toHaveBeenCalledWith(true));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('browser-voice-handoff', { body: { action: 'token', handoffToken: 'tok-1' } }));
    await waitFor(() => expect(view.getByRole('status').textContent).toMatch(/manager/i));
  });

  it('the non-pill rendering keeps the original standalone Talk to manager row (voice lab)', () => {
    const view = render(<BrowserVoiceHandoff token="tok-1" onActive={vi.fn()} microphone="default" />);
    const button = view.getByLabelText('Talk to manager');
    expect(button.textContent).toContain('Talk to manager');
    expect(button.className).not.toContain('aspen-manager-pill');
  });
});
