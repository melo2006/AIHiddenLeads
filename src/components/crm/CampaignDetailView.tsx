import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Play, Pause, Users, Mail, Eye, MousePointerClick,
  Globe, ScanSearch, Send, ExternalLink, CheckSquare,
  Square, Search, Loader2, AlertCircle, TestTube2
} from "lucide-react";
import OutreachDialog from "./OutreachDialog";
import CampaignSequenceEditor from "./CampaignSequenceEditor";
import { campaignIdFromTargetFilters } from "@/lib/campaignIds";
import type { Prospect } from "@/hooks/useProspectSearch";

const CampaignDetailView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [showOutreach, setShowOutreach] = useState(false);
  const [showTestOutreach, setShowTestOutreach] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const returnTo = encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`);

  // Fetch campaign
  const { data: campaign, isLoading: loadingCampaign } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch matched prospects using campaign filters
  const { data: prospects = [], isLoading: loadingProspects } = useQuery({
    queryKey: ["campaign-prospects", id, campaign?.target_filters],
    queryFn: async () => {
      const filters = (campaign?.target_filters as any) || {};
      let query = supabase.from("prospects").select("*");

      // A campaign bound to a prospect campaign_id slug (e.g. the Realtors
      // regional campaigns) lists exactly those prospects, not a niche match.
      const boundCampaignId = campaignIdFromTargetFilters(filters);
      if (boundCampaignId) {
        query = query.eq("campaign_id", boundCampaignId);
      }

      if (filters.temperature && filters.temperature !== "all") {
        query = query.eq("lead_temperature", filters.temperature);
      }
      if (filters.minScore > 0) {
        query = query.gte("lead_score", filters.minScore);
      }
      if (filters.hasWebsite === "yes") {
        query = query.eq("has_website", true);
      }
      if (filters.noChat) {
        query = query.eq("has_chat_widget", false);
      }
      if (filters.noVoice) {
        query = query.eq("has_voice_ai", false);
      }
      if (campaign?.niche) {
        query = query.ilike("niche", `%${campaign.niche}%`);
      }

      const { data, error } = await query.order("lead_score", { ascending: false });
      if (error) throw error;
      return (data || []) as Prospect[];
    },
    enabled: !!campaign,
  });

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchTerm) return prospects;
    const term = searchTerm.toLowerCase();
    return prospects.filter(
      (p) =>
        p.business_name.toLowerCase().includes(term) ||
        p.formatted_address?.toLowerCase().includes(term) ||
        p.niche?.toLowerCase().includes(term)
    );
  }, [prospects, searchTerm]);

  // Toggle selection
  const toggleSelect = (pid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) { next.delete(pid); } else { next.add(pid); }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const selectedProspects = prospects.filter((p) => selectedIds.has(p.id));

  // Analyze/scrape prospects
  const analyzeProspects = async (ids: string[]) => {
    const toAnalyze = prospects.filter((p) => ids.includes(p.id) && p.website_url);
    if (toAnalyze.length === 0) {
      toast.error("No prospects with websites to analyze");
      return;
    }

    setAnalyzingIds(new Set(ids));
    let success = 0;
    let failed = 0;

    for (const p of toAnalyze) {
      try {
        const { error } = await supabase.functions.invoke("analyze-prospect", {
          body: { prospect_id: p.id, website_url: p.website_url, business_name: p.business_name, niche: p.niche },
        });
        if (error) throw error;
        success++;
      } catch {
        failed++;
      }
    }

    setAnalyzingIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["campaign-prospects"] });
    toast.success(`Analyzed ${success} prospects${failed > 0 ? `, ${failed} failed` : ""}`);
  };

  // Update campaign status
  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("campaigns")
        .update({ status })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      toast.success("Campaign updated");
    },
  });

  const statusStyles: Record<string, { text: string; cls: string }> = {
    draft: { text: "Draft", cls: "bg-muted text-muted-foreground" },
    active: { text: "Active", cls: "bg-primary/20 text-primary" },
    paused: { text: "Paused", cls: "bg-amber-400/20 text-amber-400" },
    completed: { text: "Completed", cls: "bg-emerald-400/20 text-emerald-400" },
  };

  if (loadingCampaign) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
        <p className="text-foreground font-semibold">Campaign not found</p>
        <button onClick={() => navigate("/campaigns")} className="mt-3 text-sm text-primary hover:underline">
          ← Back to Campaigns
        </button>
      </div>
    );
  }

  const st = statusStyles[campaign.status] || statusStyles.draft;
  const openRate = (campaign.emails_sent || 0) > 0
    ? Math.round(((campaign.emails_opened || 0) / (campaign.emails_sent || 1)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate("/campaigns")}
          className="mt-1 p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-foreground truncate">{campaign.name}</h1>
            <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${st.cls}`}>
              {st.text}
            </span>
          </div>
          {campaign.description && (
            <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {campaign.niche && (
              <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground capitalize">
                {campaign.niche}
              </span>
            )}
            {campaign.status === "draft" && (
              <button
                onClick={() => updateStatus.mutate("active")}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Play className="w-3 h-3" /> Launch
              </button>
            )}
            {campaign.status === "active" && (
              <button
                onClick={() => updateStatus.mutate("paused")}
                className="flex items-center gap-1 text-xs font-medium text-amber-400 hover:underline"
              >
                <Pause className="w-3 h-3" /> Pause
              </button>
            )}
            {campaign.status === "paused" && (
              <button
                onClick={() => updateStatus.mutate("active")}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Play className="w-3 h-3" /> Resume
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Users, label: "Prospects", value: prospects.length, color: "text-muted-foreground" },
          { icon: Mail, label: "Emails Sent", value: campaign.emails_sent || 0, color: "text-purple-400" },
          { icon: Eye, label: "Open Rate", value: `${openRate}%`, color: "text-emerald-400" },
          { icon: MousePointerClick, label: "Demos Viewed", value: campaign.demos_viewed || 0, color: "text-cyan-400" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
            <p className="text-lg font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Drip Campaign Sequences */}
      <CampaignSequenceEditor campaignId={id!} campaignStatus={campaign.status} />

      {/* Action Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search prospects..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setShowTestOutreach(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-medium text-foreground hover:border-primary/30 transition-colors"
          >
            <TestTube2 className="w-4 h-4 text-amber-400" />
            Send Test Email
          </button>
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => analyzeProspects(Array.from(selectedIds))}
                disabled={analyzingIds.size > 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-medium text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
              >
                <ScanSearch className="w-4 h-4 text-primary" />
                {analyzingIds.size > 0 ? "Analyzing..." : `Scrape & Analyze (${selectedIds.size})`}
              </button>
              <button
                onClick={() => setShowOutreach(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Send className="w-4 h-4" />
                Send Outreach ({selectedIds.size})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Prospects Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[40px_1fr_120px_100px_80px_80px_60px] gap-2 px-4 py-2.5 bg-secondary/50 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          <div className="flex items-center">
            <button onClick={selectAll} className="text-muted-foreground hover:text-foreground">
              {selectedIds.size === filtered.length && filtered.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          </div>
          <div>Business</div>
          <div>Location</div>
          <div>Score</div>
          <div>Website</div>
          <div>Analyzed</div>
          <div>Demo</div>
        </div>

        {loadingProspects ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No matching prospects found
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {filtered.map((p) => {
              const isSelected = selectedIds.has(p.id);
              const isAnalyzing = analyzingIds.has(p.id);
              const demoUrl = `${window.location.origin}/demo?url=${encodeURIComponent(p.website_url || "")}&name=${encodeURIComponent(p.business_name)}&niche=${encodeURIComponent(p.niche || "")}&returnTo=${returnTo}`;

              return (
                <div
                  key={p.id}
                  className={`grid grid-cols-[40px_1fr_120px_100px_80px_80px_60px] gap-2 px-4 py-3 items-center text-sm hover:bg-secondary/30 transition-colors ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  <div>
                    <button onClick={() => toggleSelect(p.id)} className="text-muted-foreground hover:text-foreground">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{p.business_name}</p>
                    {p.phone && <p className="text-[11px] text-muted-foreground">{p.phone}</p>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.city}{p.state ? `, ${p.state}` : ""}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${p.lead_score || 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-foreground w-7 text-right">{p.lead_score || 0}</span>
                    </div>
                  </div>
                  <div>
                    {p.has_website ? (
                      <a
                        href={p.website_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Globe className="w-3 h-3" /> Visit
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </div>
                  <div>
                    {isAnalyzing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : p.ai_analyzed ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-400">Done</span>
                    ) : (
                      <button
                        onClick={() => analyzeProspects([p.id])}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                      >
                        Analyze
                      </button>
                    )}
                  </div>
                  <div>
                    {p.website_url ? (
                      <a
                        href={demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Test Outreach Dialog — sends to test email using first prospect's data */}
      {showTestOutreach && prospects.length > 0 && (() => {
        const testProspect = {
          ...prospects[0],
          email: "melo4000@gmail.com",
          owner_email: "melo4000@gmail.com",
        };
        return (
          <OutreachDialog
            prospects={[testProspect] as any}
            onClose={() => setShowTestOutreach(false)}
            onSent={() => {
              setShowTestOutreach(false);
              toast.success("Test email sent to melo4000@gmail.com!");
            }}
          />
        );
      })()}

      {/* Outreach Dialog */}
      {showOutreach && selectedProspects.length > 0 && (
        <OutreachDialog
          prospects={selectedProspects}
          onClose={() => setShowOutreach(false)}
          onSent={() => {
            setShowOutreach(false);
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ["campaign-prospects"] });
          }}
        />
      )}
    </div>
  );
};

export default CampaignDetailView;
