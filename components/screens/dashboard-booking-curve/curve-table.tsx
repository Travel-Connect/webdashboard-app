"use client";

/* ============================================================
   curve-table.tsx — Excel-faithful 集計区分 × リードタイム table.
   Ported from docs/.../screens-booking.jsx (BcTable). Renders the
   12 lead-time bucket columns for one or more scope rows.
   ============================================================ */

import { type ReactNode } from "react";
import { BUCKET_LABELS } from "./constants";

const HEAD_BG = "rgba(37,111,219,0.08)";
const LINE = "var(--border)";

const thBase: React.CSSProperties = {
  background: HEAD_BG,
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--text)",
  borderRight: "1px solid " + LINE,
  borderBottom: "1px solid " + LINE,
  padding: "6px 4px",
  textAlign: "center",
  lineHeight: 1.16,
  whiteSpace: "normal",
  wordBreak: "break-word",
};

const td: React.CSSProperties = {
  padding: "0 6px",
  height: 30,
  lineHeight: "30px",
  fontSize: 11,
  textAlign: "right",
  whiteSpace: "nowrap",
  borderRight: "1px solid " + LINE,
  borderBottom: "1px solid " + LINE,
};

const labelTd: React.CSSProperties = {
  ...td,
  textAlign: "left",
  fontWeight: 700,
  background: "var(--surface)",
  whiteSpace: "nowrap",
};

export interface CurveTableRow {
  label: string;
  period: ReactNode;
  values: number[];
  dotColor: string;
}

export interface CurveTableProps {
  rows: CurveTableRow[];
  fmt: (v: number) => ReactNode;
}

export function CurveTable({ rows, fmt }: CurveTableProps) {
  return (
    <table
      style={{
        borderCollapse: "collapse",
        tableLayout: "fixed",
        width: "100%",
        minWidth: 880,
        borderTop: "1px solid " + LINE,
      }}
    >
      <colgroup>
        <col style={{ width: "15%" }} />
        <col style={{ width: "7%" }} />
        {BUCKET_LABELS.map((_, i) => (
          <col key={i} style={{ width: 78 / 12 + "%" }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...thBase, borderLeft: "1px solid " + LINE }}>集計区分</th>
          <th style={thBase}>対象期間</th>
          {BUCKET_LABELS.map((b, i) => (
            <th key={i} style={thBase}>
              {b}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            <td style={{ ...labelTd, borderLeft: "1px solid " + LINE }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: r.dotColor,
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
              <span style={{ fontSize: 10.5 }}>{r.label}</span>
            </td>
            <td
              className="tabular"
              style={{ ...td, textAlign: "center", color: "var(--text-2)" }}
            >
              {r.period}
            </td>
            {r.values.map((v, i) => (
              <td key={i} className="tabular" style={td}>
                {fmt(v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
