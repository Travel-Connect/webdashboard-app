"use client";

/* ============================================================
   annual-table.tsx — area-grouped facility cross-tab for one metric.
   Adapted from docs/.../screens-annual.jsx (AfTable).
   NOTE: the live /api/dashboard/annual-sales returns one row per
   facility for the whole year (no month dimension), so rows here are
   facilities grouped by area (instead of the prototype's months ×
   facilities matrix). Columns: 施設 / エリア / 値 / 合計-per-area.
   ============================================================ */

import { type CSSProperties } from "react";
import type { AnnualSalesRow } from "@/lib/api/types";

export type MetricKind = "actual" | "budget" | "pct" | "diff";

/* blue tonmana (shared with the analysis screens) */
const AF_GREEN = "rgba(37,111,219,0.08)"; // header cell (pale blue)
const AF_GREEN_D = "rgba(37,111,219,0.14)"; // area heading / grand total
const AF_LINE = "var(--border)";
const AF_LINE_STRONG = "var(--border-strong)";
const AF_RED = "var(--danger)";
const AF_ZEBRA = "#F7F9FC";

const _nf = new Intl.NumberFormat("ja-JP");
const yen = (v: number) => "¥" + _nf.format(Math.round(v));
const yen0 = (v: number) => (v === 0 ? "¥0" : yen(v));

/* area tint matching the prototype */
function areaTint(area: string): string {
  if (area.includes("北谷")) return "rgba(37,99,235,0.07)";
  if (area.includes("北部")) return "rgba(15,118,110,0.08)";
  if (area.includes("那覇")) return "rgba(217,119,6,0.08)";
  return "rgba(124,58,237,0.07)";
}

export interface AreaGroup {
  area: string;
  rows: AnnualSalesRow[];
}

/** Bucket rows into ordered area groups, preserving first-seen order. */
export function groupByArea(rows: AnnualSalesRow[]): AreaGroup[] {
  const order: string[] = [];
  const map = new Map<string, AnnualSalesRow[]>();
  for (const r of rows) {
    const area = r.areaName || "その他";
    if (!map.has(area)) {
      map.set(area, []);
      order.push(area);
    }
    map.get(area)!.push(r);
  }
  return order.map((area) => ({ area, rows: map.get(area)! }));
}

/* ---- per-metric value extraction (returns null when not available) ---- */
function metricValue(kind: MetricKind, row: AnnualSalesRow): number | null {
  switch (kind) {
    case "actual":
      return row.revenue;
    case "budget":
      return row.budgetAmount ?? null;
    case "pct":
      // budgetAchievementRate is a ratio (1.05 == 105%)
      return row.budgetAchievementRate != null
        ? row.budgetAchievementRate * 100
        : null;
    case "diff":
      return row.budgetAmount != null ? row.revenue - row.budgetAmount : null;
  }
}

const td: CSSProperties = {
  padding: "0 8px",
  height: 28,
  lineHeight: "28px",
  fontSize: 12,
  textAlign: "right",
  whiteSpace: "nowrap",
  borderRight: "1px solid " + AF_LINE,
  borderBottom: "1px solid " + AF_LINE,
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const nameTd: CSSProperties = {
  ...td,
  textAlign: "left",
  fontWeight: 600,
  color: "var(--text)",
  position: "sticky",
  left: 0,
  zIndex: 2,
};
const headBase: CSSProperties = {
  background: AF_GREEN,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text)",
  borderRight: "1px solid " + AF_LINE,
  borderBottom: "1px solid " + AF_LINE,
  padding: "8px 8px",
  textAlign: "right",
  lineHeight: 1.2,
  verticalAlign: "middle",
};

const fmtPct = (v: number | null) => (v == null ? "—" : v.toFixed(1) + "%");
const pctColor = (v: number | null) =>
  v == null ? "var(--text-3)" : v < 100 ? AF_RED : "var(--text)";
const fmtDiff = (v: number | null) => {
  if (v == null) return "—";
  const r = Math.round(v);
  if (r === 0) return "0";
  const s = _nf.format(Math.abs(r));
  return r < 0 ? "(" + s + ")" : "+" + s;
};
const diffColor = (v: number | null) => {
  if (v == null) return "var(--text-3)";
  const r = Math.round(v);
  return r < 0 ? AF_RED : r === 0 ? "var(--text-3)" : "var(--text)";
};

