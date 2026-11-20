import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import CustomerSignIn from '@/components/CustomerSignIn';
import { startMicrosoftOAuth } from '@/lib/googleOAuth';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import ptBR from '@/i18n/locales/pt-BR.json';
import fr from '@/i18n/locales/fr.json';

// Microsoft sign-in (2026-11-20): "Continue with Microsoft" sits beside
// Google on the customer sign-in (checkout + /setup gate) and the admin
// login. It mirrors the Google helper with provider "azure", the shared
// /auth/callback redirect, and the scopes Supabase needs for the email.
// Until the owner enables the Azure provider in Supabase, signInWithOAuth
// returns an error that must surface as a plain notice — no crash.

const auth = vi.hoisted(() => ({
  oauthResult: { data: { url: null as null | string }, error: null as null | Error },
  signInWithOAuth: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithOAuth: auth.signInWithOAuth,
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      exchangeCodeForSession: async () => ({ error: null }),
      setSession: async () => ({ error: null }),
    },
  },
}));

beforeEach(() => {
  auth.oauthResult = { data: { url: null }, error: null };
  auth.signInWithOAuth.mockReset();
  auth.signInWithOAuth.mockImplementation(async () => auth.oauthResult);
  sessionStorage.clear();
  window.history.pushState({}, '', '/');
});

afterEach(() => cleanup());

describe('startMicrosoftOAuth', () => {
  it('starts Azure OAuth with the shared callback and email scopes', async () => {
    const { error } = await startMicrosoftOAuth({ returnPath: '/plans' });
    expect(error).toBeNull();
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    const arg = auth.signInWithOAuth.mock.calls[0][0];
    expect(arg.provider).toBe('azure');
    expect(arg.options.redirectTo).toBe(`${window.location.origin}/auth/callback`);
    expect(arg.options.scopes).toBe('email openid profile');
    expect(arg.options.queryParams).toBeUndefined();
    expect(sessionStorage.getItem('customer-auth-return')).toBe('/plans');
  });

  it('returns a disabled-provider error instead of throwing', async () => {
    auth.oauthResult = { data: { url: null }, error: new Error('provider is not enabled') };
    const { error } = await startMicrosoftOAuth();
    expect(error?.message).toBe('provider is not enabled');
  });
});

describe('CustomerSignIn Microsoft button', () => {
  it('renders beside Google and starts Azure OAuth on click', async () => {
    render(
      <MemoryRouter>
        <CustomerSignIn />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy();
    const ms = screen.getByRole('button', { name: /continue with microsoft/i });
    fireEvent.click(ms);
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(auth.signInWithOAuth.mock.calls[0][0].provider).toBe('azure');
  });

  it('shows the provider error as a notice, not a crash', async () => {
    auth.oauthResult = { data: { url: null }, error: new Error('provider is not enabled') };
    render(
      <MemoryRouter>
        <CustomerSignIn />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /continue with microsoft/i }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('provider is not enabled'),
    );
  });
});

describe('locale parity for the Microsoft label', () => {
  it('every locale carries a translated continueWithMicrosoft', () => {
    const enLabel = (en as any).account.continueWithMicrosoft;
    expect(enLabel).toBe('Continue with Microsoft');
    for (const loc of [es, ptBR, fr]) {
      const label = (loc as any).account.continueWithMicrosoft;
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(enLabel);
    }
  });
});
