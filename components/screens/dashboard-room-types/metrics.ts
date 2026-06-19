/* ============================================================
   metrics.ts — 部屋タイプ別分析 screen-local metric definitions.

   The live /api/dashboard/room-types endpoint returns one aggregated
   RoomTypeRow per room type (no month dimension, no occupancy /
   companion coefficient). So the prototype's roomType×month cross-tab
   cannot be reproduced; instead we pivot roomType × metric over the
   metrics the API actually provides.
   ============================================================ */

import type { RoomTypeRow } from "@/lib/api/types";
import { integer, yen } from "@/lib/dashboard/format";

export type MetricUnit = "yen" | "int";

export interface RtMetric {
  id: keyof Pick<
    RoomTypeRow,
    "revenue" | "soldRoomNights" | "adr" | "guestCount" | "reservationCount"
  >;
  label: string;
  unit: MetricUnit;
  /** Heat-shade cells by within-metric share (sums to a total). */
  heat: boolean;
  /** ADR is an average, not summable -> footer shows blended avg, no heat. */
  averaged?: boolean;
}

export const RT_METRICS: RtMetric[] = [
  { id: "revenue", label: "売上", unit: "yen", heat: true },
  { id: "soldRoomNights", label: "販売室数", unit: "int", heat: true },
  { id: "adr", label: "ADR", unit: "yen", heat: false, averaged: true },
  { id: "guestCount", label: "宿泊人数", unit: "int", heat: true },
  { id: "reservationCount", label: "予約件数", unit: "int", heat: true },
];

/** Format a metric value, returning "—" for null/NaN (e.g. ADR with 0 nights). */
export function fmtMetric(v: number | null | undefined, unit: MetricUnit): string {
  if (v == null || Number.isNaN(v)) return "—";
  return unit === "yen" ? yen(v) : integer(v);
}

/** Stable color per room-type rank (mirrors the prototype's accent palette). */
export const RT_COLORS = [
  "var(--c-blue)",
  "var(--c-teal)",
  "var(--c-amber)",
  "var(--c-violet)",
  "var(--c-rose)",
  "var(--c-gray)",
];

export const colorFor = (i: number): string => RT_COLORS[i % RT_COLORS.length];
