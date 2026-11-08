import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Link2, Play, CheckCircle2, Timer, Send } from "lucide-react";
import { fetchOutreachReport, type CampaignRollup } from "@/lib/outreachReport";

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const MILESTONE_LABELS: Record<string, string> = {
  page_view: "Opened demo page",
  section_view: "Viewed a section",
  scan_started: "Demo started",
  voice_started: "Talked to Aspen",
  voice_ended: "Finished with Aspen",
};

const StatCard = ({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: typeof Mail; color: string }) => (
  <div className="bg-card border border-border rounded-lg px-3 py-2.5 text-center">
    <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
    <p className="text-sm font-bold text-foreground">{value}</p>
    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
    {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

const CampaignCards = ({ rollup }: { rollup: CampaignRollup }) => {
  const openRate = rollup.prospectsSent > 0 ? Math.round((rollup.linkOpened / rollup.prospectsSent) * 100) : 0;
  const startRate = rollup.linkOpened > 0 ? Math.round((rollup.demoStarted / rollup.linkOpened) * 100) : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <StatCard label="Emails sent" value={String(rollup.sent)} sub={`${rollup.prospectsSent} prospects`} icon={Send} color="text-purple-400" />
      <StatCard label="Opened demo link" value={String(rollup.linkOpened)} sub={`${openRate}% of prospects`} icon={Link2} color="text-emerald-400" />
      <StatCard label="Total link opens" value={String(rollup.totalOpens)} icon={Mail} color="text-teal-400" />
      <StatCard label="Demo started" value={String(rollup.demoStarted)} sub={rollup.linkOpened > 0 ? `${startRate}% of openers` : undefined} icon={Play} color="text-cyan-400" />
      <StatCard label="Demo finished" value={String(rollup.demoFinished)} icon={CheckCircle2} color="text-amber-400" />
      <StatCard label="Demo minutes" value={String(rollup.demoMinutes)} sub={rollup.recordedDemoMinutes > 0 ? `${rollup.recordedDemoMinutes} recorded by voice proxy` : "from visit milestones"} icon={Timer} color="text-blue-400" />
    </div>
  );
};

const OutreachReportView = () => {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["outreach-report"],
    queryFn: fetchOutreachReport,
  });

  const campaigns = data?.campaigns ?? [];
  const activeCampaign = selectedCampaign || campaigns[0]?.campaign || "";
  const rollup = campaigns.find(c => c.campaign === activeCampaign);
  const prospects = useMemo(
    () => (data?.prospects ?? []).filter(p => !activeCampaign || p.campaign === activeCampaign),
    [data, activeCampaign],
  );
  const hasAnySends = campaigns.some(c => c.sent > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Outreach Report</h1>
        <p className="text-sm text-muted-foreground">
          Cold-email campaign tracking — sent, demo-link opens, and demo depth per prospect.
          "Opened" means they opened their personal demo link (verified on our server); email opens are
          not tracked because Apple and Gmail prefetch makes them unreliable.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading outreach report…</p>}
      {error && <p className="text-sm text-destructive">The outreach report could not be loaded. Please try again.</p>}

      {data && !hasAnySends && (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
          <Send className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">No outreach sends recorded yet</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            When the first cold-email wave goes out, every send is recorded and this page fills in:
            who opened their demo link, who started the demo, and how long they stayed with Aspen.
            {campaigns.length > 0 && " Invite links already exist, so opens below are live data."}
          </p>
        </div>
      )}

      {data && campaigns.length > 0 && (
        <>
          {campaigns.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {campaigns.map(c => (
                <button
                  key={c.campaign}
                  onClick={() => setSelectedCampaign(c.campaign)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${c.campaign === activeCampaign ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
                >
                  {c.campaign}
                </button>
              ))}
            </div>
          )}

          {rollup && <CampaignCards rollup={rollup} />}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Prospects</h2>
              <p className="text-xs text-muted-foreground">Deepest milestone is the furthest step their demo visit reached.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-2 font-medium">Business</th>
                    <th className="px-4 py-2 font-medium">Step</th>
                    <th className="px-4 py-2 font-medium">Link opens</th>
                    <th className="px-4 py-2 font-medium">First opened</th>
                    <th className="px-4 py-2 font-medium">Demo started</th>
                    <th className="px-4 py-2 font-medium">Demo minutes</th>
                    <th className="px-4 py-2 font-medium">Deepest milestone</th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map(p => (
                    <tr key={p.leadId} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-foreground">{p.businessName}</p>
                        <p className="text-xs text-muted-foreground">{p.contactName}{p.email ? ` · ${p.email}` : ""}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.stepReached ? `Email ${p.stepReached}` : "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.opens}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(p.firstOpenedAt)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.demoFinished ? "Finished" : p.demoStarted ? "Started" : "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.demoMinutes > 0 ? p.demoMinutes : "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.deepestMilestone ? (MILESTONE_LABELS[p.deepestMilestone] ?? p.deepestMilestone) : "—"}</td>
                    </tr>
                  ))}
                  {prospects.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No prospects in this campaign yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OutreachReportView;
