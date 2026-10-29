import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, DollarSign, Eye, MousePointerClick, Phone, TrendingUp, Users, Search, Award, Calculator, ChevronRight, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── FACEBOOK ADS ───────────────────────────────────────────────────
import fbAdVetV1 from "@/assets/ads/fb-ad-vet-v1-new.jpg";
import fbAdVetV2 from "@/assets/ads/fb-ad-vet-v2-new.jpg";
import fbAdVetV3 from "@/assets/ads/fb-ad-vet-v3-new.jpg";
import fbAdVetV4 from "@/assets/ads/fb-ad-vet-v4.jpg";
import fbAdVetV5 from "@/assets/ads/fb-ad-vet-v5.jpg";
import fbAdPmV1 from "@/assets/ads/fb-ad-pm-v1.jpg";
import fbAdPmV2 from "@/assets/ads/fb-ad-pm-v2.jpg";
import fbAdPmV3 from "@/assets/ads/fb-ad-pm-v3.jpg";
import fbAdPmV4 from "@/assets/ads/fb-ad-pm-v4.jpg";
import fbAdPmV5 from "@/assets/ads/fb-ad-pm-v5.jpg";
import fbAdMedspaV1 from "@/assets/ads/fb-ad-medspa-v1.jpg";
import fbAdMedspaV2 from "@/assets/ads/fb-ad-medspa-v2.jpg";
import fbAdMedspaV3 from "@/assets/ads/fb-ad-medspa-v3.jpg";
import fbAdMedspaV4 from "@/assets/ads/fb-ad-medspa-v4.jpg";
import fbAdMedspaV5 from "@/assets/ads/fb-ad-medspa-v5.jpg";

// ─── INSTAGRAM STORY ADS ───────────────────────────────────────────
import igStoryVet from "@/assets/ads/ig-story-vet-v1.jpg";
import igStoryPm from "@/assets/ads/ig-story-pm-v1.jpg";
import igStoryMedspa from "@/assets/ads/ig-story-medspa-v1.jpg";

// ─── GOOGLE ADS ─────────────────────────────────────────────────────
import googleAdVetV1 from "@/assets/ads/google-ad-vet-v1-new.jpg";
import googleAdVetV2 from "@/assets/ads/google-ad-vet-v2-new.jpg";
import googleAdVetV3 from "@/assets/ads/google-ad-vet-v3.jpg";
import googleAdVetV4 from "@/assets/ads/google-ad-vet-v4.jpg";
import googleAdVetV5 from "@/assets/ads/google-ad-vet-v5.jpg";
import googleAdPmV2 from "@/assets/ads/google-ad-pm-v2.jpg";
import googleAdPmV3 from "@/assets/ads/google-ad-pm-v3.jpg";
import googleAdPmV4 from "@/assets/ads/google-ad-pm-v4.jpg";
import googleAdPmV5 from "@/assets/ads/google-ad-pm-v5.jpg";
import googleAdMedspaV2 from "@/assets/ads/google-ad-medspa-v2.jpg";
import googleAdMedspaV3 from "@/assets/ads/google-ad-medspa-v3.jpg";
import googleAdMedspaV4 from "@/assets/ads/google-ad-medspa-v4.jpg";

// ─── VIDEO ADS ──────────────────────────────────────────────────────
import videoAdVet from "@/assets/ads/video-ad-vet.mp4.asset.json";
import videoAdPm from "@/assets/ads/video-ad-pm.mp4.asset.json";
import videoAdMedspa from "@/assets/ads/video-ad-medspa.mp4.asset.json";
import videoAdVetV2 from "@/assets/ads/video-ad-vet-v2.mp4.asset.json";
import videoAdPmV2 from "@/assets/ads/video-ad-pm-v2.mp4.asset.json";
import videoAdMedspaV2 from "@/assets/ads/video-ad-medspa-v2.mp4.asset.json";

// ─── NICHE DATA ─────────────────────────────────────────────────────
interface NicheConfig {
  key: string; label: string; emoji: string; avgClientValue: number;
  missedCallPct: string; painStat: string;
  facebookAds: AdCreative[]; instagramStoryAds: AdCreative[];
  googleAds: AdCreative[]; keywords: KeywordRow[];
  searchAdCopy: SearchAd[]; targeting: { facebook: string[]; google: string[] };
  videoAds: VideoAd[];
}
interface AdCreative {
  id: string; name: string; image: string; format: string;
  headline: string; primaryText: string; cta: string; style: string;
}
interface VideoAd {
  id: string; name: string; url: string; format: string; desc: string;
}
interface KeywordRow {
  keyword: string; volume: string; cpc: string; competition: string;
  intent: string; convRate: string; tip: string;
}
interface SearchAd {
  headline1: string; headline2: string; headline3: string;
  description1: string; displayUrl: string; sitelinks: string[];
}

