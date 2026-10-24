import { ArrowRight, CheckCircle2, MapPin, MessageSquare, Quote, Sparkles, Star } from "lucide-react";
import type { CSSProperties } from "react";
import type { DemoLeadData } from "./demoResultsUtils";
import {
  buildModernHeadline,
  buildSupportingCopy,
  extractBulletItems,
  extractHeadings,
  extractNavigationLabels,
  getImageSrc,
  getSiteName,
  getThemeColor,
} from "./demoResultsUtils";
import GeminiAgentWidget from "@/components/GeminiAgentWidget";

interface WebsiteShowcaseProps {
  leadData: DemoLeadData;
  compact?: boolean;
}

const tint = (channels: string, alpha: number) => `hsl(${channels} / ${alpha})`;

const WebsiteShowcase = ({ leadData, compact = false }: WebsiteShowcaseProps) => {
  const siteName = getSiteName(leadData.websiteUrl, leadData.title);
  const logoSrc = getImageSrc(leadData.logo);
  const screenshotSrc = getImageSrc(leadData.screenshot);
  const primaryColor = getThemeColor(leadData.colors?.primary, "160 84% 50%");
  const accentColor = getThemeColor(leadData.colors?.accent ?? leadData.colors?.link, "262 83% 65%");
  const backgroundColor = getThemeColor(leadData.colors?.background, "220 18% 8%");
  const textColor = getThemeColor(leadData.colors?.textPrimary, "210 40% 96%");

  const headline = buildModernHeadline({ siteName, title: leadData.title });
  const supportingCopy = buildSupportingCopy({ description: leadData.description, siteName });
  const menuItems = extractNavigationLabels(leadData.websiteContent, compact ? 4 : 5);
  const services = extractHeadings(leadData.websiteContent, compact ? 3 : 4);
  const details = extractBulletItems(leadData.websiteContent, compact ? 4 : 6);

  const nav = menuItems.length > 0 ? menuItems : ["Services", "About", "Reviews", "Contact"];
  const serviceCards = services.length > 0 ? services : ["Signature Service", "Premium Experience", "Fast Follow-Up"];
  const trustPoints = details.length > 0
    ? details.slice(0, compact ? 3 : 4)
    : [
        "Fast response times for new leads",
        "Clear service pathways with stronger trust signals",
        "Appointment booking built directly into the experience",
        "A polished layout that feels current and premium",
      ].slice(0, compact ? 3 : 4);

  const shellStyle: CSSProperties = {
    background: `linear-gradient(155deg, ${tint(backgroundColor, 1)} 0%, ${tint(backgroundColor, 0.98)} 52%, ${tint(primaryColor, 0.16)} 100%)`,
    color: `hsl(${textColor})`,
    boxShadow: `0 26px 70px -40px ${tint(primaryColor, 0.7)}`,
  };

  const chromeStyle: CSSProperties = {
    backgroundColor: tint(textColor, 0.04),
    borderColor: tint(textColor, 0.08),
  };

  const softPrimaryStyle: CSSProperties = {
    backgroundColor: tint(primaryColor, compact ? 0.1 : 0.12),
    borderColor: tint(primaryColor, 0.22),
  };

  const softAccentStyle: CSSProperties = {
    backgroundColor: tint(accentColor, compact ? 0.1 : 0.12),
    borderColor: tint(accentColor, 0.22),
  };

  const glassStyle: CSSProperties = {
    backgroundColor: tint(textColor, 0.06),
    borderColor: tint(textColor, 0.1),
    backdropFilter: "blur(18px)",
  };

  const ctaStyle: CSSProperties = {
    background: `linear-gradient(135deg, ${tint(primaryColor, 0.28)}, ${tint(accentColor, 0.22)})`,
    borderColor: tint(primaryColor, 0.34),
    boxShadow: `0 18px 38px -26px ${tint(primaryColor, 0.88)}`,
  };

  const heroMediaStyle: CSSProperties = screenshotSrc
    ? {
        backgroundImage: `linear-gradient(180deg, ${tint(backgroundColor, 0.12)} 0%, ${tint(backgroundColor, 0.84)} 100%), url(${screenshotSrc})`,
        backgroundSize: "cover",
        backgroundPosition: "top center",
      }
    : {
        background: `radial-gradient(circle at top left, ${tint(primaryColor, 0.32)}, transparent 52%), radial-gradient(circle at bottom right, ${tint(accentColor, 0.28)}, transparent 48%), linear-gradient(145deg, ${tint(backgroundColor, 0.95)}, ${tint(backgroundColor, 1)})`,
      };

  const stats = [
    { value: "15 min", label: "Booking slot" },
    { value: "24/7", label: "Answer coverage" },
    { value: compact ? "AI" : "Live AI", label: "Lead handling" },
  ];

  return (
    <div className="overflow-hidden rounded-[1.5rem] border" style={shellStyle}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3 sm:px-5" style={chromeStyle}>
        <div className="flex min-w-0 items-center gap-3">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={`${siteName} logo`}
              className="h-10 w-10 rounded-2xl border object-contain p-1.5"
              style={glassStyle}
              loading="lazy"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border" style={softPrimaryStyle}>
              <Sparkles className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{siteName}</p>
            <p className="text-xs" style={{ color: tint(textColor, 0.72) }}>
              Refreshed customer-facing website concept
            </p>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {nav.map((item) => (
            <span key={item} className="rounded-full border px-3 py-1 text-[11px] font-medium" style={glassStyle}>
              {item}
            </span>
          ))}
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={softAccentStyle}>
          <Star className="h-3.5 w-3.5" />
          Demo-ready redesign
        </div>
      </header>

      <section className={`grid gap-5 p-4 sm:p-5 ${compact ? "xl:grid-cols-[1.02fr_0.98fr]" : "xl:grid-cols-[1.05fr_0.95fr] xl:p-6"}`}>
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={softPrimaryStyle}>
            <Sparkles className="h-3.5 w-3.5" />
            Modern homepage direction
          </div>

          <div className="space-y-3">
            <h3 className={`${compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl lg:text-5xl"} max-w-2xl font-bold leading-tight`}>
              {headline}
            </h3>
            <p className={`${compact ? "text-sm" : "text-base sm:text-lg"} max-w-2xl`} style={{ color: tint(textColor, 0.78) }}>
              {supportingCopy}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold" style={ctaStyle}>
              Explore services
              <ArrowRight className="h-4 w-4" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold" style={glassStyle}>
              <MessageSquare className="h-4 w-4" />
              Ask Aspen live
            </div>
          </div>

          <div className={`grid gap-3 ${compact ? "grid-cols-3" : "sm:grid-cols-3"}`}>
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[1.35rem] border px-4 py-3" style={softPrimaryStyle}>
                <p className="text-lg font-bold sm:text-xl">{stat.value}</p>
                <p className="text-xs" style={{ color: tint(textColor, 0.68) }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-h-[18rem] overflow-hidden rounded-[1.75rem] border p-4 sm:min-h-[22rem]" style={softAccentStyle}>
          <div className="absolute inset-0" style={heroMediaStyle} />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

          <div className="relative flex h-full flex-col justify-between">
            <div className="ml-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={glassStyle}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Feels like a real site
            </div>

            <div className="rounded-[1.5rem] border p-4 sm:p-5" style={glassStyle}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: tint(textColor, 0.64) }}>
                Why this version converts better
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {trustPoints.slice(0, compact ? 2 : 4).map((point) => (
                  <div key={point} className="rounded-2xl border p-3" style={chromeStyle}>
                    <p className="text-sm font-medium">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`grid gap-4 border-t p-4 sm:p-5 ${compact ? "lg:grid-cols-3" : "xl:grid-cols-[1.15fr_0.85fr] xl:p-6"}`} style={chromeStyle}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" />
            Featured sections
          </div>

          <div className={`grid gap-3 ${compact ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {serviceCards.map((item, index) => (
              <article key={item} className="rounded-[1.35rem] border p-4" style={index % 2 === 0 ? softPrimaryStyle : softAccentStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: tint(textColor, 0.64) }}>
                  Section {index + 1}
                </p>
                <h4 className="mt-2 text-lg font-semibold">{item}</h4>
                <p className="mt-2 text-sm" style={{ color: tint(textColor, 0.72) }}>
                  Structured to guide visitors quickly from discovery to trust to action.
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.35rem] border p-4" style={glassStyle}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Quote className="h-4 w-4" />
              Brand voice
            </div>
            <p className="text-base font-medium leading-relaxed sm:text-lg">
              “{leadData.description || `${siteName} now feels more current, more trustworthy, and far easier to act on from the first screen.`}”
            </p>
          </div>

          <div className="rounded-[1.35rem] border p-4" style={softAccentStyle}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4" />
              Trust builders
            </div>
            <div className="flex flex-wrap gap-2">
              {trustPoints.map((point) => (
                <span key={point} className="rounded-full border px-3 py-1.5 text-xs font-medium" style={glassStyle}>
                  {point}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {!compact && (
        <section className="grid gap-4 border-t p-4 sm:p-5 xl:grid-cols-[1.05fr_0.95fr] xl:p-6" style={chromeStyle}>
          <div className="rounded-[1.5rem] border p-5" style={softPrimaryStyle}>
            <p className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: tint(textColor, 0.66) }}>
              Live conversion layer
            </p>
            <h4 className="mt-3 text-2xl font-bold">A polished site plus a conversational closer.</h4>
            <p className="mt-3 max-w-xl text-sm sm:text-base" style={{ color: tint(textColor, 0.76) }}>
              Aspen answers like a real front desk, confirms a 15-minute appointment, and can guide the visitor toward a human handoff without making the experience feel robotic.
            </p>
          </div>

          <GeminiAgentWidget leadId={leadData.leadId} prospectId={leadData.prospectId} businessName={siteName} />
        </section>
      )}
    </div>
  );
};

export default WebsiteShowcase;
