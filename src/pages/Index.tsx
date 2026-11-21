import { useState } from "react";
import { niches } from "@/data/nicheData";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import FilmGallery from "@/components/landing/FilmGallery";
import TeamSection from "@/components/landing/TeamSection";
import StatsSection from "@/components/landing/StatsSection";
import AvatarGallerySection from "@/components/landing/AvatarGallerySection";
import SpokespersonSection from "@/components/landing/SpokespersonSection";
import ServicesGrid from "@/components/landing/ServicesGrid";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import ExamplesGallerySection from "@/components/landing/ExamplesGallerySection";
import WizardSection from "@/components/landing/WizardSection";
import PricingSection from "@/components/landing/PricingSection";
import AddOnPackages from "@/components/landing/AddOnPackages";
import FAQSection from "@/components/landing/FAQSection";
import TestimonialSection from "@/components/landing/TestimonialSection";
import LeadCaptureSection from "@/components/landing/LeadCaptureSection";
import Footer from "@/components/landing/Footer";
import GeminiAgentWidget from "@/components/GeminiAgentWidget";
import TryWebsiteCTA from "@/components/landing/TryWebsiteCTA";
import MapVisibilitySection from "@/components/landing/MapVisibilitySection";
import AssistantErrorBoundary from '@/components/AssistantErrorBoundary';

const Index = () => {
  const [selectedNiche, setSelectedNiche] = useState(niches[0]);

  const scrollToDemo = () => {
    document.getElementById("demo-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="landing-page min-h-screen bg-background overflow-x-hidden">
      <LandingNavbar />
      <HeroSection niche={selectedNiche} onGetDemo={scrollToDemo} />
      {/* Film gallery — directly under the hero (Ron's placement call,
          2026-11-20): the testimonial example films, spotlight + row. */}
      <FilmGallery />
      {/* Live demo examples — directly under the film gallery (Ron's
          placement call, 2026-11-21): a visitor who just watched the
          films can immediately open a demo on a real business website.
          Previously sat near the bottom, after the wizard section,
          where Ron could not find it on his phone. */}
      <ExamplesGallerySection />
      {/* Meet the team — a compact trust strip (originally directly
          under the hero, Ron's call 2026-11-09; moved down by the film
          gallery 2026-11-20 and by the examples gallery 2026-11-21). */}
      <TeamSection />
      <StatsSection niche={selectedNiche} />
      <AvatarGallerySection />
      <SpokespersonSection />
      <ServicesGrid />
      <MapVisibilitySection />
      <HowItWorksSection />
      <WizardSection />
      <TryWebsiteCTA />
      <PricingSection />
      <AddOnPackages />
      <FAQSection />
      <TestimonialSection />
      <LeadCaptureSection selectedNiche={selectedNiche} />
      <Footer />
      <AssistantErrorBoundary><GeminiAgentWidget floating /></AssistantErrorBoundary>
    </div>
  );
};

export default Index;
