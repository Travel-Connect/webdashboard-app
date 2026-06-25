"use client";

/* ============================================================
   /dashboard/occupancy — 稼働分析
   Renders the live occupancy endpoint with the shared foundation.
   Layout faithful to docs/.../screens-occupancy.jsx:
     [title row] + [9-metric KPI strip] + [matrix band].
   Matrix band は比較セレクタに応じて切替:
     previous_year → 当年実績 + 前年実績比 + 前年実績
     budget        → 当年実績 + 予算パネル（KPI は予算比）
     previous_snapshot（指定日取込）→ 準備中（別プラン）
   ============================================================ */

import useSWR from "swr";
import { useMemo } from "react";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import {
  Panel,
  Btn,
  EmptyState,
  LoadingSkeleton,
  LoadingOverlay,
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { yen, integer, percent } from "@/lib/dashboard/format";
import type { FacilityOption } from "@/app/api/facilities/route";
import type { OccupancyRow, OccupancySummary } from "@/lib/api/types";
import { OccKpiStrip } from "@/components/screens/dashboard-occupancy/kpi-strip";
import { ActualMatrix } from "@/components/screens/dashboard-occupancy/matrix";
import { CompareMatrix } from "@/components/screens/dashboard-occupancy/compare-matrix";
import { MatrixCol } from "@/components/screens/dashboard-occupancy/matrix-col";
import { TargetPanel } from "@/components/screens/dashboard-occupancy/target-panel";

const facilitiesFetcher = (url: string) =>
  fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json());

