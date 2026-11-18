import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { effectivePrice, type RateCardLine } from '@/lib/rateCard';
import { CURRENCIES, type EffectiveRate } from '@/lib/currency';

// Rate Card — platform admin only (design 2026-11-18 §11). Every
// metered cost center is one editable row: our cost, the charge mode
// (percentage markup or flat), and the tenant-facing price computed
// live. Tenants never see this page or the cost column — their
// consoles receive only labels + effective prices (tenantPriceView
// server-side). Per-tenant overrides live on the Tenants screen.

const UNIT_LABELS: Record<string, string> = {
  minute: 'per minute',
  creation: 'per creation',
  scan: 'per scan',
  per_1000: 'per 1,000',
  segment: 'per segment',
  number_month: 'per number / month',
  message: 'per message',
  prospect: 'per prospect',
};

const money = (v: number) => (v < 0.1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);

function LineRow({ line, onChange }: { line: RateCardLine; onChange: (next: RateCardLine) => void }) {
  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return (
    <tr className="border-b border-border">
      <td className="px-4 py-3">
        <p className="font-medium">{line.label}</p>
        <p className="text-xs text-muted-foreground">{UNIT_LABELS[line.unit] ?? line.unit}</p>
        {line.note && <p className="mt-0.5 max-w-md text-[11px] text-muted-foreground">{line.note}</p>}
      </td>
      <td className="px-4 py-3">
        <Input aria-label={`${line.label} our cost`} className="h-8 w-24 text-xs" inputMode="decimal"
          value={String(line.costUsd)} onChange={(e) => onChange({ ...line, costUsd: num(e.target.value) })} />
      </td>
      <td className="px-4 py-3">
        <select aria-label={`${line.label} charge mode`} className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          value={line.mode} onChange={(e) => onChange({ ...line, mode: e.target.value as RateCardLine['mode'] })}>
          <option value="markup">% markup</option>
          <option value="flat">Flat price</option>
        </select>
      </td>
      <td className="px-4 py-3">
        {line.mode === 'markup' ? (
          <span className="flex items-center gap-1">
            <Input aria-label={`${line.label} markup percent`} className="h-8 w-20 text-xs" inputMode="decimal"
              value={String(line.markupPct)} onChange={(e) => onChange({ ...line, markupPct: num(e.target.value) })} />
            <span className="text-xs text-muted-foreground">%</span>
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">$</span>
            <Input aria-label={`${line.label} flat price`} className="h-8 w-20 text-xs" inputMode="decimal"
              value={String(line.flatUsd)} onChange={(e) => onChange({ ...line, flatUsd: num(e.target.value) })} />
          </span>
        )}
      </td>
      <td className="px-4 py-3 font-medium">{money(effectivePrice(line))}</td>
    </tr>
  );
}

// Currency conversion table (design 2026-11-18 §12.4, Phase 2.5).
// USD is the base and the ONLY settlement currency — these rates exist
// purely so a reseller's customers can be SHOWN his retail prices in
// their own currency. They are editable defaults with an as-of date,
// never presented as a live exchange feed.
function CurrencyRatesCard() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ['currency-rates'],
    queryFn: async () => {
      const { data: d, error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'currencyRates' } });
      if (e) throw e;
      if ((d as { error?: string })?.error) throw new Error((d as { error: string }).error);
      return (d as { rates: EffectiveRate[] }).rates;
    },
  });
  useEffect(() => {
    if (data) setDrafts(Object.fromEntries(data.filter((r) => r.code !== 'USD').map((r) => [r.code, String(r.rate)])));
  }, [data]);

  const save = async () => {
    const rates: Record<string, number> = {};
    for (const [code, raw] of Object.entries(drafts)) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) { toast.error(`Rate for ${code} must be a positive number.`); return; }
      rates[code] = n;
    }
    setBusy(true);
    const { data: d, error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'saveCurrencyRates', rates } });
    setBusy(false);
    if (e || (d as { error?: string })?.error) {
      toast.error('Could not save currency rates.', { description: (d as { error?: string })?.error });
      return;
    }
    toast.success('Currency rates saved.');
    await queryClient.invalidateQueries({ queryKey: ['currency-rates'] });
  };

  if (!data) return null;
  const byCode = new Map(data.map((r) => [r.code, r]));
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-1 text-sm font-medium">Customer currency conversion</p>
      <p className="mb-3 max-w-2xl text-xs text-muted-foreground">
        Resellers always settle with us in US dollars. These rates only convert how a reseller's retail
        prices are DISPLAYED to his customers in their currency. They are editable defaults — not a live
        exchange feed — so review them from time to time.
      </p>
      <div className="space-y-2">
        {CURRENCIES.filter((c) => c.code !== 'USD').map((c) => {
          const eff = byCode.get(c.code);
          return (
            <div key={c.code} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-44">{c.name} ({c.code})</span>
              <span className="text-xs text-muted-foreground">1 USD =</span>
              <Input aria-label={`Rate for ${c.code}`} className="h-8 w-28 text-xs" inputMode="decimal"
                value={drafts[c.code] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [c.code]: e.target.value }))} />
              <span className="text-xs text-muted-foreground">
                {eff ? `rate as of ${eff.asOf}${eff.edited ? ' · edited by an admin' : ' · built-in default'}` : ''}
              </span>
            </div>
          );
        })}
      </div>
      <Button size="sm" className="mt-3" disabled={busy} onClick={() => void save()}><Save className="mr-1 h-3 w-3" /> Save currency rates</Button>
    </div>
  );
}

const RateCardView = () => {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<RateCardLine[]>([]);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['rate-card'],
    queryFn: async () => {
      const { data: d, error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'rateCard' } });
      if (e) throw e;
      return (d?.rateCard ?? []) as RateCardLine[];
    },
  });

  useEffect(() => { if (data) setLines(data); }, [data]);

  const save = async () => {
    const rateCard: Record<string, unknown> = {};
    for (const l of lines) rateCard[l.key] = { costUsd: l.costUsd, mode: l.mode, markupPct: l.markupPct, flatUsd: l.flatUsd };
    setBusy(true);
    const { data: d, error: e } = await supabase.functions.invoke('voice-agents', { body: { action: 'saveRateCard', rateCard } });
    setBusy(false);
    if (e || (d as { error?: string })?.error) {
      toast.error('Could not save the rate card.', { description: (d as { error?: string })?.error });
      return;
    }
    toast.success('Rate card saved.');
    await queryClient.invalidateQueries({ queryKey: ['rate-card'] });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Rate Card</h2>
        <p className="text-xs text-muted-foreground">
          What each metered service costs us and what tenants are charged. Per-minute lines ride a percentage markup so a
          provider price rise can't silently turn them into a loss; one-time actions are flat fees. Tenants see only their
          prices — never these costs.
        </p>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading rate card…</div>
      ) : error ? (
        <p role="alert" className="py-8 text-center text-sm text-muted-foreground">Rate card unavailable.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium">Our cost</th>
                  <th className="px-4 py-2 font-medium">Charge mode</th>
                  <th className="px-4 py-2 font-medium">Charge</th>
                  <th className="px-4 py-2 font-medium">Tenant price</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <LineRow key={line.key} line={line} onChange={(next) => setLines((ls) => ls.map((l) => (l.key === next.key ? next : l)))} />
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" disabled={busy} onClick={() => void save()}><Save className="mr-1 h-3 w-3" /> Save rate card</Button>
          <CurrencyRatesCard />
        </>
      )}
    </div>
  );
};

export default RateCardView;
