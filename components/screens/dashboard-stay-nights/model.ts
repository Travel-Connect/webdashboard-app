/* ============================================================
   model.ts — pivot live stay-nights rows into month × bucket grids.
   Live endpoint returns one year of rows (month × nightsBucket).
   We pivot to a fixed 5-bucket layout per month so the tables render
   faithfully to the Excel prototype (販売室数 / 売上 / ADR / 同伴係数).

   ADR / 同伴係数 は「予約単位セル丸め値の加重平均」で算出する（Excel の
   泊数分布(NEW) の SUMPRODUCT 式）。API が返す加重和 adrWeightedNum
   (= Σ round(宿泊費/室泊) × 室泊, 税表示反映済) / compWeightedNum
   (= Σ round(人数/予約,2) × 予約件数) を、室泊数 / 予約件数 で割る。
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
  /** per-bucket ADR 加重和: Σ(セル丸めADR × 室泊数)（税表示反映済）。（未使用） */
  adrWNum: number[];
  /** per-bucket 同伴係数 加重和: Σ(セル丸め同伴係数 × 予約件数)。（未使用） */
  compWNum: number[];
  /** per-bucket 占有母数 販売室数（実室泊）。ADR/同伴係数 の分母 */
  occSold: number[];
  /** per-bucket 占有母数 宿泊人数（全行）。同伴係数 の分子 */
  occGuest: number[];
  /** per-bucket 占有母数 売上（税表示反映済）。ADR の分子 */
  occRev: number[];
  /** per-bucket ADR (occRev / occSold), null when no rooms */
  adr: (number | null)[];
  /** per-bucket guest factor (occGuest / occSold), null when no rooms */
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
      adrWNum: emptyBuckets(),
      compWNum: emptyBuckets(),
      occSold: emptyBuckets(),
      occGuest: emptyBuckets(),
      occRev: emptyBuckets(),
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
    row.adrWNum[bi] += r.adrWeightedNum;
    row.compWNum[bi] += r.compWeightedNum;
    row.occSold[bi] += r.occSoldRoomNights;
    row.occGuest[bi] += r.occGuestCount;
    row.occRev[bi] += r.occRevenue;
  }
  // per-bucket ADR / 同伴係数 を占有母数で確定（稼働分析と同基準: Σ占有売上 or Σ宿泊人数 / Σ販売室数）
  for (const row of byMonth.values()) {
    for (let i = 0; i < 5; i++) {
      row.adr[i] = row.occSold[i] > 0 ? row.occRev[i] / row.occSold[i] : null;
      row.comp[i] = row.occSold[i] > 0 ? row.occGuest[i] / row.occSold[i] : null;
    }
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
export function columnTotals(
  rows: MonthRow[],
  field: "rooms" | "revenue" | "resv" | "guests" | "adrWNum" | "compWNum" | "occSold" | "occGuest" | "occRev",
): number[] {
  const out = emptyBuckets();
  for (const r of rows) {
    for (let i = 0; i < 5; i++) out[i] += r[field][i];
  }
  return out;
}

/** ADR per bucket column = Σ占有売上 / Σ販売室数（稼働分析と同基準）。 */
export function adrColumnAverages(rows: MonthRow[]): (number | null)[] {
  const num = columnTotals(rows, "occRev");
  const sold = columnTotals(rows, "occSold");
  return num.map((v, i) => (sold[i] > 0 ? v / sold[i] : null));
}

/** 同伴係数 per bucket column = Σ宿泊人数 / Σ販売室数（稼働分析と同基準）。 */
export function compColumnAverages(rows: MonthRow[]): (number | null)[] {
  const num = columnTotals(rows, "occGuest");
  const sold = columnTotals(rows, "occSold");
  return num.map((v, i) => (sold[i] > 0 ? v / sold[i] : null));
}
