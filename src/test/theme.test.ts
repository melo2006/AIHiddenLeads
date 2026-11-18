import { describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from "@/lib/theme";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, value); },
    map,
  };
}

describe("theme preference parsing", () => {
  it("accepts exactly the three known preferences", () => {
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  it("falls back to system for anything invalid", () => {
    for (const bad of [undefined, null, "", "blue", "DARK", " dark", 0, 42, {}, [], true]) {
      expect(parseThemePreference(bad)).toBe("system");
    }
  });
});

describe("theme resolution", () => {
  it("an explicit choice always wins over the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("system follows the OS scheme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("theme preference storage", () => {
  it("a stored preference wins on read", () => {
    expect(readThemePreference(fakeStorage({ [THEME_STORAGE_KEY]: "dark" }))).toBe("dark");
    expect(readThemePreference(fakeStorage({ [THEME_STORAGE_KEY]: "light" }))).toBe("light");
    expect(readThemePreference(fakeStorage({ [THEME_STORAGE_KEY]: "system" }))).toBe("system");
  });

  it("a missing or invalid stored value falls back to system", () => {
    expect(readThemePreference(fakeStorage())).toBe("system");
    expect(readThemePreference(fakeStorage({ [THEME_STORAGE_KEY]: "neon" }))).toBe("system");
  });

  it("round-trips a written preference", () => {
    const storage = fakeStorage();
    writeThemePreference("dark", storage);
    expect(storage.map.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemePreference(storage)).toBe("dark");
  });

  it("survives a storage that throws (private mode)", () => {
    const hostile = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(readThemePreference(hostile)).toBe("system");
    expect(() => writeThemePreference("light", hostile)).not.toThrow();
    expect(readThemePreference(null)).toBe("system");
    expect(() => writeThemePreference("light", null)).not.toThrow();
  });
});

describe("applying the resolved theme", () => {
  function fakeRoot() {
    const classes = new Set<string>();
    return {
      classList: {
        toggle: (token: string, force?: boolean) => {
          if (force === undefined) { classes.has(token) ? classes.delete(token) : classes.add(token); }
          else if (force) classes.add(token); else classes.delete(token);
        },
      },
      dataset: {} as Record<string, string | undefined>,
      style: { colorScheme: "" },
      classes,
    };
  }

  it("dark adds the dark class and dark color-scheme", () => {
    const root = fakeRoot();
    applyResolvedTheme("dark", root);
    expect(root.classes.has("dark")).toBe(true);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("light removes the dark class and sets light color-scheme", () => {
    const root = fakeRoot();
    applyResolvedTheme("dark", root);
    applyResolvedTheme("light", root);
    expect(root.classes.has("dark")).toBe(false);
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});
