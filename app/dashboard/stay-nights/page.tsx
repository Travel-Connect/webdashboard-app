"use client";

/* ============================================================
   泊数分析表（泊数分布） — app/dashboard/stay-nights/page.tsx
   指標ボタンで切替（販売室数 / 売上 / ADR / 同伴係数 / すべて表示）。
   各指標は [当年] と [前年実績] を並べて表示。
   施設・年・税表示はヘッダーのフィルタバーに従う（useFilters）。
   ============================================================ */

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useDashboardQuery } from "@/lib/dashboard/client";
import { Btn, EmptyState, LoadingSkeleton, LoadingOverlay } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Dropdown, FilterButton, MenuItem } from "@/components/dashboard/dropdown";
import type { FacilityOption } from "@/app/api/facilities/route";
import { pivotStayNights } from "@/components/screens/dashboard-stay-nights/model";
import {
  RoomsTable,
  SalesTable,
  MetricTable,
} from "@/components/screens/dashboard-stay-nights/tables";

const STAY_VIO = "37,111,219";

/** 全室タイプ（横断）を表す sentinel。空文字＝部屋タイプ絞り込みなし。 */
const ALL_ROOMTYPES = "";

type MetricId = "rooms" | "sales" | "adr" | "comp";
const STAY_METRICS: { id: MetricId; label: string }[] = [
  { id: "rooms", label: "販売室数" },
  { id: "sales", label: "売上" },
  { id: "adr", label: "ADR" },
  { id: "comp", label: "同伴係数" },
];
const ALL_IDS = STAY_METRICS.map((m) => m.id);

function stayNote(id: MetricId, gross: boolean): string {
  if (id === "rooms") return "※チェックインベースで計算";
  if (id === "sales") return gross ? "※税込" : "※税抜";
  if (id === "adr") return gross ? "※税込・室単価" : "※税抜・室単価";
  if (id === "comp") return "※1予約あたりの平均同伴人数";
  return "";
}

const facilitiesFetcher = (url: string): Promise<FacilityOption[]> =>
  fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json());

