"use client";

/* ============================================================
   app/dashboard/page.tsx — 総合ダッシュボード (TOP / overview).
   新 Claude Design 準拠。施設マルチセレクト + 表示モード(施設別/合算)。
   グローバル期間フィルタ(year/month/period/taxMode)は useFilters から、
   施設SET は画面ローカル state（URLには持たせない）で管理する。
   データは useOverview(/api/dashboard/overview) を消費するだけ。
   ============================================================ */

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Icon } from "@/components/ui/icon";
import { Badge, Btn, EmptyState, LoadingSkeleton, Segmented, Spinner } from "@/components/ui/primitives";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useOverview } from "@/lib/dashboard/use-overview";
import { FacilityPanel } from "@/components/screens/dashboard/facility-panel";
import { FacilityBoard } from "@/components/screens/dashboard/facility-board";
import type { FacilityOption } from "@/app/api/facilities/route";

const facFetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<FacilityOption[]>);

type Mode = "perFacility" | "total";

export default function DashboardOverviewPage() {
  const { filters } = useFilters();
  const { data: facilities } = useSWR<FacilityOption[]>("/api/facilities", facFetcher, {
    revalidateOnFocus: false,
  });

  // 施設SET（画面ローカル）。null = 未操作（既定としてグループ全施設を選択扱い）。
  // ユーザーが操作した時点で明示的な配列になる（URLには持たせない）。
  const [facilityIds, setFacilityIds] = useState<string[] | null>(null);
  const allIds = useMemo(() => (facilities ?? []).map((f) => f.id), [facilities]);
  const selectedIds = facilityIds ?? allIds;

  const [mode, setMode] = useState<Mode>("perFacility");

  const overviewFilters = useMemo(
    () => ({ year: filters.year, month: filters.month, period: filters.period, taxMode: filters.taxMode }),
    [filters.year, filters.month, filters.period, filters.taxMode],
  );
  const { data, error, isLoading, isValidating, mutate } = useOverview(overviewFilters, selectedIds);

  const taxLabel = filters.taxMode === "gross" ? "税込" : "税抜";
  const periodLabel =
    filters.period === "yearly" ? `${filters.year}年（通年）` : `${filters.year}年${filters.month ?? ""}月`;

  const noneSelected = facilityIds !== null && facilityIds.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.01em" }}>ダッシュボード</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-2)" }}>
            施設を選んで、施設ごと または 全施設合算で主要 KPI を確認できます。
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isValidating && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}>
              <Spinner size={14} />
              更新中
            </span>
          )}
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "perFacility", label: "施設別" },
              { value: "total", label: "全施設合算" },
            ]}
          />
        </div>
      </div>

      {/* 施設マルチセレクト */}
      <FacilityPanel value={selectedIds} onChange={setFacilityIds} />

      {/* 概要バッジ行 */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", color: "var(--text-2)", fontSize: 12.5 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
          <Icon name={mode === "total" ? "LayoutGrid" : "Building2"} size={16} style={{ color: "var(--text-2)" }} />
          {mode === "total" ? "全施設合算で表示" : "施設ごとに表示"}
        </span>
        <span style={{ color: "var(--text-3)" }}>·</span>
        <span>{periodLabel}</span>
        <Badge tone="neutral">{filters.period === "yearly" ? "年間" : "月間"}</Badge>
        <Badge tone="neutral">{taxLabel}</Badge>
      </div>

      {/* content */}
      {noneSelected ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "11px 14px",
            borderRadius: "var(--r-md)",
            background: "var(--primary-weak)",
            border: "1px solid var(--border)",
            color: "var(--primary-ink)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <Icon name="Building2" size={16} />
          上の「施設」一覧から 1つ以上の施設を選んでください。
        </div>
      ) : error ? (
        <EmptyState
          icon="TriangleAlert"
          title="データの取得に失敗しました"
          body="時間をおいて再読み込みしてください。"
          action={
            <Btn variant="default" icon="RotateCw" onClick={() => mutate()}>
              再読み込み
            </Btn>
          }
        />
      ) : !data && isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <LoadingSkeleton rows={2} height={40} />
          <div className="tdw-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="tdw-2">
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-lg)",
                    boxShadow: "var(--shadow-card)",
                    padding: 16,
                  }}
                >
                  <LoadingSkeleton rows={4} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !data ? null : data.perFacility.length === 0 ? (
        <EmptyState icon="Inbox" title="表示できるデータがありません" body="選択施設・期間に実績がありません。" />
      ) : mode === "total" ? (
        <FacilityBoard
          facility={null}
          totals={data.totals}
          heat={data.heatmap}
          nationalities={data.nationalities}
          domesticOverseas={data.domesticOverseas}
          channels={data.channels}
          stayNights={data.stayNights}
          budget={data.budget}
          period={filters.period}
          year={filters.year}
          month={filters.month}
          taxLabel={taxLabel}
          title="全施設合算"
          subtitle={`${data.scope.facilityCount}施設`}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          {data.perFacility.map((f, idx) => (
            <FacilityBoard
              key={f.facilityId}
              facility={f}
              heat={data.heatmap}
              nationalities={data.nationalities}
              domesticOverseas={data.domesticOverseas}
              channels={data.channels}
              stayNights={data.stayNights}
              budget={data.budget}
              period={filters.period}
              year={filters.year}
              month={filters.month}
              taxLabel={taxLabel}
              index={idx}
            />
          ))}
        </div>
      )}
    </div>
  );
}
