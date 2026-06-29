/* ============================================================
   metrics.ts — 国籍別分析の指標カタログ（docs/.../lib.jsx NAT_METRICS 準拠）。
   各指標は base measures（NatCell）から値を算出するため、セルでも合計でも
   同じ compute() を適用できる（ADR/同伴人数/連泊率/リードタイムは加重平均）。
   ============================================================ */

import type { NatCell } from "@/lib/api/types";
import { integer } from "@/lib/dashboard/format";

/** 国籍画面のバイオレットアクセント（NAT_VIO）。 */
export const NAT_VIO = "37,111,219";

export type NatMetricId = "rev" | "rooms" | "adr" | "ppr" | "stay" | "lt";

/** ヒートマップ: share = 列合計に対する割合(加法指標) / max = 列内最大に対する割合(集約指標)。 */
export type NatHeat = "share" | "max";

export interface NatMetric {
  id: NatMetricId;
  label: string;
  /** base measures から指標値を算出（単一セルでも合計でも可）。 */
  compute: (c: NatCell) => number;
  /** 表示フォーマット。 */
  fmt: (v: number) => string;
  heat: NatHeat;
}

const dec2v = (v: number): string => v.toFixed(2);
const pct2v = (v: number): string => v.toFixed(2) + "%";

export const NAT_METRICS: NatMetric[] = [
  { id: "rev", label: "売上", compute: (c) => c.rev, fmt: integer, heat: "share" },
  { id: "rooms", label: "販売室数", compute: (c) => c.rooms, fmt: integer, heat: "share" },
  { id: "adr", label: "ADR", compute: (c) => (c.rooms ? c.rev / c.rooms : 0), fmt: integer, heat: "max" },
  { id: "ppr", label: "同伴人数", compute: (c) => (c.rooms ? c.guests / c.rooms : 0), fmt: dec2v, heat: "max" },
  { id: "stay", label: "連泊率", compute: (c) => (c.resv ? (c.multi / c.resv) * 100 : 0), fmt: pct2v, heat: "max" },
  { id: "lt", label: "リードタイム", compute: (c) => (c.ltCount ? c.ltTotal / c.ltCount : 0), fmt: dec2v, heat: "max" },
];

/** Two-decimal number (or "—"). */
export const dec2 = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? "—" : n.toFixed(2);
