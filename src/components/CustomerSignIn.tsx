import { useEffect, useState } from 'react';
import PasswordInput from "@/components/ui/password-input";
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { safeReturnPath } from '@/lib/authReturn';
import { listenForOAuthPopupSession, startGoogleOAuth, startMicrosoftOAuth } from '@/lib/googleOAuth';

export function MicrosoftLogo({ className }: { className?: string }) {
 return <svg className={className} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect width="7.5" height="7.5" fill="#f25022"/><rect x="8.5" width="7.5" height="7.5" fill="#7fba00"/><rect y="8.5" width="7.5" height="7.5" fill="#00a4ef"/><rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#ffb900"/></svg>;
}
const returnTo=()=>safeReturnPath(new URLSearchParams(window.location.search).get('next'));
export default function CustomerSignIn() {
 const {t}=useTranslation();
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[signup,setSignup]=useState(()=>new URLSearchParams(window.location.search).get('mode')==='signup');
 useEffect(()=>listenForOAuthPopupSession(()=>{const next=returnTo();if(next)window.location.assign(next);}),[]);
 async function social(){const {error}=await startGoogleOAuth({returnPath:returnTo()||window.location.pathname+window.location.search});if(error)setNotice(error.message);}
 async function socialMicrosoft(){const {error}=await startMicrosoftOAuth({returnPath:returnTo()||window.location.pathname+window.location.search});if(error)setNotice(error.message);}
 return <div className="space-y-3 p-4"><h2 className="font-semibold">Your customer account</h2><p className="text-sm text-muted-foreground">Sign in before payment to keep your purchase and setup together.</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>void social()}>Continue with Google</Button><Button variant="outline" className="gap-2" onClick={()=>void socialMicrosoft()}><MicrosoftLogo/>{t('account.continueWithMicrosoft')}</Button></div><form className="space-y-3" onSubmit={async e=>{e.preventDefault();setBusy(true);const {error}=signup?await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo()||window.location.pathname+window.location.search)}`}}):await supabase.auth.signInWithPassword({email,password});if(!error&&!signup){const next=returnTo();if(next){window.location.assign(next);return;}}setNotice(error?(/invalid login/i.test(error.message)?'That email and password did not match. New here? Tap "Create an account" first.':/already registered/i.test(error.message)?'This email already has an account. Tap "Already have an account?" and sign in, or reset your password.':error.message):(signup?'Almost done: open the confirmation email we just sent, then you will come back here to pay.':''));setBusy(false);}}><label className="block text-sm">Email<Input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="block text-sm">Password<PasswordInput required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label><Button disabled={busy} type="submit">{signup?'Create account':'Sign in'}</Button><Button type="button" variant="ghost" onClick={()=>setSignup(!signup)}>{signup?'Already have an account?':'Create an account'}</Button><Button type="button" variant="ghost" asChild><Link to="/reset-password">Reset password</Link></Button></form>{notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}</div>;
}