"use client";

/* ============================================================
   経路分析 (Channels) — app/dashboard/channels/page.tsx
   Ported from docs/.../screens-stub.jsx (ChannelsScreen).
   Live endpoint: /api/dashboard/channels -> ChannelsResponse
   (flat ChannelRow[] + ChannelSummary; cross-tab matrix of the
   prototype is not available from this contract — see note).
   ============================================================ */

import { useMemo, useState } from "react";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { StatCard, KpiGrid } from "@/components/ui/stat-card";
import {
  Panel,
  Btn,
  EmptyState,
  LoadingSkeleton,
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { DonutChart } from "@/components/charts";
import { yen, yenCompact, integer, EM_DASH } from "@/lib/dashboard/format";
import { ChannelTable } from "@/components/screens/dashboard-channels/channel-table";

/* donut palette (cycled across top channels) */
const DONUT_COLORS = [
  "var(--c-blue)",
  "var(--c-teal)",
  "var(--c-violet)",
  "var(--c-amber)",
  "var(--c-rose)",
  "var(--c-gray)",
];
const DONUT_TOP = 6;

export default function ChannelsPage() {
  const { filters } = useFilters();
  const { data, error, isLoading } = useDashboardQuery("channels", filters);
  const [hideZero, setHideZero] = useState(true);

  const taxLabel = filters.taxMode === "gross" ? "税込" : "税抜";
  const periodLabel =
    filters.period === "monthly"
      ? `${filters.year}年${filters.month ?? ""}月`
      : `${filters.year}年（年間）`;

  const allRows = useMemo(() => data?.rows ?? [], [data]);
  const rows = useMemo(
    () => (hideZero ? allRows.filter((r) => r.revenue > 0) : allRows),
    [allRows, hideZero],
  );
  const hiddenN = allRows.length - rows.length;
  const hasYoy = allRows.some(
    (r) => r.previousYearRevenue != null || r.yoyRate != null,
  );

  /* donut: top channels by revenue, remainder folded into その他 */
  const donutData = useMemo(() => {
    const sorted = [...rows]
      .filter((r) => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
    const top = sorted.slice(0, DONUT_TOP);
    const rest = sorted.slice(DONUT_TOP);
    const out = top.map((r, i) => ({
      label: r.channel,
      value: r.revenue,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
    if (rest.length) {
      out.push({
        label: `その他（${rest.length}）`,
        value: rest.reduce((s, r) => s + r.revenue, 0),
        color: "var(--c-gray)",
      });
    }
    return out;
  }, [rows]);

  const summary = data?.summary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* title + toolbar */}
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
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>
            経路別実績一覧
          </h2>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-2)",
              marginTop: 3,
            }}
          >
            {filters.facilityId === "all" ? "全施設横断 · " : ""}
            {periodLabel} · {taxLabel}表示
            {summary ? (
              <>
                {" "}· 売上合計{" "}
                <strong className="tabular" style={{ color: "var(--text)" }}>
                  {yenCompact(summary.totalRevenue)}
                </strong>
              </>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          売上0の経路を隠す
          {hiddenN > 0 && hideZero ? `（${hiddenN}）` : ""}
        </button>
          <Btn variant="default" icon="FileDown" size="sm">
            エクスポート
          </Btn>
        </div>
      </div>

      {/* KPI cards */}
      <KpiGrid minWidth={240}>
        <StatCard
          label="総売上"
          value={summary ? yen(summary.totalRevenue) : EM_DASH}
          sub={taxLabel}
          icon="Banknote"
        />
        <StatCard
          label="総販売室数"
          value={summary ? integer(summary.totalSoldRoomNights) : EM_DASH}
          sub="室"
          icon="BedDouble"
        />
        <StatCard
          label="経路数"
          value={summary ? integer(summary.channelCount) : EM_DASH}
          sub="売上のある経路"
          icon="Route"
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
        <Panel title="経路別実績">
          <LoadingSkeleton rows={6} />
        </Panel>
      ) : allRows.length === 0 ? (
        <Panel>
          <EmptyState
            icon="Inbox"
            title="該当する経路がありません"
            body="選択した条件に売上データが見つかりませんでした。"
          />
        </Panel>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "minmax(280px, 360px) 1fr",
            alignItems: "start",
          }}
        >
          <Panel title="売上構成比" sub={`上位経路（${taxLabel}）`}>
            {donutData.length ? (
              <DonutChart
                data={donutData}
                size={200}
                thickness={28}
                centerLabel={yenCompact(summary?.totalRevenue ?? 0)}
                centerSub="総売上"
                valueFmt={(v) => yenCompact(v)}
              />
            ) : (
              <EmptyState icon="ChartPie" title="表示できる構成がありません" />
            )}
          </Panel>

          <Panel
            title="経路別実績"
            sub={`${rows.length}経路`}
            pad={false}
          >
            <ChannelTable
              rows={rows}
              hasYoy={hasYoy}
              totalRevenue={summary?.totalRevenue ?? 0}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}
