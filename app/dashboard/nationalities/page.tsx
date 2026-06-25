"use client";

/* ============================================================
   国籍別分析 (Nationality analysis) — app/dashboard/nationalities
   既存Excel「国籍別分析」忠実再現: 国籍 × 12ヶ月 クロスタブ（指標切替）。
   docs/.../screens-stub.jsx · NationalitiesScreen を移植。
   Live endpoint: /api/dashboard/nationalities -> NationalitiesResponse.matrix
   ============================================================ */

import { type ReactNode, useState } from "react";
import { Btn, EmptyState, LoadingSkeleton, LoadingOverlay, Panel } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { useFilters } from "@/lib/dashboard/use-filters";
import { NAT_METRICS } from "@/components/screens/dashboard-nationalities/metrics";
import { NatMatrixTable } from "@/components/screens/dashboard-nationalities/nat-matrix";
import {
  MetricSelector,
  useMultiMetric,
} from "@/components/screens/dashboard-nationalities/metric-selector";

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
        gap: 8,
        padding: "0 14px",
        background: "var(--primary)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: ".02em",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <span style={{ opacity: 0.85, fontSize: 11.5, fontWeight: 600 }}>指標</span>
      {label}
    </div>
  );
}

export default function NationalitiesPage() {
  const { filters } = useFilters();
  const { data, error, isLoading, isValidating } = useDashboardQuery(
    "nationalities",
    filters,
  );
  const metric = useMultiMetric(["rev"]);
  const [hideZero, setHideZero] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const TOP_N = 20;

  const matrix = data?.matrix ?? null;
  // 「詳細を見る」ボタンの表示判定・件数（hideZero 反映後の国数）
  const filteredCount = matrix
    ? hideZero
      ? matrix.rows.filter((r) => r.total.rooms > 0).length
      : matrix.rows.length
    : 0;
  const hasMore = filteredCount > TOP_N;
  const taxLabel = filters.taxMode === "gross" ? "税込" : "税抜";
  const shown = NAT_METRICS.filter((m) => metric.sel.includes(m.id));
  const multi = shown.length > 1;
  const metricLabels = metric.allOn
    ? `すべて（${NAT_METRICS.length}指標）`
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
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>国籍別分析</h2>
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
            {facName} · {filters.year}年（月次）· {taxLabel}表示 · 指標：
            <strong style={{ color: "var(--text)" }}>{metricLabels}</strong>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setHideZero((z) => !z)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 11px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              background: hideZero ? "var(--primary-weak)" : "var(--surface)",
              color: hideZero ? "var(--primary-ink)" : "var(--text-2)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Icon name={hideZero ? "EyeOff" : "Eye"} size={14} />
            実績0の国籍を隠す
          </button>
          <Btn variant="default" icon="FileDown" size="sm">
            エクスポート
          </Btn>
        </div>
      </div>

      {/* metric selector */}
      <div style={{ flexShrink: 0 }}>
        <MetricSelector state={metric} />
      </div>

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
        <Panel title="国籍別マトリクス">
          <LoadingSkeleton rows={10} />
        </Panel>
      ) : !matrix || matrix.rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon="Globe"
            title="対象期間の国籍データがありません"
            body="フィルタ条件（施設・期間）を変更してお試しください。"
          />
        </Panel>
      ) : multi ? (
        <div style={wrap}>
          {shown.map((m, i) => (
            <div key={m.id} style={{ marginBottom: i === shown.length - 1 ? 0 : 20 }}>
              {sectionBar(m.label)}
              <NatMatrixTable matrix={matrix} metricId={m.id} hideZero={hideZero} expanded={expanded} topN={TOP_N} sticky />
            </div>
          ))}
        </div>
      ) : (
        <div style={wrap}>
          <NatMatrixTable matrix={matrix} metricId={shown[0].id} hideZero={hideZero} expanded={expanded} topN={TOP_N} />
        </div>
      )}

      {/* 詳細を見る（上位20カ国 ⇄ 全件） */}
      {matrix && matrix.rows.length > 0 && hasMore && (
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", paddingBottom: 2 }}>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 34,
              padding: "0 18px",
              border: "1px solid var(--border)",
              borderRadius: 999,
              background: "var(--surface)",
              color: "var(--primary-ink)",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <Icon name={expanded ? "ChevronUp" : "ChevronDown"} size={15} />
            {expanded ? `上位${TOP_N}カ国に戻す` : `詳細を見る（全${filteredCount}カ国）`}
          </button>
        </div>
      )}
    </div>
  );
}