const niches: NicheConfig[] = [
  {
    key: "vet", label: "Veterinary Clinics", emoji: "🐾",
    avgClientValue: 450, missedCallPct: "38%",
    painStat: "38% of vet clinic calls go unanswered — each worth ~$450",
    facebookAds: [
      { id: "fb-vet-1", name: "V1 — Pain Point: Missed Calls", image: fbAdVetV1, format: "Feed (1080×1080)", headline: "Your Vet Clinic Missed 38% of Calls Last Month", primaryText: "That's $450 per missed call. Your AI Receptionist answers every call 24/7, books appointments, and triages emergencies.\n\n🎧 Hear YOUR clinic's AI in action — free 90-second demo.\n👉 Click below to make your website come alive.", cta: "Try It Free — Hear Your AI Now", style: "Data-driven / Urgency" },
      { id: "fb-vet-2", name: "V2 — After-Hours Story", image: fbAdVetV2, format: "Feed (1080×1080)", headline: "They Called After Hours. Nobody Answered.", primaryText: "After hours, weekends, holidays — AI answers every call. Emergencies get triaged. Appointments get booked. 24/7.\n\n🔊 Try our free 90-second simulation — your site, your business, our AI voice.", cta: "Hear Your Website Come Alive", style: "Emotional / Story" },
      { id: "fb-vet-3", name: "V3 — Before/After Reel", image: fbAdVetV3, format: "Story/Reel (1080×1920)", headline: "Stop Losing Clients to Voicemail", primaryText: "BEFORE: Missed calls, lost clients. AFTER: AI answers 24/7, books appointments, triages emergencies.\n\n⚡ See & hear it on YOUR website in 90 seconds. Free. No credit card.", cta: "Free Demo — 90 Seconds", style: "Visual / Mobile-first" },
      { id: "fb-vet-4", name: "V4 — Lost Revenue Data", image: fbAdVetV4, format: "Feed (1080×1080)", headline: "Your Clinic Lost 12 Calls Last Week", primaryText: "Each one worth $450. That's $5,400/week walking out the door. AI answers every single one — 24/7, no breaks, no sick days.\n\n🆓 Test it FREE on YOUR website. Just enter your URL.", cta: "TEST IT FREE — Enter Your Website", style: "Data-driven / Direct" },
      { id: "fb-vet-5", name: "V5 — Try It Now CTA", image: fbAdVetV5, format: "Feed (1080×1080)", headline: "Hear Your Clinic's AI Answer a Call — Right Now", primaryText: "90 seconds. Free. No credit card. Enter your website and hear YOUR clinic's AI receptionist in action.\n\nIt books appointments, triages emergencies, and never takes a day off.", cta: "TRY THE LIVE DEMO →", style: "Curiosity / CTA-first" },
    ],
    instagramStoryAds: [
      { id: "ig-vet-1", name: "Story — Missed Calls", image: igStoryVet, format: "Story/Reel (1080×1920)", headline: "YOUR CLINIC MISSED 12 CALLS THIS WEEK", primaryText: "Each one worth $450. TAP TO HEAR YOUR AI → Free. 90 seconds. No catch.", cta: "Tap to Hear Your AI", style: "Bold / Mobile" },
    ],
    googleAds: [
      { id: "g-vet-1", name: "V1 — Banner Professional", image: googleAdVetV1, format: "Display (728×90)", headline: "Never Miss Another Pet Emergency Call", primaryText: "AI Receptionist for Vet Clinics — Starting $99/mo", cta: "Free Demo", style: "Professional" },
      { id: "g-vet-2", name: "V2 — Square Data", image: googleAdVetV2, format: "Display (300×250)", headline: "38% of Vet Calls Go Unanswered", primaryText: "Your AI books appointments, triages emergencies, 24/7.", cta: "See Free Demo", style: "Data-driven" },
      { id: "g-vet-3", name: "V3 — Split Banner", image: googleAdVetV3, format: "Display (728×600)", headline: "AI Receptionist for Vet Clinics", primaryText: "Never miss a pet emergency. 24/7 answering. Starting $99/mo.", cta: "Free Demo", style: "Clean / Professional" },
      { id: "g-vet-4", name: "V4 — Teal Stats", image: googleAdVetV4, format: "Display (728×600)", headline: "38% of Vet Calls Go Unanswered", primaryText: "AI answers 24/7 — books, triages, transfers. Try free.", cta: "See Demo", style: "Data-driven / Teal" },
      { id: "g-vet-5", name: "V5 — Green Split", image: googleAdVetV5, format: "Display (728×600)", headline: "Your Vet Clinic Needs an AI Receptionist", primaryText: "Answers calls, books appointments, triages emergencies 24/7. From $99/mo.", cta: "Try Free Demo", style: "Split Design" },
    ],
    videoAds: [
      { id: "vid-vet-1", name: "🐾 Vet — Square (Feed)", url: videoAdVet.url, format: "1:1 Feed", desc: "Missed calls → AI answers. Transformation from frustrated owner to automated receptionist." },
      { id: "vid-vet-2", name: "🐾 Vet — Vertical (Reels/Stories)", url: videoAdVetV2.url, format: "9:16 Reels/Stories", desc: "After-hours scenario. Phone rings, AI answers instantly. Clear CTA: Test your website free." },
    ],
    keywords: [
      { keyword: "emergency vet [city]", volume: "12,100/mo", cpc: "$3.80–$6.50", competition: "High", intent: "🔥 Buyer", convRate: "15–20%", tip: "Pet owners in crisis convert fast" },
      { keyword: "vet answering service", volume: "880/mo", cpc: "$8.50–$14.00", competition: "Med", intent: "🎯 B2B", convRate: "10–15%", tip: "YOUR target — clinic owners seeking solutions" },
      { keyword: "after hours vet", volume: "22,200/mo", cpc: "$3.20–$5.80", competition: "High", intent: "🔥 Buyer", convRate: "12–18%", tip: "Perfect match for our after-hours AI pitch" },
      { keyword: "veterinary receptionist hiring", volume: "3,600/mo", cpc: "$1.20–$2.50", competition: "Low", intent: "🎯 B2B", convRate: "5–8%", tip: "Can't find staff → pitch AI alternative" },
      { keyword: "vet clinic phone system", volume: "720/mo", cpc: "$6.00–$12.00", competition: "Low", intent: "🎯 B2B", convRate: "12–18%", tip: "Low competition, high intent — gold mine" },
      { keyword: "AI receptionist veterinary", volume: "320/mo", cpc: "$4.50–$8.00", competition: "Low", intent: "🎯 B2B", convRate: "15–22%", tip: "Emerging keyword — get in early" },
    ],
    searchAdCopy: [
      { headline1: "AI Receptionist for Vet Clinics", headline2: "Never Miss a Pet Emergency Call", headline3: "Starting at $99/mo — Try Free", description1: "Your vet clinic misses 38% of calls. Our AI answers 24/7, books appointments, triages emergencies, and warm-transfers urgent calls.", displayUrl: "aihiddenleads.com/vet-clinics", sitelinks: ["Free Demo", "Pricing", "How It Works", "Case Studies"] },
      { headline1: "Stop Losing Clients to Voicemail", headline2: "AI Answers Vet Calls 24/7", headline3: "Free 90-Second Demo", description1: "Every missed call costs $450. AI handles bookings, triage, and transfers automatically. Hear it on YOUR website — free, no credit card.", displayUrl: "aihiddenleads.com/vet-ai", sitelinks: ["Try Free Demo", "See Pricing", "Watch Video", "How It Works"] },
      { headline1: "Vet Clinic After Hours Solution", headline2: "AI Receptionist — $99/mo", headline3: "No Setup Fee — Try Free", description1: "38% of vet calls go unanswered. AI handles emergencies, books appointments, sends confirmations. Test on YOUR website in 90 seconds.", displayUrl: "aihiddenleads.com/vet-after-hours", sitelinks: ["Free Demo", "Pricing", "Features", "Reviews"] },
      { headline1: "Tired of Hiring Receptionists?", headline2: "AI Never Calls in Sick", headline3: "Vet Clinics Love Us — $99/mo", description1: "Replace voicemail with AI that answers every call. Books appointments, triages emergencies, warm-transfers when needed. Free demo.", displayUrl: "aihiddenleads.com/vet-receptionist", sitelinks: ["Try It Free", "Pricing Plans", "How It Works", "FAQ"] },
      { headline1: "Your Clinic's AI Voice Assistant", headline2: "Hear It on YOUR Website Free", headline3: "90 Seconds — No Credit Card", description1: "Enter your website URL and hear your clinic's AI receptionist answer a call. It books, triages, and transfers — 24/7. Starting $99/mo.", displayUrl: "aihiddenleads.com/try-demo", sitelinks: ["Try Demo Now", "See Plans", "Watch Video", "Contact Us"] },
    ],
    targeting: {
      facebook: ["Location: South Florida (25mi radius)", "Age: 30–65", "Interests: Veterinary medicine, Practice management", "Job Titles: Veterinarian, Practice Manager, Clinic Owner", "Objective: Lead Generation"],
      google: ["Campaign: Search + Display", "Location: South Florida or nationwide", "Bid Strategy: Maximize conversions", "Schedule: Mon–Fri 8AM–6PM", "Extensions: Sitelinks, Callout, Call"],
    },
  },
  {
    key: "pm", label: "Property Management", emoji: "🏢",
    avgClientValue: 320, missedCallPct: "42%",
    painStat: "42% of tenant calls go to voicemail — maintenance emergencies escalate and tenants leave",
    facebookAds: [
      { id: "fb-pm-1", name: "V1 — Tenant Call Stats", image: fbAdPmV1, format: "Feed (1080×1080)", headline: "42% of Tenant Calls Go Unanswered", primaryText: "That leaking pipe at 9PM? The broken AC on a Saturday? AI answers every tenant call instantly, logs maintenance requests, and dispatches emergencies.\n\n🎧 Hear how AI handles YOUR properties — free 90-second demo.", cta: "Try It Free — Hear Your AI", style: "Data-driven / Urgency" },
      { id: "fb-pm-2", name: "V2 — Weekend Emergency", image: fbAdPmV2, format: "Feed (1080×1080)", headline: "Weekend Emergency? AI Answers in 0.4 Seconds", primaryText: "Tired of after-hours tenant calls? Your AI handles maintenance requests, emergencies, and rent inquiries 24/7.\n\n⚡ Try our free simulation — hear YOUR company's AI voice in 90 seconds.", cta: "Hear Your Website Come Alive", style: "Solution / Professional" },
      { id: "fb-pm-3", name: "V3 — 9PM Leak Scenario", image: fbAdPmV3, format: "Feed (1080×1080)", headline: "Tenant Called About a Leak at 9PM. Nobody Answered.", primaryText: "Your AI would have. 24/7. Instantly. It logs the request, dispatches if urgent, and follows up — all automatically.\n\n🆓 Test YOUR AI now. Enter your website. Free. No credit card.", cta: "TEST YOUR AI — Enter Your Website", style: "Emotional / Scenario" },
      { id: "fb-pm-4", name: "V4 — Competitor Pressure", image: fbAdPmV4, format: "Feed (1080×1080)", headline: "42% of Tenant Calls Go to Voicemail", primaryText: "Your competitors answer. Do you? AI handles maintenance, emergencies, and rent questions — 24/7, no breaks.\n\nTry YOUR AI receptionist free — 90 seconds, no credit card.", cta: "HEAR YOUR WEBSITE COME ALIVE →", style: "Competitive / Bold" },
      { id: "fb-pm-5", name: "V5 — Stop Hiring", image: fbAdPmV5, format: "Feed (1080×1080)", headline: "Stop Hiring Receptionists. Start Answering Every Call.", primaryText: "AI handles maintenance requests, emergencies, rent questions — 24/7 for $99/mo. No sick days, no turnover, no voicemail.\n\n🆓 FREE 90-SECOND DEMO — Try It On Your Website", cta: "Free 90-Second Demo", style: "Minimalist / Direct" },
    ],
    instagramStoryAds: [
      { id: "ig-pm-1", name: "Story — Tenant Emergency", image: igStoryPm, format: "Story/Reel (1080×1920)", headline: "TENANT EMERGENCY AT 9PM?", primaryText: "AI ANSWERS IN 0.4 SECONDS. SWIPE UP — Test Your AI Free.", cta: "Swipe Up — Test Your AI Free", style: "Bold / Mobile" },
    ],
    googleAds: [
      { id: "g-pm-1", name: "V1 — Leaderboard", image: fbAdPmV1, format: "Display (728×90)", headline: "AI Answering for Property Managers", primaryText: "24/7 tenant communication — Starting $99/mo", cta: "Free Demo", style: "Professional" },
      { id: "g-pm-2", name: "V2 — Navy Banner", image: googleAdPmV2, format: "Display (728×600)", headline: "AI Answering for Property Managers", primaryText: "Tenant calls handled 24/7 — maintenance, emergencies, rent inquiries. From $99/mo.", cta: "Free Demo", style: "Corporate / Navy" },
      { id: "g-pm-3", name: "V3 — Data White", image: googleAdPmV3, format: "Display (728×600)", headline: "42% of Tenant Calls Go to Voicemail", primaryText: "Your AI answers instantly. Maintenance. Emergencies. Rent. 24/7.", cta: "Try Free", style: "Clean / Data" },
      { id: "g-pm-4", name: "V4 — Teal Split", image: googleAdPmV4, format: "Display (728×600)", headline: "Stop Losing Tenants to Voicemail", primaryText: "AI handles maintenance, emergencies, leases 24/7. From $99/mo.", cta: "Test Free", style: "Split Design" },
      { id: "g-pm-5", name: "V5 — Properties Answered", image: googleAdPmV5, format: "Display (728×600)", headline: "Your Properties. Answered 24/7.", primaryText: "AI receptionist for property managers. Maintenance. Emergencies. Rent. From $99/mo.", cta: "Try Free Demo", style: "Corporate / Dark" },
    ],
    videoAds: [
      { id: "vid-pm-1", name: "🏢 PM — Square (Feed)", url: videoAdPm.url, format: "1:1 Feed", desc: "Overwhelmed PM → calm AI handling all tenant calls 24/7, even on weekends." },
      { id: "vid-pm-2", name: "🏢 PM — Vertical (Reels/Stories)", url: videoAdPmV2.url, format: "9:16 Reels/Stories", desc: "Night emergency scenario. AI answers, logs request, dispatches. CTA: Test your AI free." },
    ],
    keywords: [
      { keyword: "property management answering service", volume: "1,900/mo", cpc: "$6.50–$12.00", competition: "Med", intent: "🎯 B2B", convRate: "10–15%", tip: "Direct target — PMs looking for phone solutions" },
      { keyword: "tenant communication software", volume: "1,300/mo", cpc: "$5.00–$9.00", competition: "Med", intent: "🎯 B2B", convRate: "8–12%", tip: "Tech-savvy PMs ready for automation" },
      { keyword: "after hours maintenance calls", volume: "2,400/mo", cpc: "$3.50–$7.00", competition: "Low", intent: "🎯 B2B", convRate: "12–18%", tip: "Pain point keyword — direct match to our service" },
      { keyword: "property management virtual receptionist", volume: "480/mo", cpc: "$8.00–$14.00", competition: "Low", intent: "🎯 B2B", convRate: "15–22%", tip: "Low volume but insanely high intent" },
      { keyword: "tenant portal software", volume: "5,400/mo", cpc: "$4.50–$8.00", competition: "High", intent: "🎯 B2B", convRate: "4–7%", tip: "Broader — use for awareness campaigns" },
      { keyword: "property management automation", volume: "3,200/mo", cpc: "$4.00–$7.50", competition: "Med", intent: "🎯 B2B", convRate: "6–10%", tip: "Growing keyword — automation trend" },
    ],
    searchAdCopy: [
      { headline1: "AI Receptionist for Property Managers", headline2: "Never Miss a Tenant Emergency", headline3: "Starting at $99/mo", description1: "Tenants call after hours about leaks, lockouts, AC failures. Your AI answers instantly, logs requests, and dispatches emergencies.", displayUrl: "aihiddenleads.com/property-management", sitelinks: ["Free Demo", "Pricing", "How It Works", "Case Studies"] },
      { headline1: "42% of Tenant Calls Go to Voicemail", headline2: "AI Answers — You Don't Have To", headline3: "Free 90-Second Demo", description1: "Maintenance emergencies escalate when ignored. AI handles every call — logs requests, dispatches urgently, follows up automatically.", displayUrl: "aihiddenleads.com/pm-ai", sitelinks: ["Try Free Demo", "See Pricing", "Watch Video", "Features"] },
      { headline1: "Stop Hiring Answering Services", headline2: "AI Property Management Assistant", headline3: "From $99/mo — No Contract", description1: "Your AI handles tenant calls 24/7 — maintenance, emergencies, rent questions, lease inquiries. Try on YOUR website free.", displayUrl: "aihiddenleads.com/pm-receptionist", sitelinks: ["Free Demo", "Plans", "How It Works", "FAQ"] },
      { headline1: "Weekend Tenant Emergency?", headline2: "AI Answers in 0.4 Seconds", headline3: "Test It Free — No Credit Card", description1: "Leaks, lockouts, AC failures at 9PM. Your AI logs it, dispatches it, and follows up. Enter your website to hear it live.", displayUrl: "aihiddenleads.com/pm-after-hours", sitelinks: ["Try Demo Now", "See Plans", "Watch Video", "Contact"] },
      { headline1: "AI Voice for Property Managers", headline2: "Hear It on YOUR Website Now", headline3: "90 Seconds — Totally Free", description1: "Enter your website URL and hear your AI receptionist handle a tenant call. Books, logs, dispatches — all automatically. From $99/mo.", displayUrl: "aihiddenleads.com/try-pm-demo", sitelinks: ["Try Demo", "Pricing", "Features", "Reviews"] },
    ],
    targeting: {
      facebook: ["Location: South Florida + Texas metros", "Age: 28–60", "Interests: Property management, Real estate investing", "Job Titles: Property Manager, Landlord, Building Manager", "Objective: Lead Generation"],
      google: ["Campaign: Search + Display", "Location: Major metros (FL, TX, AZ)", "Bid Strategy: Maximize conversions", "Schedule: Mon–Fri 7AM–7PM", "Extensions: Sitelinks, Callout, Call"],
    },
  },
  {
    key: "medspa", label: "Med Spas & Aesthetics", emoji: "✨",
    avgClientValue: 850, missedCallPct: "35%",
    painStat: "67% of aesthetic treatment inquiries come after business hours — and those clients book whoever answers first",
    facebookAds: [
      { id: "fb-ms-1", name: "V1 — After-Hours Inquiries", image: fbAdMedspaV1, format: "Feed (1080×1080)", headline: "67% of Inquiries Come After Hours", primaryText: "A potential client just searched for lip filler at 8PM. They called 3 med spas — yours went to voicemail. They booked with the one that answered.\n\n🎧 Hear YOUR med spa's AI receptionist — free 90-second demo.", cta: "Try It Free — Hear Your AI", style: "Data-driven / Luxury" },
      { id: "fb-ms-2", name: "V2 — Stop Losing Bookings", image: fbAdMedspaV2, format: "Feed (1080×1080)", headline: "Stop Losing Bookings to Voicemail", primaryText: "Your front desk is busy during peak hours. After hours, nobody answers. Your AI handles both — books consultations, answers treatment questions, sends confirmations.", cta: "Hear Your Website Come Alive", style: "Solution / Elegant" },
      { id: "fb-ms-3", name: "V3 — Lip Filler at 8PM", image: fbAdMedspaV3, format: "Feed (1080×1080)", headline: "She Wanted Lip Filler at 8PM. You Were Closed.", primaryText: "She booked with the spa that answered. Don't lose another client to voicemail — your AI receptionist answers 24/7.\n\n🆓 Hear YOUR AI now — free demo. No credit card.", cta: "HEAR YOUR AI RECEPTIONIST — FREE DEMO", style: "Emotional / Luxury" },
      { id: "fb-ms-4", name: "V4 — Front Desk Busy", image: fbAdMedspaV4, format: "Feed (1080×1080)", headline: "Your Front Desk Is Busy. Your AI Never Is.", primaryText: "Books consultations, answers treatment questions, sends confirmations — while you focus on clients.\n\n🆓 FREE 90-SECOND DEMO → Try It On Your Website", cta: "Free 90-Second Demo →", style: "Bold / Professional" },
      { id: "fb-ms-5", name: "V5 — $850 Lost Per Call", image: fbAdMedspaV5, format: "Feed (1080×1080)", headline: "Every Missed Call = $850 Lost", primaryText: "Botox. Filler. Laser. Your clients don't wait — they book whoever answers first.\n\nYour AI answers every call, 24/7. Books consultations automatically.", cta: "HEAR YOUR AI ANSWER NOW — Free Demo", style: "Data-driven / Pink" },
    ],
    instagramStoryAds: [
      { id: "ig-ms-1", name: "Story — Consultation at 8PM", image: igStoryMedspa, format: "Story/Reel (1080×1920)", headline: "SHE WANTED A CONSULTATION AT 8PM", primaryText: "YOU WERE CLOSED. Your AI would have booked her. TAP TO TRY YOUR AI — Free Demo", cta: "Tap to Try Your AI", style: "Luxury / Mobile" },
    ],
    googleAds: [
      { id: "g-ms-1", name: "V1 — Display Ad", image: fbAdMedspaV1, format: "Display (300×250)", headline: "AI Receptionist for Med Spas", primaryText: "Never lose another consultation booking — Starting $99/mo", cta: "Free Demo", style: "Premium" },
      { id: "g-ms-2", name: "V2 — Rose Gold Elegant", image: googleAdMedspaV2, format: "Display (728×600)", headline: "AI Receptionist for Med Spas", primaryText: "Book consultations 24/7. Never lose another client to voicemail. From $99/mo.", cta: "Free Demo", style: "Luxury / Rose Gold" },
      { id: "g-ms-3", name: "V3 — $850 Lost", image: googleAdMedspaV3, format: "Display (728×600)", headline: "Every Missed Call = $850 Lost", primaryText: "Your AI books consultations 24/7. Filler. Laser. Chemical peels.", cta: "Try Free", style: "Data / Pink" },
      { id: "g-ms-4", name: "V4 — After Hours", image: googleAdMedspaV4, format: "Display (728×600)", headline: "67% of Bookings Come After Hours", primaryText: "AI answers and books — automatically. Starting $99/mo.", cta: "See Free Demo", style: "Luxury / Plum" },
    ],
    videoAds: [
      { id: "vid-ms-1", name: "✨ Med Spa — Square (Feed)", url: videoAdMedspa.url, format: "1:1 Feed", desc: "Unanswered phone → elegant AI receptionist booking consultations automatically." },
      { id: "vid-ms-2", name: "✨ Med Spa — Vertical (Reels/Stories)", url: videoAdMedspaV2.url, format: "9:16 Reels/Stories", desc: "After-hours scenario. Client calls, AI books consultation. CTA: Hear your AI now." },
    ],
    keywords: [
      { keyword: "med spa near me", volume: "90,500/mo", cpc: "$4.50–$8.00", competition: "High", intent: "🔥 Buyer", convRate: "8–12%", tip: "Massive consumer volume — show spas they're losing calls" },
      { keyword: "med spa receptionist", volume: "1,600/mo", cpc: "$3.00–$6.00", competition: "Low", intent: "🎯 B2B", convRate: "8–12%", tip: "Hiring pain — pitch AI alternative" },
      { keyword: "aesthetic clinic phone system", volume: "390/mo", cpc: "$7.00–$13.00", competition: "Low", intent: "🎯 B2B", convRate: "15–22%", tip: "Low volume but extremely high intent" },
      { keyword: "med spa booking software", volume: "2,900/mo", cpc: "$5.50–$10.00", competition: "Med", intent: "🎯 B2B", convRate: "6–10%", tip: "Broader — awareness + retargeting" },
      { keyword: "after hours booking aesthetics", volume: "720/mo", cpc: "$4.00–$7.50", competition: "Low", intent: "🎯 B2B", convRate: "12–18%", tip: "Perfect match — our core value prop" },
      { keyword: "AI receptionist medical spa", volume: "210/mo", cpc: "$5.00–$9.00", competition: "Low", intent: "🎯 B2B", convRate: "18–25%", tip: "Emerging — get in before competitors" },
    ],
    searchAdCopy: [
      { headline1: "AI Receptionist for Med Spas", headline2: "Book Consultations 24/7 Automatically", headline3: "Starting $99/mo — Free Demo", description1: "67% of aesthetic inquiries come after hours. Your AI answers every call, books consultations, answers treatment questions, and sends confirmation texts.", displayUrl: "aihiddenleads.com/med-spas", sitelinks: ["Free Demo", "Pricing", "How It Works", "Success Stories"] },
      { headline1: "Stop Losing Clients to Voicemail", headline2: "AI Books Consultations 24/7", headline3: "Free 90-Second Demo", description1: "She wanted lip filler at 8PM. You were closed. AI answers every call — books consultations, answers questions, sends confirmations. Try free.", displayUrl: "aihiddenleads.com/medspa-ai", sitelinks: ["Try Free Demo", "See Pricing", "Watch Demo", "How It Works"] },
      { headline1: "Every Missed Call = $850 Lost", headline2: "AI Receptionist for Med Spas", headline3: "From $99/mo — No Contract", description1: "Botox, filler, laser — your clients don't wait. They book whoever answers first. AI makes sure that's you. 24/7.", displayUrl: "aihiddenleads.com/medspa-revenue", sitelinks: ["Free Demo", "Plans", "Features", "FAQ"] },
      { headline1: "Med Spa After Hours Solution", headline2: "AI Handles Bookings Automatically", headline3: "Test on YOUR Website Free", description1: "67% of aesthetic inquiries come after hours. AI answers, books, and confirms — while you sleep. Enter your website to hear it live.", displayUrl: "aihiddenleads.com/medspa-after-hours", sitelinks: ["Try Demo Now", "See Plans", "Watch Video", "Contact"] },
      { headline1: "Hear Your Med Spa's AI Voice", headline2: "Free 90-Second Simulation", headline3: "No Credit Card — Try Now", description1: "Enter your website URL and hear your med spa's AI receptionist book a consultation. It answers questions, sends texts, and never takes a break.", displayUrl: "aihiddenleads.com/try-medspa", sitelinks: ["Try Demo", "Pricing", "Features", "Reviews"] },
    ],
    targeting: {
      facebook: ["Location: South Florida + major metros", "Age: 28–55", "Interests: Medical aesthetics, Spa management", "Job Titles: Med Spa Owner, Aesthetic Nurse, Practice Manager", "Objective: Lead Generation"],
      google: ["Campaign: Search + Display", "Location: Affluent zip codes, major metros", "Bid Strategy: Maximize conversions", "Schedule: All week (after-hours converts well)", "Extensions: Sitelinks, Callout, Call, Image"],
    },
  },
];

