/* ============================================================
   metrics.ts — 部屋タイプ別分析の指標カタログ（docs/.../screens-roomtypes.jsx 準拠）。
   各指標は base measures（RtCell）から算出（セル＝合計同式）。
   ※ 消化率(occ) は部屋タイプ別の客室在庫が無いため未対応（mart に room-type 在庫なし）。
   ============================================================ */

import type { RtCell } from "@/lib/api/types";
import { integer } from "@/lib/dashboard/format";

/** 統一アクセント（primary blue, RT_TEAL）。 */
export const RT_TEAL = "37,111,219";

export type RtMetricId = "rev" | "rooms" | "adr" | "comp";
export type RtHeat = "share" | "none";

export interface RtMetric {
  id: RtMetricId;
  label: string;
  compute: (c: RtCell) => number;
  fmt: (v: number) => string;
  heat: RtHeat;
}

const dec2v = (v: number): string => v.toFixed(2);

export const RT_METRICS: RtMetric[] = [
  { id: "rev", label: "売上", compute: (c) => c.rev, fmt: integer, heat: "share" },
  { id: "rooms", label: "販売室数", compute: (c) => c.rooms, fmt: integer, heat: "share" },
  { id: "adr", label: "ADR", compute: (c) => (c.rooms ? c.rev / c.rooms : 0), fmt: integer, heat: "none" },
  { id: "comp", label: "同伴係数", compute: (c) => (c.rooms ? c.guests / c.rooms : 0), fmt: dec2v, heat: "none" },
];
