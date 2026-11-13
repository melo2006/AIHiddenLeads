import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Prospect } from "./useProspectSearch";
import type { Filters } from "@/components/crm/CRMFilters";

export type { Filters };

const QUERY_PAGE_SIZE = 1000;

const buildProspectsQuery = (filters: Filters) => {
  let query = supabase
    .from("prospects")
    .select("*")
    .order("lead_score", { ascending: false });

  if (filters.temperature !== "all") {
    query = query.eq("lead_temperature", filters.temperature);
  }
  if (filters.hasWebsite === "yes") {
    query = query.eq("has_website", true);
  } else if (filters.hasWebsite === "no") {
    query = query.eq("has_website", false);
  }
  if (filters.minScore > 0) {
    query = query.gte("lead_score", filters.minScore);
  }
  if (filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.niche.length > 0) {
    query = query.in("niche", filters.niche);
  }
  if (filters.campaign.length > 0) {
    query = query.in("campaign_id", filters.campaign);
  }
  if (filters.city.length > 0) {
    query = query.in("city", filters.city);
  }
  if (filters.state.length > 0) {
    query = query.in("state", filters.state);
  }
  if (filters.phoneType.length > 0) {
    query = query.in("phone_type", filters.phoneType);
  }
  if (filters.analyzed === "yes") {
    query = query.eq("ai_analyzed", true);
  } else if (filters.analyzed === "no") {
    query = query.or("ai_analyzed.eq.false,ai_analyzed.is.null");
  }

  return query;
};

const fetchAllProspects = async (filters: Filters) => {
  const prospects: Prospect[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildProspectsQuery(filters).range(from, from + QUERY_PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data || []) as unknown as Prospect[];
    prospects.push(...batch);

    if (batch.length < QUERY_PAGE_SIZE) break;
    from += QUERY_PAGE_SIZE;
  }

  return prospects;
};

const fetchDistinctFilterValues = async (column: "niche" | "campaign_id" | "city" | "state") => {
  const values = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("prospects")
      .select(column)
      .not(column, "is", null)
      .range(from, from + QUERY_PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data || []) as Array<Record<typeof column, string | null>>;
    batch.forEach((row) => {
      const value = row[column];
      if (typeof value === "string" && value.trim().length > 0) {
        values.add(value.trim());
      }
    });

    if (batch.length < QUERY_PAGE_SIZE) break;
    from += QUERY_PAGE_SIZE;
  }

  return [...values].sort((a, b) => a.localeCompare(b));
};

export const useProspects = (filters: Filters) => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["prospects", filters],
    queryFn: () => fetchAllProspects(filters),
  });

  return { prospects: data || [], isLoading, refetch };
};

// Hook to get distinct filter options (dynamic from DB)
export const useFilterOptions = () => {
  const { data } = useQuery({
    queryKey: ["filter-options"],
    queryFn: async () => {
      const [nicheRes, campaignRes, cityRes, stateRes] = await Promise.all([
        fetchDistinctFilterValues("niche"),
        fetchDistinctFilterValues("campaign_id"),
        fetchDistinctFilterValues("city"),
        fetchDistinctFilterValues("state"),
      ]);

      return {
        niches: nicheRes,
        campaigns: campaignRes,
        cities: cityRes,
        states: stateRes,
      };
    },
    staleTime: 30000, // refresh every 30s so new scrapes show up
  });

  return { niches: data?.niches || [], campaigns: data?.campaigns || [], cities: data?.cities || [], states: data?.states || [] };
};
