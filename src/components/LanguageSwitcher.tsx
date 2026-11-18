import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGS = [
  { code: "en", flag: "🇺🇸", label: "EN" },
  { code: "pt-BR", flag: "🇧🇷", label: "PT" },
  { code: "es", flag: "🌎", label: "ES" },
  { code: "fr-CA", flag: "🇨🇦", label: "FR" },
] as const;

interface LanguageSwitcherProps {
  variant?: "compact" | "full";
  className?: string;
}

const LanguageSwitcher = ({ variant = "compact", className = "" }: LanguageSwitcherProps) => {
  const { i18n, t } = useTranslation();

  // Normalize: i18n may report 'pt' or 'pt-BR'
  const current =
    LANGS.find((l) => l.code === i18n.language) ??
    LANGS.find((l) => i18n.language?.startsWith(l.code.split("-")[0])) ??
    LANGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("lang.label")}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ${className}`}
      >
        <Globe className="w-4 h-4" />
        <span>{current.flag}</span>
        {variant === "full" && <span className="text-xs">{current.label}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px] z-[100]">
        {LANGS.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={`cursor-pointer gap-2 ${
              current.code === lang.code ? "bg-primary/10 text-primary" : ""
            }`}
          >
            <span className="text-base">{lang.flag}</span>
            <span className="flex-1">{t(`lang.${lang.code}`)}</span>
            {current.code === lang.code && <span className="text-xs">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
