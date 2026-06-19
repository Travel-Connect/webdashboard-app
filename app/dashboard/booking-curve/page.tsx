"use client";

/* ============================================================
   /dashboard/booking-curve — ブッキングカーブ
   Lead-time (リードタイム) bucket distribution of sold room nights,
   ported from docs/.../screens-booking.jsx onto the live
   /api/dashboard/booking-curve endpoint.

   LIVE-DATA NOTE: the endpoint returns sold-room-night counts per
   lead-time bucket, split by cancel scope (with/without cancelled);
   it has no previous-year, ADR, revenue or occupancy per bucket.
   So the prototype's 当年 vs 前年 comparison + 売上/ADR/稼働率 metric
   tabs + dual-axis revenue chart have no source. The faithful live
   rendering compares the two real series we have — キャンセルを除く
   (実需) vs キャンセルを含む — across the same bucket axis.
   ============================================================ */

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { FacilityOption } from "@/app/api/facilities/route";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { integer, percent } from "@/lib/dashboard/format";
import { Btn, EmptyState, LoadingSkeleton, Segmented } from "@/components/ui/primitives";
import { KpiGrid, StatCard } from "@/components/ui/stat-card";
import { MultiLineChart } from "@/components/charts";
import {
  BUCKET_LABELS,
  COLOR_CANCEL,
  COLOR_CUR,
  bucketValues,
} from "@/components/screens/dashboard-booking-curve/constants";
import {
  CurveTable,
  type CurveTableRow,
} from "@/components/screens/dashboard-booking-curve/curve-table";

const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--r-lg)",
  background: "var(--surface)",
  boxShadow: "var(--shadow-card)",
  overflow: "hidden",
};

function Caption({ text, sub }: { text: string; sub?: string }) {
  return (
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
        {text}
      </h3>
      {sub && (
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
      )}
    </div>
  );
}

const facFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<FacilityOption[]>);

type Scope = "without" | "with";

