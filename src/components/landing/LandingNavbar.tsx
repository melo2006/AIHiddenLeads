import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, FileText, Type, Phone, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import TextSizeControl from "@/components/TextSizeControl";
import ThemeToggle, { ThemePreferenceRow } from "@/components/ThemeToggle";
import AccountMenu from "@/components/AccountMenu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveTenantBrand, type ResolvedBrand } from "@/lib/clients";
import { TOLL_FREE_DISPLAY } from "@/lib/phoneDisplay";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);

  const scrollTo = (id: string) => {
    setOpen(false);
    setMenuOpen(false);
    if(location.pathname !== '/') { navigate(`/#${id}`); return; }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  // Menu links live in ONE stacked menu (Ron's call, 2026-11-21):
  // spread across the bar they ate the whole header on smaller
  // screens. The desktop dropdown and the mobile panel both render
  // this same list, stacked. Most entries jump to a homepage section
  // (`id`); Articles and Help are real routes (`to`) in the same
  // list. Menu cleanup (2026-11-24): the old FAQ section jump and
  // the separate Help route entry merged into ONE Help
  // entry → /help — the homepage FAQ section itself is untouched.
  type MenuLinkItem = { label: string; id?: string; to?: string };
  const menuLinks: MenuLinkItem[] = [
    { id: "services", label: t("nav.services") },
    { id: "customers", label: t("nav.customers", "Customers") },
    { id: "examples", label: t("nav.examples", "Examples") },
    { to: "/articles", label: t("nav.articles", "Articles") },
    { id: "benefits", label: t("nav.benefits", "Benefits") },
    { id: "avatar-gallery", label: t("nav.avatars", "Avatars") },
    { id: "how-it-works", label: t("nav.howItWorks") },
    { id: "pricing", label: t("nav.pricing") },
    { id: "testimonials", label: t("nav.testimonials") },
    { to: "/help", label: t("nav.help", "Help") },
  ];

  const closeMenus = () => {
    setOpen(false);
    setMenuOpen(false);
  };

  return (
    <>
    <div aria-hidden className="h-14 sm:h-16" />
    <nav className="fixed top-0 inset-x-0 z-[90] bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
        <Link to="/" className="flex min-w-0 flex-1 lg:flex-none items-center gap-2 sm:gap-2.5">
          {orgBrand ? (
            <>
              {orgBrand.logoUrl ? (
                <img src={orgBrand.logoUrl} alt={orgBrand.name} className="w-10 h-10 shrink-0 rounded object-contain sm:w-12 sm:h-12" />
              ) : (
                <span
                  aria-hidden
                  className="flex w-10 h-10 shrink-0 items-center justify-center rounded text-xs font-bold text-white sm:w-12 sm:h-12 sm:text-sm"
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
              {/* logo-mark.png is /logo.png pre-cropped to its artwork:
                  the source canvas is ~64% transparent padding, which made
                  the mark render at ~13px inside a 36px box. The cropped
                  mark at 40/48px puts the artwork itself at ~33/39px. */}
              <img src="/logo-mark.png" alt="AI Hidden Leads" className="w-10 h-10 shrink-0 sm:w-12 sm:h-12" />
              <span className="min-w-0 truncate text-sm sm:text-lg leading-tight font-extrabold text-foreground">
                AI <span className="text-primary">Hidden</span> Leads
              </span>
            </>
          )}
        </Link>

        <div className="hidden lg:flex items-center gap-4 xl:gap-6">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={t("nav.menu", "Menu")} aria-expanded={menuOpen} className="text-sm text-muted-foreground hover:text-foreground">
                <Menu className="h-4 w-4" />
                {t("nav.menu", "Menu")}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[100] w-60 p-2">
              <div className="flex flex-col">
                {menuLinks.map((item) =>
                  item.to ? (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={closeMenus}
                      className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      key={item.id}
                      onClick={() => scrollTo(item.id!)}
                      className="w-full rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                    >
                      {item.label}
                    </button>
                  ),
                )}
                <div className="my-1 border-t border-border" />
                <Link
                  to="/transcript"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  title="Video transcript"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Script
                </Link>
              </div>
            </PopoverContent>
          </Popover>
          <LanguageSwitcher />
          <Popover><PopoverTrigger asChild><Button size="icon" variant="ghost" aria-label="Text size" title="Text size"><Type /></Button></PopoverTrigger><PopoverContent className="z-[100] w-72"><TextSizeControl /></PopoverContent></Popover>
          <ThemeToggle />
          {/* Platform number in the header (Ron's request, 2026-11-20):
              platform hosts only — like the footer, the platform
              numbers never render under a tenant's brand. The text
              joins at xl; below that the icon alone keeps the dense
              desktop cluster from crowding. */}
          {!effectiveBrand && (
            <a
              href={TOLL_FREE_DISPLAY.href}
              aria-label={`${t("nav.callUs")} ${TOLL_FREE_DISPLAY.vanity}`}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Phone className="h-4 w-4 shrink-0" />
              <span className="hidden xl:inline">{TOLL_FREE_DISPLAY.vanity}</span>
            </a>
          )}
          <Button size="sm" onClick={() => scrollTo("demo-form")}>
            {t("nav.getFreeDemo")}
          </Button>
          <AccountMenu />
        </div>

        <div className="lg:hidden flex items-center gap-1">
          <LanguageSwitcher />
          {/* Phone widths get a compact tap-to-call icon instead of
              the number text (platform hosts only, as above). */}
          {!effectiveBrand && (
            <Button asChild size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground">
              <a href={TOLL_FREE_DISPLAY.href} aria-label={`${t("nav.callUs")} ${TOLL_FREE_DISPLAY.vanity}`}>
                <Phone className="w-5 h-5" />
              </a>
            </Button>
          )}
          <AccountMenu compact />
          <Button size="icon" variant="ghost" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} className="shrink-0 text-muted-foreground hover:text-foreground">
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </div>

    </nav>

    {open && (
      <div className="lg:hidden">
        {/* Light scrim only: the page stays visible beside the narrow
            panel so live changes (text size, theme) can be judged with
            the menu open. Clicking the scrim closes the menu. */}
        <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 top-14 z-[80] bg-foreground/10 sm:top-16" />
        <div role="dialog" aria-label="Menu" className="fixed bottom-0 right-0 top-14 z-[85] w-[min(88vw,360px)] space-y-1 overflow-y-auto overscroll-contain border-l border-border bg-background px-4 py-3 shadow-2xl sm:top-16">
          {menuLinks.map((item) =>
            item.to ? (
              <Link
                key={item.to}
                to={item.to}
                onClick={closeMenus}
                className="block w-full text-left px-3 py-3 rounded-lg text-base font-medium text-foreground hover:bg-secondary transition-all"
              >
                {item.label}
              </Link>
            ) : (
              <Button variant="ghost"
                key={item.id}
                onClick={() => scrollTo(item.id!)}
                className="h-auto min-h-11 justify-start whitespace-normal w-full text-left px-3 py-2 text-base font-medium text-foreground hover:bg-secondary transition-all"
              >
                {item.label}
              </Button>
            ),
          )}
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
      </div>
    )}
    </>
  );
};

export default LandingNavbar;
