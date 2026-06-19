"use client";

/* ============================================================
   nat-matrix-table.tsx — country × selected-metric matrix.

   The prototype (docs/.../screens-stub.jsx · NatMatrixTable) renders a
   country×月 cross-tab per metric. The live /api/dashboard/nationalities
   endpoint returns flat NationalityRow[] with no month dimension, so we
   pivot the same dense-table idiom onto: country (rows) × selected metrics
   (columns), grouped under their countryMajor region, with per-column
   intensity shading and a 合計 footer. Violet accent preserved.
   ============================================================ */

import { type CSSProperties } from "react";
import type { NationalityRow } from "@/lib/api/types";
import { NAT_METRICS, NAT_VIO, type NatMetricId } from "./metrics";

export interface NatMatrixTableProps {
  rows: NationalityRow[];
  /** Metric ids to render as columns, in display order. */
  metricIds: NatMetricId[];
  /** Hide countries whose primary additive metric (室数) is 0. */
  hideZero: boolean;
}

const cName: CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  background: "var(--surface)",
  textAlign: "left",
  padding: "0 10px",
  fontSize: 11.5,
  height: 26,
  whiteSpace: "nowrap",
  borderRight: "1px solid var(--border-strong)",
  borderBottom: "1px solid var(--border)",
};
const cNum: CSSProperties = {
  padding: "0 8px",
  fontSize: 11.5,
  height: 26,
  textAlign: "right",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border)",
};
const hTop: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  height: 30,
  boxSizing: "border-box",
  background: `rgba(${NAT_VIO},0.08)`,
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--text)",
  padding: "0 8px",
  textAlign: "right",
  borderBottom: "1px solid var(--border-strong)",
  borderLeft: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

interface Cell {
  raw: number | null;
  text: string;
}
interface BodyRow {
  key: string;
  name: string;
  major: string;
  active: boolean;
  cells: Cell[];
}

export function NatMatrixTable({ rows, metricIds, hideZero }: NatMatrixTableProps) {
  const metrics = metricIds
    .map((id) => NAT_METRICS.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m != null);

  // Primary "is this country active" probe = 販売室数 > 0.
  const roomsMetric = NAT_METRICS.find((m) => m.id === "rooms")!;

  const body: BodyRow[] = rows.map((r, i) => ({
    key: `${r.countryMajor}|${r.countryMiddle}|${r.country}|${i}`,
    name: r.country || r.countryMiddle || r.countryMajor || "(不明)",
    major: r.countryMajor || "—",
    active: (roomsMetric.value(r) ?? 0) > 0,
    cells: metrics.map((m) => {
      const raw = m.value(r);
      return { raw, text: m.fmt(raw) };
    }),
  }));

  const shown = hideZero ? body.filter((b) => b.active) : body;

  // Per-column max over additive metrics for intensity shading.
  const colMax = metrics.map((m, ci) => {
    if (!m.additive) return 0;
    return Math.max(...shown.map((b) => Math.abs(b.cells[ci].raw ?? 0)), 0.0001);
  });

  // Column totals (additive metrics only; intensive → "—").
  const totals: Cell[] = metrics.map((m, ci) => {
    if (!m.additive) return { raw: null, text: "—" };
    const sum = shown.reduce((a, b) => a + (b.cells[ci].raw ?? 0), 0);
    return { raw: sum, text: m.fmt(sum) };
  });

  const alphaFor = (raw: number | null, ci: number, additive: boolean): number => {
    if (!additive || raw == null || raw === 0) return 0;
    return Math.min(0.55, (Math.abs(raw) / (colMax[ci] || 1)) * 0.55);
  };

  return (
    <table
      style={{
        borderCollapse: "collapse",
        tableLayout: "fixed",
        width: "100%",
        minWidth: 220 + metrics.length * 130,
      }}
    >
      <colgroup>
        <col style={{ width: 150 }} />
        <col style={{ width: 180 }} />
        {metrics.map((m) => (
          <col key={m.id} style={{ width: 130 }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...cName, ...hTop, zIndex: 7, left: 0, textAlign: "left" }}>
            地域
          </th>
          <th
            style={{
              ...hTop,
              position: "sticky",
              left: 150,
              zIndex: 7,
              textAlign: "left",
              borderRight: "1px solid var(--border-strong)",
            }}
          >
            国籍 \ 指標
          </th>
          {metrics.map((m) => (
            <th key={m.id} style={hTop}>
              {m.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map((b) => (
          <tr
            key={b.key}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "";
            }}
          >
            <td style={{ ...cName, color: "var(--text-2)", borderRight: "1px solid var(--border)" }}>
              {b.major}
            </td>
            <td style={{ ...cName, left: 150, fontWeight: 600 }}>{b.name}</td>
            {b.cells.map((c, ci) => {
              const m = metrics[ci];
              const a = alphaFor(c.raw, ci, m.additive);
              const blank = c.raw == null || c.raw === 0;
              return (
                <td
                  key={m.id}
                  className="tabular"
                  style={{
                    ...cNum,
                    color: blank ? "var(--text-3)" : "var(--text)",
                    background: a > 0 ? `rgba(${NAT_VIO},${a.toFixed(3)})` : undefined,
                  }}
                >
                  {c.text}
                </td>
              );
            })}
          </tr>
        ))}
        <tr>
          <td
            colSpan={2}
            style={{
              ...cName,
              fontWeight: 700,
              background: `rgba(${NAT_VIO},0.07)`,
              borderTop: "2px solid var(--border-strong)",
              borderRight: "1px solid var(--border-strong)",
            }}
          >
            合計（{shown.length}か国）
          </td>
          {totals.map((t, ci) => (
            <td
              key={metrics[ci].id}
              className="tabular"
              style={{
                ...cNum,
                fontWeight: 800,
                background: `rgba(${NAT_VIO},0.07)`,
                borderTop: "2px solid var(--border-strong)",
                color: t.raw == null ? "var(--text-3)" : "var(--text)",
              }}
            >
              {t.text}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
