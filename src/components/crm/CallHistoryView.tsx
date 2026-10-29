import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Phone, PhoneForwarded, Clock, User, Mail, Globe, ChevronDown, ChevronUp, Play, Zap, RefreshCw, MessageSquare, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ConversationRecordsView from './ConversationRecordsView';
import CallReportActions from './CallReportActions';




interface CallRecord {
  id: string;
  retell_call_id: string;
  lead_id?: string | null;
  prospect_id?: string | null;
  business_name: string;
  website_url: string | null;
  owner_name: string | null;
  owner_email: string | null;
  caller_name: string | null;
  caller_email: string | null;
  caller_phone: string | null;
  call_status: string;
  transfer_requested: boolean;
  transfer_status: string;
  trigger_source?: string;
  transfer_target_phone: string | null;
  transfer_error: string | null;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
}

interface AutoRecapMeta {
  attempted?: boolean;
  sent?: boolean;
  sid?: string | null;
  warning?: string | null;
  normalizedPhone?: string | null;
  attemptedAt?: string | null;
}

interface SmsLogRow {
  id: string;
  to_phone: string;
  body: string | null;
  status: string;
  message_sid: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string;
  delivered_at: string | null;
}



const statusColor = (status: string) => {
  switch (status) {
    case "completed": return "bg-green-500/20 text-green-400";
    case "joined": return "bg-green-500/20 text-green-400";
    case "failed": return "bg-destructive/20 text-destructive";
    case "dialing_caller": case "dialing_owner": case "awaiting_owner": return "bg-amber-500/20 text-amber-400";
    default: return "bg-muted text-muted-foreground";
  }
};

const formatDuration = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const normalizePhoneNumber = (value?: string | null) => {
  if (!value) return "";

  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (value.trim().startsWith("+")) return value.trim();
  return "";
};

const isLikelyCallablePhoneNumber = (value?: string | null) => {
  const normalized = normalizePhoneNumber(value);
  if (!/^\+\d{11,15}$/.test(normalized)) return false;

  if (!normalized.startsWith("+1")) return true;

  const digits = normalized.slice(2);
  if (digits.length !== 10) return false;

  const areaCode = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  return /^[2-9]\d{2}$/.test(areaCode) && /^[2-9]\d{2}$/.test(exchange);
};

