"use client";

/* ============================================================
   部屋タイプ別分析 (Room-type analysis)
   /api/dashboard/room-types — one aggregated row per room type.

   Faithful to the prototype's idiom (KPI strip, metric multi-select,
   heat-shaded share table, export button), pivoted to roomType × metric
   because the live endpoint has no month dimension and no
   occupancy / companion-coefficient data.
   ============================================================ */

import { type MouseEvent, Suspense, useMemo, useState } from "react";
import type { RoomTypeRow } from "@/lib/api/types";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { integer, percent, yen, yenCompact } from "@/lib/dashboard/format";
import {
  Badge,
  Btn,
  EmptyState,
  LoadingSkeleton,
  Panel,
} from "@/components/ui/primitives";
import { KpiGrid, StatCard } from "@/components/ui/stat-card";
import { DonutChart } from "@/components/charts";
import { Icon } from "@/components/ui/icon";
import { RtMatrixTable } from "@/components/screens/dashboard-room-types/RtMatrixTable";
import {
  RT_METRICS,
  colorFor,
} from "@/components/screens/dashboard-room-types/metrics";

const RT_TEAL = "37,99,235"; /* --primary rgb */

// useFilters() -> useSearchParams() needs a Suspense boundary. The
// dashboard shell only wraps its FilterBar, so the page provides its own.
export default function RoomTypesPage() {
  return (
    <Suspense fallback={null}>
      <RoomTypesInner />
    </Suspense>
  );
}

