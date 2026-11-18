// Reseller retail pricing (design 2026-11-18 §12.3, Phase 2.5).
//
// What the reseller sees here: HIS wholesale cost per service (the
// tenant price view of his effective rate card — never the platform's
// cost column, never a vendor name), and his own retail strategy per
// service: a % markup, a flat price, or cost + a fixed add-on. The
// recommendation (100% markup) pre-fills every line he has not set.
// Below the editor, a read-only preview renders exactly what his
// customers see: his retail prices under HIS brand, in the currency
// he picked. Settlement copy is explicit and constant: he always
// settles with the platform in US dollars.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TenantPriceLine } from "@/lib/rateCard";
import {
  RECOMMENDED_MARKUP_PCT,
  defaultRetailSetting,
  retailPriceUsd,
  type RetailLineSetting,
  type RetailMode,
} from "@/lib/retailPricing";
import { CURRENCIES, convertFromUsd, formatMoney, type EffectiveRate } from "@/lib/currency";
import type { OrgBranding } from "@/lib/clients";

const UNIT_LABELS: Record<string, string> = {
  minute: "per minute",
  creation: "per creation",
  scan: "per scan",
  per_1000: "per 1,000",
  segment: "per segment",
  number_month: "per number / month",
  message: "per message",
  prospect: "per prospect",
};

interface RetailPayload {
  organizationId: string;
  wholesale: TenantPriceLine[];
  retail: Record<string, RetailLineSetting>;
  customerCurrency: string;
  currencies: EffectiveRate[];
}

interface DraftLine {
  mode: RetailMode;
  markupPct: string;
  flatUsd: string;
  addonUsd: string;
}

const draftOf = (setting: RetailLineSetting | undefined): DraftLine => ({
  mode: setting?.mode ?? "markup",
  markupPct: String(setting?.markupPct ?? RECOMMENDED_MARKUP_PCT),
  flatUsd: setting?.flatUsd != null ? String(setting.flatUsd) : "",
  addonUsd: setting?.addonUsd != null ? String(setting.addonUsd) : "",
});

const parseDraft = (d: DraftLine): RetailLineSetting => ({
  mode: d.mode,
  markupPct: Math.max(0, Number(d.markupPct) || 0),
  flatUsd: Math.max(0, Number(d.flatUsd) || 0),
  addonUsd: Math.max(0, Number(d.addonUsd) || 0),
});

