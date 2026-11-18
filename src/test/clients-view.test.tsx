import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientsView from '@/components/crm/ClientsView';

// Clients view (multi-tenant / reseller design Phase 1, 2026-11-18):
// the admin's joined customer list, fed by the voice-agents `clients`
// action, with the lead -> customer link suggested by email and written
// only on an explicit click.

const clientFixture = {
  userId: 'user-1', email: 'maria@example.com', customerName: 'Maria Lopez',
  organizationId: 'org-1', businessName: 'Lopez Dental', organizationType: 'client',
  organizationStatus: 'active', parentOrganizationId: null, parentOrganizationName: null,
  agentId: 'agent-1', environment: 'live', planPriceId: 'growth_monthly',
  subscriptionStatus: 'active', currentPeriodEnd: '2026-12-15T00:00:00.000Z',
  joinedAt: '2026-11-02T00:00:00.000Z', linkedProspectId: null as string | null,
};

const prospectFixture = {
  id: 'p-1', business_name: 'Lopez Dental', email: 'info@lopezdental.com',
  owner_email: 'maria@example.com', converted_organization_id: null as string | null,
};

const state = vi.hoisted(() => ({
  clients: [] as unknown[],
  prospects: [] as unknown[],
  linkable: true,
  writes: [] as { id: string; values: Record<string, unknown> }[],
}));

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (name: string, opts?: { body?: Record<string, unknown> }) => {
    if (name === 'voice-agents' && opts?.body?.action === 'clients') {
      return { data: { clients: state.clients }, error: null };
    }
    return { data: null, error: null };
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({
      select: (cols: string) => ({
        order: () => {
          if (String(cols).includes('converted_organization_id') && !state.linkable) {
            return Promise.resolve({ data: null, error: { message: 'column does not exist' } });
          }
          return Promise.resolve({ data: state.prospects, error: null });
        },
      }),
      update: (values: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          state.writes.push({ id, values });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  },
}));

const renderView = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClientsView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mocks.invoke.mockClear();
  state.clients = [clientFixture];
  state.prospects = [prospectFixture];
  state.linkable = true;
  state.writes = [];
});
afterEach(() => cleanup());

describe('ClientsView', () => {
  it('renders the joined customer: person, business, plan, status, tenant, joined', async () => {
    renderView();
    expect(await screen.findByText('Maria Lopez')).toBeTruthy();
    expect(screen.getByText('maria@example.com')).toBeTruthy();
    expect(screen.getByText('Lopez Dental')).toBeTruthy();
    expect(screen.getByText('Pro · $199/mo')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('Direct')).toBeTruthy();
  });

  it('shows the honest empty state when there are no customers', async () => {
    state.clients = [];
    renderView();
    expect(await screen.findByText('No paying customers yet.')).toBeTruthy();
  });

  it('suggests the email-matched lead in the detail and links it only on click', async () => {
    renderView();
    fireEvent.click(await screen.findByText('Maria Lopez'));
    expect(await screen.findByText(/Possible match:/)).toBeTruthy();
    expect(state.writes).toHaveLength(0); // a suggestion writes nothing
    fireEvent.click(screen.getByText('Link this lead'));
    await waitFor(() => expect(state.writes).toHaveLength(1));
    expect(state.writes[0].id).toBe('p-1');
    expect(state.writes[0].values.converted_organization_id).toBe('org-1');
    expect(typeof state.writes[0].values.converted_at).toBe('string');
  });

  it('shows an existing lead link in the detail', async () => {
    state.clients = [{ ...clientFixture, linkedProspectId: 'p-1' }];
    state.prospects = [{ ...prospectFixture, converted_organization_id: 'org-1' }];
    renderView();
    fireEvent.click(await screen.findByText('Maria Lopez'));
    expect(await screen.findByText(/Linked lead:/)).toBeTruthy();
    expect(screen.getByText('Unlink')).toBeTruthy();
  });

  it('keeps linking off, with an explanation, until the Phase 1 SQL lands', async () => {
    state.linkable = false;
    renderView();
    fireEvent.click(await screen.findByText('Maria Lopez'));
    expect(await screen.findByText(/Lead linking turns on once the Phase 1 database update is applied/)).toBeTruthy();
  });
});

describe('Phase 1 wiring pins', () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const crm = read('pages/CRM.tsx');
  const sidebar = read('components/crm/CRMSidebar.tsx');

  it('routes /dashboard/clients and lists it in the sidebar under Results', () => {
    expect(crm).toContain('<Route path="clients" element={<ClientsView />} />');
    expect(sidebar).toContain('{ title: "Clients", url: "/dashboard/clients"');
  });

  it('the ADMIN header stays platform-branded: no tenant branding in the CRM shell', () => {
    const shell = crm.slice(crm.indexOf('<SidebarProvider>'));
    const header = shell.slice(shell.indexOf('<header'), shell.indexOf('</header>'));
    expect(header).toContain('<BrandLockup />');
    expect(header).toContain('aria-label="AI Hidden Leads — back to the main site"');
    expect(crm).not.toContain('useOrgBranding');
    expect(crm).not.toContain('myBranding');
  });
});