// ─── BUDGET TIERS ───────────────────────────────────────────────────
interface BudgetTier {
  daily: number; monthly: number; impressions: string; clicks: string;
  cpc: string; leads: string; costPerLead: string; conversions: string;
}
const budgetTiers: Record<string, { facebook: BudgetTier; google: BudgetTier }> = {
  "$10": {
    facebook: { daily: 10, monthly: 300, impressions: "3,000–5,000/day", clicks: "30–60/day", cpc: "$0.18–0.35", leads: "15–25/mo", costPerLead: "$12–20", conversions: "2–4 clients" },
    google: { daily: 10, monthly: 300, impressions: "800–1,500/day", clicks: "8–15/day", cpc: "$0.70–1.25", leads: "8–15/mo", costPerLead: "$20–38", conversions: "1–3 clients" },
  },
  "$15": {
    facebook: { daily: 15, monthly: 450, impressions: "5,000–8,000/day", clicks: "50–90/day", cpc: "$0.17–0.30", leads: "25–40/mo", costPerLead: "$11–18", conversions: "4–7 clients" },
    google: { daily: 15, monthly: 450, impressions: "1,200–2,200/day", clicks: "12–22/day", cpc: "$0.68–1.20", leads: "12–22/mo", costPerLead: "$20–38", conversions: "2–4 clients" },
  },
  "$20": {
    facebook: { daily: 20, monthly: 600, impressions: "7,000–12,000/day", clicks: "70–130/day", cpc: "$0.15–0.28", leads: "35–55/mo", costPerLead: "$11–17", conversions: "5–9 clients" },
    google: { daily: 20, monthly: 600, impressions: "1,600–3,000/day", clicks: "16–30/day", cpc: "$0.65–1.20", leads: "16–30/mo", costPerLead: "$20–38", conversions: "3–5 clients" },
  },
  "$25": {
    facebook: { daily: 25, monthly: 750, impressions: "9,000–15,000/day", clicks: "90–160/day", cpc: "$0.15–0.28", leads: "45–70/mo", costPerLead: "$11–17", conversions: "7–12 clients" },
    google: { daily: 25, monthly: 750, impressions: "2,000–3,800/day", clicks: "20–38/day", cpc: "$0.65–1.20", leads: "20–38/mo", costPerLead: "$20–38", conversions: "3–6 clients" },
  },
};

