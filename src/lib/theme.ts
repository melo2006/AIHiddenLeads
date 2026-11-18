/**
 * Site-wide theme foundation (2026-11-18): every visitor gets a
 * System / Light / Dark preference. The preference persists per visitor
 * in localStorage and mirrors into the signed-in account's Supabase
 * user_metadata (no extra table needed). The resolved theme is applied
 * as the `dark` class on <html> — the same class Tailwind's darkMode
 * and the .dark token block in index.css key off — plus color-scheme,
 * so form controls and scrollbars follow too.
 *
 * The pre-paint bootstrap in index.html runs this same resolution
 * inline so the correct theme is on <html> before first paint; keep
 * the two in sync (storage key, valid values, system default).
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "aihl-theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/** Anything that is not exactly a known preference falls back to "system". */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

/** An explicit light/dark choice always wins; "system" follows the OS. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readThemePreference(storage: StorageLike | null = defaultStorage()): ThemePreference {
  if (!storage) return "system";
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeThemePreference(preference: ThemePreference, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* Storage blocked (private mode): the in-memory choice still applies. */
  }
}

type RootLike = {
  classList: { toggle: (token: string, force?: boolean) => void };
  dataset: Record<string, string | undefined>;
  style: { colorScheme: string };
};

export function applyResolvedTheme(resolved: ResolvedTheme, root: RootLike): void {
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
  } catch {
    return false;
  }
}
