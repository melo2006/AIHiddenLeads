import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LOCAL_DISPLAY, TOLL_FREE_DISPLAY } from "@/lib/phoneDisplay";
import { useTenantBrand } from "@/components/TenantBrandProvider";
import { initialsFor } from "@/lib/tenancy";

const Footer = () => {
  const { t } = useTranslation();
  const tenant = useTenantBrand();

  // Reseller subdomain (design §12.2): the footer carries the
  // tenant's own lockup, slogan and support email, and his name on
  // the copyright line. The platform phone numbers and the platform
  // SMS-consent paragraph are platform facts and never render under
  // a tenant's brand. Platform hosts render exactly as before.
  if (tenant) {
    const b = tenant.branding;
    return (
      <footer className="py-10 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {b.logoUrl ? (
                  <img src={b.logoUrl} alt={b.name ?? ""} className="w-8 h-8 rounded-lg object-contain" />
                ) : (
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: b.brandColor || "#10b981" }}
                  >
                    <span className="text-white font-bold text-sm">{initialsFor(b.name)}</span>
                  </div>
                )}
                <span className="font-semibold text-foreground">{b.name}</span>
              </div>
              <div className="flex items-center gap-6">
                <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {t("footer.privacy")}
                </Link>
                <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {t("footer.terms")}
                </Link>
              </div>
            </div>
            {b.slogan && (
              <p className="text-center text-sm text-muted-foreground">{b.slogan}</p>
            )}
            {b.supportEmail && (
              <div className="text-center">
                <a
                  href={`mailto:${b.supportEmail}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {b.supportEmail}
                </a>
              </div>
            )}
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} {b.name}. {t("footer.rights")}
              </p>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="py-10 border-t border-border">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <span className="text-primary font-bold text-sm">H</span>
              </div>
              <span className="font-semibold text-foreground">AI Hidden Leads</span>
            </div>
            <div className="flex items-center gap-6">
              <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("footer.privacy")}
              </Link>
              <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("footer.terms")}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a
              href={TOLL_FREE_DISPLAY.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {TOLL_FREE_DISPLAY.digits} · {TOLL_FREE_DISPLAY.vanity}
            </a>
            <a
              href={LOCAL_DISPLAY.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {LOCAL_DISPLAY.digits} · {LOCAL_DISPLAY.vanity}
            </a>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {t("footer.smsConsent")}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} AI Hidden Leads. {t("footer.copyright")}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

