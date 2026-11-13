import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Save, FolderOpen, Trash2, X, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MultiSelectFilter, { type SelectOption } from "@/components/crm/filters/MultiSelectFilter";
import { campaignOptionLabel } from "@/lib/campaignIds";

export interface Filters {
  temperature: string;
  hasWebsite: string;
  minScore: number;
  status: string;
  previewType: string[];
  phoneType: string[];
  niche: string[];
  campaign: string[];
  city: string[];
  state: string[];
  hasEmail: string[];
  smsCapable: string[];
  analyzed: string;
}

interface LegacyFilters
  extends Omit<
    Partial<Filters>,
    "previewType" | "phoneType" | "niche" | "campaign" | "city" | "state" | "hasEmail" | "smsCapable"
  > {
  previewType?: string | string[];
  phoneType?: string | string[];
  niche?: string | string[];
  campaign?: string | string[];
  city?: string | string[];
  state?: string | string[];
  hasEmail?: string | string[];
  smsCapable?: string | string[];
}

const normalizeMultiValue = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string" && value !== "all" && value.trim().length > 0) {
    return [value];
  }

  return [];
};

export const DEFAULT_FILTERS: Filters = {
  temperature: "all",
  hasWebsite: "all",
  minScore: 0,
  status: "all",
  previewType: [],
  phoneType: [],
  niche: [],
  campaign: [],
  city: [],
  state: [],
  hasEmail: [],
  smsCapable: [],
  analyzed: "all",
};

export const normalizeFilters = (filters?: LegacyFilters | null): Filters => {
  const source = filters ?? {};

  return {
    temperature: typeof source.temperature === "string" ? source.temperature : DEFAULT_FILTERS.temperature,
    hasWebsite: typeof source.hasWebsite === "string" ? source.hasWebsite : DEFAULT_FILTERS.hasWebsite,
    minScore: typeof source.minScore === "number" ? source.minScore : DEFAULT_FILTERS.minScore,
    status: typeof source.status === "string" ? source.status : DEFAULT_FILTERS.status,
    previewType: normalizeMultiValue(source.previewType),
    phoneType: normalizeMultiValue(source.phoneType),
    niche: normalizeMultiValue(source.niche),
    campaign: normalizeMultiValue(source.campaign),
    city: normalizeMultiValue(source.city),
    state: normalizeMultiValue(source.state),
    hasEmail: normalizeMultiValue(source.hasEmail),
    smsCapable: normalizeMultiValue(source.smsCapable),
    analyzed: typeof source.analyzed === "string" ? source.analyzed : DEFAULT_FILTERS.analyzed,
  };
};

interface SavedPreset {
  name: string;
  filters: LegacyFilters;
  createdAt: string;
}

const PRESETS_KEY = "crm_filter_presets";

function loadPresets(): SavedPreset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePresets(presets: SavedPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

const PHONE_TYPE_OPTIONS: SelectOption[] = [
  { value: "mobile", label: "Mobile" },
  { value: "landline", label: "Landline" },
  { value: "voip", label: "VoIP" },
];

const PREVIEW_OPTIONS: SelectOption[] = [
  { value: "iframe", label: "iFrame" },
  { value: "screenshot", label: "Screenshot" },
  { value: "http", label: "HTTP" },
  { value: "none", label: "None" },
];

const EMAIL_OPTIONS: SelectOption[] = [
  { value: "yes", label: "Has Email" },
  { value: "no", label: "No Email" },
];

const SMS_OPTIONS: SelectOption[] = [
  { value: "yes", label: "SMS OK" },
  { value: "no", label: "No SMS" },
  { value: "unknown", label: "Unknown" },
];

const toSelectOptions = (values: string[]): SelectOption[] =>
  values.map((value) => ({ value, label: value }));

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  onApply: () => void;
  niches?: string[];
  campaigns?: string[];
  cities?: string[];
  states?: string[];
}

