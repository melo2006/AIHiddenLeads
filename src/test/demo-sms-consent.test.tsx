import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoIntakePanel from '@/components/landing/DemoIntakePanel';
import { DEMO_SMS_CONSENT_LABEL } from '@/lib/demoVerification';

// Telnyx TFV fix (2026-11-13): the demo intake carries an honest OPTIONAL
// SMS-consent checkbox — unchecked by default, never required. These tests
// pin (a) the default state, (b) that the demo submits identically with the
// box unticked, and (c) that the visitor's choice is carried into the
// set_demo_lead_sms_consent RPC that records it on the lead.
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  },
}));
vi.mock('@/lib/campaignTracking', () => ({ trackCampaignEvent: async () => {} }));

// jsdom has no ResizeObserver; Radix primitives (Switch) require one.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const LEAD_ID = '00000000-0000-4000-8000-0000000000aa';

function renderPanel(onReady = vi.fn()) {
  return render(<DemoIntakePanel url="example.com" onUrlChange={() => {}} onReady={onReady} />);
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jane Visitor' } });
  fireEvent.change(screen.getByLabelText('Email for your verification code'), {
    target: { value: 'jane@example.com' },
  });
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'create_demo_lead') return { data: LEAD_ID, error: null };
    return { data: true, error: null };
  });
});

afterEach(() => cleanup());

describe('demo intake SMS consent checkbox (Telnyx TFV fix)', () => {
  it('renders unchecked by default with the optional-consent label', () => {
    renderPanel();
    const box = screen.getByRole('checkbox', { name: /text me my demo link/i });
    expect(box).toBeInTheDocument();
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(DEMO_SMS_CONSENT_LABEL)).toBeInTheDocument();
  });

  it('submits fine with the box unticked and records sms_consent=false on the lead', async () => {
    const onReady = vi.fn();
    renderPanel(onReady);
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /show me my talking website/i }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith(
      'set_demo_lead_sms_consent',
      expect.objectContaining({ _lead_id: LEAD_ID, _sms_consent: false }),
    );
    const ready = onReady.mock.calls[0][0];
    expect(ready.leadData.leadId).toBe(LEAD_ID);
  });

  it('records sms_consent=true when the visitor ticks the box', async () => {
    const onReady = vi.fn();
    renderPanel(onReady);
    fillRequiredFields();

    fireEvent.click(screen.getByRole('checkbox', { name: /text me my demo link/i }));
    expect(screen.getByRole('checkbox', { name: /text me my demo link/i })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /show me my talking website/i }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith(
      'set_demo_lead_sms_consent',
      expect.objectContaining({ _lead_id: LEAD_ID, _sms_consent: true }),
    );
  });

  it('still completes the demo when the consent write fails (best-effort, never a blocker)', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'create_demo_lead') return { data: LEAD_ID, error: null };
      return { data: null, error: { message: 'function not found' } };
    });
    const onReady = vi.fn();
    renderPanel(onReady);
    fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: /show me my talking website/i }));

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });
});