export default function OccupancyPage() {
  const { filters } = useFilters();
  const monthMode = filters.period === "yearly"; // yearly → monthly rows, monthly → daily rows

  // 比較セレクタ（なし/前年実績/予算/前回取込）を反映する。
  // 「なし」（未選択）は従来挙動を維持するため前年実績にフォールバック。
  // 予算 → budget basis、前回取込（指定日取込）は API 側で未対応（比較なし）。
  const occFilters = useMemo(
    () => ({
      ...filters,
      compareWith: filters.compareWith ?? ("previous_year" as const),
    }),
    [filters],
  );
  const { data, error, isLoading, isValidating } = useDashboardQuery(
    "occupancy",
    occFilters,
  );

  // facility display name for the subtitle (best-effort; gracefully degrades)
  const { data: facilities } = useSWR<FacilityOption[]>(
    "/api/facilities",
    facilitiesFetcher,
  );
  // 当年実績(ライブデータ)が何日時点か（最終取込日）
  const { data: freshness } = useSWR<{ dataAsOf: string | null }>(
    "/api/dashboard/data-freshness",
    facilitiesFetcher,
    { revalidateOnFocus: false },
  );
  const dataAsOf = freshness?.dataAsOf ?? null;
  const facName =
    filters.facilityId === "all"
      ? "全施設"
      : (facilities?.find((f) => f.id === filters.facilityId)?.displayName ??
        "施設");

  const periodLabel =
    filters.period === "monthly"
      ? `${filters.year}年${filters.month ?? "—"}月`
      : `${filters.year}年`;
  const grainLabel = filters.period === "monthly" ? "月間（日次）" : "年間（月次）";

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const cmp = data?.comparison ?? null;
  const baseline = cmp?.rows ?? null;
  const basis = cmp?.basis ?? null;
  const isPY = basis === "previous_year";
  const isBudget = basis === "budget";
  const isSnap = basis === "previous_snapshot";
  const isBudgetYear = isBudget && monthMode;   // 年間予算 → 当年実績｜予算差｜予算 の3列帯
  const isBudgetMonth = isBudget && !monthMode; // 月間予算 → 年間予算へ誘導（日別予算なし）
  // 3列帯（当年実績｜差分｜基準実績）＝前年実績 / 指定日取込 / 年間予算（いずれも基準行を持つ）
  const cmpBand = (isPY || isSnap || isBudgetYear) && baseline != null && baseline.length > 0;
  const lbl = compareLabels(basis, filters.year, cmp?.asOf); // 列タイトル・KPIラベル
  const requestedBasis = occFilters.compareWith; // API へ送った比較基準

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
      {/* 再取得中オーバーレイ（旧データを見せつつ上に重ねる） */}
      {!error && data && isValidating && <LoadingOverlay />}

      {/* ---------- title row ---------- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, whiteSpace: "nowrap" }}>
            稼働分析
          </h2>
          <span
            style={{
              fontSize: 12.5,
              color: "var(--text-2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {facName} · {periodLabel} · {grainLabel}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {summary && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--text-2)",
              }}
            >
              <Icon name="BedDouble" size={13} style={{ color: "var(--primary)" }} />
              売上{" "}
              <strong className="tabular" style={{ color: "var(--text)" }}>
                {yen(summary.roomRevenue)}
              </strong>
              <span style={{ color: "var(--text-3)" }}>·</span>稼働率{" "}
              <strong className="tabular" style={{ color: "var(--text)" }}>
                {percent(
                  summary.occupancyRate != null ? summary.occupancyRate * 100 : null,
                )}
              </strong>
            </span>
          )}
          <Btn variant="default" icon="FileDown" size="sm">
            エクスポート
          </Btn>
        </div>
      </div>

      {/* ---------- error ---------- */}
      {error && (
        <Panel>
          <EmptyState
            icon="TriangleAlert"
            title="データを取得できませんでした"
            body={error.message}
          />
        </Panel>
      )}

      {/* ---------- loading ---------- */}
      {!error && isLoading && !data && (
        <Panel title="稼働分析" sub="読み込み中…">
          <LoadingSkeleton rows={6} />
        </Panel>
      )}

      {/* ---------- empty ---------- */}
      {!error && data && rows.length === 0 && (
        <Panel>
          <EmptyState
            icon="CalendarOff"
            title="対象期間のデータがありません"
            body="フィルタ条件（施設・期間）を変更してください。"
          />
        </Panel>
      )}

      {/* ---------- content ---------- */}
      {!error && summary && rows.length > 0 && (
        <>
          {/* KPI strip */}
          <OccKpiStrip
            summary={summary}
            metrics={cmp ? cmp.metrics : null}
            compareLabel={lbl.kpiLabel}
          />

          {/* matrix band — デザインに無い稼働トレンドchartは撤去（プロト準拠）
              幅が足りない時は横スクロールせず行内で折り返す（auto-fit）。 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                cmpBand || isBudgetMonth
                  ? `repeat(auto-fit, minmax(${monthMode ? 516 : 446}px, 1fr))`
                  : "1fr",
              gap: 8,
              alignItems: isBudgetMonth ? "start" : "stretch",
            }}
          >
            <MatrixCol
              title="当年実績"
              sub={dataAsOf ? `${periodLabel}・${dataAsOf} 取込時点` : periodLabel}
              accent="var(--c-blue)"
            >
              <div style={{ padding: 0 }}>
                <ActualMatrix
                  rows={rows}
                  total={summary}
                  totalLabel="合計"
                  monthMode={monthMode}
                  rowH={monthMode ? 26 : undefined}
                />
              </div>
            </MatrixCol>

            {/* 差分 + 基準実績（previous_year / previous_snapshot / 年間予算） */}
            {cmpBand && baseline && (
              <>
                <MatrixCol title={lbl.midTitle} sub={lbl.midSub} accent="var(--c-amber)">
                  <div>
                    <CompareMatrix
                      rows={rows}
                      baseline={baseline}
                      monthMode={monthMode}
                      rowH={monthMode ? 26 : undefined}
                      footLabel={isBudget ? "予算差" : monthMode ? "年間差分" : "月間差分"}
                    />
                  </div>
                </MatrixCol>

                <MatrixCol title={lbl.rightTitle} sub={lbl.rightSub} accent="var(--c-gray)">
                  <div>
                    <ActualMatrix
                      rows={baseline}
                      total={baselineTotal(baseline)}
                      totalLabel="合計"
                      monthMode={monthMode}
                      rowH={monthMode ? 26 : undefined}
                    />
                  </div>
                </MatrixCol>
              </>
            )}

            {/* 月間予算: 日別予算が無いため年間表示へ誘導 */}
            {isBudgetMonth && cmp && (
              <MatrixCol title="予算" sub={`${filters.year}年 計画`} accent="var(--c-amber)">
                <div
                  style={{
                    padding: "18px 20px",
                    fontSize: 13,
                    lineHeight: 1.8,
                    color: "var(--text-2)",
                  }}
                >
                  <Icon
                    name="Target"
                    size={16}
                    style={{ color: "var(--text-3)", marginRight: 6, verticalAlign: "-3px" }}
                  />
                  月間ビューには日別の予算がありません。
                  <br />
                  予算との比較は{" "}
                  <strong style={{ color: "var(--text)" }}>「年間」表示</strong>{" "}
                  で年間予算をご確認ください。
                </div>
              </MatrixCol>
            )}
          </div>

          {/* A室数の試算（残室を埋める目標単価・前年比） */}
          <TargetPanel targeting={data.targeting} taxMode={filters.taxMode} />

          {/* 予算未登録（budget 選択だが対象データなし） */}
          {requestedBasis === "budget" && !cmp && (
            <Panel>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  color: "var(--text-2)",
                }}
              >
                <Icon name="Target" size={15} style={{ color: "var(--text-3)" }} />
                選択中の施設・期間に予算が登録されていないため、予算比較を表示できません（予算はコルディオ 2025–2026 のみ）。
              </div>
            </Panel>
          )}

          {/* 指定日取込: スナップショット未投入で比較不可 */}
          {requestedBasis === "previous_snapshot" && !cmp && (
            <Panel>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  color: "var(--text-2)",
                }}
              >
                <Icon name="History" size={15} style={{ color: "var(--text-3)" }} />
                指定日取込のスナップショットがまだ投入されていません（取込日を選択するか、バックフィル完了をお待ちください）。
              </div>
            </Panel>
          )}

          {/* sellable-missing notice (occupancy / RevPAR are null without inventory) */}
          {summary.occupancyRate == null && (
            <Panel>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  color: "var(--text-2)",
                }}
              >
                <Icon name="CircleMinus" size={15} style={{ color: "var(--text-3)" }} />
                販売可能室数が未登録のため、稼働率・RevPAR は算出できません（
                <span className="tabular">{integer(summary.soldRoomNights)}</span> 室の実績は表示されています）。
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

