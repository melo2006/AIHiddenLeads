import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/ThemeProvider";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";

const ICONS: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const LABEL_KEYS: Record<ThemePreference, string> = {
  system: "account.themeSystem",
  light: "account.themeLight",
  dark: "account.themeDark",
};

/**
 * The three theme choices as dropdown items (icon + label + check on
 * the active one). Render inside any DropdownMenuContent — used by the
 * header toggle below and by the account menu's settings section.
 */
export function ThemePreferenceItems() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  return (
    <>
      <DropdownMenuLabel>{t("account.theme")}</DropdownMenuLabel>
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option];
        return (
          <DropdownMenuItem key={option} onSelect={() => setPreference(option)}>
            <Icon className="mr-2 h-4 w-4" /> {t(LABEL_KEYS[option])}
            {preference === option && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

/** Header control: a button naming the theme choice, opening System / Light / Dark. */
export default function ThemeToggle() {
  const { t } = useTranslation();
  const { preference } = useTheme();
  const Current = ICONS[preference];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={t("account.theme")} title={t("account.theme")}>
          <Current />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[120] w-52">
        <ThemePreferenceItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Labeled row for menus/settings lists (mobile nav, account settings): same choices, presented as a bordered row like TextSizeControl. */
export function ThemePreferenceRow() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-3">
      <span className="flex items-center gap-2 text-sm">
        {(() => { const Icon = ICONS[preference]; return <Icon className="h-4 w-4" />; })()}
        {t("account.theme")}
      </span>
      <div className="flex items-center gap-1" role="group" aria-label={t("account.theme")}>
        {THEME_PREFERENCES.map((option) => {
          const Icon = ICONS[option];
          const active = preference === option;
          return (
            <Button
              key={option}
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              onClick={() => setPreference(option)}
              className="gap-1.5"
            >
              <Icon className="h-4 w-4" />
              {t(LABEL_KEYS[option])}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
