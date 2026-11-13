import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LOCAL_DISPLAY, TOLL_FREE_DISPLAY } from "@/lib/phoneDisplay";

const Footer = () => {
  const { t } = useTranslation();
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