/** Render one cell for a metric value. */
function renderCell(
  kind: MetricKind,
  v: number | null,
  extra?: CSSProperties,
) {
  if (kind === "pct") {
    return (
      <td className="tabular" style={{ ...td, color: pctColor(v), ...extra }}>
        {fmtPct(v)}
      </td>
    );
  }
  if (kind === "diff") {
    return (
      <td className="tabular" style={{ ...td, color: diffColor(v), ...extra }}>
        {fmtDiff(v)}
      </td>
    );
  }
  return (
    <td
      className="tabular"
      style={{
        ...td,
        color: v == null ? "var(--text-3)" : v === 0 ? "var(--text-3)" : "var(--text)",
        ...extra,
      }}
    >
      {v == null ? "—" : yen0(v)}
    </td>
  );
}

/* ---- aggregation helpers for subtotals / total rows ---- */
function sumRevenue(rows: AnnualSalesRow[]): number {
  return rows.reduce((a, r) => a + r.revenue, 0);
}
function sumBudget(rows: AnnualSalesRow[]): number | null {
  const b = rows.filter((r) => r.budgetAmount != null);
  return b.length ? b.reduce((a, r) => a + (r.budgetAmount ?? 0), 0) : null;
}
/** Aggregate metric over a set of rows (pct/diff derived from sums). */
function aggregate(kind: MetricKind, rows: AnnualSalesRow[]): number | null {
  if (kind === "actual") return sumRevenue(rows);
  if (kind === "budget") return sumBudget(rows);
  const bud = sumBudget(rows);
  const act = sumRevenue(rows);
  if (kind === "diff") return bud == null ? null : act - bud;
  // pct
  return bud != null && bud !== 0 ? (act / bud) * 100 : null;
}

export interface AnnualTableProps {
  kind: MetricKind;
  rowLabel: string;
  rows: AnnualSalesRow[];
}

export function AnnualTable({ kind, rowLabel, rows }: AnnualTableProps) {
  const groups = groupByArea(rows);

  return (
    <table
      style={{
        borderCollapse: "collapse",
        width: "100%",
        minWidth: 560,
        borderTop: "1px solid " + AF_LINE,
        borderLeft: "1px solid " + AF_LINE,
      }}
    >
      <thead>
        <tr>
          <th
            style={{
              ...headBase,
              textAlign: "left",
              position: "sticky",
              left: 0,
              zIndex: 3,
              minWidth: 200,
            }}
          >
            施設
          </th>
          <th style={{ ...headBase, textAlign: "left", minWidth: 110 }}>エリア</th>
          <th style={{ ...headBase, background: AF_GREEN_D }}>{rowLabel}</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const subtotal = aggregate(kind, g.rows);
          return (
            <Group
              key={g.area}
              kind={kind}
              area={g.area}
              groupRows={g.rows}
              subtotal={subtotal}
            />
          );
        })}
        {/* grand total */}
        <tr style={{ background: AF_GREEN_D }}>
          <td
            style={{
              ...nameTd,
              background: AF_GREEN_D,
              fontWeight: 800,
              borderTop: "2px solid " + AF_LINE_STRONG,
            }}
          >
            合計
          </td>
          <td
            style={{
              ...td,
              textAlign: "left",
              fontWeight: 800,
              background: AF_GREEN_D,
              borderTop: "2px solid " + AF_LINE_STRONG,
            }}
          >
            全エリア
          </td>
          {renderCell(kind, aggregate(kind, rows), {
            fontWeight: 800,
            background: AF_GREEN_D,
            borderTop: "2px solid " + AF_LINE_STRONG,
          })}
        </tr>
      </tbody>
    </table>
  );
}

function Group({
  kind,
  area,
  groupRows,
  subtotal,
}: {
  kind: MetricKind;
  area: string;
  groupRows: AnnualSalesRow[];
  subtotal: number | null;
}) {
  const tint = areaTint(area);
  return (
    <>
      {groupRows.map((r, i) => (
        <tr key={r.facilityId} style={{ background: i % 2 ? AF_ZEBRA : "#fff" }}>
          <td
            style={{
              ...nameTd,
              background: i % 2 ? AF_ZEBRA : "#fff",
            }}
            title={r.facilityName}
          >
            {r.facilityName}
          </td>
          <td style={{ ...td, textAlign: "left", color: "var(--text-2)" }}>
            {r.areaName || "その他"}
          </td>
          {renderCell(kind, metricValue(kind, r))}
        </tr>
      ))}
      {/* area subtotal */}
      <tr style={{ background: tint }}>
        <td style={{ ...nameTd, background: tint, fontWeight: 700 }}>小計</td>
        <td
          style={{
            ...td,
            textAlign: "left",
            fontWeight: 700,
            color: "var(--text)",
            background: tint,
          }}
        >
          {area}
        </td>
        {renderCell(kind, subtotal, { fontWeight: 700, background: AF_GREEN })}
      </tr>
    </>
  );
}
