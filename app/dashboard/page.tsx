"use client";

/* ============================================================
   app/dashboard/page.tsx — 総合ダッシュボード (overview).
   Combines occupancy + channels + annual-sales summaries into the
   KPI overview cards from docs/.../screens-dashboard.jsx.
   ============================================================ */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { Icon } from "@/components/ui/icon";
import { Badge, Btn, LoadingSkeleton } from "@/components/ui/primitives";
import { percent, yen, yenCompact } from "@/lib/dashboard/format";
import {
  OverviewCard,
  type OverviewKpi,
} from "@/components/screens/dashboard/overview-card";
import {
  AlertStrip,
  type OverviewAlert,
} from "@/components/screens/dashboard/alert-strip";
import type {
  DashboardComparison,
} from "@/lib/api/types";

/** Pull a metric's diff/rate from a comparison envelope, if present. */
function metricRate(
  comparison: DashboardComparison<unknown> | null | undefined,
  metric: string,
): number | null {
  if (!comparison) return null;
  const m = comparison.metrics.find((x) => x.metric === metric);
  return m?.rate ?? null;
}

export default function DashboardOverviewPage() {
  const { filters } = useFilters();
  const router = useRouter();

  const occQ = useDashboardQuery("occupancy", filters);
  const chQ = useDashboardQuery("channels", filters);
  const asQ = useDashboardQuery("annual-sales", filters);

  const isLoading = occQ.isLoading || chQ.isLoading || asQ.isLoading;
  const firstError = occQ.error || chQ.error || asQ.error;

  const periodLabel =
    filters.period === "monthly" && filters.month != null
      ? `${filters.year}年${filters.month}月`
      : `${filters.year}年`;
  const facLabel = filters.facilityId === "all" ? "全施設" : "選択施設";

  const cards = useMemo<OverviewKpi[]>(() => {
    const list: OverviewKpi[] = [];

    /* ---- 稼働分析 (occupancy) ---- */
    const occ = occQ.data?.summary;
    if (occ) {
      const occRate = occ.occupancyRate; // null when room inventory absent
      const yoyOcc = metricRate(occQ.data?.comparison, "occupancyRate");
      const status: OverviewKpi["status"] =
        occRate == null ? "danger" : occRate < 70 ? "warn" : "ok";
      list.push({
        key: "occupancy",
        href: "/dashboard/occupancy",
        icon: "Percent",
        title: "稼働分析",
        sub: "稼働率",
        main: percent(occRate),
        yoy: yoyOcc,
        yoyUnit: "pt",
        status,
        note:
          occRate == null
            ? "販売可能室数が未登録のため算出不可"
            : `販売室数 ${occ.soldRoomNights.toLocaleString("ja-JP")}室 ・ 売上 ${yenCompact(occ.roomRevenue)}`,
      });

      /* ---- RevPAR (from occupancy summary) ---- */
      const revpar = occ.revpar; // null when inventory absent
      const yoyRevpar = metricRate(occQ.data?.comparison, "revpar");
      list.push({
        key: "revpar",
        href: "/dashboard/occupancy",
        icon: "TrendingUp",
        title: "RevPAR",
        sub: "販売可能室あたり売上",
        main: yen(revpar),
        yoy: yoyRevpar,
        yoyUnit: "%",
        status: revpar == null ? "danger" : "ok",
        note:
          revpar == null
            ? "販売可能室数が未登録のため算出不可"
            : `ADR ${yen(occ.adr)} ・ 客室単価 ${yen(occ.guestUnitPrice)}`,
      });
    }

    /* ---- 経路分析 (channels) ---- */
    const ch = chQ.data?.summary;
    if (ch) {
      const yoyCh = metricRate(chQ.data?.comparison, "totalRevenue");
      list.push({
        key: "channels",
        href: "/dashboard/channels",
        icon: "Route",
        title: "経路分析",
        sub: `売上（全経路） ・ ${periodLabel}`,
        main: yenCompact(ch.totalRevenue),
        yoy: yoyCh,
        yoyUnit: "%",
        status: "ok",
        note: `経路数 ${ch.channelCount} ・ 販売室数 ${ch.totalSoldRoomNights.toLocaleString("ja-JP")}室`,
      });
    }

    /* ---- 全施設年間売上 (annual-sales) ---- */
    const as = asQ.data?.summary;
    if (as) {
      list.push({
        key: "annual-sales",
        href: "/dashboard/annual-sales",
        icon: "Building2",
        title: "全施設年間売上",
        sub: `年間売上（${as.facilityCount}施設）`,
        main: yenCompact(as.totalRevenue),
        yoy: as.yoyRate,
        yoyUnit: "%",
        budget: as.budgetAchievementRate,
        budgetUnit: "%",
        status:
          as.budgetAchievementRate == null
            ? "ok"
            : as.budgetAchievementRate >= 100
              ? "ok"
              : "warn",
        note:
          as.budgetAchievementRate == null
            ? `${as.facilityCount}施設 ・ 予算未登録`
            : `予算達成率 ${percent(as.budgetAchievementRate, 0)} ・ ${as.facilityCount}施設`,
      });
    }

    return list;
  }, [occQ.data, chQ.data, asQ.data, periodLabel]);

  /* ---- derived data-quality alerts ---- */
  const alerts = useMemo<OverviewAlert[]>(() => {
    const out: OverviewAlert[] = [];
    const occ = occQ.data?.summary;
    if (occ && occ.occupancyRate == null) {
      out.push({
        level: "danger",
        icon: "TriangleAlert",
        title: "販売可能室数 未登録",
        body: "選択期間の販売可能室数が未登録です。稼働率・残室・RevPAR を算出できません。",
        cta: "稼働分析へ",
        href: "/dashboard/occupancy",
      });
    }
    const as = asQ.data?.summary;
    if (as && as.budgetAchievementRate == null) {
      out.push({
        level: "warning",
        icon: "FileX",
        title: "予算 未登録",
        body: "予算が未登録のため、予算差分は「—」で表示されます。",
        cta: "全施設年間売上へ",
        href: "/dashboard/annual-sales",
      });
    }
    return out;
  }, [occQ.data, asQ.data]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* page intro */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--text-2)",
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            <Icon name="Building2" size={15} />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{facLabel}</span>
            <span style={{ color: "var(--text-3)" }}>·</span>
            <span>{periodLabel}</span>
            <Badge tone="neutral" style={{ marginLeft: 4 }}>
              {filters.taxMode === "gross" ? "税込" : "税抜"}
            </Badge>
          </div>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>
            指標サマリー
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Btn variant="default" icon="FileDown" size="sm">
            エクスポート
          </Btn>
          <Btn
            variant="default"
            icon="Maximize2"
            size="sm"
            onClick={() => router.push("/dashboard/occupancy")}
          >
            詳細分析へ
          </Btn>
        </div>
      </div>

      {/* alerts */}
      <AlertStrip alerts={alerts} />

      {/* body */}
      {firstError ? (
        <div
          style={{
            padding: "32px 18px",
            textAlign: "center",
            color: "var(--text-2)",
            fontSize: 13.5,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
          }}
        >
          データの取得に失敗しました（{firstError.code ?? firstError.status}）。
        </div>
      ) : isLoading && cards.length === 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
            gap: 14,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
                boxShadow: "var(--shadow-card)",
                padding: 18,
              }}
            >
              <LoadingSkeleton rows={3} />
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
            gap: 14,
          }}
        >
          {cards.map((k) => (
            <OverviewCard key={k.key} k={k} />
          ))}
        </div>
      )}
    </div>
  );
}
