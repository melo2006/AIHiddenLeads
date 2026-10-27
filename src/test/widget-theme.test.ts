// @vitest-environment node
import { expect, test } from 'vitest';
import { normalizeTheme, websiteTheme, themeVariables, DEFAULT_WIDGET_THEME } from '../../supabase/functions/_shared/widget-theme';
test('older agents retain the existing emerald theme',()=>expect(normalizeTheme(undefined)).toEqual(DEFAULT_WIDGET_THEME));
test('customers can save accent, window and text colors with a supported font',()=>expect(normalizeTheme({primary:'#2468AC',background:'#FFFFFF',foreground:'#121212',font:'Georgia'})).toEqual({primary:'#2468AC',background:'#FFFFFF',foreground:'#121212',font:'Georgia'}));
test('CSS injection and remote font values fall back to safe defaults',()=>expect(normalizeTheme({primary:'red;display:none',font:'url(https://example.com/font)'})).toEqual(DEFAULT_WIDGET_THEME));
test('website styling uses captured evidence and a supported font',()=>expect(websiteTheme({primary:'#2468AC',background:'#FFFFFF',textPrimary:'#121212'},[{family:'Georgia'}])).toEqual({primary:'#2468AC',background:'#FFFFFF',foreground:'#121212',font:'Georgia'}));
test('missing website branding produces no invented suggestion',()=>expect(websiteTheme(null,null)).toBeNull());
test('published appearance maps saved colors to semantic tokens',()=>expect(themeVariables({primary:'#FF0000'})['--primary']).toBe('0 100% 50%'));