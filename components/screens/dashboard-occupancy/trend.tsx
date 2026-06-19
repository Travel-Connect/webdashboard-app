"use client";

/* ============================================================
   trend.tsx — occupancy trend (bars = 売上, line = 稼働率%,
   dashed = 前年稼働率%). Built on the shared ComboChart.
   ============================================================ */

import { ComboChart } from "@/components/charts";
import { yenCompact } from "@/lib/dashboard/format";
import type { OccupancyRow } from "@/lib/api/types";

interface TrendDatum {
  x: string;
  rev: number;
  occ: number;
  occLY: number;
  [key: string]: number | string;
}

export interface OccTrendProps {
  rows: OccupancyRow[];
  baseline?: OccupancyRow[] | null;
  monthMode: boolean;
  height?: number;
}

export function OccTrend({ rows, baseline, monthMode, height = 240 }: OccTrendProps) {
  const base = new Map((baseline ?? []).map((b) => [key(b.date, monthMode), b]));
  const data: TrendDatum[] = rows.map((r) => {
    const ly = base.get(key(r.date, monthMode));
    const [, mm, dd] = r.date.split("-");
    return {
      x: monthMode ? `${Number(mm)}月` : `${Number(dd)}`,
      rev: r.roomRevenue,
      occ: r.occupancyRate != null ? r.occupancyRate * 100 : 0,
      occLY: ly?.occupancyRate != null ? ly.occupancyRate * 100 : 0,
    };
  });

  const hasLY = base.size > 0;

  return (
    <ComboChart<TrendDatum>
      data={data}
      xKey="x"
      barKey="rev"
      lineKey="occ"
      ly={hasLY ? "occLY" : undefined}
      height={height}
      barColor="var(--c-blue)"
      lineColor="var(--c-teal)"
      barFmt={(v) => yenCompact(v)}
      lineMax={100}
      lineUnit="%"
    />
  );
}

function key(dateIso: string, monthMode: boolean): string {
  const [, mm, dd] = dateIso.split("-");
  return monthMode ? mm : dd;
}