/** 比較基準ごとの列タイトル・KPIラベル（前年実績 / 指定日取込）。 */
function compareLabels(
  basis: string | null,
  year: number,
  asOf?: string,
): { midTitle: string; midSub: string; rightTitle: string; rightSub: string; kpiLabel: string } {
  if (basis === "previous_snapshot") {
    const md = asOf ? asOf.slice(5).replace("-", "/") : ""; // MM/DD
    return {
      midTitle: "指定日取込比",
      midSub: asOf ? `当年 − ${asOf} 時点` : "当年 − 取込時点",
      rightTitle: "指定日取込実績",
      rightSub: asOf ? `${asOf} 時点` : "取込時点",
      kpiLabel: md || "取込",
    };
  }
  if (basis === "budget") {
    return {
      midTitle: "予算差",
      midSub: "当年 − 予算",
      rightTitle: "予算",
      rightSub: `${year}年 計画`,
      kpiLabel: "予算",
    };
  }
  // previous_year（既定）
  return {
    midTitle: "前年実績比",
    midSub: "当年 − 前年",
    rightTitle: "前年実績",
    rightSub: `${year - 1}年`,
    kpiLabel: "前年",
  };
}

/** Derive a summary-like total from previous-year rows (live response gives
 *  comparison.rows but the prior-year aggregate is reconstructed here). */
function baselineTotal(r: OccupancyRow[]): OccupancySummary {
  const sum = (k: keyof OccupancyRow) =>
    r.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const sold = sum("soldRoomNights");
  const sellable = sum("sellableRoomNights");
  const guest = sum("guestCount");
  const rev = sum("roomRevenue");
  return {
    soldRoomNights: sold,
    sellableRoomNights: sellable,
    remainingRoomNights: sellable - sold,
    occupancyRate: sellable > 0 ? sold / sellable : null,
    guestCount: guest,
    roomRevenue: rev,
    guestUnitPrice: guest > 0 ? rev / guest : null,
    adr: sold > 0 ? rev / sold : null,
    revpar: sellable > 0 ? rev / sellable : null,
    avgGuestsPerRoom: sold > 0 ? guest / sold : null,
  };
}