function calcROI(niche: NicheConfig, dailyBudget: number, essentialPrice: number, growthPrice: number) {
  const monthlySpend = dailyBudget * 30;
  const avgCPC = dailyBudget <= 15 ? 0.85 : 0.75;
  const totalClicks = Math.round(monthlySpend / avgCPC);
  const convRate = 0.08;
  const leads = Math.round(totalClicks * convRate);
  const closeRate = 0.18;
  const clients = Math.round(leads * closeRate);
  const essentialRev = clients * essentialPrice;
  const growthRev = clients * growthPrice;
  const lifetimeRev = clients * niche.avgClientValue;
  return { monthlySpend, totalClicks, leads, clients, essentialRev, growthRev, lifetimeRev };
}

// ─── COMPONENT ──────────────────────────────────────────────────────
const AdPreviews = () => {
  const navigate = useNavigate();
  const [nicheKey, setNicheKey] = useState("vet");
  const [selectedBudget, setSelectedBudget] = useState("$15");
  const [roiBudget, setRoiBudget] = useState(15);
  const [essentialPrice, setEssentialPrice] = useState(99);
  const [growthPrice, setGrowthPrice] = useState(199);
  const [selectedAd, setSelectedAd] = useState<string | null>(null);

  const niche = niches.find(n => n.key === nicheKey)!;
  const budget = budgetTiers[selectedBudget];
  const roi = calcROI(niche, roiBudget, essentialPrice, growthPrice);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">📊 Ad Creatives, Keywords & ROI Calculator</h1>
            <p className="text-sm text-muted-foreground">Multi-niche ad strategy — Facebook, Instagram, Google — with financial projections</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {/* Niche Selector */}
        <div className="flex flex-wrap gap-2">
          {niches.map(n => (
            <Button key={n.key} variant={nicheKey === n.key ? "default" : "outline"} onClick={() => { setNicheKey(n.key); setSelectedAd(null); }} className="gap-2">
              <span>{n.emoji}</span> {n.label}
            </Button>
          ))}
        </div>

        {/* Pain stat banner */}
        <Card className="border-2 border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Award className="w-8 h-8 text-primary shrink-0 mt-1" />
              <div>
                <h2 className="text-lg font-bold text-foreground mb-1">{niche.emoji} {niche.label} — Key Insight</h2>
                <p className="text-sm text-muted-foreground">{niche.painStat}</p>
                <p className="text-sm text-muted-foreground mt-2">Average client value: <span className="text-primary font-bold">${niche.avgClientValue}</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── ROI CALCULATOR ─────────────────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" /> Financial ROI Calculator
          </h2>
          <Card>
            <CardContent className="pt-6">
              <div className="mb-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Daily Ad Budget: ${roiBudget}/day (${roiBudget * 30}/mo)</label>
                  <input type="range" min={5} max={50} step={5} value={roiBudget} onChange={e => setRoiBudget(Number(e.target.value))} className="w-full accent-primary" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>$5/day</span><span>$25/day</span><span>$50/day</span></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Natural Voice Plan Price ($/mo)</label>
                    <input type="number" min={49} max={499} step={10} value={essentialPrice} onChange={e => setEssentialPrice(Number(e.target.value))} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-semibold text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Growth Plan Price ($/mo)</label>
                    <input type="number" min={99} max={999} step={10} value={growthPrice} onChange={e => setGrowthPrice(Number(e.target.value))} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-semibold text-foreground" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: "Monthly Ad Spend", value: `$${roi.monthlySpend}`, color: "text-foreground" },
                  { label: "Est. Clicks", value: roi.totalClicks.toLocaleString(), color: "text-foreground" },
                  { label: "Leads Generated", value: roi.leads.toString(), color: "text-primary" },
                  { label: "New Clients", value: roi.clients.toString(), color: "text-primary" },
                  { label: `Rev @ $${essentialPrice}/mo`, value: `$${roi.essentialRev}/mo`, color: "text-green-500" },
                  { label: `Rev @ $${growthPrice}/mo`, value: `$${roi.growthRev}/mo`, color: "text-green-500" },
                  { label: "Client Lifetime Value", value: `$${roi.lifetimeRev}`, color: "text-green-500" },
                ].map(item => (
                  <div key={item.label} className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                    <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid md:grid-cols-3 gap-3">
                {niches.map(n => {
                  const r = calcROI(n, roiBudget, essentialPrice, growthPrice);
                  const roiMultiple = r.essentialRev > 0 ? (r.essentialRev / r.monthlySpend).toFixed(1) : "0";
                  return (
                    <Card key={n.key} className={`border ${n.key === nicheKey ? "border-primary bg-primary/5" : "border-border"}`}>
                      <CardContent className="pt-4">
                        <p className="text-sm font-bold text-foreground">{n.emoji} {n.label}</p>
                        <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                          <div><span className="text-muted-foreground">Leads:</span> <span className="font-semibold">{r.leads}</span></div>
                          <div><span className="text-muted-foreground">Clients:</span> <span className="font-semibold">{r.clients}</span></div>
                          <div><span className="text-muted-foreground">Revenue:</span> <span className="font-semibold text-green-500">${r.essentialRev}/mo</span></div>
                          <div><span className="text-muted-foreground">ROI:</span> <span className="font-semibold text-primary">{roiMultiple}×</span></div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ─── AD CREATIVES ───────────────────────────────────── */}
        <Tabs defaultValue="facebook">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="facebook">📘 Facebook Ads ({niche.facebookAds.length})</TabsTrigger>
            <TabsTrigger value="instagram">📸 Instagram Stories ({niche.instagramStoryAds.length})</TabsTrigger>
            <TabsTrigger value="google-display">🖼️ Google Display ({niche.googleAds.length})</TabsTrigger>
            <TabsTrigger value="google-search">🔍 Google Search ({niche.searchAdCopy.length})</TabsTrigger>
            <TabsTrigger value="video">🎬 Video Ads ({niche.videoAds.length})</TabsTrigger>
          </TabsList>

          {/* FACEBOOK ADS */}
          <TabsContent value="facebook">
            <p className="text-sm text-muted-foreground mb-4">Square (1:1) format — optimized for Facebook & Instagram feeds. Click any ad to see full copy.</p>
            <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
              {niche.facebookAds.map(ad => (
                <Card key={ad.id} className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setSelectedAd(selectedAd === ad.id ? null : ad.id)}>
                  <div className={ad.format.includes("1920") ? "aspect-[9/16] max-h-[300px]" : "aspect-square"}>
                    <img src={ad.image} alt={ad.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <CardContent className="pt-3 space-y-1.5">
                    <h3 className="font-bold text-foreground text-xs">{ad.name}</h3>
                    <Badge variant="outline" className="text-[10px]">{ad.style}</Badge>
                    {selectedAd === ad.id && (
                      <div className="space-y-1.5 pt-2 border-t border-border mt-2">
                        <p className="text-[10px] text-muted-foreground"><strong>Headline:</strong> {ad.headline}</p>
                        <p className="text-[10px] text-muted-foreground whitespace-pre-line"><strong>Primary Text:</strong> {ad.primaryText}</p>
                        <p className="text-[10px] text-muted-foreground"><strong>CTA:</strong> {ad.cta}</p>
                      </div>
                    )}
                    <a href={ad.image} download className="inline-block">
                      <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2 gap-1"><Download className="w-3 h-3" /> Download</Button>
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* INSTAGRAM STORIES */}
          <TabsContent value="instagram">
            <p className="text-sm text-muted-foreground mb-4">Vertical (9:16) format — optimized for Instagram Stories, Reels, and TikTok.</p>
            <div className="grid md:grid-cols-3 gap-6">
              {niche.instagramStoryAds.map(ad => (
                <Card key={ad.id} className="overflow-hidden">
                  <div className="aspect-[9/16] max-h-[500px]">
                    <img src={ad.image} alt={ad.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <CardContent className="pt-3 space-y-1.5">
                    <h3 className="font-bold text-foreground text-sm">{ad.name}</h3>
                    <Badge variant="outline">{ad.style}</Badge>
                    <p className="text-xs text-muted-foreground"><strong>CTA:</strong> {ad.cta}</p>
                    <a href={ad.image} download className="inline-block">
                      <Button variant="ghost" size="sm" className="gap-1"><Download className="w-3 h-3" /> Download</Button>
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* GOOGLE DISPLAY */}
          <TabsContent value="google-display">
            <p className="text-sm text-muted-foreground mb-4">Google Display Network ad variations — multiple formats and styles.</p>
            <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
              {niche.googleAds.map(ad => (
                <Card key={ad.id} className="overflow-hidden">
                  <div className="bg-muted p-2 flex items-center justify-center aspect-square">
                    <img src={ad.image} alt={ad.name} className="max-w-full rounded shadow" loading="lazy" />
                  </div>
                  <CardContent className="pt-3 space-y-1.5">
                    <h3 className="font-bold text-foreground text-xs">{ad.name}</h3>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{ad.format}</Badge>
                      <Badge variant="outline" className="text-[10px]">{ad.style}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground"><strong>Headline:</strong> {ad.headline}</p>
                    <a href={ad.image} download className="inline-block">
                      <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2 gap-1"><Download className="w-3 h-3" /> Download</Button>
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* GOOGLE SEARCH */}
          <TabsContent value="google-search">
            <p className="text-sm text-muted-foreground mb-4">Ready-to-paste Google Search ad copy variations. Each targets a different angle.</p>
            <div className="space-y-4">
              {niche.searchAdCopy.map((ad, i) => (
                <Card key={i}>
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="max-w-xl">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px]">Variation {i + 1}</Badge>
                          <p className="text-xs text-muted-foreground">Sponsored</p>
                        </div>
                        <p className="text-sm text-primary font-medium">{ad.displayUrl}</p>
                        <h3 className="text-base text-primary font-medium hover:underline cursor-pointer">
                          {ad.headline1} | {ad.headline2} | {ad.headline3}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">{ad.description1}</p>
                        <div className="flex gap-4 mt-2">
                          {ad.sitelinks.map(link => (
                            <span key={link} className="text-xs text-primary hover:underline cursor-pointer">{link}</span>
                          ))}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => {
                        const text = `Headline 1: ${ad.headline1}\nHeadline 2: ${ad.headline2}\nHeadline 3: ${ad.headline3}\nDescription: ${ad.description1}\nDisplay URL: ${ad.displayUrl}\nSitelinks: ${ad.sitelinks.join(', ')}`;
                        navigator.clipboard.writeText(text);
                      }}>
                        📋 Copy
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* VIDEO ADS */}
          <TabsContent value="video">
            <p className="text-sm text-muted-foreground mb-4">Animated video creatives for Facebook, Instagram Reels, Stories & TikTok. Download and upload directly to your ad campaigns.</p>
            <div className="grid md:grid-cols-2 gap-6">
              {niche.videoAds.map(v => (
                <Card key={v.id} className="overflow-hidden">
                  <div className={v.format.includes("9:16") ? "aspect-[9/16] max-h-[500px]" : "aspect-square"}>
                    <video src={v.url} className="w-full h-full object-cover" controls loop muted playsInline preload="metadata" />
                  </div>
                  <CardContent className="pt-4">
                    <h3 className="font-bold text-foreground">{v.name}</h3>
                    <Badge variant="outline" className="mt-1">{v.format}</Badge>
                    <p className="text-xs text-muted-foreground mt-2">{v.desc}</p>
                    <a href={v.url} download className="inline-block mt-2">
                      <Button variant="outline" size="sm" className="gap-1"><Download className="w-4 h-4" /> Download Video</Button>
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* ─── KEYWORD INTELLIGENCE ───────────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
            <Search className="w-6 h-6 text-primary" /> Keyword Intelligence — {niche.label}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-muted/80">
                  <th className="text-left p-3 font-semibold text-foreground">Keyword</th>
                  <th className="text-left p-3 font-semibold text-foreground">Volume</th>
                  <th className="text-left p-3 font-semibold text-foreground">CPC</th>
                  <th className="text-left p-3 font-semibold text-foreground">Competition</th>
                  <th className="text-left p-3 font-semibold text-foreground">Intent</th>
                  <th className="text-left p-3 font-semibold text-foreground">Conv. Rate</th>
                  <th className="text-left p-3 font-semibold text-foreground hidden md:table-cell">💡 Tip</th>
                </tr>
              </thead>
              <tbody>
                {niche.keywords.map((kw, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="p-3 font-mono text-xs text-foreground">{kw.keyword}</td>
                    <td className="p-3 text-foreground">{kw.volume}</td>
                    <td className="p-3 font-semibold text-foreground">{kw.cpc}</td>
                    <td className="p-3"><Badge variant={kw.competition === "Low" ? "default" : kw.competition === "Med" ? "secondary" : "destructive"} className="text-xs">{kw.competition}</Badge></td>
                    <td className="p-3 text-foreground">{kw.intent}</td>
                    <td className="p-3 text-foreground">{kw.convRate}</td>
                    <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">{kw.tip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── BUDGET PROJECTIONS ─────────────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" /> Budget Projections
          </h2>
          <div className="flex gap-2 mb-6">
            {Object.keys(budgetTiers).map(b => (
              <Button key={b} variant={selectedBudget === b ? "default" : "outline"} onClick={() => setSelectedBudget(b)} className="font-mono">{b}/day</Button>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {(["facebook", "google"] as const).map(platform => {
              const d = budget[platform];
              return (
                <Card key={platform} className="border-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      {platform === "facebook" ? "📘 Facebook/Instagram" : "🔍 Google Ads"}
                      <Badge variant="secondary">${d.daily}/day = ${d.monthly}/mo</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { icon: Eye, label: "Impressions", value: d.impressions },
                        { icon: MousePointerClick, label: "Clicks", value: d.clicks },
                        { icon: DollarSign, label: "Cost/Click", value: d.cpc },
                        { icon: Users, label: "Leads/Month", value: d.leads },
                        { icon: Phone, label: "Cost/Lead", value: d.costPerLead },
                        { icon: TrendingUp, label: "Conversions", value: d.conversions },
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="bg-muted/50 rounded-lg p-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Icon className="w-3 h-3" /> {label}</div>
                          <div className="font-semibold text-sm text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ─── TARGETING GUIDE ────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>🎯 Ad Targeting — {niche.label}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-foreground mb-2">📘 Facebook + Instagram Targeting</h3>
                <ul className="text-sm text-muted-foreground space-y-1">{niche.targeting.facebook.map(t => <li key={t}>• {t}</li>)}</ul>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">🔍 Google Targeting</h3>
                <ul className="text-sm text-muted-foreground space-y-1">{niche.targeting.google.map(t => <li key={t}>• {t}</li>)}</ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── WIDGET INSTALLATION SNIPPET ────────────────────── */}
        <Card>
          <CardHeader><CardTitle>🔧 Client Widget Installation Guide</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              After onboarding a client, add these two widgets to their website. Works on WordPress, Wix, Squarespace, or any HTML site.
            </p>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">💬 AI Chat Widget</h3>
                <pre className="bg-muted rounded-lg p-4 text-xs text-foreground overflow-x-auto">
{`<!-- AI Chat Widget — paste before </body> -->
<script>
  window.AI_CHAT_CONFIG = {
    businessName: "CLIENT_BUSINESS_NAME",
    niche: "${niche.key}",
    primaryColor: "#0ea5e9",
    position: "bottom-right",
    greeting: "Hi! How can I help you today?"
  };
</script>
<script src="https://aihiddenleads.com/widgets/chat.js" defer></script>`}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">🎙️ AI Voice Widget</h3>
                <pre className="bg-muted rounded-lg p-4 text-xs text-foreground overflow-x-auto">
{`<!-- AI Voice Widget — paste before </body> -->
<script>
  window.AI_VOICE_CONFIG = {
    businessName: "CLIENT_BUSINESS_NAME",
    agentId: "RETELL_AGENT_ID",
    position: "bottom-left",
    label: "Talk to AI"
  };
</script>
<script src="https://aihiddenleads.com/widgets/voice.js" defer></script>`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default AdPreviews;