export default function ResellerPricing({
  organizationId,
  branding,
  organizationName,
}: {
  organizationId: string;
  branding: OrgBranding;
  organizationName: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, DraftLine>>({});
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["reseller-retail", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("voice-agents", {
        body: { action: "resellerRetail", organizationId },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as RetailPayload;
    },
  });

  useEffect(() => {
    if (!data) return;
    const next: Record<string, DraftLine> = {};
    for (const line of data.wholesale) next[line.key] = draftOf(data.retail[line.key]);
    setDrafts(next);
    setCurrency(data.customerCurrency || "USD");
  }, [data]);

  const rate = useMemo(
    () => data?.currencies.find((c) => c.code === currency) ?? null,
    [data, currency],
  );

  const retailUsd = (line: TenantPriceLine): number => {
    const draft = drafts[line.key];
    if (!draft) return retailPriceUsd(line.priceUsd, defaultRetailSetting());
    return retailPriceUsd(line.priceUsd, parseDraft(draft));
  };

  const applyRecommendation = () => {
    setDrafts((prev) => {
      const next: Record<string, DraftLine> = {};
      for (const [key, d] of Object.entries(prev)) {
        next[key] = { ...d, mode: "markup", markupPct: String(RECOMMENDED_MARKUP_PCT) };
      }
      return next;
    });
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const retailPrices: Record<string, RetailLineSetting> = {};
      for (const line of data.wholesale) {
        const draft = drafts[line.key];
        if (draft) retailPrices[line.key] = parseDraft(draft);
      }
      const { data: res, error } = await supabase.functions.invoke("voice-agents", {
        body: { action: "saveResellerRetail", organizationId, retailPrices, customerCurrency: currency },
      });
      if (error) throw error;
      if ((res as { error?: string })?.error) throw new Error((res as { error: string }).error);
      toast({ title: "Selling prices saved", description: "Your customers now see these prices." });
      void queryClient.invalidateQueries({ queryKey: ["reseller-retail", organizationId] });
    } catch (e) {
      toast({
        title: "Could not save selling prices",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your prices…
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-destructive">
          {error instanceof Error ? error.message : "Your prices could not be loaded."}
        </CardContent>
      </Card>
    );
  }

  const brandName = branding.name || organizationName;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your selling prices</CardTitle>
          <CardDescription>
            Your cost is what you pay us for each service. Your selling price is what your customers
            pay you — set it per service as a percentage markup, a flat price, or your cost plus a
            fixed amount. Our recommendation is a {RECOMMENDED_MARKUP_PCT}% markup, and it is
            pre-filled on every line until you change it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="retail-currency">
                Your customers see prices in
              </label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="retail-currency" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={applyRecommendation}>
              <Sparkles className="mr-1 h-4 w-4" /> Apply the {RECOMMENDED_MARKUP_PCT}% recommendation
            </Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save selling prices
            </Button>
          </div>
          {currency !== "USD" && rate && (
            <p className="text-xs text-muted-foreground">
              Converted at 1 USD = {rate.rate} {rate.code} (rate as of {rate.asOf}
              {rate.edited ? ", set by the platform" : " — an editable default, not a live exchange rate"}).
            </p>
          )}
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            You always settle with us in US dollars (USD). The currency above only changes how your
            customers see your prices — it never changes what you owe us.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Service</th>
                  <th className="px-2 py-2 font-medium">Your cost</th>
                  <th className="px-2 py-2 font-medium">How you price it</th>
                  <th className="px-2 py-2 font-medium">Your setting</th>
                  <th className="px-2 py-2 font-medium">Your price (USD)</th>
                  <th className="px-2 py-2 font-medium">Your customer sees</th>
                </tr>
              </thead>
              <tbody>
                {data.wholesale.map((line) => {
                  const draft = drafts[line.key] ?? draftOf(undefined);
                  const price = retailUsd(line);
                  const converted = convertFromUsd(price, currency, data.currencies);
                  return (
                    <tr key={line.key} className="border-b border-border/60 align-top">
                      <td className="px-2 py-2">
                        <span className="font-medium">{line.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {UNIT_LABELS[line.unit] ?? line.unit}
                        </span>
                      </td>
                      <td className="px-2 py-2 tabular-nums">{formatMoney(line.priceUsd, "USD")}</td>
                      <td className="px-2 py-2">
                        <Select
                          value={draft.mode}
                          onValueChange={(v) =>
                            setDrafts((p) => ({ ...p, [line.key]: { ...draft, mode: v as RetailMode } }))
                          }
                        >
                          <SelectTrigger className="w-40" aria-label={`Pricing mode for ${line.label}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="markup">% markup</SelectItem>
                            <SelectItem value="flat">Flat price</SelectItem>
                            <SelectItem value="addon">Cost + add-on</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        {draft.mode === "markup" && (
                          <span className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              className="w-24"
                              aria-label={`Markup percent for ${line.label}`}
                              value={draft.markupPct}
                              onChange={(e) =>
                                setDrafts((p) => ({ ...p, [line.key]: { ...draft, markupPct: e.target.value } }))
                              }
                            />
                            <span className="text-muted-foreground">%</span>
                          </span>
                        )}
                        {draft.mode === "flat" && (
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">$</span>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-24"
                              aria-label={`Flat price for ${line.label}`}
                              value={draft.flatUsd}
                              onChange={(e) =>
                                setDrafts((p) => ({ ...p, [line.key]: { ...draft, flatUsd: e.target.value } }))
                              }
                            />
                          </span>
                        )}
                        {draft.mode === "addon" && (
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">+ $</span>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-24"
                              aria-label={`Add-on for ${line.label}`}
                              value={draft.addonUsd}
                              onChange={(e) =>
                                setDrafts((p) => ({ ...p, [line.key]: { ...draft, addonUsd: e.target.value } }))
                              }
                            />
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{formatMoney(price, "USD")}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatMoney(converted, currency)}
                        <span className="block text-xs text-muted-foreground">
                          {UNIT_LABELS[line.unit] ?? line.unit}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div
            className="flex items-center gap-3 rounded-md px-3 py-2"
            style={branding.brandColor ? { backgroundColor: `${branding.brandColor}1a` } : undefined}
          >
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
            ) : null}
            <div>
              <p className="text-sm font-semibold">{brandName}</p>
              {branding.slogan ? (
                <p className="text-xs text-muted-foreground">{branding.slogan}</p>
              ) : null}
            </div>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              Customer preview
            </Badge>
          </div>
          <CardTitle className="pt-2 text-base">What your customers see</CardTitle>
          <CardDescription>
            This is your price list exactly as your customers see it — your brand, your prices, your
            currency. Your costs are never shown to them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {data.wholesale.map((line) => {
              const price = retailUsd(line);
              const converted = convertFromUsd(price, currency, data.currencies);
              return (
                <li key={line.key} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span>{line.label}</span>
                  <span className="tabular-nums font-medium">
                    {formatMoney(converted, currency)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {UNIT_LABELS[line.unit] ?? line.unit}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="pt-3 text-xs text-muted-foreground">
            Prices shown in {currency}. You always settle with us in US dollars (USD).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
