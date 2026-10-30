import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ScrollToTop from "@/components/ScrollToTop";
import Index from "./pages/Index.tsx";
import DemoSite from "./pages/DemoSite.tsx";
import CRM from "./pages/CRM.tsx";
import TryDemo from "./pages/TryDemo.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.tsx";
import TermsOfService from "./pages/TermsOfService.tsx";
import Checkout from "./pages/Checkout.tsx";
import CheckoutReturn from "./pages/CheckoutReturn.tsx";
import ShortLinkRedirect from "./pages/ShortLinkRedirect.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import CampaignTracking from '@/components/CampaignTracking';

const AdPreviews = lazy(() => import("./pages/AdPreviews.tsx"));
const MarketingHub = lazy(() => import("./pages/MarketingHub.tsx"));
const TranscriptPage = lazy(() => import("./pages/TranscriptPage.tsx"));
const VoiceLab = lazy(() => import("./pages/VoiceLab.tsx"));
const SharedDemo = lazy(() => import("./pages/SharedDemo.tsx"));
const ClientVoiceAgent = lazy(() => import("./pages/ClientVoiceAgent.tsx"));
const BookCall = lazy(() => import("./pages/BookCall.tsx"));
const Plans = lazy(() => import("./pages/Plans.tsx"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail.tsx"));
const CustomerSetup = lazy(() => import('./pages/CustomerSetup.tsx'));
const AgentEmbed = lazy(() => import('./pages/AgentEmbed.tsx'));
const ConversationCopy = lazy(() => import('./pages/ConversationCopy.tsx'));

const queryClient = new QueryClient();

const legacyCrmRedirects = [
  { path: "/prospects", to: "/dashboard/prospects" },
  { path: "/intent-leads", to: "/dashboard/intent-leads" },
  { path: "/campaigns", to: "/dashboard/campaigns" },
  { path: "/campaigns/:id", to: "/dashboard/campaigns" },
  { path: "/pipeline", to: "/dashboard/pipeline" },
  { path: "/calls", to: "/dashboard/calls" },
  { path: "/imported", to: "/dashboard/imported" },
  { path: "/imported/:id", to: "/dashboard/imported" },
  { path: "/engagement", to: "/dashboard/engagement" },
  { path: "/templates", to: "/dashboard/templates" },
];

const App = () => {
  useEffect(() => {
    try { const size = localStorage.getItem("reading-text-size"); if (size && ["90", "100", "110", "125", "150"].includes(size)) document.documentElement.dataset.textSize = size; } catch { /* Default reading size remains available. */ }
  }, []);
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <CampaignTracking />
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/demo-site" element={<DemoSite />} />
            <Route path="/demo" element={<TryDemo />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/ad-previews" element={<AdPreviews />} />
            <Route path="/marketing" element={<MarketingHub />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/setup" element={<CustomerSetup />} />
            <Route path="/account" element={<CustomerSetup dashboard />} />
            <Route path="/embed/:id" element={<AgentEmbed />} />
            <Route path="/checkout/return" element={<CheckoutReturn />} />
            <Route path="/transcript" element={<TranscriptPage />} />
            <Route path="/conversation-copy" element={<ConversationCopy />} />
            <Route path="/voice-lab" element={<VoiceLab />} />
            <Route path="/book" element={<BookCall />} />
            <Route path="/agent/:id" element={<ClientVoiceAgent />} />
            <Route path="/demo-share/:token" element={<SharedDemo />} />
            <Route path="/d/:slug" element={<ShortLinkRedirect />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/services/:id" element={<ServiceDetail />} />
            <Route path="/dashboard/*" element={<CRM />} />
            {legacyCrmRedirects.map(({ path, to }) => (
              <Route key={path} path={path} element={<Navigate to={to} replace />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
