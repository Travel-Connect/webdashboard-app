"use client";

/* ============================================================
   monthly-view.tsx — 部屋タイプ別分析「月間」表示（コルディオ Excel 準拠）。
   上: 「販売客室数 ＆ ADR」複合グラフ
       販売客室数 = 棒[当月/前年/先月]（左軸）, ADR = 線[当月/前年/先月]（右軸）。
   下: 転置クロス集計（列=部屋タイプ[当月売上降順], 行=指標）。
       稼働率は部屋タイプ別在庫が無いため '—'（当月/前年/先月とも）。
   ============================================================ */

import { type CSSProperties } from "react";
import type { RoomTypeMonthlyDetail, RoomTypeMonthlyRow } from "@/lib/api/types";
import { MultiLineChart } from "@/components/charts";
import { yen, yenCompact, integer, percent } from "@/lib/dashboard/format";

// グラフ系列色（スクショ準拠: 販売客室数=teal/green/yellow, ADR=orange/gray/red）
const ROOMS_CUR = "#2E86AB";
const ROOMS_PY = "#8CB83C";
const ROOMS_PM = "#F4C20D";
const ADR_CUR = "#ED7D31";
const ADR_PY = "#9AA0A6";
const ADR_PM = "#E0524B";

const short = (s: string) => (s.length > 14 ? s.slice(0, 13) + "…" : s);
const n1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const roomsCell = (v: number | null) => (v == null ? "—" : integer(v) + "室");

interface MetricRow {
  label: string;
  get: (r: RoomTypeMonthlyRow) => string;
  /** 稼働率系（部屋タイプ別在庫が無く未対応）。ミュート表示。 */
  muted?: boolean;
}
const METRIC_ROWS: MetricRow[] = [
  { label: "売上", get: (r) => yen(r.revenue) },
  { label: "売上シェア率", get: (r) => percent(r.revenueShare != null ? r.revenueShare * 100 : null) },
  { label: "販売客室数", get: (r) => roomsCell(r.soldRoomNights) },
  { label: "販売客室数（前年）", get: (r) => roomsCell(r.soldRoomNightsPrevYear) },
  { label: "販売客室数（先月）", get: (r) => roomsCell(r.soldRoomNightsPrevMonth) },
  { label: "人数", get: (r) => (r.guestCount != null ? integer(r.guestCount) + "人" : "—") },
  { label: "ADR", get: (r) => yen(r.adr) },
  { label: "ADR（前年）", get: (r) => yen(r.adrPrevYear) },
  { label: "ADR（先月）", get: (r) => yen(r.adrPrevMonth) },
  { label: "同伴係数", get: (r) => n1(r.companion) },
  { label: "平均泊数", get: (r) => n1(r.avgNights) },
  // 稼働率: 客室数マスタ(app.room_type_inventory)登録済みなら実値、未登録なら percent() が '—'
  { label: "稼働率", get: (r) => percent(r.occupancy != null ? r.occupancy * 100 : null) },
  { label: "稼働率（前年）", get: (r) => percent(r.occupancyPrevYear != null ? r.occupancyPrevYear * 100 : null) },
  { label: "稼働率（先月）", get: (r) => percent(r.occupancyPrevMonth != null ? r.occupancyPrevMonth * 100 : null) },
];

export function RoomTypeMonthlyView({ detail }: { detail: RoomTypeMonthlyDetail }) {
  const rows = detail.rows;
  const labels = rows.map((r) => short(r.roomType));

  const barSeries = [
    { label: "販売客室数", color: ROOMS_CUR, values: rows.map((r) => r.soldRoomNights), axis: "left" as const },
    { label: "販売客室数（前年）", color: ROOMS_PY, values: rows.map((r) => r.soldRoomNightsPrevYear ?? 0), axis: "left" as const },
    { label: "販売客室数（先月）", color: ROOMS_PM, values: rows.map((r) => r.soldRoomNightsPrevMonth ?? 0), axis: "left" as const },
  ];
  const lineSeries = [
    { label: "ADR", color: ADR_CUR, values: rows.map((r) => r.adr ?? 0), axis: "right" as const },
    { label: "ADR（前年）", color: ADR_PY, values: rows.map((r) => r.adrPrevYear ?? 0), axis: "right" as const, dashed: true },
    { label: "ADR（先月）", color: ADR_PM, values: rows.map((r) => r.adrPrevMonth ?? 0), axis: "right" as const, dashed: true },
  ];

  const colW = 132;
  const headLabel: CSSProperties = {
    position: "sticky",
    left: 0,
    zIndex: 3,
    background: "var(--surface-2)",
    textAlign: "left",
    padding: "8px 12px",
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--text-2)",
    borderBottom: "1px solid var(--border-strong)",
    borderRight: "1px solid var(--border-strong)",
  };
  const headRt: CSSProperties = {
    padding: "8px 10px",
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--text)",
    textAlign: "right",
    borderBottom: "1px solid var(--border-strong)",
    borderLeft: "1px solid var(--border)",
    whiteSpace: "normal",
    lineHeight: 1.25,
    verticalAlign: "bottom",
    background: "var(--surface-2)",
  };
  const rowLabel: CSSProperties = {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--surface)",
    textAlign: "left",
    padding: "0 12px",
    height: 30,
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--text-2)",
    whiteSpace: "nowrap",
    borderRight: "1px solid var(--border-strong)",
    borderBottom: "1px solid var(--border)",
  };
  const cell: CSSProperties = {
    padding: "0 10px",
    height: 30,
    fontSize: 11.5,
    textAlign: "right",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border)",
    borderLeft: "1px solid var(--border)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 販売客室数 ＆ ADR 複合グラフ */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-card)",
          padding: "14px 16px 10px",
        }}
      >
        <div style={{ textAlign: "center", fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
          販売客室数 ＆ ADR
        </div>
        <MultiLineChart
          xLabels={labels}
          barSeries={barSeries}
          series={lineSeries}
          yFmt={(v) => integer(v)}
          yFmtRight={(v) => yenCompact(v)}
          hoverFmt={(v) => integer(v) + "室"}
          hoverFmtRight={(v) => yen(v)}
          height={320}
        />
      </div>

      {/* 転置クロス集計（列=部屋タイプ・行=指標） */}
      <div
        style={{
          overflow: "auto",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: 180 + rows.length * colW }}>
          <colgroup>
            <col style={{ width: 180 }} />
            {rows.map((_, i) => (
              <col key={i} style={{ width: colW }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th style={headLabel}>
                {detail.facName} · {detail.year}年{detail.month}月
              </th>
              {rows.map((r, i) => (
                <th key={i} style={headRt} title={r.roomType}>
                  {r.roomType}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_ROWS.map((mr, ri) => (
              <tr
                key={ri}
                style={
                  mr.muted
                    ? { background: "var(--surface-3)" }
                    : ri % 2
                      ? { background: "rgba(37,111,219,0.025)" }
                      : undefined
                }
              >
                <td
                  style={{
                    ...rowLabel,
                    ...(mr.muted ? { color: "var(--text-3)", background: "var(--surface-3)" } : null),
                  }}
                >
                  {mr.label}
                </td>
                {rows.map((r, ci) => (
                  <td
                    key={ci}
                    className="tabular"
                    style={{ ...cell, color: mr.muted ? "var(--text-3)" : "var(--text)" }}
                  >
                    {mr.get(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
