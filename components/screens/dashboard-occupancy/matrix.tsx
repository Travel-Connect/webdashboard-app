"use client";

/* ============================================================
   matrix.tsx — compact daily/monthly occupancy matrix tables.
   Ported from screens-occupancy.jsx (ActualMatrix / CompareMatrix /
   DayCell) and wired to live OccupancyRow + OccupancySummary.
   ============================================================ */

import type { CSSProperties } from "react";
import { integer } from "@/lib/dashboard/format";
import type { OccupancyRow, OccupancySummary } from "@/lib/api/types";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

const mTh: CSSProperties = {
  padding: "4px 5px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-2)",
  borderBottom: "1px solid var(--border-strong)",
  whiteSpace: "normal", // 長い項目名は2行に折り返す（列幅は据え置き）
  lineHeight: 1.15,
  verticalAlign: "bottom",
  background: "var(--surface-2)",
  textAlign: "right",
  position: "sticky",
  top: 0,
  zIndex: 1,
};
const mTd: CSSProperties = {
  padding: "0 5px",
  fontSize: 12.5,
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border)",
  height: 19,
  lineHeight: "19px",
  textAlign: "right",
};
const mTdF: CSSProperties = {
  padding: "0 5px",
  fontSize: 12.5,
  whiteSpace: "nowrap",
  height: 20,
  lineHeight: "20px",
  textAlign: "right",
  fontWeight: 700,
  background: "var(--surface-2)",
};

function pct(v: number | null): string {
  return v == null || Number.isNaN(v) ? "—" : (v * 100).toFixed(1) + "%";
}
function ratio2(v: number | null): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(2);
}
/** label for a row: day-of-month (+曜日) when monthly, "M月" when yearly. */
function rowLabel(dateIso: string, monthMode: boolean) {
  const [, mm, dd] = dateIso.split("-");
  if (monthMode) return `${Number(mm)}月`;
  return { day: dd, dow: DOW[new Date(`${dateIso}T00:00:00`).getDay()] };
}

export interface ActualMatrixProps {
  rows: OccupancyRow[];
  total: OccupancySummary;
  totalLabel?: string;
  /** yearly view → rows are months. */
  monthMode?: boolean;
  rowH?: number;
  /** 合計行の下に追加する「予算」行（Excel 同様）。null/未指定なら出さない。 */
  budgetRow?: OccupancySummary | null;
  /** 予算行のラベル（既定「予算」）。 */
  budgetLabel?: string;
}

