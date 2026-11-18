import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  applyResolvedTheme,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  /** The visitor's stored choice: system | light | dark. */
  preference: ThemePreference;
  /** What is actually painted right now. */
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolvedTheme: "dark",
  setPreference: () => undefined,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Owns the site-wide theme: reads the stored preference, tracks the OS
 * scheme live while the preference is "system", applies the resolved
 * theme to <html> (the pre-paint bootstrap in index.html already put
 * the same class there, so this never flashes), and mirrors the choice
 * into the signed-in account's user_metadata so it follows the user
 * across devices. On sign-in, a stored account preference is adopted
 * once — the account wins over this browser's guest choice.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());
  const adoptedForUser = useRef<string | null>(null);

  const resolvedTheme = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme, document.documentElement);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeThemePreference(next);
    // Mirror into the account so the choice follows the user; a guest
    // has no session and updateUser simply no-ops through the catch.
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        void supabase.auth.updateUser({ data: { theme_preference: next } }).catch(() => undefined);
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const adopt = (userId: string | undefined, metadata: unknown) => {
      if (!userId || adoptedForUser.current === userId) return;
      const stored = parseThemePreference((metadata as { theme_preference?: unknown } | null)?.theme_preference);
      adoptedForUser.current = userId;
      // parseThemePreference falls back to "system" for anything unset —
      // only adopt when the account actually carries a saved choice.
      if ((metadata as { theme_preference?: unknown } | null)?.theme_preference === stored) {
        setPreferenceState(stored);
        writeThemePreference(stored);
      }
    };
    void supabase.auth.getUser().then(({ data }) => adopt(data.user?.id, data.user?.user_metadata)).catch(() => undefined);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      adopt(session?.user?.id, session?.user?.user_metadata);
    });
    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
