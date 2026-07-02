"use client";

/* ============================================================
   facility-board.tsx — 1ボード分の .tdw-grid（6カラム）。
   screens-top.jsx FacilityBoard 準拠の配置:
   6 KPIカード(.tdw-2) → カレンダー(.tdw-3) → 国籍TOP10(.tdw-3)
   → 予算ゲージ(.tdw-2) → 国内海外(.tdw-2) → 経路(.tdw-2) → 泊数(.tdw-2)。

   施設別モード(facility != null)では KPI と予算ゲージは施設単位、
   カレンダー/国籍/構成比ドーナツは API が「選択施設の合算」しか返さない
   ため合算値を表示する（per-facility 化は API 拡張が必要 = 既知の制約）。
   ============================================================ */

import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/primitives";
import { TopKpiCard, buildTopKpis, type MetricTriple, type TopKpiDescriptor } from "./top-kpi-card";
import { CalendarHeatmap } from "./calendar-heatmap";
import { NationalityTop10 } from "./nationality-top10";
import { CompositionDonut, type CompositionSlice } from "./composition-donut";
import { BudgetGauge } from "./budget-gauge";
import { TOP_PAL } from "./top-shared";
import { integer } from "@/lib/dashboard/format";
import {
  tdwItemsToRows,
  tdwDefaultLayout,
  TDW_WIDGETS,
  type WidgetId,
  type WidgetLayoutItem,
} from "@/lib/dashboard/widget-layout";
import type {
  OverviewBudget,
  OverviewChannels,
  OverviewDomesticOverseas,
  OverviewFacility,
  OverviewHeat,
  OverviewNationalities,
  OverviewStayNights,
  Period,
} from "@/lib/api/types";

const STAY_LABELS: Record<string, string> = {
  "1": "1泊",
  "2": "2泊",
  "3_4": "3〜4泊",
  "5_6": "5〜6泊",
  "7_plus": "7泊以上",
};
/* 順序データ向けクールランプ（screens-top STAYDIST_COLORS の先頭5色）。 */
const STAY_COLORS = ["#1E50C8", "#2E74E0", "#3E9AD4", "#2BA6A6", "#2E9E73"];
const DO_COLORS = [TOP_PAL.teal, TOP_PAL.blue, TOP_PAL.gray]; // 国内 / 海外 / 不明

export interface FacilityBoardProps {
  /** 施設別ボードはこの施設の指標を KPI に使う。合算ボードは null。 */
  facility: OverviewFacility | null;
  /** 合算ボード(facility=null)の KPI 用 指標セット。 */
  totals?: MetricTriple | null;
  heat: OverviewHeat;
  nationalities: OverviewNationalities;
  domesticOverseas: OverviewDomesticOverseas;
  channels: OverviewChannels;
  stayNights: OverviewStayNights;
  budget: OverviewBudget;
  period: Period;
  year: number;
  month?: number;
  taxLabel: string;
  /** 合算ボード見出し（facility=null のとき）。 */
  title?: string;
  subtitle?: string;
  /** 施設別ボードの連番（見出しアバター）。 */
  index?: number;
  /** ユーザー保存済みのウィジェット並び順（未指定なら初期レイアウト）。 */
  layout?: WidgetLayoutItem[];
  /** モバイル幅では見出しを縮小（screens-top.jsx 準拠: h2 20/25, avatar 40/46, icon 20/23）。 */
  isMobile?: boolean;
}

/** 施設別ボード用に、合算予算から該当施設の達成率を取り出した OverviewBudget を作る。 */
function deriveFacilityBudget(facility: OverviewFacility, budget: OverviewBudget): OverviewBudget {
  const pf = budget.perFacility.find((p) => p.facilityId === facility.facilityId);
  const revenueBudget = pf?.revenueBudget ?? facility.budget?.revenue ?? null;
  const revenueActual = pf?.revenueActual ?? facility.current.revenue;
  const achievementRate =
    pf?.achievementRate ?? (revenueBudget && revenueBudget !== 0 ? revenueActual / revenueBudget : null);
  return {
    hasData: revenueBudget != null,
    revenueActual,
    revenueBudget,
    achievementRate,
    soldRoomNightsActual: facility.current.soldRoomNights,
    soldRoomNightsBudget: facility.budget?.soldRoomNights ?? null,
    perFacility: [],
  };
}