export function ActualMatrix({
  rows,
  total,
  totalLabel = "合計",
  monthMode = false,
  rowH,
  budgetRow,
  budgetLabel = "予算",
}: ActualMatrixProps) {
  const td: CSSProperties = rowH
    ? { ...mTd, height: rowH, lineHeight: rowH + "px" }
    : mTd;
  return (
    <table
      style={{
        width: "100%",
        minWidth: monthMode ? 516 : 446,
        borderCollapse: "collapse",
        tableLayout: "fixed",
      }}
    >
      <colgroup>
        <col style={{ width: monthMode ? 46 : 36 }} />{/* 日付 */}
        <col style={{ width: monthMode ? 40 : 32 }} />{/* 販売室数 */}
        <col style={{ width: monthMode ? 38 : 30 }} />{/* 残室数 */}
        <col style={{ width: monthMode ? 52 : 50 }} />{/* 稼働率 */}
        <col style={{ width: monthMode ? 46 : 34 }} />{/* 宿泊人数 */}
        <col style={{ width: monthMode ? 78 : 70 }} />{/* 客室販売金額 */}
        <col style={{ width: monthMode ? 54 : 46 }} />{/* 客単価 */}
        <col style={{ width: monthMode ? 60 : 54 }} />{/* 平均室単価 */}
        <col style={{ width: monthMode ? 56 : 52 }} />{/* RevPAR */}
        <col style={{ width: monthMode ? 46 : 42 }} />{/* 平均宿泊者数 */}
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...mTh, textAlign: "left" }}>日付</th>
          <th style={mTh}>販売室数</th>
          <th style={mTh}>残室数</th>
          <th style={mTh}>稼働率</th>
          <th style={mTh}>宿泊人数</th>
          <th style={mTh}>客室販売金額</th>
          <th style={mTh}>客単価</th>
          <th style={mTh}>平均室単価</th>
          <th style={mTh}>RevPAR</th>
          <th style={mTh}>同伴係数</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const occ = r.occupancyRate;
          const full = occ != null && occ >= 1;
          const lbl = rowLabel(r.date, monthMode);
          return (
            <tr key={r.date} style={{ background: full ? "var(--accent-weak)" : "transparent" }}>
              {typeof lbl === "string" ? (
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{lbl}</td>
              ) : (
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>
                  <span className="tabular">{lbl.day}</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      marginLeft: 2,
                      color:
                        lbl.dow === "日"
                          ? "var(--danger)"
                          : lbl.dow === "土"
                            ? "var(--primary)"
                            : "var(--text-3)",
                    }}
                  >
                    {lbl.dow}
                  </span>
                </td>
              )}
              {/* 販売室数 */}
              <td style={td} className="tabular">
                {integer(r.soldRoomNights)}
              </td>
              {/* 残室数 */}
              <td
                style={{ ...td, color: r.remainingRoomNights === 0 ? "var(--accent)" : "var(--text-3)" }}
                className="tabular"
              >
                {integer(r.remainingRoomNights)}
              </td>
              {/* 稼働率 */}
              <td
                style={{ ...td, color: full ? "var(--accent)" : "var(--text)", fontWeight: full ? 700 : 400 }}
                className="tabular"
              >
                {pct(occ)}
              </td>
              {/* 宿泊人数 */}
              <td style={td} className="tabular">
                {integer(r.guestCount)}
              </td>
              {/* 客室販売金額 */}
              <td style={td} className="tabular">
                {integer(r.roomRevenue)}
              </td>
              {/* 客単価 */}
              <td style={{ ...td, color: "var(--text-2)" }} className="tabular">
                {integer(r.guestUnitPrice)}
              </td>
              {/* 平均室単価 */}
              <td style={{ ...td, color: "var(--text-2)" }} className="tabular">
                {integer(r.adr)}
              </td>
              {/* RevPAR */}
              <td style={{ ...td, color: "var(--text-2)" }} className="tabular">
                {integer(r.revpar)}
              </td>
              {/* 平均宿泊者数 */}
              <td style={{ ...td, color: "var(--text-2)" }} className="tabular">
                {ratio2(r.avgGuestsPerRoom)}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td style={{ ...mTdF, textAlign: "left", borderTop: "2px solid var(--border-strong)" }}>
            {totalLabel}
          </td>
          {[
            integer(total.soldRoomNights),
            integer(total.remainingRoomNights),
            pct(total.occupancyRate),
            integer(total.guestCount),
            integer(total.roomRevenue),
            integer(total.guestUnitPrice),
            integer(total.adr),
            integer(total.revpar),
            ratio2(total.avgGuestsPerRoom),
          ].map((v, i) => (
            <td
              key={i}
              style={{ ...mTdF, borderTop: "2px solid var(--border-strong)" }}
              className="tabular"
            >
              {v}
            </td>
          ))}
        </tr>
        {/* 予算行（Excel 同様、合計行の直下にミュート表示）。 */}
        {budgetRow && (
          <tr>
            <td style={{ ...mTdF, textAlign: "left", fontWeight: 600, color: "var(--text-2)", background: "var(--surface-3)" }}>
              {budgetLabel}
            </td>
            {[
              integer(budgetRow.soldRoomNights),
              integer(budgetRow.remainingRoomNights),
              pct(budgetRow.occupancyRate),
              integer(budgetRow.guestCount),
              integer(budgetRow.roomRevenue),
              integer(budgetRow.guestUnitPrice),
              integer(budgetRow.adr),
              integer(budgetRow.revpar),
              ratio2(budgetRow.avgGuestsPerRoom),
            ].map((v, i) => (
              <td
                key={i}
                style={{ ...mTdF, fontWeight: 400, color: "var(--text-2)", background: "var(--surface-3)" }}
                className="tabular"
              >
                {v}
              </td>
            ))}
          </tr>
        )}
      </tfoot>
    </table>
  );
}
