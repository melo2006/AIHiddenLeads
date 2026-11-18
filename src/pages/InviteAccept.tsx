import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandLockup } from '@/components/BrandLogo';
import { toast } from 'sonner';

// Invite acceptance (multi-tenant design Phase 2, 2026-11-18 §4).
// The link carries the raw token; the server stores only its hash.
// Preview works signed-out (company + inviter brand + status only).
// Accepting requires a signed-in account whose email matches the
// invite — enforced server-side; this page just drives the flow.

interface Preview { kind: string; companyName: string; inviterName: string; status: string }

const InviteAccept = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');

  useEffect(() => {
    if (!token) return;
    void supabase.functions.invoke('voice-agents', { body: { action: 'invitePreview', inviteToken: token } })
      .then(({ data, error }) => {
        if (error || !(data as { preview?: Preview })?.preview) {
          setPreviewError((data as { error?: string })?.error || 'This invite link is not valid.');
          return;
        }
        setPreview((data as { preview: Preview }).preview);
      })
      .catch(() => setPreviewError('This invite link is not valid.'));
  }, [token]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const auth = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) {
      toast.error(mode === 'signup' ? 'Could not create your account' : 'Sign-in failed', { description: result.error.message });
      return;
    }
    if (mode === 'signup' && !result.data.session) {
      toast.success('Account created — check your email to confirm, then come back to this link.');
      return;
    }
    toast.success('Signed in');
  };

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('voice-agents', { body: { action: 'inviteAccept', inviteToken: token } });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error('Could not accept the invite', { description: (data as { error?: string })?.error });
      return;
    }
    const kind = (data as { kind?: string })?.kind;
    toast.success('Welcome — your account is ready.');
    navigate(kind === 'reseller' || kind === 'staff' ? '/dashboard' : '/setup', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="space-y-3">
          <BrandLockup />
          <CardTitle className="text-lg">You're invited</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewError ? (
            <p role="alert" className="text-sm text-muted-foreground">{previewError}</p>
          ) : !preview ? (
            <p className="text-sm text-muted-foreground">Checking your invite…</p>
          ) : preview.status !== 'pending' ? (
            <p className="text-sm text-muted-foreground">
              {preview.status === 'expired' ? 'This invite has expired. Ask for a new one.' : 'This invite is no longer available.'}
            </p>
          ) : (
            <>
              <p className="text-sm">
                <strong>{preview.inviterName}</strong> has set up{' '}
                {preview.kind === 'reseller' ? 'a reseller account' : preview.kind === 'staff' ? 'a team account' : 'a business account'}{' '}
                for <strong>{preview.companyName}</strong>.
              </p>
              {session ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Signed in as {session.user.email}. The invite must be accepted by the account it was sent to.
                  </p>
                  <Button className="w-full" disabled={busy} onClick={() => void accept()}>
                    {busy ? 'Accepting…' : 'Accept invitation'}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => void supabase.auth.signOut()}>Sign out and use a different account</Button>
                </>
              ) : (
                <>
                  <div className="flex gap-2 text-xs">
                    <Button size="sm" variant={mode === 'signup' ? 'default' : 'outline'} onClick={() => setMode('signup')}>Create account</Button>
                    <Button size="sm" variant={mode === 'signin' ? 'default' : 'outline'} onClick={() => setMode('signin')}>I already have an account</Button>
                  </div>
                  <form onSubmit={(e) => void auth(e)} className="space-y-3">
                    <Input type="email" autoComplete="email" placeholder="The email the invite was sent to" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <Input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? 'Working…' : mode === 'signup' ? 'Create account and continue' : 'Sign in and continue'}
                    </Button>
                  </form>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InviteAccept;
