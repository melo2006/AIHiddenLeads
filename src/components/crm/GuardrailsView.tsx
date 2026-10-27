import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2, RefreshCw, DollarSign, PhoneOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Guardrails = {
  id: string;
  enabled: boolean;
  max_call_seconds: number;
  max_calls_per_visitor_per_day: number;
  max_calls_per_day_total: number;
  estimated_cost_per_minute: number;
};

type Attempt = {
  id: string;
  created_at: string;
  business_name: string | null;
  visitor_key: string | null;
  allowed: boolean;
  blocked_reason: string | null;
};

export default function GuardrailsView() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Guardrails | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);

    const [settingsRes, attemptsRes] = await Promise.all([
      supabase.from("voice_guardrails").select("*").order("created_at").limit(1).maybeSingle(),
      supabase.from("demo_call_attempts").select("*").order("created_at", { ascending: false }).limit(30),
    ]);

    if (settingsRes.data) setSettings(settingsRes.data as Guardrails);
    setAttempts((attemptsRes.data as Attempt[]) || []);

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("voice_guardrails")
      .update({
        enabled: settings.enabled,
        max_call_seconds: settings.max_call_seconds,
        max_calls_per_visitor_per_day: settings.max_calls_per_visitor_per_day,
        max_calls_per_day_total: settings.max_calls_per_day_total,
      })
      .eq("id", settings.id);
    setSaving(false);
    toast({
      title: error ? "Could not save" : "Guardrails saved",
      description: error ? error.message : "New limits apply to the next demo call.",
      variant: error ? "destructive" : undefined,
    });
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div id="limits" className="space-y-4 scroll-mt-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Limits
          </h2>
          <p className="text-xs text-muted-foreground">Cap call length and daily calls to control voice spend.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {settings && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <p className="text-xs font-medium">Guardrails enabled</p>
                <p className="text-[10px] text-muted-foreground">Turn off to allow unlimited demo calls.</p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Max call length (seconds)</Label>
                <Input
                  type="number"
                  min={30}
                  value={settings.max_call_seconds}
                  onChange={(e) => setSettings({ ...settings, max_call_seconds: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max calls per visitor / day</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.max_calls_per_visitor_per_day}
                  onChange={(e) => setSettings({ ...settings, max_calls_per_visitor_per_day: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max calls per day (all visitors)</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.max_calls_per_day_total}
                  onChange={(e) => setSettings({ ...settings, max_calls_per_day_total: Number(e.target.value) })}
                />
              </div>
            </div>

            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save guardrails
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <PhoneOff className="h-4 w-4 text-primary" /> Recent demo call attempts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No demo call attempts recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {attempts.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-[11px]">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.business_name || "Demo call"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()} · {a.visitor_key?.slice(0, 10) || "unknown visitor"}
                    </p>
                  </div>
                  <Badge variant={a.allowed ? "secondary" : "destructive"}>
                    {a.allowed ? "allowed" : a.blocked_reason || "blocked"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