export function FacilityBoard({
  facility,
  totals,
  heat,
  nationalities,
  domesticOverseas,
  channels,
  stayNights,
  budget,
  period,
  year,
  month,
  taxLabel,
  title,
  subtitle,
  index,
  layout,
  isMobile = false,
}: FacilityBoardProps) {
  const set: MetricTriple | null = facility
    ? { current: facility.current, previousYear: facility.previousYear, budget: facility.budget }
    : (totals ?? null);

  const periodLabel = period === "yearly" ? `${year}年（通年）` : `${year}年${month ?? ""}月`;
  const kpis = set ? buildTopKpis(set, periodLabel) : [];

  const perFacility = facility != null;
  // 施設別モード=施設固有データ / 合算モード=top-level 合算データ。施設別化により注記は無し。
  const heatSrc = facility ? facility.heatmap : heat;
  const natSrc = facility ? facility.nationalities : nationalities;
  const doSrc = facility ? facility.domesticOverseas : domesticOverseas;
  const chSrc = facility ? facility.channels : channels;
  const stSrc = facility ? facility.stayNights : stayNights;
  const sharedNote: string | undefined = undefined;

  const gaugeBudget = facility ? deriveFacilityBudget(facility, budget) : budget;

  const doSlices: CompositionSlice[] = doSrc.current.map((s) => ({
    label: s.label,
    revenue: s.revenue,
    soldRoomNights: s.soldRoomNights,
    share: s.share,
  }));
  const chSlices: CompositionSlice[] = chSrc.current.map((s) => ({
    label: s.channel,
    revenue: s.revenue,
    soldRoomNights: s.soldRoomNights,
    share: s.share,
  }));
  const stSlices: CompositionSlice[] = stSrc.current.map((s) => ({
    label: STAY_LABELS[s.bucket] ?? s.bucket,
    revenue: s.revenue,
    soldRoomNights: s.soldRoomNights,
    share: null,
  }));

  /* ---------- 見出し ---------- */
  const heading = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        minWidth: 0,
        marginBottom: 14,
      }}
    >
      <span
        style={{
          width: isMobile ? 40 : 46,
          height: isMobile ? 40 : 46,
          borderRadius: "var(--r-md)",
          background: "var(--surface-3)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          fontSize: 15,
          fontWeight: 800,
          color: "var(--text-2)",
        }}
      >
        {perFacility && index != null ? (
          <span className="tabular">{index + 1}</span>
        ) : (
          <Icon name={perFacility ? "Building2" : "LayoutGrid"} size={isMobile ? 20 : 23} style={{ color: "var(--text)" }} />
        )}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 25, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.12 }}>
            {facility ? facility.name : title ?? "全施設合算"}
          </h2>
          {facility?.area && <Badge tone="neutral">{facility.area}</Badge>}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-2)",
            fontSize: 12.5,
            marginTop: 5,
            flexWrap: "wrap",
          }}
        >
          {facility ? (
            <>
              {facility.roomsPerDay != null && (
                <>
                  <span>
                    客室{" "}
                    <strong className="tabular" style={{ color: "var(--text)" }}>
                      {integer(facility.roomsPerDay)}
                    </strong>
                    室
                  </span>
                  <span style={{ color: "var(--text-3)" }}>·</span>
                </>
              )}
              <span>{periodLabel}</span>
            </>
          ) : (
            <>
              {subtitle && <span>{subtitle}</span>}
              {subtitle && <span style={{ color: "var(--text-3)" }}>·</span>}
              <span>{periodLabel}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  /* ---------- ウィジェット描画（id → カード）。保存レイアウトの並び順で配置 ---------- */
  const kpiById: Record<string, TopKpiDescriptor> = {};
  kpis.forEach((k) => {
    kpiById[k.id] = k;
  });
  const KPI_IDS = new Set<WidgetId>(["revenue", "soldRoomNights", "adr", "avgGuests", "avgNights", "cancelRate"]);

  const renderWidget = (id: WidgetId) => {
    if (KPI_IDS.has(id)) {
      const k = kpiById[id];
      return k ? <TopKpiCard k={k} /> : null;
    }
    switch (id) {
      case "calendar":
        return <CalendarHeatmap heat={heatSrc} period={period} year={year} month={month} taxLabel={taxLabel} subnote={sharedNote} />;
      case "nationalityTopTen":
        return <NationalityTop10 nat={natSrc} taxLabel={taxLabel} subnote={sharedNote} />;
      case "budgetAchievement":
        return <BudgetGauge budget={gaugeBudget} taxLabel={taxLabel} />;
      case "domesticInternationalRatio":
        return (
          <CompositionDonut
            title="国内・海外比率"
            slices={doSlices}
            colors={DO_COLORS}
            taxLabel={taxLabel}
            sub="不明/未設定を含む構成比"
            footerLink={{ label: "国籍別分析を見る", route: "/dashboard/nationalities" }}
            subnote={sharedNote}
            emptyIcon="Globe"
          />
        );
      case "channelShare":
        return (
          <CompositionDonut
            title="経路別分析"
            slices={chSlices}
            taxLabel={taxLabel}
            footerLink={{ label: "経路別分析を見る", route: "/dashboard/channels" }}
            subnote={sharedNote}
            emptyIcon="Route"
          />
        );
      case "stayNightsDistribution":
        return (
          <CompositionDonut
            title="泊数別（室数）"
            slices={stSlices}
            toggle={false}
            defaultMetric="rooms"
            colors={STAY_COLORS}
            sub="販売室数の泊数構成 ・ 税表示の影響なし"
            footerLink={{ label: "泊数別分析を見る", route: "/dashboard/stay-nights" }}
            subnote={sharedNote}
            emptyIcon="Moon"
          />
        );
      default:
        return null;
    }
  };

  // 予算達成率は予算未登録の施設ではシステム側で自動非表示（ユーザー非表示とは別）
  const availableOnBoard = (id: WidgetId) => (id === "budgetAchievement" ? gaugeBudget.hasData : true);

  // 保存済みレイアウトを row-aware に展開。行内は利用可能なものだけ左詰め、
  // 利用不可で空になった行は詰めて連番の gridRow を割り当てる。narrow は CSS 側で order フロー。
  const layoutRows = tdwItemsToRows(layout && layout.length ? layout : tdwDefaultLayout()).rows;
  const cells: { id: WidgetId; col: number; span: number; gr: number }[] = [];
  let gr = 0;
  layoutRows.forEach((rowIds) => {
    const avail = rowIds.filter(availableOnBoard);
    if (!avail.length) return;
    gr++;
    let col = 1;
    avail.forEach((id) => {
      const span = TDW_WIDGETS[id].span;
      cells.push({ id, col, span, gr });
      col += span;
    });
  });

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      {heading}

      <div className="tdw-board">
        {cells.map((c) => (
          <div key={c.id} className={"cell s" + c.span} style={{ gridColumn: `${c.col} / span ${c.span}`, gridRow: c.gr }}>
            {renderWidget(c.id)}
          </div>
        ))}
      </div>

      {!gaugeBudget.hasData && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11.5,
            color: "var(--text-3)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="Info" size={13} />
          {facility ? "この施設は売上予算が未登録のため、予算達成率カードは非表示です。" : "売上予算が未登録のため、予算達成率カードは非表示です。"}
        </div>
      )}
    </section>
  );
}
