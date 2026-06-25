"use client";

/* ============================================================
   全施設年間売上 — app/dashboard/annual-sales/page.tsx
   既存Excel忠実再現: 12ヶ月(行) × 施設(列) クロスタブを指標(実績/予算/
   予算達成率/予算差)ごとにカード表示。docs/.../screens-annual.jsx を移植。
   Live endpoint: /api/dashboard/annual-sales -> AnnualSalesResponse.matrix
   ============================================================ */

import { Btn, EmptyState, LoadingSkeleton, LoadingOverlay, Panel } from "@/components/ui/primitives";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { useFilters } from "@/lib/dashboard/use-filters";
import { MetricTabs, useMetricTabs } from "@/components/dashboard/metric-tabs";
import { AF_METRICS, type AfMetricId } from "@/components/screens/dashboard-annual-sales/metrics";
import { AnnualMatrixTable } from "@/components/screens/dashboard-annual-sales/annual-matrix";

const AF_IDS = AF_METRICS.map((m) => m.id);

export default function AnnualSalesPage() {
  const { filters } = useFilters();
  const { data, error, isLoading, isValidating } = useDashboardQuery(
    "annual-sales",
    filters,
  );
  const metric = useMetricTabs<AfMetricId>(AF_IDS, ["actual"]);

  const matrix = data?.matrix ?? null;
  const taxLabel = filters.taxMode === "gross" ? "税込" : "税抜";
  const shown = AF_METRICS.filter((m) => metric.sel.includes(m.id));
  const metricLabels = metric.allOn
    ? `すべて（${AF_METRICS.length}表）`
    : shown.map((m) => m.label).join("・");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
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
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>全施設年間売上</h2>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3 }}>
            全施設 · {filters.year}年（月次）· {taxLabel}表示 · 対象項目：
            <strong style={{ color: "var(--text)" }}>客室販売金額</strong> · 指標：
            <strong style={{ color: "var(--text)" }}>{metricLabels}</strong>
          </div>
        </div>
        <Btn variant="default" icon="FileDown" size="sm">
          エクスポート
        </Btn>
      </div>

      {/* metric selector */}
      <MetricTabs metrics={AF_METRICS} state={metric} />

      {/* body */}
      {error ? (
        <Panel>
          <EmptyState icon="TriangleAlert" title="データを取得できませんでした" body={error.message} />
        </Panel>
      ) : isLoading && !data ? (
        <Panel title="全施設年間売上">
          <LoadingSkeleton rows={10} />
        </Panel>
      ) : !matrix || matrix.facilities.length === 0 ? (
        <Panel>
          <EmptyState
            icon="Building2"
            title="対象年の売上データがありません"
            body="フィルタ条件（年）を変更してお試しください。"
          />
        </Panel>
      ) : (
        shown.map((m) => (
          <div
            key={m.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-card)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "11px 16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>
                {m.label}
              </h3>
              <span
                style={{
                  fontSize: 11.5,
                  color: "var(--text-3)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {m.sub(taxLabel, filters.year)}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <AnnualMatrixTable matrix={matrix} kind={m.id} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