export default function BookingCurvePage() {
  const { filters } = useFilters();
  const { data, error, isLoading } = useDashboardQuery("booking-curve", filters);
  const { data: facilities } = useSWR<FacilityOption[]>("/api/facilities", facFetcher, {
    revalidateOnFocus: false,
  });

  // Which cancel scope drives the single-table view (default: 実需 = 除く).
  const [scope, setScope] = useState<Scope>("without");

  const facName =
    filters.facilityId === "all"
      ? "全施設"
      : facilities?.find((f) => f.id === filters.facilityId)?.displayName ?? "施設";

  const periodLabel =
    filters.period === "monthly" && filters.month
      ? `${filters.year}年${filters.month}月`
      : `${filters.year}年`;

  const summary = data?.summary;

  // Bucket values for each scope from the live summary totals.
  const series = useMemo(() => {
    if (!summary) return null;
    const without = bucketValues(summary.withoutCancelled);
    const withc = bucketValues(summary.withCancelled);
    return { without, withc };
  }, [summary]);

  const sub = `${facName} / ${periodLabel}（販売室数・累計）`;

  /* ----- loading / error / empty ----- */
  if (isLoading && !data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Header facName={facName} periodLabel={periodLabel} />
        <div style={{ ...card, padding: 20 }}>
          <LoadingSkeleton rows={6} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Header facName={facName} periodLabel={periodLabel} />
        <div style={card}>
          <EmptyState
            icon="TriangleAlert"
            title="データを取得できませんでした"
            body={error.message}
          />
        </div>
      </div>
    );
  }

  if (!summary || !series || summary.months === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Header facName={facName} periodLabel={periodLabel} />
        <div style={card}>
          <EmptyState
            icon="CalendarSearch"
            title="該当データがありません"
            body="選択した施設・期間にブッキングカーブのデータが見つかりませんでした。"
          />
        </div>
      </div>
    );
  }

  /* ----- derived KPIs (from live counts, no synthesis) ----- */
  const active = scope === "without" ? series.without : series.withc;
  const total = active.reduce((s, v) => s + v, 0);
  const sameDay = active[0] ?? 0;
  const totalWith = series.withc.reduce((s, v) => s + v, 0);
  const cancelledRoomNights = totalWith - series.without.reduce((s, v) => s + v, 0);
  const cancelRate = totalWith > 0 ? (cancelledRoomNights / totalWith) * 100 : null;
  // 早期予約（21日以上前）の構成比
  const earlyIdx = 6; // index of "21〜30日前"; >= this is 21日以上前
  const earlySum = active.slice(earlyIdx).reduce((s, v) => s + v, 0);
  const earlyRate = total > 0 ? (earlySum / total) * 100 : null;

  /* ----- table rows (both scopes shown together, faithful to Excel) ----- */
  const tableRows: CurveTableRow[] = [
    {
      label: "キャンセルを除く（実需）",
      period: periodLabel,
      values: series.without,
      dotColor: COLOR_CUR,
    },
    {
      label: "キャンセルを含む",
      period: periodLabel,
      values: series.withc,
      dotColor: COLOR_CANCEL,
    },
  ];

  const progress = (vals: number[]): number[] =>
    vals.map((v) => (vals[0] ? (v / vals[0]) * 100 : 0));

  const progressRows: CurveTableRow[] = [
    {
      label: "キャンセルを除く（実需）",
      period: periodLabel,
      values: progress(series.without),
      dotColor: COLOR_CUR,
    },
    {
      label: "キャンセルを含む",
      period: periodLabel,
      values: progress(series.withc),
      dotColor: COLOR_CANCEL,
    },
  ];

  /* ----- line chart: with/without cancelled across buckets ----- */
  const chartSeries = [
    {
      label: "キャンセルを除く（実需）",
      color: COLOR_CUR,
      values: series.without,
      axis: "left" as const,
    },
    {
      label: "キャンセルを含む",
      color: COLOR_CANCEL,
      values: series.withc,
      axis: "left" as const,
      dashed: true,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Header facName={facName} periodLabel={periodLabel} months={summary.months} />

      {/* KPI cards (all from live counts) */}
      <KpiGrid minWidth={210}>
        <StatCard
          label="累計販売室数"
          sub={scope === "without" ? "キャンセルを除く" : "キャンセルを含む"}
          value={integer(total)}
          icon="BedDouble"
        />
        <StatCard
          label="当日（リードタイム0）"
          sub="当日成約室数"
          value={integer(sameDay)}
          icon="CalendarCheck"
        />
        <StatCard
          label="早期予約構成比"
          sub="21日以上前"
          value={percent(earlyRate)}
          icon="CalendarClock"
        />
        <StatCard
          label="キャンセル率"
          sub="室数ベース"
          value={percent(cancelRate)}
          icon="CalendarX"
        />
      </KpiGrid>

      {/* Scope toggle + export */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Segmented<Scope>
          value={scope}
          onChange={setScope}
          options={[
            { value: "without", label: "キャンセルを除く" },
            { value: "with", label: "キャンセルを含む" },
          ]}
        />
        <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          進捗率カードは選択中の集計区分を反映します
        </span>
        <div style={{ flex: 1 }} />
        <Btn variant="default" icon="FileDown" size="sm">
          エクスポート
        </Btn>
      </div>

      {/* 累計テーブル */}
      <div style={card}>
        <Caption text="ブッキングカーブ 累計" sub={sub} />
        <div style={{ overflowX: "auto" }}>
          <CurveTable rows={tableRows} fmt={(v) => integer(v)} />
        </div>
      </div>

      {/* 進捗率テーブル（当日を100%） */}
      <div style={card}>
        <Caption text="当日を100%とした進捗率" sub={sub} />
        <div style={{ overflowX: "auto" }}>
          <CurveTable rows={progressRows} fmt={(v) => percent(v)} />
        </div>
      </div>

      {/* 折れ線チャート */}
      <div style={card}>
        <Caption
          text="ブッキングカーブ チャート"
          sub="リードタイム別 累計販売室数・キャンセルを除く vs 含む"
        />
        <div style={{ padding: "18px 18px 12px" }}>
          <MultiLineChart
            series={chartSeries}
            xLabels={BUCKET_LABELS}
            yFmt={(v) => integer(v)}
            hoverFmt={(v) => integer(v)}
            height={360}
          />
        </div>
      </div>
    </div>
  );
}

function Header({
  facName,
  periodLabel,
  months,
}: {
  facName: string;
  periodLabel: string;
  months?: number;
}) {
  return (
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
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>ブッキングカーブ</h2>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--text-2)",
            marginTop: 3,
            whiteSpace: "nowrap",
          }}
        >
          {facName} · {periodLabel}
          {months != null && months > 1 ? ` · ${months}ヶ月集計` : ""} · 販売室数（リードタイム別累計）
        </div>
      </div>
    </div>
  );
}
