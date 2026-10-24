import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Globe, User, Mail, Phone, MessageSquare, PhoneCall, Clock,
  ChevronDown, ChevronUp, Play, Image as ImageIcon, FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Lead = {
  id: string;
  full_name: string | null;
  business_name: string;
  email: string | null;
  phone: string | null;
  website_url: string;
  niche: string | null;
  scan_status: string;
  website_screenshot: string | null;
  brand_logo: string | null;
  created_at: string;
  updated_at: string;
};

type ChatMsg = {
  id: string;
  lead_id: string | null;
  session_id: string;
  role: string;
  content: string;
  ai_interest_summary: string | null;
  created_at: string;
};

type Call = {
  id: string;
  lead_id: string | null;
  retell_call_id: string;
  business_name: string;
  caller_name: string | null;
  caller_email: string | null;
  caller_phone: string | null;
  call_status: string;
  transfer_requested: boolean;
  transfer_status: string;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  duration_seconds: number | null;
  started_at: string;
  created_at: string;
};

const formatDate = (d: string) =>
  new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

const formatDuration = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const SessionCard = ({
  lead, chats, calls,
}: {
  lead: Lead;
  chats: ChatMsg[];
  calls: Call[];
}) => {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const chatGroups = useMemo(() => {
    const groups = new Map<string, ChatMsg[]>();
    for (const m of chats) {
      const arr = groups.get(m.session_id) || [];
      arr.push(m);
      groups.set(m.session_id, arr);
    }
    return Array.from(groups.entries());
  }, [chats]);

  const totalDurationSec = calls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
  const lastActivity =
    [lead.updated_at, ...calls.map(c => c.created_at), ...chats.map(c => c.created_at)]
      .sort()
      .reverse()[0];

  const handleReDemo = (e: React.MouseEvent) => {
    e.stopPropagation();
    const params = new URLSearchParams({
      url: lead.website_url,
      name: lead.business_name,
      leadId: lead.id,
      returnTo: "/dashboard/sessions",
    });
    if (lead.full_name) params.set("callerName", lead.full_name);
    if (lead.email) params.set("callerEmail", lead.email);
    if (lead.phone) params.set("callerPhone", lead.phone);
    navigate(`/demo?${params.toString()}`);
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {lead.brand_logo ? (
          <img src={lead.brand_logo} alt="" className="w-10 h-10 rounded object-contain bg-muted/30 shrink-0" />
        ) : lead.website_screenshot ? (
          <img src={lead.website_screenshot} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <Globe className="h-5 w-5 text-primary" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{lead.business_name}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReDemo}
              className="h-6 px-2 text-[10px]"
              title="Re-launch demo"
            >
              <Play className="h-3 w-3 mr-1" />
              Re-demo
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {lead.full_name || "Unknown"}
            {lead.phone ? ` · ${lead.phone}` : ""}
            {lead.email ? ` · ${lead.email}` : ""}
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px] gap-1">
            <PhoneCall className="h-3 w-3" /> {calls.length}
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <MessageSquare className="h-3 w-3" /> {chats.length}
          </Badge>
          {totalDurationSec > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Clock className="h-3 w-3" /> {formatDuration(totalDurationSec)}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">{lead.scan_status}</Badge>
        </div>

        <span className="text-[11px] text-muted-foreground shrink-0 ml-2">{formatDate(lastActivity)}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
          {/* Visitor info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Visitor entered</p>
              <div className="space-y-0.5">
                {lead.full_name && <p className="flex items-center gap-1"><User className="h-3 w-3" />{lead.full_name}</p>}
                {lead.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</p>}
                {lead.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</p>}
                <p className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                    {lead.website_url}
                  </a>
                </p>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Demo session</p>
              <div className="space-y-0.5">
                <p>Niche: <span className="font-medium">{lead.niche || "general"}</span></p>
                <p>Scan: <span className="font-medium">{lead.scan_status}</span></p>
                <p>Submitted: {formatDate(lead.created_at)}</p>
                {lead.website_screenshot && (
                  <a href={lead.website_screenshot} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 text-primary hover:underline">
                    <ImageIcon className="h-3 w-3" /> View screenshot
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Voice calls */}
          {calls.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Voice calls with Aspen ({calls.length})
              </p>
              <div className="space-y-2">
                {calls.map((c) => (
                  <div key={c.id} className="rounded border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <PhoneCall className="h-3 w-3" />
                        {formatDate(c.started_at)} · {formatDuration(c.duration_seconds)} · {c.call_status}
                        {c.retell_call_id.startsWith('gemini_') && <Badge variant="outline" className="text-[10px]">Gemini</Badge>}
                      </span>
                      {c.transfer_requested && (
                        <Badge variant="outline" className="text-[10px]">
                          Transfer: {c.transfer_status.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                    {c.recording_url ? (
                      <audio controls preload="none" src={c.recording_url} className="w-full h-8" />
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">
                        {c.retell_call_id.startsWith('gemini_') ? 'Gemini audio is not recorded; transcripts require visitor consent.' : 'No recording stored — open Call History to fetch it from Retell.'}
                      </p>
                    )}
                    {c.summary && (
                      <p className="text-xs text-foreground/90"><span className="text-muted-foreground">Summary:</span> {c.summary}</p>
                    )}
                    {c.transcript && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
                          <FileText className="h-3 w-3" /> Transcript
                        </summary>
                        <pre className="mt-2 bg-background/60 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-foreground/80">
                          {c.transcript}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat interactions */}
          {chatGroups.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Chat with Aspen ({chats.length} messages, {chatGroups.length} session{chatGroups.length !== 1 ? "s" : ""})
              </p>
              <div className="space-y-2">
                {chatGroups.map(([sessionId, msgs]) => (
                  <details key={sessionId} className="rounded border border-border bg-muted/20 p-2">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground">
                      Session {sessionId.slice(0, 8)} · {msgs.length} msgs · {formatDate(msgs[0].created_at)}
                    </summary>
                    <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                      {msgs.map((m) => (
                        <div key={m.id} className="text-xs">
                          <span className={`font-medium ${m.role === "user" ? "text-primary" : "text-foreground/70"}`}>
                            {m.role}:
                          </span>{" "}
                          <span className="text-foreground/80">{m.content}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {calls.length === 0 && chats.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              Visitor submitted the demo form but did not chat or talk to Aspen.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const DemoSessionsView = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["demo-sessions"],
    queryFn: async () => {
      const { data: leads, error: leadsErr } = await supabase
        .from("leads")
        .select("id, full_name, business_name, email, phone, website_url, niche, scan_status, website_screenshot, brand_logo, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (leadsErr) throw leadsErr;

      const leadIds = (leads || []).map((l) => l.id);
      if (leadIds.length === 0) return { leads: [], chatsByLead: new Map(), callsByLead: new Map() };

      const [chatsRes, callsRes] = await Promise.all([
        supabase
          .from("demo_chat_interactions")
          .select("id, lead_id, session_id, role, content, ai_interest_summary, created_at")
          .in("lead_id", leadIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("call_history")
          .select("id, lead_id, retell_call_id, business_name, caller_name, caller_email, caller_phone, call_status, transfer_requested, transfer_status, summary, transcript, recording_url, duration_seconds, started_at, created_at")
          .in("lead_id", leadIds)
          .order("created_at", { ascending: false }),
      ]);
      if (chatsRes.error) throw chatsRes.error;
      if (callsRes.error) throw callsRes.error;

      const chatsByLead = new Map<string, ChatMsg[]>();
      for (const c of (chatsRes.data || []) as ChatMsg[]) {
        if (!c.lead_id) continue;
        const arr = chatsByLead.get(c.lead_id) || [];
        arr.push(c);
        chatsByLead.set(c.lead_id, arr);
      }
      const callsByLead = new Map<string, Call[]>();
      for (const c of (callsRes.data || []) as Call[]) {
        if (!c.lead_id) continue;
        const arr = callsByLead.get(c.lead_id) || [];
        arr.push(c);
        callsByLead.set(c.lead_id, arr);
      }

      return { leads: leads as Lead[], chatsByLead, callsByLead };
    },
  });

  const totalSessions = data?.leads.length || 0;
  const totalCalls = data ? Array.from(data.callsByLead.values()).reduce((a, b) => a + b.length, 0) : 0;
  const totalChats = data ? Array.from(data.chatsByLead.values()).reduce((a, b) => a + b.length, 0) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Demo Sessions</h2>
        <p className="text-xs text-muted-foreground">
          Every visitor that submitted a demo form, with their chat and voice activity.
          {" "}{totalSessions} session{totalSessions !== 1 ? "s" : ""} · {totalCalls} call{totalCalls !== 1 ? "s" : ""} · {totalChats} chat msg{totalChats !== 1 ? "s" : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading demo sessions...</div>
      ) : !data?.leads.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No demo sessions yet.</div>
      ) : (
        <div className="space-y-2">
          {data.leads.map((lead) => (
            <SessionCard
              key={lead.id}
              lead={lead}
              chats={data.chatsByLead.get(lead.id) || []}
              calls={data.callsByLead.get(lead.id) || []}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DemoSessionsView;
