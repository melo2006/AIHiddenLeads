import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, Search, UserPlus, X, Megaphone, FileSpreadsheet } from "lucide-react";
import ApolloImportDialog from "@/components/crm/ApolloImportDialog";
import ProspectSearchForm from "@/components/crm/ProspectSearchForm";
import ProspectTable from "@/components/crm/ProspectTable";
import CRMStats from "@/components/crm/CRMStats";
import CRMFilters, { DEFAULT_FILTERS, type Filters } from "@/components/crm/CRMFilters";
import OutreachDialog from "@/components/crm/OutreachDialog";
import QuickAddProspectDialog from "@/components/crm/QuickAddProspectDialog";
import CampaignBuilderDialog from "@/components/crm/CampaignBuilderDialog";
import SmartPreScan from "@/components/crm/SmartPreScan";
import { useProspectAnalysis } from "@/hooks/useProspectAnalysis";
import { useProspectSearch } from "@/hooks/useProspectSearch";
import { useProspects, useFilterOptions } from "@/hooks/useProspects";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const getPreviewType = (prospect: any) => {
  if (!prospect.website_url) return "none";
  if (prospect.website_url.startsWith("https://")) return "iframe";
  if (prospect.website_screenshot) return "screenshot";
  return "http";
};

const hasAnyEmail = (prospect: any) => Boolean(prospect.owner_email || prospect.email);

const getSmsCapability = (prospect: any) => {
  if (prospect.sms_capable === true) return "yes";
  if (prospect.sms_capable === false) return "no";
  return "unknown";
};

