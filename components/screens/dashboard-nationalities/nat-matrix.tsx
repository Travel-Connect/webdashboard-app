"use client";

/* ============================================================
   nat-matrix.tsx — 国籍 × 12ヶ月 クロスタブ（単一指標）。
   docs/.../screens-stub.jsx (NatMatrixTable) を移植。指標値は
   NatCell の base measures から compute() で算出（合計も同式）。
   ヒートシェード: 売上/販売室数 = 列内シェア / 他 = 列内最大比。
   すべて表示モードでは sticky オフセットをセクション帯(40px)分ずらす。
   ============================================================ */

import { type CSSProperties } from "react";
import type { NationalityMatrix, NatCell } from "@/lib/api/types";
import { NAT_METRICS, NAT_VIO, type NatMetricId } from "./metrics";

export interface NatMatrixTableProps {
  matrix: NationalityMatrix;
  metricId: NatMetricId;
  hideZero: boolean;
  /** すべて表示時はセクション帯（高さ40px）の分だけ sticky を下げる。 */
  sticky?: boolean;
}

export function NatMatrixTable({ matrix, metricId, hideZero, sticky }: NatMatrixTableProps) {
  const M = NAT_METRICS.find((m) => m.id === metricId) ?? NAT_METRICS[0];
  const months = Array.from({ length: 12 }, (_, m) => `${m + 1}月`);

  const rows = hideZero ? matrix.rows.filter((r) => r.total.rooms > 0) : matrix.rows;
  const val = (c: NatCell) => M.compute(c);

  const colTotV = matrix.colTotals.map((c) => val(c));
  const colMax = months.map((_, m) => Math.max(...rows.map((r) => val(r.months[m])), 0.0001));
  const alphaFor = (v: number, m: number) => {
    if (v === 0) return 0;
    return M.heat === "share" ? (v / (colTotV[m] || 1)) * 0.55 : (v / colMax[m]) * 0.42;
  };

  const topOff = sticky ? 40 : 0;
  const cName: CSSProperties = {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--surface)",
    textAlign: "left",
    padding: "0 10px",
    fontSize: 11.5,
    height: 24,
    whiteSpace: "nowrap",
    borderRight: "1px solid var(--border-strong)",
    borderBottom: "1px solid var(--border)",
  };
  const cNum: CSSProperties = {
    padding: "0 6px",
    fontSize: 11,
    height: 24,
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
    background: `rgba(${NAT_VIO},0.08)`,
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
    background: `rgba(${NAT_VIO},0.07)`,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-2)",
    padding: "0 6px",
    textAlign: "right",
    borderBottom: "1px solid var(--border-strong)",
    whiteSpace: "nowrap",
  };
  const totCol: CSSProperties = {
    ...cNum,
    fontWeight: 700,
    background: `rgba(${NAT_VIO},0.07)`,
    borderLeft: "1px solid var(--border-strong)",
  };

  return (
    <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", minWidth: 1240 }}>
      <colgroup>
        <col style={{ width: 184 }} />
        {months.map((_, i) => (
          <col key={i} style={{ width: 80 }} />
        ))}
        <col style={{ width: 116 }} />
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
            {M.label}　国籍 \ 月
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
            <td style={cName}>{r.country}</td>
            {r.months.map((c, m) => {
              const v = val(c);
              return (
                <td
                  key={m}
                  className="tabular"
                  style={{
                    ...cNum,
                    color: v === 0 ? "var(--text-3)" : "var(--text)",
                    background: v === 0 ? undefined : `rgba(${NAT_VIO},${alphaFor(v, m).toFixed(3)})`,
                  }}
                >
                  {M.fmt(v)}
                </td>
              );
            })}
            <td
              className="tabular"
              style={{ ...totCol, color: val(r.total) === 0 ? "var(--text-3)" : "var(--text)" }}
            >
              {M.fmt(val(r.total))}
            </td>
          </tr>
        ))}
        <tr>
          <td style={{ ...cName, fontWeight: 700, background: `rgba(${NAT_VIO},0.07)`, borderTop: "2px solid var(--border-strong)" }}>
            合計
          </td>
          {matrix.colTotals.map((c, m) => (
            <td
              key={m}
              className="tabular"
              style={{ ...cNum, fontWeight: 700, background: `rgba(${NAT_VIO},0.07)`, borderTop: "2px solid var(--border-strong)" }}
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
