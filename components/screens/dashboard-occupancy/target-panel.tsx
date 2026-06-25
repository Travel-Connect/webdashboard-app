"use client";

/* ============================================================
   target-panel.tsx — 稼働分析「A室数の試算」パネル
   Excel 下部レイアウトを再現:
     販売可能室数 / 残室
     目標達成まで残り（不足額。達成済み / 予算未登録は別表示）
     残室を平均 ¥P で販売すれば目標達成
     前年比（売上の前年比）
   ============================================================ */

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/primitives";
import { yen, integer, percent } from "@/lib/dashboard/format";
import type { OccupancyTargeting } from "@/lib/api/types";

export interface TargetPanelProps {
  targeting?: OccupancyTargeting;
  taxMode: "gross" | "net";
}

/** 1 行: ラベル + 値（縦並びの key/value セル）。 */
function Cell({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 14px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 17,
          fontWeight: 800,
          letterSpacing: "-.02em",
          lineHeight: 1.1,
          color: accent ?? "var(--text)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function TargetPanel({ targeting, taxMode }: TargetPanelProps) {
  if (!targeting) return null;
  const t = targeting;
  const taxLabel = taxMode === "net" ? "税抜" : "税込";
  const hasBudget = t.budgetRevenue != null;
  const achieved = t.revenueGap != null && t.revenueGap <= 0;

  // 目標達成まで残り（不足額）の表示
  const gapValue = !hasBudget
    ? <span style={{ color: "var(--text-3)" }}>予算未登録</span>
    : achieved
      ? <span style={{ color: "var(--positive)" }}>達成済み</span>
      : yen(t.revenueGap);

  return (
    <Panel
      title="A室数の試算"
      sub={`残室を埋めるための目標単価・前年比（売上は${taxLabel}）`}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
        }}
      >
        <Cell label="販売可能室数" value={`${integer(t.sellableRoomNights)} 室`} />
        <Cell label="残室" value={`${integer(t.remainingRoomNights)} 室`} accent="var(--primary)" />
        <Cell label="目標達成まで残り" value={gapValue} />
        <Cell
          label="前年比（売上）"
          value={percent(t.yoyRate != null ? t.yoyRate * 100 : null, 0)}
        />
      </div>

      {/* 必要単価の案内文（残室を平均いくらで販売すれば達成できるか） */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
          padding: "10px 14px",
          background: "var(--surface-3)",
          borderRadius: "var(--r-md)",
          fontSize: 12.5,
          lineHeight: 1.7,
          color: "var(--text-2)",
        }}
      >
        <Icon name="Target" size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        {!hasBudget ? (
          <span>予算が未登録のため、目標単価は算出できません。</span>
        ) : achieved ? (
          <span>
            すでに売上目標を達成しています（
            <strong className="tabular" style={{ color: "var(--text)" }}>{yen(t.budgetRevenue)}</strong>
            ）。
          </span>
        ) : t.requiredAdr != null ? (
          <span>
            残室{" "}
            <strong className="tabular" style={{ color: "var(--text)" }}>{integer(t.remainingRoomNights)}室</strong>
            {" "}を平均{" "}
            <strong className="tabular" style={{ color: "var(--text)" }}>{yen(t.requiredAdr)}</strong>
            {" "}で販売すれば目標達成
          </span>
        ) : (
          <span>残室が無いため、目標単価は算出できません。</span>
        )}
      </div>
    </Panel>
  );
}
