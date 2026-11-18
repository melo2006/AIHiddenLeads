import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, FileText, Type } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import TextSizeControl from "@/components/TextSizeControl";
import ThemeToggle, { ThemePreferenceRow } from "@/components/ThemeToggle";
import AccountMenu from "@/components/AccountMenu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveTenantBrand, type ResolvedBrand } from "@/lib/clients";
import { useTenantBrand } from "@/components/TenantBrandProvider";
import { initialsFor } from "@/lib/tenancy";

/**
 * Optional tenant brand (multi-tenant design Phase 1): only the
 * customer shell (CustomerPageLayout) passes one, resolved from the
 * signed-in user's organization. Public pages pass nothing and get the
 * platform AiHiddenLeads lockup, byte-for-byte as before.
 *
 * Reseller subdomains (design §12.2): when no explicit brand is
 * passed and the app is running on a claimed tenant host, the tenant
 * brand from TenantBrandProvider takes over instead. An explicit
 * brand (the signed-in customer shell) always wins over the host.
 */
const LandingNavbar = ({ brand }: { brand?: ResolvedBrand }) => {
  const tenant = useTenantBrand();
  const effectiveBrand = brand ?? (tenant ? resolveTenantBrand(tenant.branding) : undefined);
  const orgBrand = effectiveBrand?.source === "org" ? effectiveBrand : null;
  const location=useLocation();
  const navigate=useNavigate();
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const scrollTo = (id: string) => {
    setOpen(false);
    if(location.pathname !== '/') { navigate(`/#${id}`); return; }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
    <div aria-hidden className="h-14 sm:h-16" />
    <nav className="fixed top-0 inset-x-0 z-[90] bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
        <Link to="/" className="flex min-w-0 flex-1 lg:flex-none items-center gap-1.5">
          {orgBrand ? (
            <>
              {orgBrand.logoUrl ? (
                <img src={orgBrand.logoUrl} alt={orgBrand.name} className="w-6 h-6 shrink-0 rounded object-contain sm:w-9 sm:h-9" />
              ) : (
                <span
                  aria-hidden
                  className="flex w-6 h-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white sm:w-9 sm:h-9 sm:text-xs"
                  style={{ backgroundColor: orgBrand.brandColor || "#10b981" }}
                >
                  {initialsFor(orgBrand.name)}
                </span>
              )}
              <span
                className="min-w-0 truncate text-sm sm:text-lg leading-tight font-extrabold text-foreground"
                style={orgBrand.brandColor ? { color: orgBrand.brandColor } : undefined}
              >
                {orgBrand.name}
              </span>
            </>
          ) : (
            <>
              <img src="/logo.png" alt="AI Hidden Leads" className="w-6 h-6 shrink-0 sm:w-9 sm:h-9" />
              <span className="min-w-0 text-sm sm:text-lg leading-tight font-extrabold text-foreground">
                AI <span className="text-primary">Hidden</span> Leads
              </span>
            </>
          )}
        </Link>

        <div className="hidden lg:flex items-center gap-6">
          <button onClick={() => scrollTo("services")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t("nav.services")}
          </button>
          <button onClick={() => scrollTo("how-it-works")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t("nav.howItWorks")}
          </button>
          <button onClick={() => scrollTo("pricing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t("nav.pricing")}
          </button>
          <button onClick={() => scrollTo("testimonials")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t("nav.testimonials")}
          </button>
          <button onClick={() => scrollTo("faq")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t("nav.faq", "Help / FAQ")}
          </button>
          <Link
            to="/transcript"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            title="Video transcript"
          >
            <FileText className="h-3.5 w-3.5" />
            Script
          </Link>
          <LanguageSwitcher />
          <Popover><PopoverTrigger asChild><Button size="icon" variant="ghost" aria-label="Text size" title="Text size"><Type /></Button></PopoverTrigger><PopoverContent className="z-[100] w-72"><TextSizeControl /></PopoverContent></Popover>
          <ThemeToggle />
          <Button size="sm" onClick={() => scrollTo("demo-form")}>
            {t("nav.getFreeDemo")}
          </Button>
          <AccountMenu />
        </div>

        <div className="lg:hidden flex items-center gap-1">
          <LanguageSwitcher />
          <AccountMenu compact />
          <Button size="icon" variant="ghost" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} className="shrink-0 text-muted-foreground hover:text-foreground">
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-border bg-background/95 backdrop-blur-xl px-4 py-3 space-y-1">
          {[
            { id: "services", label: t("nav.services") },
            { id: "how-it-works", label: t("nav.howItWorks") },
            { id: "pricing", label: t("nav.pricing") },
            { id: "testimonials", label: t("nav.testimonials") },
            { id: "faq", label: t("nav.faq", "Help / FAQ") },
          ].map((item) => (
            <Button variant="ghost"
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="h-auto min-h-11 justify-start whitespace-normal w-full text-left px-3 py-2 text-base font-medium text-foreground hover:bg-secondary transition-all"
            >
              {item.label}
            </Button>
          ))}
          <Link
            to="/transcript"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-3 py-3 rounded-lg text-base font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          >
            Script
          </Link>
          <Button asChild variant="ghost" className="w-full justify-start"><Link to="/account?mode=signup" onClick={()=>setOpen(false)}>Create account</Link></Button>
          <TextSizeControl />
          <ThemePreferenceRow />
          <Button size="lg" className="h-auto min-h-11 whitespace-normal w-full mt-2 py-3 text-base" onClick={() => scrollTo("demo-form")}>
            {t("nav.getFreeDemo")}
          </Button>
        </div>
      )}
    </nav>
    </>
  );
};

export default LandingNavbar;
