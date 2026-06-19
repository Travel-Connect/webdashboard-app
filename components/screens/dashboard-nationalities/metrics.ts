/* ============================================================
   metrics.ts — metric catalogue for 国籍別分析.
   Mirrors NAT_METRICS in docs/.../lib.jsx but bound to the live
   NationalityRow fields (the live API has no month dimension, so
   the prototype's country×month cross-tab collapses to one column
   per metric over the country dimension).
   ============================================================ */

import type { NationalityRow } from "@/lib/api/types";
import { integer, percent, yen } from "@/lib/dashboard/format";

/** Violet accent used by the prototype's nationality screen (NAT_VIO). */
export const NAT_VIO = "37,111,219";

export type NatMetricId =
  | "rev"
  | "rooms"
  | "guests"
  | "adr"
  | "ppr"
  | "stay"
  | "lt"
  | "rsv";

export interface NatMetric {
  id: NatMetricId;
  label: string;
  /** Pull the raw numeric value off a row (null when not computable). */
  value: (r: NationalityRow) => number | null;
  /** Format a value for display. */
  fmt: (v: number | null) => string;
  /** Whether the metric is additive across rows (sum) or intensive (weighted/—). */
  additive: boolean;
  /** Tax-adjustable money metric (gross→net handled server-side; flag for label only). */
  money?: boolean;
}

export const NAT_METRICS: NatMetric[] = [
  { id: "rev", label: "売上", value: (r) => r.revenue, fmt: yen, additive: true, money: true },
  { id: "rooms", label: "販売室数", value: (r) => r.soldRoomNights, fmt: integer, additive: true },
  { id: "guests", label: "宿泊人数", value: (r) => r.guestCount, fmt: integer, additive: true },
  { id: "rsv", label: "予約数", value: (r) => r.reservationCount, fmt: integer, additive: true },
  { id: "adr", label: "ADR", value: (r) => r.adr, fmt: (v) => yen(v), additive: false, money: true },
  { id: "ppr", label: "同伴人数", value: (r) => r.avgGuestsPerRoom, fmt: (v) => dec2(v), additive: false },
  { id: "stay", label: "連泊率", value: (r) => r.multiNightRate, fmt: (v) => percent(v, 2), additive: false },
  { id: "lt", label: "リードタイム", value: (r) => r.avgLeadTime, fmt: (v) => dec2(v), additive: false },
];

/** Two-decimal number (or "—"). Kept local; format.ts has no dec2. */
function dec2(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

export { dec2 };