const RecapDebugPanel = ({ call, enabled }: { call: CallRecord; enabled: boolean }) => {
  const meta = (call.metadata ?? {}) as Record<string, any>;
  const autoRecap: AutoRecapMeta = meta.autoRecap ?? {};
  const captureFailed: boolean = Boolean(meta.captureFailed);
  const captureReason: string | null = meta.captureFailedReason ?? null;
  const rawPhone = call.caller_phone;
  const normalized = normalizePhoneNumber(rawPhone);
  const isCallable = isLikelyCallablePhoneNumber(rawPhone);

  const { data: smsLogs, isLoading: smsLoading } = useQuery({
    queryKey: ["sms-debug", normalized, call.id],
    enabled: enabled && Boolean(normalized),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_delivery_log")
        .select("id,to_phone,body,status,message_sid,error_code,error_message,sent_at,delivered_at")
        .eq("to_phone", normalized)
        .order("sent_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as SmsLogRow[];
    },
  });

  let skipReason: string | null = null;
  if (!rawPhone) skipReason = "No caller phone captured during the call.";
  else if (!normalized) skipReason = `Phone "${rawPhone}" could not be normalized to E.164.`;
  else if (!isCallable) skipReason = `Phone ${normalized} failed E.164 / SMS-capable validation (bad area code or exchange).`;
  else if (autoRecap.warning && !autoRecap.sent) skipReason = autoRecap.warning;

  const statusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (["delivered", "sent", "queued", "accepted"].includes(s)) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (["failed", "undelivered"].includes(s)) return "bg-destructive/20 text-destructive border-destructive/30";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="border border-border/60 rounded-md bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">SMS / WhatsApp Debug</p>
        {autoRecap.sent ? (
          <Badge variant="outline" className="text-[9px] bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Auto-recap sent
          </Badge>
        ) : autoRecap.attempted ? (
          <Badge variant="outline" className="text-[9px] bg-destructive/20 text-destructive border-destructive/30">
            <XCircle className="h-2.5 w-2.5 mr-0.5" /> Auto-recap failed
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/30">
            Not attempted
          </Badge>
        )}
      </div>

      {captureFailed && (
        <div className="flex items-start gap-1.5 text-[11px] bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5 text-destructive">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{captureReason || "Voice agent failed to capture a valid email or phone."}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Raw phone</p>
          <p className="font-mono text-foreground/80 truncate">{rawPhone || <span className="italic text-muted-foreground">—</span>}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Normalized (E.164)</p>
          <p className="font-mono text-foreground/80 truncate flex items-center gap-1">
            {normalized || <span className="italic text-muted-foreground">invalid</span>}
            {normalized && (isCallable
              ? <CheckCircle2 className="h-3 w-3 text-green-400" />
              : <XCircle className="h-3 w-3 text-destructive" />)}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">autoRecapSent</p>
          <p className="font-mono">{String(autoRecap.sent ?? false)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">autoRecapSid</p>
          <p className="font-mono truncate">{autoRecap.sid || <span className="italic text-muted-foreground">—</span>}</p>
        </div>
      </div>

      {skipReason && !autoRecap.sent && (
        <div className="flex items-start gap-1.5 text-[11px] bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 text-amber-300">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span><span className="font-semibold">Skip reason:</span> {skipReason}</span>
        </div>
      )}

      <div>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
          Recent SMS/WhatsApp deliveries to this number
        </p>
        {!normalized ? (
          <p className="text-[11px] italic text-muted-foreground">No normalized phone to look up.</p>
        ) : smsLoading ? (
          <p className="text-[11px] italic text-muted-foreground">Loading delivery log…</p>
        ) : !smsLogs?.length ? (
          <p className="text-[11px] italic text-muted-foreground">No delivery log entries found for {normalized}.</p>
        ) : (
          <div className="space-y-1">
            {smsLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 bg-background/40 border border-border/40 rounded px-2 py-1.5">
                <Badge variant="outline" className={`text-[9px] ${statusBadge(log.status)} shrink-0`}>
                  {log.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {log.message_sid || "no-sid"} · {new Date(log.sent_at).toLocaleString()}
                  </p>
                  {log.body && (
                    <p className="text-[11px] text-foreground/70 line-clamp-2">{log.body}</p>
                  )}
                  {log.error_message && (
                    <p className="text-[10px] text-destructive">⚠ {log.error_code ? `[${log.error_code}] ` : ""}{log.error_message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CallRow = ({ call }: { call: CallRecord }) => {

  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleRefreshRecording = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("retell-web-call", {
        body: { action: "refresh-recording", callHistoryId: call.id },
      });
      if (error) throw error;
      if (data?.recordingUrl) {
        toast.success("Recording loaded");
        queryClient.invalidateQueries({ queryKey: ["call-history"] });
      } else {
        toast.info(data?.message || "Recording not yet available from Retell.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to refresh recording");
    } finally {
      setRefreshing(false);
    }
  };


  const handleRedemo = (e: React.MouseEvent) => {
    e.stopPropagation();
    const params = new URLSearchParams();
    if (call.website_url) params.set("url", call.website_url);
    params.set("name", call.business_name);

    if (call.prospect_id) params.set("prospectId", call.prospect_id);
    if (call.lead_id) params.set("leadId", call.lead_id);
    if (call.caller_name) params.set("callerName", call.caller_name);
    if (call.caller_email) params.set("callerEmail", call.caller_email);
    if (isLikelyCallablePhoneNumber(call.caller_phone)) {
      params.set("callerPhone", normalizePhoneNumber(call.caller_phone));
    }
    params.set("returnTo", "/calls");

    navigate(`/demo?${params.toString()}`);
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0">
          {call.trigger_source === 'speed_to_lead' ? (
            <Zap className="h-4 w-4 text-amber-400" />
          ) : call.transfer_requested ? (
            <PhoneForwarded className="h-4 w-4 text-primary" />
          ) : (
            <Phone className="h-4 w-4 text-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{call.business_name}</p>
            {call.retell_call_id.startsWith('gemini_') && <Badge variant="outline" className="text-[10px]">Gemini</Badge>}
            {call.website_url && (
              <button
                onClick={handleRedemo}
                title="Re-launch demo"
                className="shrink-0 flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Play className="h-3 w-3" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {call.caller_name || "Unknown caller"}
            {call.caller_phone ? ` · ${call.caller_phone}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {call.trigger_source === 'speed_to_lead' && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
              ⚡ Auto-Call
            </Badge>
          )}
          {call.transfer_requested && (
            <Badge variant="outline" className={`text-[10px] ${statusColor(call.transfer_status)}`}>
              {call.transfer_status.replace(/_/g, " ")}
            </Badge>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDuration(call.duration_seconds)}
          </div>
          <span className="text-[11px] text-muted-foreground">{formatDate(call.created_at)}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {call.retell_call_id.startsWith('gemini_') && <p className="text-xs text-muted-foreground">New agreed recordings are in Private conversation records above. Historical unsaved audio cannot be recovered. End reason: {String(call.metadata?.end_reason || 'not captured for this historical call')}.</p>}
          {call.retell_call_id.startsWith('gemini_') && <Link to="/dashboard/voice-costs" className="text-xs text-primary underline">Gemini Voice Costs — call and per-minute estimates</Link>}
          {/* Recording */}
          {!call.retell_call_id.startsWith('gemini_') && <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recording</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefreshRecording}
                disabled={refreshing}
                className="h-6 px-2 text-[10px]"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                {call.recording_url ? "Refresh" : "Fetch recording"}
              </Button>
            </div>
            {call.recording_url ? (
              <audio controls preload="none" src={call.recording_url} className="w-full h-8">
                Your browser does not support audio playback.
              </audio>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                No recording saved yet. Click "Fetch recording" to pull it from Retell (available shortly after the call ends).
              </p>
            )}
          </div>}

          {/* Summary */}
          <CallReportActions records={[call]} allowZapier />
          {call.summary && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
              <p className="text-sm text-foreground">{call.summary}</p>
            </div>
          )}


          {/* Contact details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Caller</p>
              <div className="space-y-0.5 text-xs">
                {call.caller_name && <p className="flex items-center gap-1"><User className="h-3 w-3" />{call.caller_name}</p>}
                {call.caller_phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{call.caller_phone}</p>}
                {call.caller_email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{call.caller_email}</p>}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Business Owner</p>
              <div className="space-y-0.5 text-xs">
                {call.owner_name && <p className="flex items-center gap-1"><User className="h-3 w-3" />{call.owner_name}</p>}
                {call.owner_email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{call.owner_email}</p>}
                {call.website_url && <p className="flex items-center gap-1"><Globe className="h-3 w-3" /><a href={call.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{call.website_url}</a></p>}
              </div>
            </div>
          </div>

          {/* Transfer details */}
          {call.transfer_requested && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Transfer Details</p>
              <div className="text-xs space-y-0.5">
                <p>Status: <span className="font-medium">{call.transfer_status.replace(/_/g, " ")}</span></p>
                {call.transfer_target_phone && <p>Target: {call.transfer_target_phone}</p>}
                {call.transfer_error && <p className="text-destructive">Error: {call.transfer_error}</p>}
              </div>
            </div>
          )}

          {/* SMS/WhatsApp debug */}
          <RecapDebugPanel call={call} enabled={expanded} />

          {/* Transcript */}

          {call.transcript && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Transcript</p>
              <div className="bg-muted/30 rounded-lg p-3 max-h-60 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-sans text-foreground/80">{call.transcript}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CallHistoryView = () => {
  const { data: calls, isLoading } = useQuery({
    queryKey: ["call-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as CallRecord[];
    },
  });

  const totalCalls = calls?.length || 0;
  const transferCalls = calls?.filter(c => c.transfer_requested).length || 0;

  return (
    <div className="space-y-4">
      <ConversationRecordsView />
      <div>
        <h2 className="text-lg font-bold">Call History</h2>
        <p className="text-xs text-muted-foreground">
          {totalCalls} call{totalCalls !== 1 ? "s" : ""} · {transferCalls} transfer{transferCalls !== 1 ? "s" : ""} attempted
        </p>
        <div className="mt-2"><CallReportActions records={calls ?? []} /></div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading calls...</div>
      ) : !calls?.length ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No calls recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {calls.map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
        </div>
      )}
    </div>
  );
};

export default CallHistoryView;
