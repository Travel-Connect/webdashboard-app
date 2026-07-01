"use client";

/* ============================================================
   budget-gauge.tsx — 予算達成率ゲージ（半円アーク）。
   screens-top.jsx BudgetGauge / BudgetAchievementCard 準拠。
   実績 ÷ 予算 のアークと、実績 / 予算 の併記。
   budget.hasData が false のときは empty-state（呼び出し側で非表示も可）。
   ============================================================ */

import { WidgetCard, ModuleEmpty, FooterLink } from "./top-shared";
import { yen } from "@/lib/dashboard/format";
import type { OverviewBudget } from "@/lib/api/types";

function GaugeArc({ rate }: { rate: number }) {
  const W = 260,
    H = 144,
    cx = 130,
    cy = 128,
    r = 100,
    sw = 18;
  const capped = Math.max(0, Math.min(rate, 100));
  const a0 = Math.PI,
    a1 = Math.PI * 2;
  const ang = a0 + (capped / 100) * (a1 - a0);
  const pt = (a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const arc = (s: number, e: number) => {
    const [x0, y0] = pt(s);
    const [x1, y1] = pt(e);
    const large = e - s > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  const over = rate >= 100;
  const color = over ? "var(--positive)" : "var(--primary)";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={"予算達成率 " + rate.toFixed(0) + "%"}
      style={{ display: "block", maxWidth: 300, margin: "0 auto" }}
    >
      <path d={arc(a0, a1)} fill="none" stroke="var(--surface-3)" strokeWidth={sw} strokeLinecap="round" />
      <path d={arc(a0, ang)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <text x={cx} y={cy - 26} textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--text)" className="tabular">
        {rate.toFixed(0)}%
      </text>
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11.5" fill="var(--text-3)">
        予算達成率
      </text>
      <text x={cx - r} y={cy + 16} textAnchor="middle" fontSize="10" fill="var(--text-3)">
        0%
      </text>
      <text x={cx + r} y={cy + 16} textAnchor="middle" fontSize="10" fill="var(--text-3)">
        100%
      </text>
    </svg>
  );
}

export interface BudgetGaugeProps {
  budget: OverviewBudget;
  taxLabel?: string;
  subnote?: string;
}

export function BudgetGauge({ budget, taxLabel, subnote }: BudgetGaugeProps) {
  const subParts: string[] = [];
  if (subnote) subParts.push(subnote);
  subParts.push("売上実績 ÷ 売上予算" + (taxLabel ? `（${taxLabel}）` : ""));

  const footer = (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <FooterLink label="年間売上を見る" route="/dashboard/annual-sales" />
    </div>
  );

  if (!budget.hasData || budget.revenueBudget == null || budget.achievementRate == null) {
    return (
      <WidgetCard title="予算達成率" sub={subParts.join(" ・ ")} footer={footer}>
        <ModuleEmpty icon="Target" msg="売上予算が未登録です" />
      </WidgetCard>
    );
  }

  const rate = budget.achievementRate * 100;
  const over = rate >= 100;

  return (
    <WidgetCard title="予算達成率" sub={subParts.join(" ・ ")} footer={footer}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
        <GaugeArc rate={rate} />
        {over ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--positive)",
            }}
          >
            <span aria-hidden="true">🎉</span>
            <span>予算を達成しました</span>
          </div>
        ) : (
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>予算に対する進捗です</div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 18,
            fontSize: 12.5,
            color: "var(--text-2)",
            borderTop: "1px solid var(--border)",
            paddingTop: 12,
          }}
        >
          <span>
            実績{" "}
            <strong className="tabular" style={{ color: "var(--text)" }}>
              {yen(budget.revenueActual)}
            </strong>
          </span>
          <span style={{ color: "var(--border-strong)" }}>/</span>
          <span>
            予算{" "}
            <strong className="tabular" style={{ color: "var(--text)" }}>
              {yen(budget.revenueBudget)}
            </strong>
          </span>
        </div>
      </div>
    </WidgetCard>
  );
}
