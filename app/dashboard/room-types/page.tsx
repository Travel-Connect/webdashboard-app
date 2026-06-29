"use client";

/* ============================================================
   部屋タイプ別分析 — app/dashboard/room-types
   既存Excel忠実再現: 部屋タイプ × 12ヶ月 クロスタブ（指標切替）。
   docs/.../screens-roomtypes.jsx · RoomTypesScreen を移植。
   Live endpoint: /api/dashboard/room-types -> RoomTypesResponse.matrix
   ※ 消化率は部屋タイプ別在庫が無いため未対応（売上/販売室数/ADR/同伴係数）。
   ============================================================ */

import { type ReactNode } from "react";
import { Btn, EmptyState, LoadingSkeleton, LoadingOverlay, Panel } from "@/components/ui/primitives";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { useFilters } from "@/lib/dashboard/use-filters";
import { MetricTabs, useMetricTabs } from "@/components/dashboard/metric-tabs";
import { RT_METRICS, type RtMetricId } from "@/components/screens/dashboard-room-types/metrics";
import { RtMatrixTable } from "@/components/screens/dashboard-room-types/rt-matrix";
import { RoomTypeMonthlyView } from "@/components/screens/dashboard-room-types/monthly-view";

const RT_IDS = RT_METRICS.map((m) => m.id);

const wrap = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-lg)",
  background: "var(--surface)",
  boxShadow: "var(--shadow-card)",
} as const;

function sectionBar(label: ReactNode) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 8,
        height: 40,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 16px",
        background: "var(--primary)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: ".02em",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <span style={{ opacity: 0.8, fontSize: 11.5, fontWeight: 600 }}>指標</span>
      {label}
    </div>
  );
}

export default function RoomTypesPage() {
  const { filters } = useFilters();
  const { data, error, isLoading, isValidating } = useDashboardQuery(
    "room-types",
    filters,
  );
  const metric = useMetricTabs<RtMetricId>(RT_IDS, ["rev"]);

  const isMonthly = filters.period === "monthly";
  const matrix = data?.matrix ?? null;
  const detail = data?.monthlyDetail ?? null;
  const taxLabel = filters.taxMode === "gross" ? "税込" : "税抜";
  const shown = RT_METRICS.filter((m) => metric.sel.includes(m.id));
  const multi = shown.length > 1;
  const metricLabels = metric.allOn
    ? `すべて（${RT_METRICS.length}指標）`
    : shown.map((m) => m.label).join("・");
  const facName = matrix?.facName ?? (filters.facilityId === "all" ? "全施設" : "施設");

  return (
    <div
      style={{
        height: "calc(100dvh - 150px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* 再取得中オーバーレイ（旧データを見せつつ上に重ねる） */}
      {!error && data && isValidating && <LoadingOverlay />}

      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>部屋タイプ別分析</h2>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-2)",
              marginTop: 3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {facName} ·{" "}
            {isMonthly ? `${filters.year}年${filters.month ?? "—"}月` : `${filters.year}年（月次12ヶ月）`} ·{" "}
            {taxLabel}表示
            {!isMonthly && (
              <>
                {" "}
                · 指標：<strong style={{ color: "var(--text)" }}>{metricLabels}</strong>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Btn variant="default" icon="FileDown" size="sm">
            エクスポート
          </Btn>
        </div>
      </div>

      {/* metric selector（年間マトリクスのみ。月間は全指標を行展開するため非表示） */}
      {!isMonthly && <MetricTabs metrics={RT_METRICS} state={metric} />}

      {/* body */}
      {error ? (
        <Panel>
          <EmptyState
            icon="TriangleAlert"
            title="データを取得できませんでした"
            body={error.message}
          />
        </Panel>
      ) : isLoading && !data ? (
        <Panel title="部屋タイプ別マトリクス">
          <LoadingSkeleton rows={8} />
        </Panel>
      ) : isMonthly ? (
        !detail || detail.rows.length === 0 ? (
          <Panel>
            <EmptyState
              icon="BedDouble"
              title="対象期間の部屋タイプデータがありません"
              body="フィルタ条件（施設・期間）を変更してお試しください。"
            />
          </Panel>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", paddingRight: 2 }}>
            <RoomTypeMonthlyView detail={detail} />
          </div>
        )
      ) : !matrix || matrix.rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon="BedDouble"
            title="対象期間の部屋タイプデータがありません"
            body="フィルタ条件（施設・期間）を変更してお試しください。"
          />
        </Panel>
      ) : multi ? (
        <div style={wrap}>
          {shown.map((m, i) => (
            <div key={m.id} style={{ marginBottom: i === shown.length - 1 ? 0 : 20 }}>
              {sectionBar(m.label)}
              <RtMatrixTable matrix={matrix} metricId={m.id} sticky />
            </div>
          ))}
        </div>
      ) : (
        <div style={wrap}>
          <RtMatrixTable matrix={matrix} metricId={shown[0].id} />
        </div>
      )}
    </div>
  );
}
