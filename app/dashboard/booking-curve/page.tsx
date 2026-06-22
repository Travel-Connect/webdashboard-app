"use client";

/* ============================================================
   /dashboard/booking-curve — ブッキングカーブ（既存Excel忠実再現）
   docs/.../screens-booking.jsx を移植。指標(販売室数/売上/ADR/稼働率)切替・
   当年 vs 前年・進捗率・二軸チャート(販売室数×売上)。
   Live endpoint: /api/dashboard/booking-curve -> BookingCurveResponse.matrix
   ============================================================ */

import { type ReactNode, useState } from "react";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { integer, percent, yen, yenCompact } from "@/lib/dashboard/format";
import { Btn, EmptyState, LoadingSkeleton, Segmented } from "@/components/ui/primitives";
import { MultiLineChart } from "@/components/charts";
import { MetricTabs, useMetricTabs } from "@/components/dashboard/metric-tabs";
import { CurveTable, type CurveTableRow } from "@/components/screens/dashboard-booking-curve/curve-table";
import type { BcCell } from "@/lib/api/types";

const NAVY = "#2563EB"; // 当年
const ORANGE = "#ED7D31"; // 前年

type BcMetricId = "rooms" | "rev" | "adr" | "occ";
const BC_METRICS: { id: BcMetricId; label: string }[] = [
  { id: "rooms", label: "販売室数（泊数）" },
  { id: "rev", label: "売上" },
  { id: "adr", label: "ADR" },
  { id: "occ", label: "稼働率" },
];
const BC_IDS = BC_METRICS.map((m) => m.id);

const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--r-lg)",
  background: "var(--surface)",
  boxShadow: "var(--shadow-card)",
  overflow: "hidden",
};