const ProspectsView = () => {
  const [searchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showApolloImport, setShowApolloImport] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");

  // Draft filters (user edits these) vs applied filters (sent to query)
  const [draftFilters, setDraftFilters] = useState<Filters>({
    ...DEFAULT_FILTERS,
    temperature: searchParams.get("temp") || "all",
    status: searchParams.get("status") || "all",
    campaign: searchParams.get("campaign") ? [searchParams.get("campaign") as string] : [],
  });
  const [appliedFilters, setAppliedFilters] = useState<Filters>(draftFilters);

  const [outreachProspects, setOutreachProspects] = useState<any[] | null>(null);
  const [campaignProspects, setCampaignProspects] = useState<any[] | null>(null);

  useEffect(() => {
    const temp = searchParams.get("temp");
    const status = searchParams.get("status");
    const campaign = searchParams.get("campaign");
    if (temp || status || campaign) {
      const updated = {
        ...draftFilters,
        temperature: temp || "all",
        status: status || "all",
        campaign: campaign ? [campaign] : draftFilters.campaign,
      };
      setDraftFilters(updated);
      setAppliedFilters(updated);
      setShowFilters(true);
    }
  }, [searchParams]);

  const { search, isSearching, searchResults } = useProspectSearch();
  const { prospects, isLoading, refetch } = useProspects(appliedFilters);
  const { niches, campaigns, cities, states } = useFilterOptions();
  const prospectAnalysis = useProspectAnalysis();

  const handleApplyFilters = () => {
    setAppliedFilters({ ...draftFilters });
  };

  const applyMonitorFilters = (overrides: Partial<Filters>) => {
    const updated: Filters = { ...appliedFilters, ...overrides };
    setDraftFilters(updated);
    setAppliedFilters(updated);
    setShowFilters(true);
  };

  const handleReviewAnalyzed = () => applyMonitorFilters({ analyzed: "yes" });
  const handleReviewEmails = () => applyMonitorFilters({ hasEmail: ["yes"] });
  const handleReviewSms = () => applyMonitorFilters({ smsCapable: ["yes"] });
  const handleFilterTripleQualified = () => applyMonitorFilters({ previewType: ["iframe"], hasEmail: ["yes"], smsCapable: ["yes"] });
  const handleFilterDemoReady = (mode: "live" | "screenshot") => {
    if (mode === "live") {
      applyMonitorFilters({ previewType: ["iframe"], hasEmail: ["yes"] });
    } else {
      applyMonitorFilters({ previewType: ["http", "screenshot"], hasEmail: ["yes"] });
    }
  };

  const baseProspects = searchResults.length > 0 ? searchResults : prospects;

  const displayProspects = useMemo(() => {
    let list = baseProspects;

    // Preview type filter (client-side)
    if (appliedFilters.previewType.length > 0 && appliedFilters.previewType.length < 4) {
      list = list.filter((prospect) => appliedFilters.previewType.includes(getPreviewType(prospect)));
    }

    if (appliedFilters.hasEmail.length === 1) {
      const shouldHaveEmail = appliedFilters.hasEmail[0] === "yes";
      list = list.filter((prospect) => hasAnyEmail(prospect) === shouldHaveEmail);
    }

    if (appliedFilters.smsCapable.length > 0 && appliedFilters.smsCapable.length < 3) {
      list = list.filter((prospect) => appliedFilters.smsCapable.includes(getSmsCapability(prospect)));
    }

    if (!quickSearch.trim()) return list;
    const q = quickSearch.toLowerCase();
    return list.filter(p =>
      p.business_name?.toLowerCase().includes(q) ||
      (p as any).city?.toLowerCase().includes(q) ||
      (p as any).state?.toLowerCase().includes(q) ||
      p.niche?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      (p as any).owner_name?.toLowerCase().includes(q) ||
      p.formatted_address?.toLowerCase().includes(q)
    );
  }, [baseProspects, quickSearch, appliedFilters.hasEmail, appliedFilters.previewType, appliedFilters.smsCapable]);

  return (
    <div className="space-y-2">
      {/* Header row - compact */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground leading-tight">Prospects</h1>
          <p className="text-xs text-muted-foreground">Search and manage your business leads</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowQuickAdd(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-3 h-3" />Quick Add
          </button>
          <button
            onClick={() => setShowApolloImport(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary border border-border text-[11px] font-medium hover:bg-secondary/80 transition-colors text-foreground"
          >
            <FileSpreadsheet className="w-3 h-3" />Import CSV
          </button>
          <button
            onClick={() => {
              if (displayProspects.length > 0) setCampaignProspects(displayProspects);
              else { setShowFilters(true); }
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/30 text-accent-foreground text-[11px] font-medium hover:bg-accent/30 transition-colors"
          >
            <Megaphone className="w-3 h-3" />Build Campaign ({displayProspects.length})
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Filter className="w-3 h-3" />Filters
          </button>
        </div>
      </div>

      <CRMStats prospects={displayProspects} />

      <SmartPreScan
        analysis={prospectAnalysis}
        prospects={displayProspects}
        onFilterTripleQualified={handleFilterTripleQualified}
        onFilterDemoReady={handleFilterDemoReady}
        onRefetch={refetch}
      />

      {/* Quick Search + Find Prospects on same visual level */}
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="Search prospects by name, city, state, niche, phone, owner..."
            className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-secondary border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          {quickSearch && (
            <button onClick={() => setQuickSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="search" className="border border-border rounded-lg overflow-hidden bg-card">
          <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-secondary/30">
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">Find Prospects</span>
              {isSearching && <span className="text-[10px] text-primary animate-pulse">Searching...</span>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-0 pb-0">
            <ProspectSearchForm
              onSearch={async (params) => {
                await search(params);
                refetch();
              }}
              isSearching={isSearching}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-visible"
          >
            <CRMFilters
              filters={draftFilters}
              onChange={setDraftFilters}
              onApply={handleApplyFilters}
              niches={niches}
              campaigns={campaigns}
              cities={cities}
              states={states}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ProspectTable
        analysis={prospectAnalysis}
        prospects={displayProspects}
        isLoading={isLoading || isSearching}
        onRefetch={refetch}
        onOutreach={(selected) => setOutreachProspects(selected)}
        onCampaign={(selected) => setCampaignProspects(selected)}
        onReviewAnalyzed={handleReviewAnalyzed}
        onReviewEmails={handleReviewEmails}
        onReviewSms={handleReviewSms}
      />

      {outreachProspects && outreachProspects.length > 0 && (
        <OutreachDialog
          prospects={outreachProspects}
          onClose={() => setOutreachProspects(null)}
          onSent={() => { setOutreachProspects(null); refetch(); }}
        />
      )}

      {campaignProspects && campaignProspects.length > 0 && (
        <CampaignBuilderDialog
          prospects={campaignProspects}
          onClose={() => setCampaignProspects(null)}
          onSent={() => { setCampaignProspects(null); refetch(); }}
        />
      )}

      <QuickAddProspectDialog
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        onAdded={refetch}
      />

      <ApolloImportDialog
        open={showApolloImport}
        onOpenChange={setShowApolloImport}
        onImportComplete={refetch}
      />
    </div>
  );
};

export default ProspectsView;
