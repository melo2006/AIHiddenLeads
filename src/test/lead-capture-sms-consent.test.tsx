import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LeadCaptureSection from '@/components/landing/LeadCaptureSection';
import { DEMO_CONSENT_DISCLOSURE, DEMO_SMS_CONSENT_LABEL } from '@/lib/demoVerification';
import en from '../i18n/locales/en.json';
import type { NicheData } from '@/data/nicheData';

// Publish #41 Pick 2 (Ron approved 2026-11-13): the homepage bottom form
// (LeadCaptureSection) mirrors the /demo intake's SMS consent EXACTLY —
// same Radix checkbox (unchecked by default, never required), same
// canonical label + disclosure from lib/demoVerification, and the choice
// persisted through the same set_demo_lead_sms_consent RPC when the form
// creates its lead via create_demo_lead. These tests pin the default
// state, the verbatim copy, and the persistence call in both positions.
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  },
}));
vi.mock('@/lib/campaignTracking', () => ({ trackCampaignEvent: async () => {} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/components/landing/ScanningAnimation', () => ({ default: () => null }));

// The form reads its copy from i18next; resolve keys against the real en
// locale (same pattern as demo-reassurance-strip.test.tsx).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const value = key
        .split('.')
        .reduce<unknown>(
          (acc, part) =>
            acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
          en as unknown,
        );
      return typeof value === 'string' ? value : key;
    },
  }),
}));

// jsdom lacks the observers Radix + framer-motion reach for.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

const LEAD_ID = '00000000-0000-4000-8000-0000000000bb';

function renderForm() {
  return render(
    <LeadCaptureSection selectedNiche={{ id: 'general' } as unknown as NicheData} />,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByPlaceholderText('Alex Johnson'), {
    target: { value: 'Jane Visitor' },
  });
  fireEvent.change(screen.getByPlaceholderText('bankunited.com'), {
    target: { value: 'example.com' },
  });
}

function submitForm() {
  fireEvent.click(screen.getByRole('button', { name: /build my ai demo/i }));
}

beforeEach(() => {
  localStorage.clear();
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  mocks.navigate.mockReset();
  mocks.invoke.mockResolvedValue({ data: {}, error: null });
  mocks.rpc.mockImplementation((name: string) => {
    if (name === 'create_demo_lead') return Promise.resolve({ data: LEAD_ID, error: null });
    if (name === 'get_demo_lead') {
      return { maybeSingle: async () => ({ data: null, error: null }) };
    }
    return Promise.resolve({ data: true, error: null });
  });
});

afterEach(() => cleanup());

describe('homepage LeadCaptureSection SMS consent (Publish #41 Pick 2 — mirrors /demo)', () => {
  it('renders the checkbox unchecked by default with the canonical label and disclosure', () => {
    renderForm();
    const box = screen.getByRole('checkbox', { name: /text me my demo link/i });
    expect(box).toBeInTheDocument();
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(DEMO_SMS_CONSENT_LABEL)).toBeInTheDocument();
    expect(screen.getByText(DEMO_CONSENT_DISCLOSURE)).toBeInTheDocument();
    // The retired Studio-local wording must never come back on this form.
    expect(screen.queryByText(/yes, text me about my demo/i)).not.toBeInTheDocument();
  });

  it('submits with the box unticked and records sms_consent=false on the created lead', async () => {
    renderForm();
    fillRequiredFields();
    submitForm();

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        'set_demo_lead_sms_consent',
        expect.objectContaining({ _lead_id: LEAD_ID, _sms_consent: false }),
      ),
    );
    // The demo build still proceeds exactly as before.
    expect(mocks.invoke).toHaveBeenCalledWith('scan-website', expect.anything());
  });

  it('records sms_consent=true when the visitor ticks the box', async () => {
    renderForm();
    fillRequiredFields();

    fireEvent.click(screen.getByRole('checkbox', { name: /text me my demo link/i }));
    expect(screen.getByRole('checkbox', { name: /text me my demo link/i })).toBeChecked();

    submitForm();

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        'set_demo_lead_sms_consent',
        expect.objectContaining({ _lead_id: LEAD_ID, _sms_consent: true }),
      ),
    );
  });

  it('still builds the demo when the consent write fails (best-effort, never a blocker)', async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'create_demo_lead') return Promise.resolve({ data: LEAD_ID, error: null });
      if (name === 'get_demo_lead') {
        return { maybeSingle: async () => ({ data: null, error: null }) };
      }
      return Promise.resolve({ data: null, error: { message: 'function not found' } });
    });
    renderForm();
    fillRequiredFields();
    submitForm();

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith('scan-website', expect.anything()),
    );
  });
});
