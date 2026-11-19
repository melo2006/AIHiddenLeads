import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import CustomerSetup from '@/pages/CustomerSetup';

// Owner preview (2026-11-19): the /setup subscription gate gains an
// admin-only bypass. Platform admin is determined exactly the way
// AccountMenu determines it — a row with role "admin" in the protected
// voice_platform_roles table for the signed-in user — never a client
// flag or an email list. Non-admins must see today's gate, unchanged.

const state = vi.hoisted(() => ({
  roles: [] as { role: string }[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'someone@example.com' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
    },
    functions: {
      invoke: async (name: string) => {
        if (name === 'customer-billing') {
          return { data: { paid: false, workspace: null, subscription: null, avatar: null }, error: null };
        }
        return { data: null, error: null };
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => Promise.resolve({ data: table === 'voice_platform_roles' ? state.roles : [], error: null }),
      }),
    }),
  },
}));

vi.mock('@/lib/stripe', () => ({ getStripeEnvironment: () => 'sandbox' }));
vi.mock('@/components/CustomerPageLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/CustomerSignIn', () => ({ default: () => <div>sign-in</div> }));
vi.mock('@/components/PaymentTestModeBanner', () => ({ PaymentTestModeBanner: () => null }));
vi.mock('@/components/crm/VoiceAgentsView', () => ({ default: () => <div>voice-agents</div> }));
vi.mock('@/components/AgentInstallationGuide', () => ({ default: () => null }));
vi.mock('@/components/FirstStepsChecklist', () => ({ default: () => null }));
vi.mock('@/components/customer/UsageSection', () => ({ default: () => null }));
vi.mock('@/components/GeminiAgentWidget', () => ({ default: () => null }));
vi.mock('@/components/setup-wizard/SetupWizard', () => ({
  default: ({ preview, ownerPreview }: { preview?: boolean; ownerPreview?: boolean }) => (
    <div data-testid="setup-wizard" data-preview={String(Boolean(preview))} data-owner-preview={String(Boolean(ownerPreview))} />
  ),
}));

const renderSetup = () => render(
  <MemoryRouter initialEntries={['/setup']}>
    <CustomerSetup />
  </MemoryRouter>,
);

beforeEach(() => { state.roles = []; });
afterEach(() => cleanup());

describe('owner preview at the /setup gate', () => {
  it('a signed-in non-admin sees the unchanged gate and no owner preview button', async () => {
    state.roles = [{ role: 'member' }];
    renderSetup();
    expect(await screen.findByText('A verified paid subscription is required to start setup.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Owner preview/ })).toBeNull();
    expect(screen.queryByTestId('setup-wizard')).toBeNull();
  });

  it('a user with no platform roles at all also sees no owner preview button', async () => {
    state.roles = [];
    renderSetup();
    expect(await screen.findByText('A verified paid subscription is required to start setup.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Owner preview/ })).toBeNull();
  });

  it('a platform admin sees the owner preview button and it opens the wizard in owner preview mode', async () => {
    state.roles = [{ role: 'admin' }];
    renderSetup();
    const button = await screen.findByRole('button', { name: 'Owner preview — open the wizard' });
    fireEvent.click(button);
    const wizard = await screen.findByTestId('setup-wizard');
    expect(wizard.getAttribute('data-preview')).toBe('true');
    expect(wizard.getAttribute('data-owner-preview')).toBe('true');
    expect(screen.queryByText('A verified paid subscription is required to start setup.')).toBeNull();
  });
});

describe('owner preview banner wiring in SetupWizard', () => {
  const wizard = readFileSync(path.resolve(__dirname, '../components/setup-wizard/SetupWizard.tsx'), 'utf8');
  const crm = readFileSync(path.resolve(__dirname, '../pages/CRM.tsx'), 'utf8');

  it('the wizard banner swaps to the owner copy only in owner preview mode', () => {
    expect(wizard).toContain('ownerPreview = false');
    expect(wizard).toContain('t("wizard.ownerPreview.title")');
    expect(wizard).toContain('t("wizard.ownerPreview.note")');
    // The CRM assisted-setup banner copy stays for plain preview mode.
    expect(wizard).toContain('Assisted setup');
  });

  it('the CRM assisted-setup route still mounts plain preview mode', () => {
    expect(crm).toContain('<SetupWizard preview />');
  });

  it('the gate bypass never fabricates a paid state', () => {
    const setup = readFileSync(path.resolve(__dirname, '../pages/CustomerSetup.tsx'), 'utf8');
    expect(setup).toContain('<SetupWizard preview ownerPreview/>');
    expect(setup).toContain('voice_platform_roles');
    expect(setup).not.toContain('setBilling({paid:true');
    expect(setup).not.toContain('setBilling({ paid: true');
  });
});