function Caption({ text, sub }: { text: string; sub?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>{text}</h3>
      {sub && (
        <span style={{ fontSize: 11.5, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

const taxRev = (c: BcCell, gross: boolean) => (gross ? c.gross : c.net);
function metricValue(id: BcMetricId, c: BcCell, sellable: number, gross: boolean): number {
  if (id === "rooms") return c.rooms;
  if (id === "rev") return taxRev(c, gross);
  if (id === "adr") return c.rooms ? taxRev(c, gross) / c.rooms : 0;
  return sellable ? (c.rooms / sellable) * 100 : 0; // occ
}
function metricFmt(id: BcMetricId): (v: number) => string {
  if (id === "rev" || id === "adr") return (v) => yen(v);
  if (id === "occ") return (v) => percent(v);
  return (v) => integer(v);
}
const progress = (vals: number[]): number[] => vals.map((v) => (vals[0] ? (v / vals[0]) * 100 : 0));

export default function BookingCurvePage() {
  const { filters } = useFilters();
  const { data, error, isLoading } = useDashboardQuery("booking-curve", filters);
  const metric = useMetricTabs<BcMetricId>(BC_IDS, ["rooms"]);
  const [scope, setScope] = useState<"without" | "with">("without");

  const matrix = data?.matrix ?? null;
  const gross = filters.taxMode === "gross";
  const taxLabel = gross ? "税込" : "税抜";
  const monthly = filters.period === "monthly" && filters.month != null;
  const facName = matrix?.facName ?? (filters.facilityId === "all" ? "全施設" : "施設");

  const periodCur = monthly ? `${filters.year}/${filters.month}` : `${filters.year}年`;
  const periodPy = monthly ? `${filters.year - 1}/${filters.month}` : `${filters.year - 1}年`;
  const cancelLbl = scope === "without" ? "キャンセルを除く" : "キャンセルを含む";
  const shown = BC_METRICS.filter((m) => metric.sel.includes(m.id));
  const multi = shown.length > 1;

  const curCells = (): BcCell[] =>
    matrix ? (scope === "without" ? matrix.current.withoutCancelled : matrix.current.withCancelled) : [];
  const pyCells = (): BcCell[] =>
    matrix?.previous ? (scope === "without" ? matrix.previous.withoutCancelled : matrix.previous.withCancelled) : [];

  const Header = (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>ブッキングカーブ</h2>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {facName}
          {monthly && matrix ? ` · 室数 ${Math.round(matrix.current.sellable / daysInMonth(filters.year, filters.month!))}` : ""}
          {" · "}
          {monthly ? `${filters.year}年${filters.month}月` : `${filters.year}年`} · {taxLabel}表示
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {Header}
        <div style={card}>
          <EmptyState icon="TriangleAlert" title="データを取得できませんでした" body={error.message} />
        </div>
      </div>
    );
  }
  if ((isLoading && !data) || !matrix) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {Header}
        <div style={{ ...card, padding: 20 }}>
          <LoadingSkeleton rows={6} />
        </div>
      </div>
    );
  }

  // 指標ごとの 累計（+進捗率）テーブル
  const renderMetric = (id: BcMetricId, compact: boolean): ReactNode => {
    const M = BC_METRICS.find((m) => m.id === id)!;
    const fmt = metricFmt(id);
    const cur = curCells().map((c) => metricValue(id, c, matrix.current.sellable, gross));
    const py = pyCells().map((c) => metricValue(id, c, matrix.previous?.sellable ?? 0, gross));
    const sub = `${facName} / ${periodCur}（${M.label}）`;
    const rows: CurveTableRow[] = [
      { label: `${cancelLbl}（当年）`, period: periodCur, values: cur, dotColor: NAVY },
      { label: `${cancelLbl}（前年）`, period: periodPy, values: py, dotColor: ORANGE },
    ];
    const progRows: CurveTableRow[] = [
      { label: `${cancelLbl}（当年）`, period: periodCur, values: progress(cur), dotColor: NAVY },
      { label: `${cancelLbl}（前年）`, period: periodPy, values: progress(py), dotColor: ORANGE },
    ];
    return (
      <div key={id} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={card}>
          <Caption text="ブッキングカーブ 累計" sub={sub} />
          <div style={{ overflowX: "auto" }}>
            <CurveTable rows={rows} fmt={fmt} />
          </div>
        </div>
        {!compact && (
          <div style={card}>
            <Caption text="当日を100%とした進捗率" sub={sub} />
            <div style={{ overflowX: "auto" }}>
              <CurveTable rows={progRows} fmt={(v) => percent(v)} />
            </div>
          </div>
        )}
      </div>
    );
  };

  // 二軸チャート：販売室数（左）× 売上（右）・当年 vs 前年
  const chartSeries = [
    { label: "販売室数 当年", color: NAVY, values: curCells().map((c) => c.rooms), axis: "left" as const },
    { label: "販売室数 前年", color: NAVY, values: pyCells().map((c) => c.rooms), axis: "left" as const, dashed: true },
    { label: "売上 当年", color: ORANGE, values: curCells().map((c) => taxRev(c, gross)), axis: "right" as const },
    { label: "売上 前年", color: ORANGE, values: pyCells().map((c) => taxRev(c, gross)), axis: "right" as const, dashed: true },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Header}

      {/* 指標セレクタ + キャンセル可否 + エクスポート */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <MetricTabs metrics={BC_METRICS} state={metric} />
        <div style={{ flex: 1 }} />
        <Segmented<"without" | "with">
          value={scope}
          onChange={setScope}
          options={[
            { value: "without", label: "キャンセルを除く" },
            { value: "with", label: "キャンセルを含む" },
          ]}
        />
        <Btn variant="default" icon="FileDown" size="sm">
          エクスポート
        </Btn>
      </div>

      {/* 指標テーブル（単一=累計+進捗率 / すべて表示=累計のみ積み重ね） */}
      {multi ? shown.map((m) => renderMetric(m.id, true)) : renderMetric(shown[0].id, false)}

      {/* 二軸チャート */}
      <div style={card}>
        <Caption text="ブッキングカーブ チャート" sub={`販売室数（左軸）× 売上（右軸・${taxLabel}）・当年 vs 前年`} />
        <div style={{ padding: "18px 18px 12px" }}>
          <MultiLineChart
            series={chartSeries}
            xLabels={matrix.buckets.map((b) => b.label)}
            yFmt={(v) => integer(v)}
            yFmtRight={(v) => yenCompact(v)}
            hoverFmt={(v) => integer(v)}
            hoverFmtRight={(v) => yen(v)}
            height={360}
          />
        </div>
      </div>
    </div>
  );
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
