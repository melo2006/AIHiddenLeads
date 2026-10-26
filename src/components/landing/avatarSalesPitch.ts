// Homepage-only fallback; live conversations use the saved homepage agent snapshot.
import { HOMEPAGE_SALES_PROMPT, HOMEPAGE_KNOWLEDGE } from '../../../supabase/functions/_shared/homepage-knowledge';
import { homepageIntroSegments } from './homepageIntroScript';
export const salesPitchSegments = homepageIntroSegments;
export const qaSystemPrompt = `${HOMEPAGE_SALES_PROMPT}\n${HOMEPAGE_KNOWLEDGE}`;
