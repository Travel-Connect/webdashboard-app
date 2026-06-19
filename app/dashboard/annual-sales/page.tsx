"use client";

/* ============================================================
   全施設年間売上 — app/dashboard/annual-sales/page.tsx
   Adapted from docs/.../screens-annual.jsx.
   Live API (/api/dashboard/annual-sales) returns one row per
   facility for the whole year (revenue / budget / yoy / achievement),
   so the prototype's month × facility Excel grid becomes an
   area-grouped per-facility cross-tab. The 4-metric selector
   (実績 / 予算 / 予算達成率 / 予算差) and blue tonmana are preserved.
   ============================================================ */

import { type CSSProperties, useState } from "react";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import {
  Btn,
  EmptyState,
  LoadingSkeleton,
} from "@/components/ui/primitives";
import { StatCard, KpiGrid } from "@/components/ui/stat-card";
import { Icon } from "@/components/ui/icon";
import { yen, percent } from "@/lib/dashboard/format";
import { AnnualTable, type MetricKind } from "@/components/screens/dashboard-annual-sales/annual-table";

const AF_VIO = "37,111,219";

interface MetricDef {
  id: MetricKind;
  label: string;
}
const AF_METRICS: MetricDef[] = [
  { id: "actual", label: "実績" },
  { id: "budget", label: "予算" },
  { id: "pct", label: "予算達成率" },
  { id: "diff", label: "予算差" },
];
const ALL_IDS = AF_METRICS.map((m) => m.id);

const card: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--r-lg)",
  background: "var(--surface)",
  boxShadow: "var(--shadow-card)",
  overflow: "hidden",
};

export default function AnnualSalesPage() {
  const { filters } = useFilters();
  const { data, error, isLoading } = useDashboardQuery("annual-sales", filters);

  // multi-metric selection (Ctrl/⌘+click to toggle multiple)
  const [sel, setSel] = useState<MetricKind[]>(["actual"]);
  const isOn = (id: MetricKind) => sel.includes(id);
  const allOn = sel.length === ALL_IDS.length;
  const pick = (id: MetricKind, e: React.MouseEvent) => {
    const multi = e.ctrlKey || e.metaKey;
    setSel((cur) => {
      if (multi) {
        const next = cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id];
        return next.length ? next : cur; // keep at least one
      }
      return [id];
    });
  };
  const setAll = () => setSel(allOn ? ["actual"] : [...ALL_IDS]);

  const shown = AF_METRICS.filter((m) => sel.includes(m.id));
  const year = filters.year;
  const taxLabel = filters.taxMode === "gross" ? "税込" : "税抜";

  const summary = data?.summary;
  const rows = data?.rows ?? [];

  const metaFor = (id: MetricKind): { title: string; sub: string; label: string } => {
    const map: Record<MetricKind, { title: string; sub: string; label: string }> = {
      actual: {
        title: "実績",
        sub: `客室販売金額（${taxLabel}）· ${year}年`,
        label: "実績",
      },
      budget: {
        title: "予算",
        sub: `売上予算（税込）· ${year}年`,
        label: "予算",
      },
      pct: {
        title: "予算達成率",
        sub: "実績 ÷ 予算 ・ 100%未満は赤字",
        label: "達成率",
      },
      diff: {
        title: "予算差",
        sub: `実績 − 予算（円）・ マイナスは赤の括弧表示`,
        label: "差額",
      },
    };
    return map[id];
  };

  const tabBtn = (m: MetricDef) => (
    <button
      key={m.id}
      onClick={(e) => pick(m.id, e)}
      title="Ctrl/⌘+クリックで複数選択"
      style={{
        height: 32,
        padding: "0 15px",
        borderRadius: "var(--r-md)",
        cursor: "pointer",
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        border: "1px solid " + (isOn(m.id) ? `rgba(${AF_VIO},0.5)` : "var(--border)"),
        background: isOn(m.id) ? `rgba(${AF_VIO},0.1)` : "var(--surface)",
        color: isOn(m.id) ? "var(--primary-ink)" : "var(--text-2)",
      }}
    >
      {m.label}
    </button>
  );

  const cap = (title: string, sub: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "11px 16px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 14.5,
          fontWeight: 800,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {title}
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
        {sub}
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>全施設年間売上</h2>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-2)",
              marginTop: 3,
              whiteSpace: "nowrap",
            }}
          >
            全施設 · {year}年（年次）· {taxLabel}表示 · 対象項目：
            <strong style={{ color: "var(--text)" }}>客室販売金額</strong> · 指標：
            <strong style={{ color: "var(--text)" }}>
              {allOn ? "すべて（4表）" : shown.map((m) => m.label).join("・")}
            </strong>
          </div>
        </div>
        <Btn variant="default" icon="FileDown" size="sm">
          エクスポート
        </Btn>
      </div>

      {/* KPI summary */}
      {summary && (
        <KpiGrid minWidth={220}>
          <StatCard
            label="総売上"
            value={yen(summary.totalRevenue)}
            sub={`${summary.facilityCount}施設 · ${taxLabel}`}
            icon="JapaneseYen"
            deltaValue={
              summary.yoyRate != null ? (summary.yoyRate - 1) * 100 : null
            }
          />
          <StatCard
            label="前年売上"
            value={
              summary.totalPreviousYearRevenue != null
                ? yen(summary.totalPreviousYearRevenue)
                : "—"
            }
            sub="前年同期"
            icon="History"
          />
          <StatCard
            label="予算"
            value={summary.totalBudget != null ? yen(summary.totalBudget) : "—"}
            sub="売上予算（税込）"
            icon="Target"
          />
          <StatCard
            label="予算達成率"
            value={
              summary.budgetAchievementRate != null
                ? percent(summary.budgetAchievementRate * 100)
                : "—"
            }
            sub="実績 ÷ 予算"
            icon="Gauge"
            statusColor={
              summary.budgetAchievementRate != null &&
              summary.budgetAchievementRate < 1
                ? "var(--danger)"
                : undefined
            }
          />
        </KpiGrid>
      )}

      {/* metric selector */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {AF_METRICS.map(tabBtn)}
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
              "1px solid " + (allOn ? "var(--primary)" : `rgba(${AF_VIO},0.4)`),
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

      {/* states */}
      {error && (
        <EmptyState
          icon="TriangleAlert"
          title="データを取得できませんでした"
          body={error.message}
        />
      )}

      {isLoading && !data && (
        <div style={card}>
          <div style={{ padding: 18 }}>
            <LoadingSkeleton rows={6} />
          </div>
        </div>
      )}

      {!error && !isLoading && rows.length === 0 && (
        <EmptyState
          icon="Inbox"
          title="対象データがありません"
          body={`${year}年の売上・予算データが見つかりませんでした。`}
        />
      )}

      {/* tables (one per selected metric) */}
      {!error &&
        rows.length > 0 &&
        shown.map((m) => {
          const meta = metaFor(m.id);
          return (
            <div style={card} key={m.id}>
              {cap(meta.title, meta.sub)}
              <div style={{ overflowX: "auto" }}>
                <AnnualTable kind={m.id} rowLabel={meta.label} rows={rows} />
              </div>
            </div>
          );
        })}
    </div>
  );
}
