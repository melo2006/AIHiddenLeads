import { useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  MessageSquare,
  Phone,
  Star,
  Clock,
  Shield,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import type { DemoLeadData } from "./demoResultsUtils";
import {
  extractBulletItems,
  extractHeadings,
  extractNavigationLabels,
  getImageSrc,
  getSiteName,
  getThemeColor,
  buildSupportingCopy,
} from "./demoResultsUtils";
import GeminiAgentWidget from "@/components/GeminiAgentWidget";
import ChatWidget from "./ChatWidget";

interface Props {
  leadData: DemoLeadData;
}

const tint = (channels: string, alpha: number) => `hsl(${channels} / ${alpha})`;

const RedesignedWebsite = ({ leadData }: Props) => {
  const [mobileNav, setMobileNav] = useState(false);

  const siteName = getSiteName(leadData.websiteUrl, leadData.title);
  const logoSrc = getImageSrc(leadData.logo);
  const screenshotSrc = getImageSrc(leadData.screenshot);
  const primaryColor = getThemeColor(leadData.colors?.primary, "160 84% 50%");
  const accentColor = getThemeColor(leadData.colors?.accent ?? leadData.colors?.link, "262 83% 65%");
  const bgColor = getThemeColor(leadData.colors?.background, "0 0% 100%");
  const textColor = getThemeColor(leadData.colors?.textPrimary, "220 18% 12%");
  const textSecondary = getThemeColor(leadData.colors?.textSecondary, "220 10% 44%");

  const nav = extractNavigationLabels(leadData.websiteContent, 5);
  const navItems = nav.length > 0 ? nav : ["Services", "About", "Reviews", "Contact"];
  const services = extractHeadings(leadData.websiteContent, 6);
  const serviceCards = services.length > 0 ? services : ["Premium Service", "Expert Care", "Fast Response"];
  const trustPoints = extractBulletItems(leadData.websiteContent, 6);
  const bullets = trustPoints.length > 0 ? trustPoints : [
    "Serving the community with excellence",
    "Licensed and fully insured professionals",
    "Satisfaction guaranteed on every job",
    "Fast response and flexible scheduling",
  ];

  const description = buildSupportingCopy({ description: leadData.description, siteName });

  // Determine if site colors are dark or light to pick good contrast
  const isDarkBg = bgColor.includes("0%") || parseInt(bgColor.split("%").pop() || "50") < 40;

  const pageBg: CSSProperties = {
    backgroundColor: isDarkBg ? `hsl(${bgColor})` : "#ffffff",
    color: isDarkBg ? `hsl(${textColor})` : `hsl(${textColor})`,
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  };

  const navBg: CSSProperties = {
    backgroundColor: isDarkBg ? tint(bgColor, 0.95) : "rgba(255,255,255,0.97)",
    borderBottom: `1px solid ${isDarkBg ? tint(textColor, 0.08) : "rgba(0,0,0,0.06)"}`,
    backdropFilter: "blur(12px)",
  };

  const primaryBtnStyle: CSSProperties = {
    backgroundColor: tint(primaryColor, 1),
    color: isDarkBg ? "#000" : "#fff",
  };

  const cardBg: CSSProperties = {
    backgroundColor: isDarkBg ? tint(textColor, 0.04) : "rgba(0,0,0,0.02)",
    border: `1px solid ${isDarkBg ? tint(textColor, 0.08) : "rgba(0,0,0,0.06)"}`,
  };

  return (
    <div className="min-h-screen" style={pageBg}>
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50" style={navBg}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            {logoSrc ? (
              <img src={logoSrc} alt={siteName} className="h-9 w-9 rounded-lg object-contain" loading="lazy" />
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold"
                style={{ backgroundColor: tint(primaryColor, 0.15), color: tint(primaryColor, 1) }}
              >
                {siteName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-lg font-bold">{siteName}</span>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            {navItems.map((item) => (
              <span key={item} className="cursor-pointer text-sm font-medium opacity-70 transition-opacity hover:opacity-100">
                {item}
              </span>
            ))}
            <button className="rounded-lg px-4 py-2 text-sm font-semibold transition-transform hover:scale-105" style={primaryBtnStyle}>
              Get a Quote
            </button>
          </div>

          <button className="md:hidden" onClick={() => setMobileNav(!mobileNav)}>
            {mobileNav ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileNav && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden border-t md:hidden"
            style={{ borderColor: isDarkBg ? tint(textColor, 0.08) : "rgba(0,0,0,0.06)" }}
          >
            <div className="space-y-3 px-5 py-4">
              {navItems.map((item) => (
                <p key={item} className="text-sm font-medium opacity-80">{item}</p>
              ))}
              <button className="w-full rounded-lg px-4 py-2 text-sm font-semibold" style={primaryBtnStyle}>
                Get a Quote
              </button>
            </div>
          </motion.div>
        )}
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden">
        {screenshotSrc && (
          <div className="absolute inset-0">
            <img
              src={screenshotSrc}
              alt=""
              className="h-full w-full object-cover object-top"
              style={{ filter: "blur(2px) brightness(0.3)" }}
            />
            <div className="absolute inset-0" style={{
              background: isDarkBg
                ? `linear-gradient(180deg, ${tint(bgColor, 0.7)} 0%, ${tint(bgColor, 0.95)} 100%)`
                : `linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.98) 100%)`,
            }} />
          </div>
        )}

        <div className="relative mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center lg:py-32">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{ backgroundColor: tint(primaryColor, 0.12), color: tint(primaryColor, 1) }}
            >
              <Star className="h-3 w-3" />
              {leadData.niche ? `Top-rated ${leadData.niche.replace(/-/g, " ")}` : "Trusted local business"}
            </div>

            <h1 className="text-4xl font-extrabold leading-[1.1] sm:text-5xl lg:text-6xl">
              {siteName}
            </h1>

            <p className="max-w-xl text-lg leading-relaxed" style={{ color: tint(textSecondary, 1) }}>
              {description}
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
                style={primaryBtnStyle}
              >
                Book an Appointment
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition-colors"
                style={{
                  borderColor: isDarkBg ? tint(textColor, 0.15) : "rgba(0,0,0,0.12)",
                  backgroundColor: isDarkBg ? tint(textColor, 0.05) : "rgba(0,0,0,0.03)",
                }}
              >
                <Phone className="h-4 w-4" />
                Call Us Today
              </button>
            </div>

            {/* Stats strip */}
            <div className="flex flex-wrap gap-6 pt-4">
              {[
                { icon: Clock, label: "Quick response", value: "Under 15 min" },
                { icon: Shield, label: "Fully insured", value: "Licensed & bonded" },
                { icon: Star, label: "Top rated", value: "5-star reviews" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: tint(primaryColor, 0.1) }}
                  >
                    <Icon className="h-5 w-5" style={{ color: tint(primaryColor, 1) }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{value}</p>
                    <p className="text-xs" style={{ color: tint(textSecondary, 1) }}>{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Hero image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            {screenshotSrc ? (
              <div className="overflow-hidden rounded-2xl shadow-2xl" style={{ border: `2px solid ${tint(primaryColor, 0.2)}` }}>
                <img src={screenshotSrc} alt={`${siteName} website`} className="w-full object-cover object-top" style={{ maxHeight: 480 }} />
                <div className="absolute inset-0 rounded-2xl" style={{
                  background: `linear-gradient(to top, ${isDarkBg ? tint(bgColor, 0.6) : "rgba(255,255,255,0.3)"} 0%, transparent 40%)`,
                }} />
              </div>
            ) : (
              <div
                className="flex h-80 items-center justify-center rounded-2xl"
                style={{ background: `linear-gradient(135deg, ${tint(primaryColor, 0.15)}, ${tint(accentColor, 0.1)})` }}
              >
                <Sparkles className="h-16 w-16" style={{ color: tint(primaryColor, 0.4) }} />
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── Services Section ── */}
      <section className="py-16 sm:py-24" style={{ backgroundColor: isDarkBg ? tint(textColor, 0.02) : "rgba(0,0,0,0.015)" }}>
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: tint(primaryColor, 1) }}>
              What we offer
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl">Our Services</h2>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {serviceCards.map((service, i) => (
              <motion.article
                key={service}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="group rounded-2xl p-6 transition-shadow hover:shadow-xl"
                style={cardBg}
              >
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: tint(i % 2 === 0 ? primaryColor : accentColor, 0.12) }}
                >
                  <CheckCircle2 className="h-6 w-6" style={{ color: tint(i % 2 === 0 ? primaryColor : accentColor, 1) }} />
                </div>
                <h3 className="mb-2 text-lg font-bold">{service}</h3>
                <p className="text-sm leading-relaxed" style={{ color: tint(textSecondary, 1) }}>
                  Professional, reliable service tailored to your needs. Contact us to learn more about our approach.
                </p>
                <span
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
                  style={{ color: tint(primaryColor, 1) }}
                >
                  Learn more <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Choose Us ── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <p className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: tint(primaryColor, 1) }}>
                Why choose us
              </p>
              <h2 className="mb-6 text-3xl font-bold sm:text-4xl">
                Trusted by customers across the area
              </h2>
              <div className="space-y-4">
                {bullets.slice(0, 4).map((point, i) => (
                  <motion.div
                    key={point}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <div
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: tint(primaryColor, 0.12) }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" style={{ color: tint(primaryColor, 1) }} />
                    </div>
                    <p className="text-sm leading-relaxed sm:text-base">{point}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="rounded-2xl p-6 sm:p-8"
              style={{
                ...cardBg,
                background: `linear-gradient(135deg, ${tint(primaryColor, 0.06)}, ${tint(accentColor, 0.04)})`,
              }}
            >
              <div className="mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5" style={{ color: tint(primaryColor, 1) }} />
                <h3 className="text-lg font-bold">Serving your area</h3>
              </div>
              <p className="mb-6 text-sm leading-relaxed" style={{ color: tint(textSecondary, 1) }}>
                We're proud to serve our local community with dedication and professionalism. Reach out today to see how we can help.
              </p>
              <div className="flex flex-wrap gap-2">
                {bullets.slice(0, 3).map((b) => (
                  <span
                    key={b}
                    className="rounded-full px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: tint(primaryColor, 0.1), color: tint(primaryColor, 1) }}
                  >
                    {b.length > 40 ? b.slice(0, 37) + "…" : b}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── AI Assistants Section (Chat + Voice side by side) ── */}
      <section
        className="py-16 sm:py-24"
        style={{ backgroundColor: isDarkBg ? tint(textColor, 0.03) : "rgba(0,0,0,0.02)" }}
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 text-center"
          >
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: tint(accentColor, 1) }}>
              AI-Powered Support
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl">Talk to Us Anytime</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base" style={{ color: tint(textSecondary, 1) }}>
              Reach out instantly via chat or voice. Aspen, our AI assistant, is available 24/7 to answer questions, book appointments, and connect you with the owner.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Chat Widget */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <ChatWidget
                businessName={siteName}
                businessNiche={leadData.niche || "general"}
                websiteUrl={leadData.websiteUrl}
                businessInfo={leadData.websiteContent || leadData.description || ""}
              />
            </motion.div>

            {/* Voice Widget */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <GeminiAgentWidget leadId={leadData.leadId} prospectId={leadData.prospectId} businessName={siteName} />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="rounded-3xl px-8 py-12 text-center sm:px-12 sm:py-16"
            style={{
              background: `linear-gradient(135deg, ${tint(primaryColor, 0.15)}, ${tint(accentColor, 0.1)})`,
              border: `1px solid ${tint(primaryColor, 0.2)}`,
            }}
          >
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Ready to Get Started?</h2>
            <p className="mx-auto mb-8 max-w-xl text-sm sm:text-base" style={{ color: tint(textSecondary, 1) }}>
              Let us show you how a modern website with AI-powered customer engagement can transform your business.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
                style={primaryBtnStyle}
              >
                <MessageSquare className="h-4 w-4" />
                Contact Us Now
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-xl border px-8 py-3.5 text-sm font-semibold transition-colors"
                style={{
                  borderColor: isDarkBg ? tint(textColor, 0.15) : "rgba(0,0,0,0.12)",
                  backgroundColor: isDarkBg ? tint(textColor, 0.05) : "rgba(0,0,0,0.03)",
                }}
              >
                <Phone className="h-4 w-4" />
                Call Today
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="border-t py-8"
        style={{
          borderColor: isDarkBg ? tint(textColor, 0.08) : "rgba(0,0,0,0.06)",
          backgroundColor: isDarkBg ? tint(bgColor, 0.95) : "rgba(0,0,0,0.02)",
        }}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 sm:flex-row sm:justify-between sm:px-8">
          <div className="flex items-center gap-2 text-sm" style={{ color: tint(textSecondary, 1) }}>
            {logoSrc && <img src={logoSrc} alt="" className="h-5 w-5 rounded object-contain" />}
            <span>© {new Date().getFullYear()} {siteName}. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: tint(textSecondary, 0.6) }}>
              Redesign powered by AI Hidden Leads
            </span>
            <a
              href="/"
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ backgroundColor: tint(primaryColor, 0.1), color: tint(primaryColor, 1) }}
            >
              Get your own AI demo
              <ArrowRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default RedesignedWebsite;
