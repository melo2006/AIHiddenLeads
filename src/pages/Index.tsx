import { useState } from "react";
import { niches } from "@/data/nicheData";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import BeforeAfterSection from "@/components/landing/BeforeAfterSection";
import StatsSection from "@/components/landing/StatsSection";
import ServicesGrid from "@/components/landing/ServicesGrid";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import DemoDifferentiator from "@/components/landing/DemoDifferentiator";
import WhyUsSection from "@/components/landing/WhyUsSection";
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <LandingNavbar />
      <HeroSection niche={selectedNiche} onGetDemo={scrollToDemo} />
      <ServicesGrid />
      <BeforeAfterSection niche={selectedNiche} />
      <MapVisibilitySection />
      <TryWebsiteCTA />
      <StatsSection niche={selectedNiche} />
      <HowItWorksSection />
      <TryWebsiteCTA />
      <DemoDifferentiator />
      <WhyUsSection />
      <PricingSection />
      <AddOnPackages />
      <FAQSection />
      <TestimonialSection />
      <TryWebsiteCTA />
      <LeadCaptureSection selectedNiche={selectedNiche} />
      <Footer />
      <AssistantErrorBoundary><GeminiAgentWidget floating /></AssistantErrorBoundary>
    </div>
  );
};

export default Index;
