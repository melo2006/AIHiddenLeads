export function voiceQuotaClass(isAdmin: boolean, preview: boolean) {
  return isAdmin ? 'admin_test' : preview ? 'audition' : 'visitor';
}

export function voiceLimitResponse(message: string, now = new Date()) {
  const visitorLimit = message === 'Your daily voice limit has been reached';
  if (!visitorLimit && message !== 'Daily voice limit reached') return null;
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return {
    allowed: false,
    code: visitorLimit ? 'VISITOR_DAILY_LIMIT' : 'SITE_DAILY_LIMIT',
    error: visitorLimit
      ? 'Your daily demo allowance has been used. Try again after midnight UTC. Administrators can sign in to continue testing or adjust Voice Guardrails.'
      : 'Today’s voice allowance has been used. Please try again after midnight UTC, or ask the administrator to review Voice Guardrails.',
    resetsAt: reset.toISOString(),
  };
}