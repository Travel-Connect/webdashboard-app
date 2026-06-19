"use client";

/* ============================================================
   国籍別分析 (Nationality analysis) — app/dashboard/nationalities

   Faithful to docs/.../screens-stub.jsx · NationalitiesScreen
   (violet metric tabs + すべて表示, hide-zero toggle, dense matrix
   table). The prototype's synthetic country×月 cross-tab collapses
   to country×selected-metric here because the live
   /api/dashboard/nationalities endpoint has no month dimension —
   it returns flat NationalityRow[] + a NationalitySummary.
   ============================================================ */

import { useMemo, useState } from "react";
import { DonutChart } from "@/components/charts";
import { Btn, EmptyState, LoadingSkeleton, Panel } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { KpiGrid, StatCard } from "@/components/ui/stat-card";
import { integer, yen } from "@/lib/dashboard/format";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { useFilters } from "@/lib/dashboard/use-filters";
import { dec2, NAT_VIO } from "@/components/screens/dashboard-nationalities/metrics";
import { NatMatrixTable } from "@/components/screens/dashboard-nationalities/nat-matrix-table";
import {
  MetricSelector,
  useMultiMetric,
} from "@/components/screens/dashboard-nationalities/metric-selector";
import type { NationalityRow } from "@/lib/api/types";

/** Violet → teal → blue → amber palette for the composition donut. */
const DONUT_COLORS = [
  `rgb(${NAT_VIO})`,
  "var(--c-teal)",
  "var(--c-blue)",
  "var(--c-amber)",
  "var(--c-violet)",
  "var(--c-rose)",
  "var(--text-3)",
];

const MAJOR_FALLBACK = "(不明)";

export default function NationalitiesPage() {
  const { filters } = useFilters();
  const { data, error, isLoading } = useDashboardQuery("nationalities", filters);
  const metric = useMultiMetric(["rev"]);
  const [hideZero, setHideZero] = useState(true);

  const rows: NationalityRow[] = useMemo(() => {
    const r = data?.rows ?? [];
    // Sort by revenue desc so the matrix and donut lead with the biggest markets.
    return [...r].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
  }, [data]);

  const summary = data?.summary;

  // Composition by countryMajor region (revenue share) for the donut.
  const donutData = useMemo(() => {
    const byMajor = new Map<string, number>();
    for (const r of rows) {
      const key = r.countryMajor || MAJOR_FALLBACK;
      byMajor.set(key, (byMajor.get(key) ?? 0) + (r.revenue ?? 0));
    }
    const entries = [...byMajor.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 6);
    const restVal = entries.slice(6).reduce((a, [, v]) => a + v, 0);
    const slices = top.map(([label, value], i) => ({
      label,
      value,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
    if (restVal > 0) {
      slices.push({ label: "その他", value: restVal, color: "var(--text-3)" });
    }
    return slices;
  }, [rows]);

  const subLine = useMemo(() => {
    const fac = filters.facilityId === "all" ? "全施設" : "対象施設";
    const periodLabel =
      filters.period === "monthly" && filters.month != null
        ? `${filters.year}年${filters.month}月`
        : `${filters.year}年（通年）`;
    const tax = filters.taxMode === "gross" ? "税込" : "税抜";
    const metricLabels = metric.allOn
      ? "すべて（8指標）"
      : metric.sel
          .map((id) => labelFor(id))
          .join("・");
    return { fac, periodLabel, tax, metricLabels };
  }, [filters, metric.allOn, metric.sel]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* ---- header ---- */}
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
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>国籍別分析</h2>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3 }}>
            {subLine.fac} · {subLine.periodLabel} · {subLine.tax}表示 · 指標：
            <strong style={{ color: "var(--text)" }}>{subLine.metricLabels}</strong>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
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
          <Btn variant="default" icon="FileDown" size="sm" disabled>
            エクスポート
          </Btn>
        </div>
      </div>

      {/* ---- KPI strip ---- */}
      <KpiGrid minWidth={200}>
        <StatCard
          label="売上"
          value={summary ? yen(summary.totalRevenue) : "—"}
          icon="Banknote"
        />
        <StatCard
          label="販売室数"
          value={summary ? integer(summary.totalSoldRoomNights) : "—"}
          icon="BedDouble"
        />
        <StatCard
          label="宿泊人数"
          value={summary ? integer(summary.totalGuestCount) : "—"}
          icon="Users"
        />
        <StatCard
          label="予約数"
          value={summary ? integer(summary.totalReservationCount) : "—"}
          icon="CalendarCheck"
        />
        <StatCard
          label="平均リードタイム"
          value={summary ? dec2(summary.avgLeadTime) : "—"}
          sub="日"
          icon="Clock"
        />
        <StatCard
          label="国籍数"
          value={summary ? integer(summary.countryCount) : "—"}
          icon="Globe"
        />
      </KpiGrid>

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
          <LoadingSkeleton rows={8} />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel title="国籍別マトリクス">
          <EmptyState
            icon="Globe"
            title="対象期間の国籍データがありません"
            body="フィルタ条件（施設・期間）を変更してお試しください。"
          />
        </Panel>
      ) : (
        <>
          {/* composition donut */}
          <Panel
            title="地域別 売上構成"
            sub="countryMajor（大分類）別の売上シェア"
          >
            <DonutChart
              data={donutData}
              size={200}
              thickness={28}
              centerLabel={summary ? yen(summary.totalRevenue) : undefined}
              centerSub="総売上"
              valueFmt={(v) => yen(v)}
            />
          </Panel>

          {/* metric selector + matrix */}
          <Panel title="国籍別マトリクス" pad={false}>
            <div style={{ padding: "14px 18px 0" }}>
              <MetricSelector state={metric} />
            </div>
            <div
              style={{
                margin: "12px 0 0",
                maxHeight: "62vh",
                overflow: "auto",
              }}
            >
              <NatMatrixTable rows={rows} metricIds={metric.sel} hideZero={hideZero} />
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function labelFor(id: string): string {
  const map: Record<string, string> = {
    rev: "売上",
    rooms: "販売室数",
    guests: "宿泊人数",
    rsv: "予約数",
    adr: "ADR",
    ppr: "同伴人数",
    stay: "連泊率",
    lt: "リードタイム",
  };
  return map[id] ?? id;
}
