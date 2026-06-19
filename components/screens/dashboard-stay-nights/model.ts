/* ============================================================
   model.ts — pivot live stay-nights rows into month × bucket grids.
   Live endpoint returns one year of rows (month × nightsBucket).
   We pivot to a fixed 5-bucket layout per month so the tables render
   faithfully to the Excel prototype (販売室数 / 売上 / ADR / 同伴係数).
   ============================================================ */

import type { NightsBucket, StayNightsRow } from "@/lib/api/types";

export const STAY_BUCKETS = ["1泊", "2泊", "3-4泊", "5-6泊", "7泊以上"] as const;
export const STAY_MONTHS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
] as const;

/** Fixed bucket order matching STAY_BUCKETS (5 columns). */
export const BUCKET_KEYS: NightsBucket[] = ["1", "2", "3_4", "5_6", "7_plus"];

export interface MonthRow {
  /** 1-12 */
  month: number;
  /** per-bucket sold room nights */
  rooms: number[];
  /** per-bucket revenue */
  revenue: number[];
  /** per-bucket reservation count */
  resv: number[];
  /** per-bucket guest count */
  guests: number[];
  /** per-bucket ADR (revenue / rooms), null when no rooms */
  adr: (number | null)[];
  /** per-bucket guest factor (guests / resv), null when no resv */
  comp: (number | null)[];
}

const monthOf = (iso: string): number => {
  // iso = "YYYY-MM-DD"
  const m = Number(iso.slice(5, 7));
  return Number.isFinite(m) ? m : 0;
};

const emptyBuckets = (): number[] => [0, 0, 0, 0, 0];

/** Pivot live rows into 12 month rows × 5 buckets. */
export function pivotStayNights(rows: StayNightsRow[]): MonthRow[] {
  const byMonth = new Map<number, MonthRow>();
  for (let m = 1; m <= 12; m++) {
    byMonth.set(m, {
      month: m,
      rooms: emptyBuckets(),
      revenue: emptyBuckets(),
      resv: emptyBuckets(),
      guests: emptyBuckets(),
      adr: [null, null, null, null, null],
      comp: [null, null, null, null, null],
    });
  }
  for (const r of rows) {
    const m = monthOf(r.month);
    const row = byMonth.get(m);
    if (!row) continue;
    const bi = BUCKET_KEYS.indexOf(r.nightsBucket);
    if (bi < 0) continue;
    row.rooms[bi] += r.soldRoomNights;
    row.revenue[bi] += r.revenue;
    row.resv[bi] += r.reservationCount;
    row.guests[bi] += r.guestCount;
    row.adr[bi] = r.adr;
    row.comp[bi] = r.guestFactor;
  }
  // Only keep months that actually have data (preserve order 1..12).
  const present = new Set(rows.map((r) => monthOf(r.month)));
  const result: MonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    if (present.has(m)) result.push(byMonth.get(m)!);
  }
  return result;
}

/** Column totals across all month rows for a numeric field. */
export function columnTotals(rows: MonthRow[], field: "rooms" | "revenue" | "resv" | "guests"): number[] {
  const out = emptyBuckets();
  for (const r of rows) {
    for (let i = 0; i < 5; i++) out[i] += r[field][i];
  }
  return out;
}

/** Weighted-average ADR per bucket column = Σrevenue / Σrooms. */
export function adrColumnAverages(rows: MonthRow[]): (number | null)[] {
  const rev = columnTotals(rows, "revenue");
  const rooms = columnTotals(rows, "rooms");
  return rev.map((v, i) => (rooms[i] > 0 ? v / rooms[i] : null));
}

/** Weighted-average guest factor per bucket column = Σguests / Σresv. */
export function compColumnAverages(rows: MonthRow[]): (number | null)[] {
  const guests = columnTotals(rows, "guests");
  const resv = columnTotals(rows, "resv");
  return guests.map((v, i) => (resv[i] > 0 ? v / resv[i] : null));
}
