"use client";

/* ============================================================
   target-panel.tsx — 稼働分析「A室数の試算」パネル
   Excel 下部レイアウトを再現:
     販売可能室数 / 残室
     目標達成まで残り（不足額。達成済み / 予算未登録は別表示）
     残室を平均 ¥P で販売すれば目標達成
     前年比（売上の前年比）
   ============================================================ */

import { useState, useMemo, type ReactNode } from "react";
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

      {/* 目標達成シミュレーター（平均単価を入力 → 必要販売室数を自動逆算） */}
      {!hasBudget ? (
        <StaticNote>予算が未登録のため、目標単価は算出できません。</StaticNote>
      ) : achieved ? (
        <StaticNote>
          すでに売上目標を達成しています（
          <strong className="tabular" style={{ color: "var(--text)" }}>{yen(t.budgetRevenue)}</strong>
          ）。
        </StaticNote>
      ) : t.revenueGap != null && t.revenueGap > 0 && t.futureRemainingRoomNights > 0 ? (
        <TargetSimulator
          gap={t.revenueGap}
          remaining={t.futureRemainingRoomNights}
          requiredAdr={t.requiredAdr}
          currentAdr={t.soldRoomNights > 0 ? t.roomRevenue / t.soldRoomNights : null}
          sold={t.soldRoomNights}
          sellable={t.sellableRoomNights}
          revenue={t.roomRevenue}
        />
      ) : (
        <StaticNote>翌日以降に販売できる残室がないため、目標単価は算出できません。</StaticNote>
      )}
    </Panel>
  );
}

/** 静的な案内文（予算未登録 / 達成済み / 残室なし）。 */
function StaticNote({ children }: { children: ReactNode }) {
  return (
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
      <span>{children}</span>
    </div>
  );
}

/**
 * 目標達成シミュレーター。
 * 平均販売単価を入力すると、翌日以降の残室をその単価で売った場合に
 * 目標達成へ必要な販売室数（〇室）を自動逆算し、残室で足りるか判定する。
 * 初期値は「翌日以降の残室を売り切れば達成する単価」(requiredAdr) を採用。
 * @param remaining 翌日以降（明日〜期間末）の販売可能な残室数。
 */
