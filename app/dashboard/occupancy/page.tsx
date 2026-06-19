"use client";

/* ============================================================
   /dashboard/occupancy — 稼働分析
   Renders the live occupancy endpoint with the shared foundation.
   Layout faithful to docs/.../screens-occupancy.jsx:
     [title row] + [9-metric KPI strip] + [trend] + [matrix band].
   Matrix band: 当年実績 (+ 前年実績 / 前年実績比 when compareWith=previous_year).
   ============================================================ */

import useSWR from "swr";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import {
  Panel,
  Btn,
  EmptyState,
  LoadingSkeleton,
  Badge,
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { yen, integer, percent } from "@/lib/dashboard/format";
import type { FacilityOption } from "@/app/api/facilities/route";
import type { OccupancyRow, OccupancySummary } from "@/lib/api/types";
import { OccKpiStrip } from "@/components/screens/dashboard-occupancy/kpi-strip";
import { ActualMatrix } from "@/components/screens/dashboard-occupancy/matrix";
import { CompareMatrix } from "@/components/screens/dashboard-occupancy/compare-matrix";
import { MatrixCol } from "@/components/screens/dashboard-occupancy/matrix-col";
import { OccTrend } from "@/components/screens/dashboard-occupancy/trend";

const facilitiesFetcher = (url: string) =>
  fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json());

export default function OccupancyPage() {
  const { filters } = useFilters();
  const monthMode = filters.period === "yearly"; // yearly → monthly rows, monthly → daily rows
  const { data, error, isLoading } = useDashboardQuery("occupancy", filters);

  // facility display name for the subtitle (best-effort; gracefully degrades)
  const { data: facilities } = useSWR<FacilityOption[]>(
    "/api/facilities",
    facilitiesFetcher,
  );
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
  const isPY = cmp?.basis === "previous_year";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
          <OccKpiStrip summary={summary} metrics={isPY ? cmp?.metrics : null} />

          {/* trend */}
          <Panel
            title="稼働トレンド"
            sub={`売上（棒）× 稼働率（線）${baseline ? " · 前年稼働率（破線）" : ""}`}
            actions={
              summary.sellableRoomNights === 0 ? (
                <Badge tone="warning" icon="TriangleAlert">
                  販売可能室数 未登録
                </Badge>
              ) : undefined
            }
          >
            <OccTrend
              rows={rows}
              baseline={baseline}
              monthMode={monthMode}
              height={monthMode ? 240 : 220}
            />
          </Panel>

          {/* matrix band */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isPY ? "1fr 0.86fr 1fr" : "1fr",
              gap: 10,
              alignItems: "stretch",
            }}
          >
            <MatrixCol title="当年実績" sub={periodLabel} accent="var(--c-blue)">
              <div style={{ maxHeight: 520, padding: 0 }}>
                <ActualMatrix
                  rows={rows}
                  total={summary}
                  totalLabel="合計"
                  monthMode={monthMode}
                  rowH={monthMode ? 26 : undefined}
                />
              </div>
            </MatrixCol>

            {isPY && baseline && (
              <>
                <MatrixCol title="前年実績比" sub="当年 − 前年" accent="var(--c-amber)">
                  <div style={{ maxHeight: 520 }}>
                    <CompareMatrix
                      rows={rows}
                      baseline={baseline}
                      monthMode={monthMode}
                      rowH={monthMode ? 26 : undefined}
                      footLabel={monthMode ? "年間差分" : "月間差分"}
                    />
                  </div>
                </MatrixCol>

                <MatrixCol
                  title="前年実績"
                  sub={`${filters.year - 1}年`}
                  accent="var(--c-gray)"
                >
                  <div style={{ maxHeight: 520 }}>
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
          </div>

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
