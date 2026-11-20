import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import ResetPassword from '@/pages/ResetPassword';
import UpdatePassword from '@/pages/UpdatePassword';
import CustomerSignIn from '@/components/CustomerSignIn';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import ptBR from '@/i18n/locales/pt-BR.json';
import fr from '@/i18n/locales/fr.json';

// Password reset flow (2026-11-20): the old sign-in "Reset password"
// button fired resetPasswordForEmail with whatever happened to be in
// the email field (empty → "Password recovery requires an email") and
// its redirect target /setup?reset=1 had no set-password UI at all.
// The flow is now: sign-in link → /reset-password (email only) →
// email link → /update-password (recovery session → new password).

const auth = vi.hoisted(() => ({
  resetResult: { error: null as null | Error },
  updateResult: { error: null as null | Error },
  session: null as null | { user: { id: string } },
  listener: null as null | ((event: string, session: unknown) => void),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: auth.resetPasswordForEmail,
      updateUser: auth.updateUser,
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async () => ({ error: null }),
      getUser: async () => ({ data: { user: null } }),
      signOut: async () => ({ error: null }),
      signUp: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
    },
  },
}));

const renderInRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  auth.resetResult = { error: null };
  auth.updateResult = { error: null };
  auth.session = null;
  auth.listener = null;
  auth.resetPasswordForEmail.mockReset();
  auth.resetPasswordForEmail.mockImplementation(async () => auth.resetResult);
  auth.updateUser.mockReset();
  auth.updateUser.mockImplementation(async () => auth.updateResult);
  window.history.pushState({}, '', '/');
});

afterEach(() => cleanup());

describe('/reset-password', () => {
  it('renders inside the site shell (header + footer, not a bare page)', async () => {
    renderInRouter(<ResetPassword />);
    // Footer carries the platform phone numbers; the bare page had neither.
    expect(await screen.findByText(/1-877-86-AI WIZ/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('sends the reset email with the /update-password redirect and confirms', async () => {
    renderInRouter(<ResetPassword />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1));
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('owner@example.com', {
      redirectTo: `${window.location.origin}/update-password`,
    });
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/owner@example\.com/)).toBeInTheDocument();
  });

  it('shows an honest error when Supabase refuses the request', async () => {
    auth.resetResult = { error: new Error('boom') };
    renderInRouter(<ResetPassword />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn't send the reset email/i
    );
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });
});

describe('/update-password', () => {
  it('shows the invalid-link state when the URL carries an error', async () => {
    window.history.pushState(
      {},
      '',
      '/update-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );
    renderInRouter(<UpdatePassword />);
    expect(await screen.findByText(/this reset link doesn't work/i)).toBeInTheDocument();
    const again = screen.getByRole('link', { name: /request a new reset link/i });
    expect(again).toHaveAttribute('href', '/reset-password');
  });

  it('reveals the form on PASSWORD_RECOVERY, validates, and saves the new password', async () => {
    renderInRouter(<UpdatePassword />);
    expect(auth.listener).toBeTypeOf('function');
    auth.listener!('PASSWORD_RECOVERY', { user: { id: 'u1' } });

    const next = await screen.findByLabelText(/^new password$/i);
    const confirm = screen.getByLabelText(/confirm new password/i);
    fireEvent.change(next, { target: { value: 'Longenough1!' } });
    fireEvent.change(confirm, { target: { value: 'Different99!' } });
    fireEvent.submit(screen.getByRole('button', { name: /save new password/i }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/don't match/i);
    expect(auth.updateUser).not.toHaveBeenCalled();

    fireEvent.change(confirm, { target: { value: 'Longenough1!' } });
    fireEvent.submit(screen.getByRole('button', { name: /save new password/i }).closest('form')!);
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Longenough1!' }));
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it('blocks a password that misses the policy (no special character)', async () => {
    renderInRouter(<UpdatePassword />);
    auth.listener!('PASSWORD_RECOVERY', { user: { id: 'u1' } });
    fireEvent.change(await screen.findByLabelText(/^new password$/i), {
      target: { value: 'longenough1' },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'longenough1' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /save new password/i }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/meet all the rules/i);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('eye toggle shows and hides the typed password', async () => {
    renderInRouter(<UpdatePassword />);
    auth.listener!('PASSWORD_RECOVERY', { user: { id: 'u1' } });
    const next = (await screen.findByLabelText(/^new password$/i)) as HTMLInputElement;
    expect(next.type).toBe('password');
    fireEvent.click(screen.getAllByRole('button', { name: /show password/i })[0]);
    expect(next.type).toBe('text');
    fireEvent.click(screen.getAllByRole('button', { name: /hide password/i })[0]);
    expect(next.type).toBe('password');
  });

  it('rejects passwords shorter than 8 characters before calling Supabase', async () => {
    renderInRouter(<UpdatePassword />);
    auth.listener!('PASSWORD_RECOVERY', { user: { id: 'u1' } });
    fireEvent.change(await screen.findByLabelText(/^new password$/i), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'short' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /save new password/i }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe('CustomerSignIn reset entry point', () => {
  it('navigates to /reset-password instead of emailing from the form', () => {
    renderInRouter(<CustomerSignIn />);
    const link = screen.getByRole('link', { name: /reset password/i });
    expect(link).toHaveAttribute('href', '/reset-password');
    fireEvent.click(link);
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe('passwordReset locale parity', () => {
  const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, string> =>
    Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') acc[key] = v;
      else if (v && typeof v === 'object') Object.assign(acc, flatten(v as Record<string, unknown>, key));
      return acc;
    }, {});

  const enFlat = flatten((en as { passwordReset: Record<string, unknown> }).passwordReset);

  it.each([
    ['es', es],
    ['pt-BR', ptBR],
    ['fr-CA', fr],
  ])('%s has every passwordReset string, translated', (_name, locale) => {
    const flat = flatten((locale as { passwordReset: Record<string, unknown> }).passwordReset);
    for (const [key, enValue] of Object.entries(enFlat)) {
      expect(flat[key], `missing ${key}`).toBeTypeOf('string');
      expect(flat[key].length, `empty ${key}`).toBeGreaterThan(0);
      expect(flat[key], `untranslated ${key}`).not.toBe(enValue);
    }
  });
});
