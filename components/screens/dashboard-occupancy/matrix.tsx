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
  padding: "4px 6px",
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-2)",
  borderBottom: "1px solid var(--border-strong)",
  whiteSpace: "nowrap",
  background: "var(--surface-2)",
  textAlign: "right",
  position: "sticky",
  top: 0,
  zIndex: 1,
};
const mTd: CSSProperties = {
  padding: "0 6px",
  fontSize: 11,
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border)",
  height: 17,
  lineHeight: "17px",
  textAlign: "right",
};
const mTdF: CSSProperties = {
  padding: "0 6px",
  fontSize: 11,
  whiteSpace: "nowrap",
  height: 18,
  lineHeight: "18px",
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
}

export function ActualMatrix({
  rows,
  total,
  totalLabel = "合計",
  monthMode = false,
  rowH,
}: ActualMatrixProps) {
  const td: CSSProperties = rowH
    ? { ...mTd, height: rowH, lineHeight: rowH + "px" }
    : mTd;
  return (
    <table
      style={{
        width: "100%",
        minWidth: monthMode ? 452 : undefined,
        borderCollapse: "collapse",
        tableLayout: "fixed",
      }}
    >
      <colgroup>
        <col style={{ width: monthMode ? 48 : 38 }} />
        <col style={{ width: monthMode ? 42 : 38 }} />
        <col style={{ width: monthMode ? 40 : 34 }} />
        <col style={{ width: monthMode ? 50 : 46 }} />
        <col style={{ width: monthMode ? 44 : 40 }} />
        <col style={{ width: 42 }} />
        <col style={monthMode ? { width: 70 } : undefined} />
        <col style={monthMode ? { width: 56 } : undefined} />
        <col style={monthMode ? { width: 56 } : undefined} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...mTh, textAlign: "left" }}>{monthMode ? "月" : "日"}</th>
          <th style={mTh}>室</th>
          <th style={mTh}>残</th>
          <th style={mTh}>稼働率</th>
          <th style={mTh}>人</th>
          <th style={mTh}>平均</th>
          <th style={mTh}>売上</th>
          <th style={mTh}>室単価</th>
          <th style={mTh}>RevPAR</th>
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
                      fontSize: 9.5,
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
              <td style={td} className="tabular">
                {integer(r.soldRoomNights)}
              </td>
              <td
                style={{ ...td, color: r.remainingRoomNights === 0 ? "var(--accent)" : "var(--text-3)" }}
                className="tabular"
              >
                {integer(r.remainingRoomNights)}
              </td>
              <td
                style={{ ...td, color: full ? "var(--accent)" : "var(--text)", fontWeight: full ? 700 : 400 }}
                className="tabular"
              >
                {pct(occ)}
              </td>
              <td style={td} className="tabular">
                {integer(r.guestCount)}
              </td>
              <td style={{ ...td, color: "var(--text-2)" }} className="tabular">
                {ratio2(r.avgGuestsPerRoom)}
              </td>
              <td style={td} className="tabular">
                {integer(r.roomRevenue)}
              </td>
              <td style={{ ...td, color: "var(--text-2)" }} className="tabular">
                {integer(r.adr)}
              </td>
              <td style={{ ...td, color: "var(--text-2)" }} className="tabular">
                {integer(r.revpar)}
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
            ratio2(total.avgGuestsPerRoom),
            integer(total.roomRevenue),
            integer(total.adr),
            integer(total.revpar),
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
      </tfoot>
    </table>
  );
}
