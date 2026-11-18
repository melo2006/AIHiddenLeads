import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TenantsView from '@/components/crm/TenantsView';
import RateCardView from '@/components/crm/RateCardView';
import ResellerConsole from '@/components/crm/ResellerConsole';
import { DEFAULT_RATE_CARD } from '@/lib/rateCard';

// Phase 2 screens (multi-tenant / reseller design, 2026-11-18): the
// admin Tenants screen + limits editor, the admin Rate Card, and the
// reseller console. The console assertions pin the white-label
// boundary: a reseller sees his prices and caps — never our costs,
// never the word for a vendor, never another tenant.

const tenantFixture = {
  id: 'org-reseller', name: 'B2 Tecnologia', type: 'reseller', status: 'active',
  parentOrganizationId: null, parentName: null,
  branding: { logoUrl: 'https://x/logo.png', slogan: 'Atendimento que vende', supportEmail: 'suporte@b2.example', brandColor: '#0ea5e9' },
  limits: { maxClients: 25, minutesPool: 5000, demoBudgetUsd: 100, monthlySpendCapUsd: null, features: {} },
  rateCardOverrides: {},
  clientCount: 3, monthMinutes: 4200, monthSpendUsd: 141.2, monthDemoSpendUsd: 82.5,
  caps: { minutes: 'warning', spend: 'unlimited', demoSpend: 'warning', clients: 'ok' },
  brandingComplete: true,
};

const consoleFixture = {
  organization: { id: 'org-reseller', name: 'B2 Tecnologia', type: 'reseller', status: 'active', branding: { name: 'B2 Tecnologia', logoUrl: 'https://x/logo.png', slogan: 'Atendimento que vende', supportEmail: 'suporte@b2.example', brandColor: '#0ea5e9' } },
  limits: { maxClients: 25, minutesPool: 5000, demoBudgetUsd: 100, monthlySpendCapUsd: null, features: {} },
  caps: { minutes: 'warning', spend: 'unlimited', demoSpend: 'ok', clients: 'ok' },
  usage: { minutes: 4200, spendUsd: 141.2, demoSpendUsd: 40, clientCount: 3 },
  prices: [
    { key: 'voice_minutes', label: 'Voice minutes', unit: 'minute', priceUsd: 0.0499 },
    { key: 'avatar_minutes', label: 'Avatar/video minutes', unit: 'minute', priceUsd: 0.05 },
  ],
  invites: [
    { id: 'inv-1', kind: 'client', email: 'owner@client.example', company_name: 'Client Co', role: 'owner', status: 'pending', expires_at: '2026-11-25T00:00:00Z', email_sent: true },
  ],
  brandingComplete: true,
};

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (_name: string, opts?: { body?: Record<string, unknown> }) => {
    const action = opts?.body?.action;
    if (action === 'tenants') return { data: { tenants: [tenantFixture] }, error: null };
    if (action === 'rateCard') return { data: { rateCard: DEFAULT_RATE_CARD }, error: null };
    if (action === 'resellerConsole') return { data: consoleFixture, error: null };
    if (action === 'tenantClients') return { data: { clients: [], organizationId: 'org-reseller' }, error: null };
    if (action === 'updateTenant' || action === 'saveRateCard') return { data: { success: true }, error: null };
    return { data: {}, error: null };
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })), getPublicUrl: () => ({ data: { publicUrl: 'https://x/logo.png' } }) }) },
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  },
}));

// Radix Tabs activates on mouse-down, not click.
const openTab = (name: string) => {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
};

const wrap = (el: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{el}</MemoryRouter>
  </QueryClientProvider>,
);

afterEach(() => cleanup());

describe('TenantsView (platform admin)', () => {
  it('renders tenants with usage, demo spend and cap badges', async () => {
    wrap(<TenantsView />);
    await waitFor(() => expect(screen.getByText('B2 Tecnologia')).toBeTruthy());
    const text = document.body.textContent || '';
    expect(text).toContain('Reseller');
    expect(text).toContain('4200');
    expect(text).toContain('$141.20');
    expect(text).toContain('$82.50');
    expect(text).toContain('Near limit');
  });

  it('the limits editor exposes caps, feature toggles and overrides', async () => {
    wrap(<TenantsView />);
    await waitFor(() => expect(screen.getByText('B2 Tecnologia')).toBeTruthy());
    fireEvent.click(screen.getByText('B2 Tecnologia'));
    await waitFor(() => expect(screen.getByText('Max clients')).toBeTruthy());
    const text = document.body.textContent || '';
    expect(text).toContain('Demo budget $ / month');
    expect(text).toContain('Spend cap $ / month');
    expect(text).toContain('warn at 80%');
    expect(text).toContain('Video avatar');
    expect(text).toContain('Rate card overrides for this tenant');
  });
});

describe('RateCardView (platform admin)', () => {
  it('renders every §11 line with cost, mode and computed tenant price', async () => {
    wrap(<RateCardView />);
    await waitFor(() => expect(screen.getByText('Voice minutes')).toBeTruthy());
    const text = document.body.textContent || '';
    for (const label of ['Avatar/video minutes', 'Text chat minutes', 'Voice clone creation', 'Custom avatar creation', 'Website scan for a demo', 'Email sends', 'SMS segments', 'Phone number rental', 'WhatsApp messages', 'Prospect (lead generation)']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Our cost'); // admin-only column exists HERE…
  });
});

describe('ResellerConsole (tenant scope)', () => {
  it('shows his usage vs caps, his brand, and his prices — never our costs', async () => {
    wrap(<ResellerConsole organizationId="org-reseller" />);
    await waitFor(() => expect(screen.getByText(/B2 Tecnologia — Console/)).toBeTruthy());
    const overview = document.body.textContent || '';
    expect(overview).toContain('4200');
    expect(overview).toContain('Near limit');
    expect(overview).toContain('Atendimento que vende');

    openTab('Your prices');
    await waitFor(() => expect(screen.getByText('Voice minutes')).toBeTruthy());
    const prices = document.body.textContent || '';
    expect(prices).toContain('Avatar/video minutes');
    // The white-label boundary: no cost column, no cost values, no vendor names.
    expect(prices).not.toContain('Our cost');
    expect(prices).not.toContain('0.024');
    expect(prices).not.toContain('0.0089');
    expect(prices.toLowerCase()).not.toContain('simli');
    expect(prices.toLowerCase()).not.toContain('gemini');
  });

  it('team tab lists his invites with status and email state', async () => {
    wrap(<ResellerConsole organizationId="org-reseller" />);
    await waitFor(() => expect(screen.getByText(/B2 Tecnologia — Console/)).toBeTruthy());
    openTab('Team & invites');
    await waitFor(() => expect(screen.getByText('owner@client.example')).toBeTruthy());
    const text = document.body.textContent || '';
    expect(text).toContain('Client Co');
    expect(text).toContain('pending');
    expect(text).toContain('Sent');
  });
});
