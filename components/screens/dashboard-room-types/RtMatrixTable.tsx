"use client";

/* ============================================================
   RtMatrixTable.tsx — 部屋タイプ × 指標 クロス表。
   Heat-shaded cells (within-metric share), sticky room-type column,
   sticky header, totals/average footer. Mirrors the prototype's
   RtMatrixTable look (the live API has no month axis, so the columns
   are the selected metrics instead of the 12 months).
   ============================================================ */

import { type CSSProperties } from "react";
import type { RoomTypeRow } from "@/lib/api/types";
import { fmtMetric, type RtMetric } from "./metrics";

const ACCENT = "37,99,235"; /* --primary rgb, for translucent heat fills */

export interface RtMatrixTableProps {
  rows: RoomTypeRow[];
  summary: RoomTypeRow;
  metrics: RtMetric[];
  facilityName: string;
  year: number;
}

export function RtMatrixTable({
  rows,
  summary,
  metrics,
  facilityName,
  year,
}: RtMatrixTableProps) {
  // Per-metric column total (for share-based heat shading).
  const colTotal = (m: RtMetric): number =>
    m.averaged ? 0 : rows.reduce((a, r) => a + (Number(r[m.id]) || 0), 0);

  const alphaFor = (m: RtMetric, v: number): number => {
    if (!m.heat || !v) return 0;
    const tot = colTotal(m);
    return tot ? (v / tot) * 0.5 : 0;
  };

  const cName: CSSProperties = {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--surface)",
    textAlign: "left",
    padding: "0 12px",
    fontSize: 12.5,
    height: 32,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    borderRight: "1px solid var(--border-strong)",
    borderBottom: "1px solid var(--border)",
  };
  const cNum: CSSProperties = {
    padding: "0 12px",
    fontSize: 12,
    height: 32,
    textAlign: "right",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border)",
  };
  const hTop: CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 5,
    height: 28,
    boxSizing: "border-box",
    background: "rgba(" + ACCENT + ",0.08)",
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--text)",
    padding: "0 8px",
    textAlign: "center",
    borderBottom: "1px solid var(--border)",
    borderLeft: "1px solid var(--border)",
    whiteSpace: "nowrap",
  };
  const hMetric: CSSProperties = {
    position: "sticky",
    top: 27,
    zIndex: 4,
    height: 26,
    boxSizing: "border-box",
    background: "rgba(" + ACCENT + ",0.07)",
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--text-2)",
    padding: "0 12px",
    textAlign: "right",
    borderBottom: "1px solid var(--border-strong)",
    whiteSpace: "nowrap",
  };

  return (
    <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
      <colgroup>
        <col style={{ width: "28%" }} />
        {metrics.map((m) => (
          <col key={m.id} style={{ width: 72 / metrics.length + "%" }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th
            rowSpan={2}
            style={{
              ...cName,
              ...hTop,
              zIndex: 7,
              top: 0,
              textAlign: "left",
              borderRight: "1px solid var(--border-strong)",
            }}
          >
            部屋タイプ
          </th>
          <th colSpan={metrics.length} style={hTop}>
            {facilityName} · {year}年
          </th>
        </tr>
        <tr>
          {metrics.map((m) => (
            <th key={m.id} style={hMetric}>
              {m.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr
            key={r.roomType + "_" + ri}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <td style={cName} title={r.roomType}>
              {r.roomType}
            </td>
            {metrics.map((m) => {
              const raw = r[m.id];
              const v = raw == null ? null : Number(raw);
              const a = v == null ? 0 : alphaFor(m, v);
              return (
                <td
                  key={m.id}
                  className="tabular"
                  style={{
                    ...cNum,
                    color: v ? "var(--text)" : "var(--text-3)",
                    background: a ? "rgba(" + ACCENT + "," + a.toFixed(3) + ")" : undefined,
                  }}
                >
                  {fmtMetric(v, m.unit)}
                </td>
              );
            })}
          </tr>
        ))}
        <tr>
          <td
            style={{
              ...cName,
              fontWeight: 700,
              background: "rgba(" + ACCENT + ",0.07)",
              borderTop: "2px solid var(--border-strong)",
            }}
          >
            合計
          </td>
          {metrics.map((m) => {
            const raw = summary[m.id];
            const v = raw == null ? null : Number(raw);
            return (
              <td
                key={m.id}
                className="tabular"
                style={{
                  ...cNum,
                  fontWeight: 800,
                  background: "rgba(" + ACCENT + ",0.07)",
                  borderTop: "2px solid var(--border-strong)",
                  color: v ? "var(--text)" : "var(--text-3)",
                }}
              >
                {fmtMetric(v, m.unit)}
                {m.averaged && v != null ? <span style={{ fontSize: 9.5, color: "var(--text-3)", marginLeft: 2 }}>(平均)</span> : null}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
