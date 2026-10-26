// Homepage sales pacing: soft wrap-up around seven minutes, continue only while the caller stays engaged.
export const HOMEPAGE_WRAPUP_SECONDS = 420;
export const HOMEPAGE_REVIEW_SECONDS = 600;
export const ENGAGED_WINDOW_SECONDS = 90;

export function homepagePacingAction(elapsed: number, lastCallerSpeechAgo: number, wrapupSent: boolean) {
  if (elapsed >= HOMEPAGE_REVIEW_SECONDS && lastCallerSpeechAgo > ENGAGED_WINDOW_SECONDS) return 'close';
  if (!wrapupSent && elapsed >= HOMEPAGE_WRAPUP_SECONDS) return 'wrapup';
  return null;
}