function TargetSimulator({
  gap,
  remaining,
  requiredAdr,
  currentAdr,
  sold,
  sellable,
  revenue,
}: {
  gap: number;
  /** 翌日以降の残室数（過去日・当日は除外）。 */
  remaining: number;
  requiredAdr: number | null;
  currentAdr: number | null;
  /** 期間内の実績販売室泊（過去日含む合計）。達成時稼働率・ADRの分母に使う。 */
  sold: number;
  /** 期間内の販売可能室泊（稼働率の分母）。 */
  sellable: number;
  /** 期間内の実績客室売上（taxMode 準拠）。達成時ADRの分子に使う。 */
  revenue: number;
}) {
  const defaultPrice = useMemo(() => {
    if (requiredAdr != null && requiredAdr > 0) return Math.round(requiredAdr);
    if (currentAdr != null && currentAdr > 0) return Math.round(currentAdr);
    return 0;
  }, [requiredAdr, currentAdr]);

  const [price, setPrice] = useState<number>(defaultPrice);
  // フィルタ変更（施設・期間）で既定値が変わったら入力も追従リセット。
  // effect ではなくレンダリング中の派生 state 更新（React 公式の推奨パターン）。
  const [seed, setSeed] = useState<number>(defaultPrice);
  if (seed !== defaultPrice) {
    setSeed(defaultPrice);
    setPrice(defaultPrice);
  }

  const roomsNeeded = price > 0 ? Math.ceil(gap / price) : null;
  const feasible = roomsNeeded != null && roomsNeeded <= remaining;
  const slack = roomsNeeded != null ? remaining - roomsNeeded : null;
  // この単価で残室を売り切っても届かない不足額（残室不足時の参考）。
  const shortfall = Math.max(0, gap - price * remaining);

  // 目標達成（または残室を売り切った）段階での稼働率を試算。
  // 分子 = 実績販売室泊 + この単価で売る室数（達成可能なら必要室数、残室不足なら残室を全部）。
  const roomsToSell = roomsNeeded == null ? 0 : feasible ? roomsNeeded : remaining;
  const currentOcc = sellable > 0 ? sold / sellable : null;
  const projectedOcc = sellable > 0 ? (sold + roomsToSell) / sellable : null;
  const occDeltaPt =
    projectedOcc != null && currentOcc != null ? (projectedOcc - currentOcc) * 100 : null;

  // 達成（または売り切り）時点の期間ADR（平均室単価）。
  // 入力単価で roomsToSell 室を売り足した後の「総売上 ÷ 総販売室泊」。
  const projectedSold = sold + roomsToSell;
  const projectedAdr = projectedSold > 0 ? (revenue + roomsToSell * price) / projectedSold : null;
  const adrDelta =
    projectedAdr != null && currentAdr != null ? projectedAdr - currentAdr : null;

  const accent = feasible ? "var(--positive)" : "var(--danger)";

  return (
    <div
      style={{
        marginTop: 10,
        padding: "12px 14px",
        background: "var(--surface-3)",
        borderRadius: "var(--r-md)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* 入力行: 残室 N室 を平均 [¥____] で販売 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          fontSize: 12.5,
          color: "var(--text-2)",
        }}
      >
        <Icon name="Target" size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        翌日以降の残室{" "}
        <strong className="tabular" style={{ color: "var(--text)" }}>
          {integer(remaining)}室
        </strong>{" "}
        を平均
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            padding: "3px 8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
          }}
        >
          <span style={{ color: "var(--text-3)" }}>¥</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={price || ""}
            onChange={(e) => setPrice(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="tabular"
            aria-label="平均販売単価"
            style={{
              width: 88,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text)",
              fontSize: 14,
              fontWeight: 700,
              textAlign: "right",
            }}
          />
        </span>
        で販売すると
      </div>

      {/* 結果行: 目標達成に 〇室 必要 + 可否バッジ */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 4,
            fontSize: 12.5,
            color: "var(--text-2)",
          }}
        >
          目標達成まで
          <strong
            className="tabular"
            style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", color: accent }}
          >
            {roomsNeeded != null ? integer(roomsNeeded) : "—"}
          </strong>
          室
        </div>
        {/* 達成（残室不足時は売り切り）段階での稼働率 */}
        {projectedOcc != null && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              fontSize: 12.5,
              color: "var(--text-2)",
            }}
          >
            {feasible ? "達成時の稼働率" : "売り切り時の稼働率"}
            <strong
              className="tabular"
              style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", color: "var(--text)" }}
            >
              {percent(projectedOcc * 100, 1)}
            </strong>
            {occDeltaPt != null && occDeltaPt > 0.05 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--positive)" }}>
                +{occDeltaPt.toFixed(1)}pt
              </span>
            )}
          </div>
        )}
        {/* 達成（残室不足時は売り切り）時点の期間ADR */}
        {projectedAdr != null && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              fontSize: 12.5,
              color: "var(--text-2)",
            }}
          >
            {feasible ? "達成時のADR" : "売り切り時のADR"}
            <strong
              className="tabular"
              style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", color: "var(--text)" }}
            >
              {yen(projectedAdr)}
            </strong>
            {adrDelta != null && Math.abs(adrDelta) >= 1 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>
                {adrDelta >= 0 ? "+" : "−"}
                {yen(Math.abs(adrDelta))}
              </span>
            )}
          </div>
        )}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 9px",
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 700,
            color: accent,
            background: feasible ? "var(--positive-weak, rgba(34,197,94,.12))" : "rgba(239,68,68,.12)",
          }}
        >
          <Icon name={feasible ? "Check" : "TriangleAlert"} size={12} strokeWidth={2.5} />
          {feasible
            ? `達成可能（残り ${integer(slack)}室の余裕）`
            : `残室不足（${yen(shortfall)} 不足）`}
        </span>
      </div>

      {/* 補助: 全残室を売り切るなら必要な平均単価 */}
      {requiredAdr != null && (
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          ※ 翌日以降の残室{integer(remaining)}室すべてを売り切る場合の必要平均単価は{" "}
          <strong className="tabular" style={{ color: "var(--text-2)" }}>{yen(requiredAdr)}</strong>
        </div>
      )}
    </div>
  );
}
