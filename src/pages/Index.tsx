import { useState } from "react";
import { niches } from "@/data/nicheData";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import BeforeAfterSection from "@/components/landing/BeforeAfterSection";
import StatsSection from "@/components/landing/StatsSection";
import ServicesGrid from "@/components/landing/ServicesGrid";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import DemoDifferentiator from "@/components/landing/DemoDifferentiator";
import PricingSection from "@/components/landing/PricingSection";
import AddOnPackages from "@/components/landing/AddOnPackages";
import FAQSection from "@/components/landing/FAQSection";
import TestimonialSection from "@/components/landing/TestimonialSection";
import LeadCaptureSection from "@/components/landing/LeadCaptureSection";
import Footer from "@/components/landing/Footer";
import GeminiAgentWidget from "@/components/GeminiAgentWidget";
import TryWebsiteCTA from "@/components/landing/TryWebsiteCTA";

const Index = () => {
  const [selectedNiche, setSelectedNiche] = useState(niches[0]);

  const scrollToDemo = () => {
    document.getElementById("demo-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <LandingNavbar />
      <HeroSection niche={selectedNiche} onGetDemo={scrollToDemo} />
      <BeforeAfterSection niche={selectedNiche} />
      <TryWebsiteCTA />
      <StatsSection niche={selectedNiche} />
      <ServicesGrid />
      <HowItWorksSection />
      <TryWebsiteCTA />
      <DemoDifferentiator />
      <PricingSection />
      <AddOnPackages />
      <FAQSection />
      <TestimonialSection />
      <TryWebsiteCTA />
      <LeadCaptureSection selectedNiche={selectedNiche} />
      <Footer />
      <GeminiAgentWidget floating />
    </div>
  );
};

export default Index;
