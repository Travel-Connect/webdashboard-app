"use client";

/* ============================================================
   use-overview.ts — 総合ダッシュボード /api/dashboard/overview 用フック。
   グローバルfilters(year/month/period/taxMode) + 画面ローカルの facilityIds[]。
   facilityIds は overview 専用パラメータ（既存7画面の単一 facilityId とは独立）。
   ============================================================ */

import useSWR from "swr";
import type { OverviewResponse } from "@/lib/api/types";
import { ApiError, getJson } from "@/lib/dashboard/client";

export interface OverviewFilterBase {
  year: number;
  month?: number;
  period: "monthly" | "yearly";
  taxMode: "gross" | "net";
}

/** /api/dashboard/overview?... を組み立てる。facilityIds 空＝グループ全施設。 */
export function buildOverviewUrl(f: OverviewFilterBase, facilityIds: string[]): string {
  const p = new URLSearchParams();
  p.set("year", String(f.year));
  if (f.period === "monthly" && f.month != null) p.set("month", String(f.month));
  p.set("period", f.period);
  p.set("taxMode", f.taxMode);
  if (facilityIds.length > 0) p.set("facilityIds", facilityIds.join(","));
  return `/api/dashboard/overview?${p.toString()}`;
}

export function useOverview(f: OverviewFilterBase, facilityIds: string[]) {
  const key = buildOverviewUrl(f, facilityIds);
  const { data, error, isLoading, isValidating, mutate } = useSWR<OverviewResponse, ApiError>(
    key,
    (url: string) => getJson<OverviewResponse>(url),
    { revalidateOnFocus: false, keepPreviousData: true },
  );
  return { data, error, isLoading, isValidating, mutate: () => void mutate() };
}
