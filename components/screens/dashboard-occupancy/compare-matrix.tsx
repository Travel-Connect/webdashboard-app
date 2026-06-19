"use client";

/* ============================================================
   compare-matrix.tsx — 前年実績比 diff table.
   Current rows minus aligned previous-year rows (live comparison.rows).
   Alignment key: month number when yearly, day-of-month when monthly.
   ============================================================ */

import type { CSSProperties } from "react";
import { integer } from "@/lib/dashboard/format";
import type { OccupancyRow } from "@/lib/api/types";

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

/** key a row by month (yearly) or day-of-month (monthly) for alignment. */
function alignKey(dateIso: string, monthMode: boolean): string {
  const [, mm, dd] = dateIso.split("-");
  return monthMode ? mm : dd;
}

/** colored signed diff cell. */
function dCell(v: number | null, fmt: ((n: number) => string) | null, suffix: string, td: CSSProperties) {
  if (v == null || Number.isNaN(v) || v === 0)
    return (
      <td style={{ ...td, color: "var(--text-3)" }} className="tabular">
        +0{suffix}
      </td>
    );
  const pos = v > 0;
  return (
    <td style={{ ...td, color: pos ? "var(--positive)" : "var(--danger)", fontWeight: 600 }} className="tabular">
      {(pos ? "+" : "") + (fmt ? fmt(v) : String(v)) + suffix}
    </td>
  );
}

const sub = (a: number | null, b: number | null): number | null =>
  a == null || b == null || Number.isNaN(a) || Number.isNaN(b) ? null : a - b;

export interface CompareMatrixProps {
  /** current-period rows (define the visible row set + ordering). */
  rows: OccupancyRow[];
  /** previous-year rows (response.comparison.rows). */
  baseline: OccupancyRow[];
  monthMode?: boolean;
  rowH?: number;
  footLabel?: string;
}

export function CompareMatrix({
  rows,
  baseline,
  monthMode = false,
  rowH,
  footLabel,
}: CompareMatrixProps) {
  const td: CSSProperties = rowH ? { ...mTd, height: rowH, lineHeight: rowH + "px" } : mTd;
  const base = new Map(baseline.map((b) => [alignKey(b.date, monthMode), b]));
  const fl = footLabel ?? (monthMode ? "年間差分" : "月間差分");

  // running totals of diffs (only where a baseline match exists)
  const tot = { sold: 0, guests: 0, rev: 0 };
  for (const r of rows) {
    const b = base.get(alignKey(r.date, monthMode));
    if (!b) continue;
    tot.sold += r.soldRoomNights - b.soldRoomNights;
    tot.guests += r.guestCount - b.guestCount;
    tot.rev += r.roomRevenue - b.roomRevenue;
  }

  return (
    <table
      style={{
        width: "100%",
        minWidth: monthMode ? 446 : undefined,
        borderCollapse: "collapse",
        tableLayout: "fixed",
      }}
    >
      <colgroup>
        <col style={{ width: monthMode ? 48 : 38 }} />
        <col style={{ width: monthMode ? 42 : 36 }} />
        <col style={{ width: monthMode ? 52 : 46 }} />
        <col style={{ width: monthMode ? 46 : 38 }} />
        <col style={{ width: 42 }} />
        <col style={monthMode ? { width: 82 } : undefined} />
        <col style={monthMode ? { width: 58 } : undefined} />
        <col style={monthMode ? { width: 58 } : undefined} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...mTh, textAlign: "left" }}>{monthMode ? "月" : "日"}</th>
          <th style={mTh}>室</th>
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
          const b = base.get(alignKey(r.date, monthMode));
          const [, mm, dd] = r.date.split("-");
          return (
            <tr key={r.date}>
              {monthMode ? (
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{Number(mm)}月</td>
              ) : (
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>
                  <span className="tabular">{dd}</span>
                  <span
                    style={{
                      fontSize: 9.5,
                      marginLeft: 2,
                      color: "var(--text-3)",
                    }}
                  >
                    {DOW[new Date(`${r.date}T00:00:00`).getDay()]}
                  </span>
                </td>
              )}
              {dCell(b ? sub(r.soldRoomNights, b.soldRoomNights) : null, (n) => integer(n), "", td)}
              {dCell(
                b ? mul100(sub(r.occupancyRate, b.occupancyRate)) : null,
                (n) => n.toFixed(1),
                "%",
                td,
              )}
              {dCell(b ? sub(r.guestCount, b.guestCount) : null, (n) => integer(n), "", td)}
              {dCell(b ? sub(r.avgGuestsPerRoom, b.avgGuestsPerRoom) : null, (n) => n.toFixed(2), "", td)}
              {dCell(b ? sub(r.roomRevenue, b.roomRevenue) : null, (n) => integer(n), "", td)}
              {dCell(b ? sub(r.adr, b.adr) : null, (n) => integer(n), "", td)}
              {dCell(b ? sub(r.revpar, b.revpar) : null, (n) => integer(n), "", td)}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td style={{ ...mTdF, textAlign: "left", borderTop: "2px solid var(--border-strong)" }}>{fl}</td>
          {footCell(tot.sold, (n) => integer(n), "", true)}
          {footCell(null, null, "%", true) /* occ diff is point-based; aggregate shown via KPI strip */}
          {footCell(tot.guests, (n) => integer(n), "", true)}
          {footCell(null, null, "", true)}
          {footCell(tot.rev, (n) => integer(n), "", true)}
          {footCell(null, null, "", true)}
          {footCell(null, null, "", true)}
        </tr>
      </tfoot>
    </table>
  );

  function footCell(
    v: number | null,
    fmt: ((n: number) => string) | null,
    suffix: string,
    border: boolean,
  ) {
    const style: CSSProperties = {
      ...mTdF,
      borderTop: border ? "2px solid var(--border-strong)" : undefined,
      color:
        v == null || v === 0 || Number.isNaN(v)
          ? "var(--text-3)"
          : v > 0
            ? "var(--positive)"
            : "var(--danger)",
    };
    const text =
      v == null || Number.isNaN(v)
        ? "—"
        : (v > 0 ? "+" : "") + (fmt ? fmt(v) : String(v)) + suffix;
    return (
      <td style={style} className="tabular">
        {text}
      </td>
    );
  }
}

function mul100(v: number | null): number | null {
  return v == null || Number.isNaN(v) ? null : v * 100;
}