export default function StayNightsPage() {
  const { filters } = useFilters();
  const [roomType, setRoomType] = useState<string>(ALL_ROOMTYPES);
  const [sel, setSel] = useState<MetricId[]>(["rooms"]);

  // 施設が変わると部屋タイプの母集合が変わるため、選択を全室タイプへリセット。
  // prop 変化に応じた state 調整＝レンダー中の条件付き setState（React 推奨／useEffect 不要）。
  const [prevFacility, setPrevFacility] = useState(filters.facilityId);
  if (prevFacility !== filters.facilityId) {
    setPrevFacility(filters.facilityId);
    setRoomType(ALL_ROOMTYPES);
  }

  const curY = filters.year;
  const priorY = curY - 1;
  const gross = filters.taxMode === "gross";

  // 当年 / 前年 を別クエリで取得（前年は year を1つ戻す）。部屋タイプ絞り込みは両方へ適用。
  const rt = roomType || undefined;
  const cur = useDashboardQuery("stay-nights", { ...filters, roomType: rt });
  const prev = useDashboardQuery("stay-nights", { ...filters, year: priorY, roomType: rt });

  const { data: facilities } = useSWR<FacilityOption[]>("/api/facilities", facilitiesFetcher, {
    revalidateOnFocus: false,
  });

  const isAll = filters.facilityId === "all";
  const facName = isAll
    ? "全施設"
    : facilities?.find((f) => f.id === filters.facilityId)?.displayName ?? "施設";

  // 選択可能な部屋タイプ（当年データの母集合・売上降順）
  const roomTypes = cur.data?.roomTypes ?? [];
  const roomTypeLabel = roomType || "全室タイプ";

  const curRows = useMemo(() => pivotStayNights(cur.data?.rows ?? []), [cur.data]);
  const prevRows = useMemo(() => pivotStayNights(prev.data?.rows ?? []), [prev.data]);

  const shown = STAY_METRICS.filter((m) => sel.includes(m.id));
  const allOn = ALL_IDS.every((id) => sel.includes(id));
  const multi = shown.length > 1;

  const pick = (id: MetricId, e: React.MouseEvent) => {
    const add = e.ctrlKey || e.metaKey;
    if (add) {
      setSel((prevSel) =>
        prevSel.includes(id)
          ? prevSel.length > 1
            ? prevSel.filter((x) => x !== id)
            : prevSel
          : [...prevSel, id],
      );
    } else {
      setSel([id]);
    }
  };
  const setAll = () => setSel(ALL_IDS.slice());
  const isOn = (id: MetricId) => sel.includes(id);

  const wrap: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    background: "var(--surface)",
    boxShadow: "var(--shadow-card)",
  };

  const tabBtn = (id: MetricId, label: string) => (
    <button
      key={id}
      onClick={(e) => pick(id, e)}
      title="Ctrl/⌘+クリックで複数選択"
      style={{
        height: 32,
        padding: "0 15px",
        borderRadius: "var(--r-md)",
        cursor: "pointer",
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        border: "1px solid " + (isOn(id) ? "rgba(" + STAY_VIO + ",0.5)" : "var(--border)"),
        background: isOn(id) ? "rgba(" + STAY_VIO + ",0.1)" : "var(--surface)",
        color: isOn(id) ? "var(--primary-ink)" : "var(--text-2)",
      }}
    >
      {label}
    </button>
  );

  const sectionBar = (label: string, note: string) => (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 8,
        height: 40,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 16px",
        background: "var(--primary)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: ".02em",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <span style={{ opacity: 0.8, fontSize: 11.5, fontWeight: 600 }}>指標</span>
      {label}
      {note && (
        <span style={{ opacity: 0.8, fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap" }}>{note}</span>
      )}
    </div>
  );

  const renderPair = (id: MetricId, headTop: number | null) => {
    if (id === "rooms")
      return (
        <>
          <RoomsTable rows={curRows} year={curY} headTop={headTop} />
          <RoomsTable rows={prevRows} year={priorY} prior headTop={headTop} />
        </>
      );
    if (id === "sales")
      return (
        <>
          <SalesTable rows={curRows} year={curY} headTop={headTop} />
          <SalesTable rows={prevRows} year={priorY} prior headTop={headTop} />
        </>
      );
    if (id === "adr")
      return (
        <>
          <MetricTable rows={curRows} year={curY} metric="adr" footLabel="平均" lastLabel="平均ADR" headTop={headTop} />
          <MetricTable rows={prevRows} year={priorY} prior metric="adr" footLabel="平均" lastLabel="平均ADR" headTop={headTop} />
        </>
      );
    return (
      <>
        <MetricTable rows={curRows} year={curY} metric="comp" footLabel="平均" lastLabel="平均同伴件数" headTop={headTop} />
        <MetricTable rows={prevRows} year={priorY} prior metric="comp" footLabel="平均" lastLabel="平均同伴件数" headTop={headTop} />
      </>
    );
  };

  const isLoading = cur.isLoading && !cur.data;
  const hasError = cur.error;
  const noData = !isLoading && !hasError && curRows.length === 0;

  return (
    <div style={{ height: "calc(100dvh - 152px)", display: "flex", flexDirection: "column", gap: 12, overflow: "hidden", position: "relative" }}>
      {/* 再取得中オーバーレイ（旧データを見せつつ上に重ねる。複数クエリは当年=cur を基準） */}
      {!hasError && cur.data && cur.isValidating && <LoadingOverlay />}

      {/* タイトル + メタ */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>泊数分析表</h2>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3 }}>
            {facName} · {roomTypeLabel} · {gross ? "税込" : "税抜"}表示 · 当年 {curY}年 / 前年 {priorY}年 · 指標：
            <strong style={{ color: "var(--text)" }}>
              {allOn ? "すべて（4指標）" : shown.map((m) => m.label).join("・")}
            </strong>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Dropdown
            width={280}
            align="right"
            trigger={(open, toggle) => (
              <FilterButton
                icon="BedDouble"
                label="部屋タイプ"
                value={roomTypeLabel}
                open={open}
                onClick={toggle}
              />
            )}
          >
            {(close) => (
              <div style={{ padding: 4 }}>
                <MenuItem
                  active={roomType === ALL_ROOMTYPES}
                  onClick={() => {
                    setRoomType(ALL_ROOMTYPES);
                    close();
                  }}
                  right={roomType === ALL_ROOMTYPES ? <Icon name="Check" size={15} /> : undefined}
                >
                  全室タイプ（横断）
                </MenuItem>
                {roomTypes.length > 0 && (
                  <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                )}
                {roomTypes.map((rt) => (
                  <MenuItem
                    key={rt}
                    active={rt === roomType}
                    onClick={() => {
                      setRoomType(rt);
                      close();
                    }}
                    right={rt === roomType ? <Icon name="Check" size={15} /> : undefined}
                  >
                    {rt}
                  </MenuItem>
                ))}
                {roomTypes.length === 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-3)" }}>
                    部屋タイプがありません
                  </div>
                )}
              </div>
            )}
          </Dropdown>
          <Btn variant="default" icon="FileDown" size="sm">
            エクスポート
          </Btn>
        </div>
      </div>

      {/* 指標セレクタ */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0, alignItems: "center" }}>
        {STAY_METRICS.map((m) => tabBtn(m.id, m.label))}
        <span style={{ width: 1, height: 20, background: "var(--border-strong)", margin: "0 4px" }} />
        <button
          onClick={setAll}
          style={{
            height: 32,
            padding: "0 16px",
            borderRadius: "var(--r-md)",
            cursor: "pointer",
            fontSize: 12.5,
            fontWeight: 700,
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid " + (allOn ? "var(--primary)" : "rgba(" + STAY_VIO + ",0.4)"),
            background: allOn ? "var(--primary)" : "var(--surface)",
            color: allOn ? "#fff" : "var(--primary-ink)",
          }}
        >
          <Icon name="Rows3" size={14} />
          すべて表示
        </button>
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4, whiteSpace: "nowrap" }}>
          Ctrl/⌘+クリックで複数選択
        </span>
      </div>

      {isLoading ? (
        <div style={{ ...wrap, padding: 18 }}>
          <LoadingSkeleton rows={8} height={24} />
        </div>
      ) : hasError ? (
        <div style={{ ...wrap, padding: 18 }}>
          <EmptyState
            icon="TriangleAlert"
            title="データの取得に失敗しました"
            body={cur.error?.message ?? "時間をおいて再度お試しください。"}
          />
        </div>
      ) : noData ? (
        <div style={{ ...wrap, padding: 18 }}>
          <EmptyState
            icon="Inbox"
            title="表示できるデータがありません"
            body={`${curY}年の泊数データが見つかりませんでした。フィルタ条件をご確認ください。`}
          />
        </div>
      ) : multi ? (
        <div style={wrap}>
          {shown.map((m, i) => (
            <div key={m.id} style={{ marginBottom: i === shown.length - 1 ? 0 : 22 }}>
              {sectionBar(m.label, stayNote(m.id, gross))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: 18 }}>
                {renderPair(m.id, null)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={wrap}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: 18, alignItems: "start" }}>
            {renderPair(shown[0].id, 0)}
          </div>
        </div>
      )}
    </div>
  );
}
