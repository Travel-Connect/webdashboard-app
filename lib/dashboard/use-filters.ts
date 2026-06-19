"use client";

/* ============================================================
   use-filters.ts — dashboard filter state in URL searchParams.
   Single source of truth for facilityId/year/month/period/taxMode/compareWith.
   ============================================================ */

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  CompareWith,
  DashboardFilters,
  Period,
  TaxMode,
} from "@/lib/api/types";

export const FILTER_DEFAULTS = {
  facilityId: "all" as string,
  year: 2025,
  period: "yearly" as Period,
  taxMode: "gross" as TaxMode,
} as const;

const PERIODS: readonly Period[] = ["monthly", "yearly"];
const TAX_MODES: readonly TaxMode[] = ["gross", "net"];
const COMPARE: readonly CompareWith[] = [
  "previous_year",
  "budget",
  "previous_snapshot",
];

/** Parse a URLSearchParams-like object into a typed DashboardFilters. */
export function parseFilters(
  sp: URLSearchParams | ReadonlyURLSearchParamsLike,
): DashboardFilters {
  const get = (k: string) => sp.get(k) ?? undefined;

  const yearRaw = Number(get("year"));
  const year = Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : FILTER_DEFAULTS.year;

  const monthRaw = Number(get("month"));
  const month =
    Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : undefined;

  const periodRaw = get("period") as Period | undefined;
  const period = periodRaw && PERIODS.includes(periodRaw) ? periodRaw : FILTER_DEFAULTS.period;

  const taxRaw = get("taxMode") as TaxMode | undefined;
  const taxMode = taxRaw && TAX_MODES.includes(taxRaw) ? taxRaw : FILTER_DEFAULTS.taxMode;

  const cmpRaw = get("compareWith") as CompareWith | undefined;
  const compareWith = cmpRaw && COMPARE.includes(cmpRaw) ? cmpRaw : undefined;

  return {
    facilityId: get("facilityId") ?? FILTER_DEFAULTS.facilityId,
    year,
    month,
    period,
    taxMode,
    compareWith,
  };
}

type ReadonlyURLSearchParamsLike = { get(name: string): string | null };

export type FilterPatch = Partial<DashboardFilters>;

export interface UseFiltersResult {
  filters: DashboardFilters;
  /** Merge a patch into current filters and push to the URL. */
  setFilters: (patch: FilterPatch) => void;
  /** Reset all filters to defaults. */
  reset: () => void;
}

/**
 * Read/write the dashboard filters from the URL searchParams.
 * Writes use router.replace (no history spam) with scroll preserved.
 */
export function useFilters(): UseFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const setFilters = useCallback(
    (patch: FilterPatch) => {
      const next: DashboardFilters = { ...filters, ...patch };
      const params = new URLSearchParams();
      params.set("facilityId", next.facilityId);
      params.set("year", String(next.year));
      params.set("period", next.period);
      params.set("taxMode", next.taxMode);
      if (next.month != null) params.set("month", String(next.month));
      if (next.compareWith) params.set("compareWith", next.compareWith);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [filters, pathname, router],
  );

  const reset = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return { filters, setFilters, reset };
}

/** Build a query string from a DashboardFilters (used by the API client). */
export function filtersToQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  params.set("facilityId", filters.facilityId);
  params.set("year", String(filters.year));
  params.set("period", filters.period);
  params.set("taxMode", filters.taxMode);
  if (filters.month != null) params.set("month", String(filters.month));
  if (filters.compareWith) params.set("compareWith", filters.compareWith);
  return params.toString();
}