const CRMFilters = ({
  filters,
  onChange,
  onApply,
  niches = [],
  campaigns = [],
  cities = [],
  states = [],
}: Props) => {
  const [presets, setPresets] = useState<SavedPreset[]>(loadPresets);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    savePresets(presets);
  }, [presets]);

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const handleSavePreset = () => {
    if (!saveName.trim()) return;
    const preset: SavedPreset = {
      name: saveName.trim(),
      filters: { ...filters },
      createdAt: new Date().toISOString(),
    };
    setPresets((prev) => [...prev, preset]);
    setSaveName("");
    setShowSave(false);
  };

  const handleLoadPreset = (preset: SavedPreset) => {
    onChange(normalizeFilters(preset.filters));
  };

  const handleDeletePreset = (idx: number, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setPresets((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleReset = () => onChange({ ...DEFAULT_FILTERS });

  const multiSelectOptionCounts = useMemo<Partial<Record<keyof Filters, number>>>(
    () => ({
      previewType: PREVIEW_OPTIONS.length,
      phoneType: PHONE_TYPE_OPTIONS.length,
      niche: niches.length,
      campaign: campaigns.length,
      city: cities.length,
      state: states.length,
      hasEmail: EMAIL_OPTIONS.length,
      smsCapable: SMS_OPTIONS.length,
    }),
    [campaigns.length, cities.length, niches.length, states.length],
  );

  const activeCount = Object.entries(filters).filter(([k, v]) => {
    if (Array.isArray(v)) {
      const totalOptions = multiSelectOptionCounts[k as keyof Filters];
      return v.length > 0 && (!totalOptions || v.length < totalOptions);
    }

    const def = DEFAULT_FILTERS[k as keyof Filters];
    return v !== def;
  }).length;

  const selectClass =
    "w-full px-2 py-1 rounded bg-secondary border border-border text-xs text-foreground focus:outline-none focus:border-primary/50";

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2">
      {/* Save / Load / Reset bar - single compact row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">
          Filters{activeCount > 0 && <span className="text-primary ml-1">({activeCount} active)</span>}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeCount > 0 && (
            <button onClick={handleReset} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <X className="w-2.5 h-2.5" /> Reset
            </button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 px-2 py-1 rounded bg-secondary border border-border text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                <FolderOpen className="w-3 h-3" /> Load ({presets.length})
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              {presets.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">No saved presets yet</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {presets.map((p, i) => (
                    <div key={i} className="group flex items-center gap-1 rounded transition-colors hover:bg-secondary">
                      <button type="button" onClick={() => handleLoadPreset(p)} className="flex-1 px-2 py-1.5 text-left">
                        <p className="text-xs font-medium text-foreground">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</p>
                      </button>
                      <button type="button" onClick={(e) => handleDeletePreset(i, e)} className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground">
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
          {showSave ? (
            <div className="flex items-center gap-1">
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSavePreset()} placeholder="Preset name..." className="px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px] text-foreground w-24 focus:outline-none focus:border-primary/50" autoFocus />
              <button onClick={handleSavePreset} disabled={!saveName.trim()} className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium disabled:opacity-50">Save</button>
              <button onClick={() => setShowSave(false)} className="p-0.5 text-muted-foreground hover:text-foreground"><X className="w-2.5 h-2.5" /></button>
            </div>
          ) : (
            <button onClick={() => setShowSave(true)} className="flex items-center gap-1 px-2 py-1 rounded bg-primary/20 border border-primary/30 text-[10px] text-primary font-medium hover:bg-primary/30 transition-colors">
              <Save className="w-3 h-3" /> Save
            </button>
          )}
        </div>
      </div>

      {/* All filters in a dense grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 items-end">
        <MultiSelectFilter label="Niche" options={toSelectOptions(niches)} selected={filters.niche} onChange={(v) => update("niche", v)} placeholder="All Niches" />
        <MultiSelectFilter label="Campaign" options={campaigns.map((value) => ({ value, label: campaignOptionLabel(value) }))} selected={filters.campaign} onChange={(v) => update("campaign", v)} placeholder="All Campaigns" />
        <MultiSelectFilter label="City" options={toSelectOptions(cities)} selected={filters.city} onChange={(v) => update("city", v)} placeholder="All Cities" />
        <MultiSelectFilter label="State" options={toSelectOptions(states)} selected={filters.state} onChange={(v) => update("state", v)} placeholder="All States" />
        <MultiSelectFilter label="Phone Type" options={PHONE_TYPE_OPTIONS} selected={filters.phoneType} onChange={(v) => update("phoneType", v)} placeholder="All Types" />
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Temperature</label>
          <select value={filters.temperature} onChange={(e) => update("temperature", e.target.value)} className={selectClass}>
            <option value="all">All</option>
            <option value="hot">🔥 Hot</option>
            <option value="warm">🌡️ Warm</option>
            <option value="cold">❄️ Cold</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Website</label>
          <select value={filters.hasWebsite} onChange={(e) => update("hasWebsite", e.target.value)} className={selectClass}>
            <option value="all">All</option>
            <option value="yes">Has Website</option>
            <option value="no">No Website</option>
          </select>
        </div>
        <MultiSelectFilter label="Has Email" options={EMAIL_OPTIONS} selected={filters.hasEmail} onChange={(v) => update("hasEmail", v)} placeholder="All" />
        <MultiSelectFilter label="SMS Capable" options={SMS_OPTIONS} selected={filters.smsCapable} onChange={(v) => update("smsCapable", v)} placeholder="All" />
        <MultiSelectFilter label="Preview" options={PREVIEW_OPTIONS} selected={filters.previewType} onChange={(v) => update("previewType", v)} placeholder="All Preview" />
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">AI Analyzed</label>
          <select value={filters.analyzed} onChange={(e) => update("analyzed", e.target.value)} className={selectClass}>
            <option value="all">All</option>
            <option value="yes">✓ Analyzed</option>
            <option value="no">Not Analyzed</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Status</label>
          <select value={filters.status} onChange={(e) => update("status", e.target.value)} className={selectClass}>
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="demo_sent">Demo Sent</option>
            <option value="interested">Interested</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Min Score</label>
          <div className="flex items-center gap-1">
            <input type="range" min={0} max={100} step={5} value={filters.minScore} onChange={(e) => update("minScore", Number(e.target.value))} className="accent-primary w-16" />
            <span className="text-[10px] font-mono text-muted-foreground w-6">{filters.minScore}</span>
          </div>
        </div>
        {/* Apply button inline with filters */}
        <div className="flex items-end">
          <button onClick={onApply} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm w-full justify-center">
            <Search className="w-3.5 h-3.5" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default CRMFilters;
