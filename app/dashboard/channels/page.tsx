"use client";

/* ============================================================
   経路分析 (Channels) — app/dashboard/channels/page.tsx
   経路×施設（月間）/ 経路×月（年間）クロスタブ。
   Ported from docs/.../screens-stub.jsx (ChannelsMonthly / ChannelsAnnual).
   Live endpoint: /api/dashboard/channels -> ChannelsResponse
   (matrix + matrixPrevious; the 当年/前年 toggle picks which to render).
   ============================================================ */

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import {
  Panel,
  Btn,
  EmptyState,
  LoadingSkeleton,
  LoadingOverlay,
  Segmented,
} from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { yenCompact } from "@/lib/dashboard/format";
import { ChannelMatrixTable } from "@/components/screens/dashboard-channels/channel-matrix";
import type { FacilityOption } from "@/app/api/facilities/route";

const facilitiesFetcher = (url: string) =>
  fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json());

export default function ChannelsPage() {
  const { filters } = useFilters();
  // 当年/前年トグルのため常に前年も取得（compareWith を固定）。
  const chFilters = useMemo(
    () => ({ ...filters, compareWith: "previous_year" as const }),
    [filters],
  );
  const { data, error, isLoading, isValidating } = useDashboardQuery(
    "channels",
    chFilters,
  );
  const [hideZero, setHideZero] = useState(true);
  const [view, setView] = useState<"cur" | "py">("cur");

  const { data: facilities } = useSWR<FacilityOption[]>("/api/facilities", facilitiesFetcher);
  const facName =
    filters.facilityId === "all"
      ? "全施設"
      : (facilities?.find((f) => f.id === filters.facilityId)?.displayName ?? "施設");

  const taxLabel = filters.taxMode === "gross" ? "税込" : "税抜";
  const isMonthly = filters.period === "monthly";

  const matrixCur = data?.matrix ?? null;
  const matrixPy = data?.matrixPrevious ?? null;
  const hasPy = !!matrixPy && matrixPy.rows.length > 0;
  const matrix = view === "py" && hasPy ? matrixPy : matrixCur;

  const shownYear = view === "py" ? filters.year - 1 : filters.year;
  const shownPeriodLabel = isMonthly
    ? `${shownYear}年${filters.month ?? ""}月`
    : `${shownYear}年（月次）`;

  const grand = matrix?.grandTotal ?? 0;
  const hiddenN = matrix ? matrix.rows.filter((r) => r.total === 0).length : 0;
  const nFac = matrixCur?.columnKind === "facility" ? matrixCur.columns.length : 0;
  const scopeLabel = isMonthly ? `全施設横断（${nFac}施設）` : facName;

  return (
    <div
      style={{
        height: "calc(100dvh - 150px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* 再取得中オーバーレイ（旧データを見せつつ上に重ねる） */}
      {!error && data && isValidating && <LoadingOverlay />}

      {/* title + toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>経路別実績一覧</h2>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-2)",
              marginTop: 3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {scopeLabel} · {shownPeriodLabel}
            {view === "py" ? "（前年）" : ""} · {taxLabel}表示
            {matrix ? (
              <>
                {" "}· {isMonthly ? "売上合計" : "年間売上"}{" "}
                <strong className="tabular" style={{ color: "var(--text)" }}>
                  {yenCompact(grand)}
                </strong>
              </>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Segmented
            size="sm"
            value={view}
            onChange={(v) => setView(v as "cur" | "py")}
            options={[
              { value: "cur", label: "当年" },
              { value: "py", label: "前年" },
            ]}
          />
          <button
            type="button"
            onClick={() => setHideZero((z) => !z)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 11px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              background: hideZero ? "var(--primary-weak)" : "var(--surface)",
              color: hideZero ? "var(--primary-ink)" : "var(--text-2)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Icon name={hideZero ? "EyeOff" : "Eye"} size={14} />
            売上0の経路を隠す{hiddenN > 0 && hideZero ? `（${hiddenN}）` : ""}
          </button>
          <Btn variant="default" icon="FileDown" size="sm">
            エクスポート
          </Btn>
        </div>
      </div>

      {/* body */}
      {error ? (
        <Panel>
          <EmptyState
            icon="TriangleAlert"
            title="データを取得できませんでした"
            body={error.message}
          />
        </Panel>
      ) : isLoading && !data ? (
        <Panel title="経路別実績">
          <LoadingSkeleton rows={8} />
        </Panel>
      ) : !matrix || matrix.rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon="Inbox"
            title="該当する経路がありません"
            body="選択した条件に売上データが見つかりませんでした。"
          />
        </Panel>
      ) : (
        <ChannelMatrixTable
          matrix={matrix}
          taxLabel={taxLabel}
          hideZero={hideZero}
          selectedColKey={
            isMonthly && filters.facilityId !== "all" ? filters.facilityId : null
          }
        />
      )}
    </div>
  );
}