function RoomTypesInner() {
  const { filters } = useFilters();
  const { data, error, isLoading } = useDashboardQuery("room-types", filters);

  // Metric multi-select (default: 売上). Ctrl/⌘+click adds; plain click sets.
  const [sel, setSel] = useState<string[]>(["revenue"]);
  const allIds = RT_METRICS.map((m) => m.id as string);
  const allOn = sel.length === allIds.length;
  const isOn = (id: string) => sel.includes(id);
  const pick = (id: string, e: MouseEvent) => {
    const multi = e.ctrlKey || e.metaKey;
    setSel((cur) => {
      if (!multi) return [id];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return next.length ? next : [id];
    });
  };
  const setAll = () => setSel(allOn ? ["revenue"] : allIds);

  const shown = RT_METRICS.filter((m) => sel.includes(m.id as string));

  const facName = filters.facilityId === "all" ? "全施設" : "対象施設";
  const periodLabel =
    filters.period === "monthly" && filters.month
      ? `${filters.year}年${filters.month}月（月次）`
      : `${filters.year}年（通年）`;
  const taxLabel = filters.taxMode === "gross" ? "税込" : "税抜";

  const summary = data?.summary;

  // Revenue-composition donut (top room types, rest grouped into その他).
  const donut = useMemo(() => {
    const rows = data?.rows ?? [];
    const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
    const top = sorted.slice(0, 5);
    const restTotal = sorted.slice(5).reduce((s, r) => s + r.revenue, 0);
    const slices = top.map((r, i) => ({
      label: r.roomType,
      value: r.revenue,
      color: colorFor(i),
    }));
    if (restTotal > 0)
      slices.push({ label: "その他", value: restTotal, color: colorFor(5) });
    return slices;
  }, [data?.rows]);

  const rows: RoomTypeRow[] = data?.rows ?? [];

  const headerActions = (
    <Btn variant="default" icon="FileDown" size="sm">
      エクスポート
    </Btn>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ---- Title block ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>部屋タイプ別分析</h2>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3 }}>
            {facName} · {periodLabel} · {taxLabel}表示 · 指標：
            <strong style={{ color: "var(--text)" }}>
              {allOn ? "すべて（5指標）" : shown.map((m) => m.label).join("・")}
            </strong>
          </div>
        </div>
        {headerActions}
      </div>

      {/* ---- Error ---- */}
      {error && (
        <Panel>
          <EmptyState
            icon="TriangleAlert"
            title="データを取得できませんでした"
            body={`${error.code ? error.code + " · " : ""}${error.message}`}
          />
        </Panel>
      )}

      {/* ---- Loading ---- */}
      {!error && isLoading && !data && (
        <Panel title="読み込み中">
          <LoadingSkeleton rows={6} />
        </Panel>
      )}

      {/* ---- Loaded ---- */}
      {!error && data && summary && (
        <>
          {/* KPI strip (from summary totals) */}
          <KpiGrid minWidth={220}>
            <StatCard
              label="総売上"
              value={yen(summary.revenue)}
              sub={yenCompact(summary.revenue)}
              icon="Banknote"
            />
            <StatCard
              label="販売室数"
              value={integer(summary.soldRoomNights)}
              sub="室"
              icon="BedDouble"
            />
            <StatCard
              label="平均 ADR"
              value={summary.adr == null ? "—" : yen(summary.adr)}
              sub="売上 / 販売室数"
              icon="TrendingUp"
            />
            <StatCard
              label="部屋タイプ数"
              value={integer(rows.length)}
              sub={`宿泊人数 ${integer(summary.guestCount)}名`}
              icon="LayoutGrid"
            />
          </KpiGrid>

          {rows.length === 0 ? (
            <Panel>
              <EmptyState
                icon="Inbox"
                title="該当データがありません"
                body="選択した施設・期間に部屋タイプ別の実績がありません。フィルタを変更してください。"
              />
            </Panel>
          ) : (
            <>
              {/* Composition donut */}
              <Panel
                title="売上構成（部屋タイプ別）"
                sub={`上位${Math.min(5, rows.length)}タイプ + その他`}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    padding: "4px 0",
                  }}
                >
                  <DonutChart
                    data={donut}
                    size={200}
                    thickness={28}
                    centerLabel={yenCompact(summary.revenue)}
                    centerSub="総売上"
                    valueFmt={(v) =>
                      `${yenCompact(v)}・${percent(
                        summary.revenue ? (v / summary.revenue) * 100 : 0,
                      )}`
                    }
                  />
                </div>
              </Panel>

              {/* Metric selector */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {RT_METRICS.map((m) => {
                  const on = isOn(m.id as string);
                  return (
                    <button
                      key={m.id}
                      onClick={(e) => pick(m.id as string, e)}
                      title="Ctrl/⌘+クリックで複数選択"
                      style={{
                        height: 32,
                        padding: "0 15px",
                        borderRadius: "var(--r-md)",
                        cursor: "pointer",
                        fontSize: 12.5,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        border:
                          "1px solid " +
                          (on ? "rgba(" + RT_TEAL + ",0.5)" : "var(--border)"),
                        background: on ? "rgba(" + RT_TEAL + ",0.1)" : "var(--surface)",
                        color: on ? "var(--primary-ink)" : "var(--text-2)",
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
                <span
                  style={{
                    width: 1,
                    height: 20,
                    background: "var(--border-strong)",
                    margin: "0 4px",
                  }}
                />
                <button
                  onClick={setAll}
                  style={{
                    height: 32,
                    padding: "0 16px",
                    borderRadius: "var(--r-md)",
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border:
                      "1px solid " +
                      (allOn ? "var(--primary)" : "rgba(" + RT_TEAL + ",0.4)"),
                    background: allOn ? "var(--primary)" : "var(--surface)",
                    color: allOn ? "#fff" : "var(--primary-ink)",
                  }}
                >
                  <Icon name="Rows3" size={14} />
                  すべて表示
                </button>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-3)",
                    marginLeft: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  Ctrl/⌘+クリックで複数選択
                </span>
              </div>

              {/* Cross table */}
              <Panel pad={false}>
                <div style={{ maxHeight: "62vh", overflow: "auto" }}>
                  <RtMatrixTable
                    rows={rows}
                    summary={summary}
                    metrics={shown}
                    facilityName={facName}
                    year={filters.year}
                  />
                </div>
                <div
                  style={{
                    padding: "8px 14px",
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <Badge tone="neutral" icon="Info">
                    ADR は 売上 ÷ 販売室数（販売室数 0 のとき「—」）
                  </Badge>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    セル濃淡は指標内シェアを表します
                  </span>
                </div>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
