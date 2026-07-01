"use client";

/* ============================================================
   top-kpi-card.tsx — TOP ダッシュボードの単一 KPI カード。
   screens-top.jsx TopKpiCard 準拠（中立トーン・前年差/予算差・ドリル）。
   buildTopKpis(set, periodLabel) で 6 KPI の記述子を固定順に生成する。
   ============================================================ */

import { type CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import {
  type KpiUnit,
  UNIT_SUFFIX,
  fmtKpiValue,
  NeutralDelta,
  useDrill,
} from "./top-shared";
import type { OverviewMetricSet } from "@/lib/api/types";

/* ---------- 記述子 ---------- */
export interface KpiDelta {
  /** 百分率差 (current-baseline)/baseline*100。baseline=0 → null。 */
  pct: number | null;
  /** 絶対差 current-baseline。 */
  abs: number | null;
}
export interface TopKpiDescriptor {
  id: string;
  label: string;
  unit: KpiUnit;
  current: number | null;
  periodLabel: string;
  /** 予算差を出せる KPI か（平均泊数・キャンセル率は予算なし）。 */
  budgetable: boolean;
  /** カード全体をクリックで遷移できるか（売上/販売室数のみ）。 */
  clickable: boolean;
  /** 当期間に実績が無い（'—'＋「実績データなし」表示）。 */
  dataMissing: boolean;
  previousYear: KpiDelta | null;
  budget: KpiDelta | null;
  link: { label: string; route: string } | null;
}

/** delta: current/baseline から {pct,abs}。どちらか null（または baseline 欠落）→ null（比較不可）。 */
function delta(
  current: number | null | undefined,
  baseline: number | null | undefined,
): KpiDelta | null {
  if (current == null || baseline == null || Number.isNaN(current) || Number.isNaN(baseline)) {
    return null;
  }
  const abs = current - baseline;
  const pct = baseline !== 0 ? (abs / baseline) * 100 : null;
  return { pct, abs };
}

export interface MetricTriple {
  current: OverviewMetricSet;
  previousYear: OverviewMetricSet;
  budget: OverviewMetricSet | null;
}

/**
 * 6 KPI 記述子を固定順で生成。
 * 順: 売上高 / 販売室数 / ADR / 同伴平均数 / 平均泊数 / キャンセル率。
 * キャンセル率は 0..1 を ×100 して % 表示にする。
 */
export function buildTopKpis(set: MetricTriple, periodLabel: string): TopKpiDescriptor[] {
  const { current, previousYear, budget } = set;
  const b = budget;
  const pct100 = (v: number | null) => (v == null ? null : v * 100);

  return [
    {
      id: "revenue",
      label: "売上高",
      unit: "yen",
      current: current.revenue,
      periodLabel,
      budgetable: true,
      clickable: true,
      dataMissing: false,
      previousYear: delta(current.revenue, previousYear.revenue),
      budget: delta(current.revenue, b?.revenue ?? null),
      link: { label: "稼働分析を見る", route: "/dashboard/occupancy" },
    },
    {
      id: "soldRoomNights",
      label: "販売室数",
      unit: "rooms",
      current: current.soldRoomNights,
      periodLabel,
      budgetable: true,
      clickable: true,
      dataMissing: false,
      previousYear: delta(current.soldRoomNights, previousYear.soldRoomNights),
      budget: delta(current.soldRoomNights, b?.soldRoomNights ?? null),
      link: { label: "稼働分析を見る", route: "/dashboard/occupancy" },
    },
    {
      id: "adr",
      label: "ADR",
      unit: "yen",
      current: current.adr,
      periodLabel,
      budgetable: true,
      clickable: false,
      dataMissing: false,
      previousYear: delta(current.adr, previousYear.adr),
      budget: delta(current.adr, b?.adr ?? null),
      link: { label: "稼働分析を見る", route: "/dashboard/occupancy" },
    },
    {
      id: "avgGuests",
      label: "同伴平均数",
      unit: "people",
      current: current.avgGuestsPerRoom,
      periodLabel,
      budgetable: true,
      clickable: false,
      dataMissing: false,
      previousYear: delta(current.avgGuestsPerRoom, previousYear.avgGuestsPerRoom),
      budget: delta(current.avgGuestsPerRoom, b?.avgGuestsPerRoom ?? null),
      link: { label: "稼働分析を見る", route: "/dashboard/occupancy" },
    },
    {
      id: "avgNights",
      label: "平均泊数",
      unit: "nights",
      current: current.avgNights,
      periodLabel,
      budgetable: false,
      clickable: false,
      dataMissing: false,
      previousYear: delta(current.avgNights, previousYear.avgNights),
      budget: null,
      link: { label: "泊数別分析を見る", route: "/dashboard/stay-nights" },
    },
    {
      id: "cancelRate",
      label: "キャンセル率",
      unit: "percent",
      current: pct100(current.cancelRate),
      periodLabel,
      budgetable: false,
      clickable: false,
      dataMissing: false,
      previousYear: delta(pct100(current.cancelRate), pct100(previousYear.cancelRate)),
      budget: null,
      link: null,
    },
  ];
}

/* ---------- カード本体 ---------- */
export function TopKpiCard({ k }: { k: TopKpiDescriptor }) {
  const drill = useDrill();

  const showPY = !k.dataMissing;
  const showBud = k.budgetable && !k.dataMissing;
  const cmpRows: { key: string; label: string; d: KpiDelta | null }[] = [];
  if (showPY) cmpRows.push({ key: "py", label: "前年差", d: k.previousYear });
  if (showBud) cmpRows.push({ key: "bud", label: "予算差", d: k.budget });

  const body = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)" }}>{k.label}</span>
        {k.clickable && <Icon name="ArrowUpRight" size={15} style={{ color: "var(--text-3)" }} />}
      </div>

      {k.dataMissing ? (
        <div style={{ padding: "10px 0 6px" }}>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 800, color: "var(--text-3)" }}>
            —
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-3)",
              marginTop: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon name="CircleOff" size={12} />
            当期間の実績データなし
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "6px 0 2px" }}>
          <span
            className="tabular"
            style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.05 }}
          >
            {fmtKpiValue(k.unit, k.current)}
          </span>
          {UNIT_SUFFIX[k.unit] && (
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>{UNIT_SUFFIX[k.unit]}</span>
          )}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-3)" }}>{k.periodLabel}</div>

      {!k.dataMissing && cmpRows.length > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {cmpRows.map((r) => (
            <div
              key={r.key}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
            >
              <span style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 600, flexShrink: 0 }}>
                {r.label}
              </span>
              {r.d ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <NeutralDelta value={r.d.pct} kind="pct" unit={k.unit} strong />
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    (<NeutralDelta value={r.d.abs} kind="abs" unit={k.unit} />)
                  </span>
                </span>
              ) : (
                <span
                  title="比較対象データがありません"
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-3)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon name="Minus" size={12} />
                  比較不可
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {k.link && !k.clickable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            drill(k.link!.route);
          }}
          style={{
            marginTop: 11,
            alignSelf: "flex-start",
            border: "none",
            background: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--primary)",
            fontSize: 12,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {k.link.label}
          <Icon name="ChevronRight" size={13} />
        </button>
      )}
      {k.link && k.clickable && (
        <span
          style={{
            marginTop: 11,
            color: "var(--primary)",
            fontSize: 12,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {k.link.label}
          <Icon name="ChevronRight" size={13} />
        </span>
      )}
    </>
  );

  const shell: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    boxShadow: "var(--shadow-card)",
    padding: 16,
    textAlign: "left",
    width: "100%",
  };

  if (k.clickable && k.link && !k.dataMissing) {
    return (
      <button
        onClick={() => drill(k.link!.route)}
        style={{ ...shell, cursor: "pointer", transition: "border-color .12s, box-shadow .12s" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--border-strong)";
          e.currentTarget.style.boxShadow = "var(--shadow-pop)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.boxShadow = "var(--shadow-card)";
        }}
      >
        {body}
      </button>
    );
  }
  return <div style={shell}>{body}</div>;
}
