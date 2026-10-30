// Only same-site paths that customers or administrators may return to after sign-in.
const ALLOWED = ['/checkout', '/setup', '/account', '/demo-site', '/demo'];

export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  const path = value.split(/[?#]/)[0];
  return ALLOWED.some(p => path === p || path.startsWith(`${p}/`)) ? value : null;
}
