"use client";

/* ============================================================
   rt-matrix.tsx — 部屋タイプ × 12ヶ月 クロスタブ（単一指標）。
   docs/.../screens-roomtypes.jsx (RtMatrixTable) を移植。
   売上/販売室数 = 月内シェアでヒートシェード、ADR/同伴係数 = ヒートなし。
   ============================================================ */

import { type CSSProperties } from "react";
import type { RoomTypeMatrix, RtCell } from "@/lib/api/types";
import { RT_METRICS, RT_TEAL, type RtMetricId } from "./metrics";

export interface RtMatrixTableProps {
  matrix: RoomTypeMatrix;
  metricId: RtMetricId;
  /** すべて表示時はセクション帯（高さ40px）分 sticky を下げる。 */
  sticky?: boolean;
}

export function RtMatrixTable({ matrix, metricId, sticky }: RtMatrixTableProps) {
  const M = RT_METRICS.find((m) => m.id === metricId) ?? RT_METRICS[0];
  const months = Array.from({ length: 12 }, (_, m) => `${m + 1}月`);
  const rows = matrix.rows;
  const val = (c: RtCell) => M.compute(c);

  const colTotV = matrix.colTotals.map((c) => val(c));
  const alphaFor = (v: number, m: number) =>
    M.heat === "share" && v !== 0 ? (v / (colTotV[m] || 1)) * 0.5 : 0;

  const topOff = sticky ? 40 : 0;
  const cName: CSSProperties = {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--surface)",
    textAlign: "left",
    padding: "0 12px",
    fontSize: 12,
    height: 30,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    borderRight: "1px solid var(--border-strong)",
    borderBottom: "1px solid var(--border)",
  };
  const cNum: CSSProperties = {
    padding: "0 8px",
    fontSize: 11.5,
    height: 30,
    textAlign: "right",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border)",
  };
  const hTop: CSSProperties = {
    position: "sticky",
    top: topOff,
    zIndex: 5,
    height: 28,
    boxSizing: "border-box",
    background: `rgba(${RT_TEAL},0.08)`,
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--text)",
    padding: "0 8px",
    textAlign: "center",
    borderBottom: "1px solid var(--border)",
    borderLeft: "1px solid var(--border)",
    whiteSpace: "nowrap",
  };
  const hMon: CSSProperties = {
    position: "sticky",
    top: topOff + 27,
    zIndex: 4,
    height: 26,
    boxSizing: "border-box",
    background: `rgba(${RT_TEAL},0.07)`,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-2)",
    padding: "0 8px",
    textAlign: "right",
    borderBottom: "1px solid var(--border-strong)",
    whiteSpace: "nowrap",
  };
  const totCol: CSSProperties = {
    ...cNum,
    fontWeight: 700,
    background: `rgba(${RT_TEAL},0.07)`,
    borderLeft: "1px solid var(--border-strong)",
  };
  const totLabel = metricId === "adr" ? "合計（平均）" : metricId === "comp" ? "平均" : "合計";

  return (
    <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", minWidth: 1100 }}>
      <colgroup>
        <col style={{ width: "16%" }} />
        {months.map((_, i) => (
          <col key={i} style={{ width: "6%" }} />
        ))}
        <col style={{ width: "12%" }} />
      </colgroup>
      <thead>
        <tr>
          <th
            rowSpan={2}
            style={{
              ...hTop,
              position: "sticky",
              left: 0,
              top: topOff,
              zIndex: 7,
              textAlign: "left",
              borderRight: "1px solid var(--border-strong)",
            }}
          >
            {M.label}　部屋タイプ \ 月
          </th>
          <th colSpan={12} style={hTop}>
            {matrix.facName} · {matrix.year}年
          </th>
          <th
            rowSpan={2}
            style={{ ...hTop, top: topOff, zIndex: 6, borderLeft: "1px solid var(--border-strong)", textAlign: "right" }}
          >
            合計
          </th>
        </tr>
        <tr>
          {months.map((m, i) => (
            <th key={i} style={hMon}>
              {m}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr
            key={ri}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <td style={cName} title={r.roomType}>
              {r.roomType}
            </td>
            {r.months.map((c, m) => {
              const v = val(c);
              return (
                <td
                  key={m}
                  className="tabular"
                  style={{
                    ...cNum,
                    color: v === 0 ? "var(--text-3)" : "var(--text)",
                    background: v === 0 ? undefined : `rgba(${RT_TEAL},${alphaFor(v, m).toFixed(3)})`,
                  }}
                >
                  {M.fmt(v)}
                </td>
              );
            })}
            <td className="tabular" style={{ ...totCol, color: val(r.total) === 0 ? "var(--text-3)" : "var(--text)" }}>
              {M.fmt(val(r.total))}
            </td>
          </tr>
        ))}
        <tr>
          <td style={{ ...cName, fontWeight: 700, background: `rgba(${RT_TEAL},0.07)`, borderTop: "2px solid var(--border-strong)" }}>
            {totLabel}
          </td>
          {matrix.colTotals.map((c, m) => (
            <td
              key={m}
              className="tabular"
              style={{ ...cNum, fontWeight: 700, background: `rgba(${RT_TEAL},0.07)`, borderTop: "2px solid var(--border-strong)" }}
            >
              {M.fmt(val(c))}
            </td>
          ))}
          <td className="tabular" style={{ ...totCol, fontWeight: 800, borderTop: "2px solid var(--border-strong)" }}>
            {M.fmt(val(matrix.grand))}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
