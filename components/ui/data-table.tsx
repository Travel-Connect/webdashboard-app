"use client";

/* ============================================================
   data-table.tsx — generic typed table matching the prototype's
   `table.tbl` styling (surface-2 header, hover rows, tabular nums).
   ============================================================ */

import { type CSSProperties, type ReactNode } from "react";

export interface Column<T> {
  /** Stable key for the column. */
  key: string;
  /** Header label. */
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: T, index: number) => ReactNode;
  /** Text alignment (default "left"; numbers usually "right"). */
  align?: "left" | "right" | "center";
  /** Use tabular-nums for the column (numbers). */
  numeric?: boolean;
  /** Fixed/min width. */
  width?: number | string;
  /** Header/cell extra style. */
  style?: CSSProperties;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Row key extractor. */
  rowKey: (row: T, index: number) => string | number;
  /** Optional per-row click handler. */
  onRowClick?: (row: T, index: number) => void;
  /** Stick the header to the top of the scroll container. */
  stickyHeader?: boolean;
  /** Render when rows is empty. */
  empty?: ReactNode;
  /** Optional footer row (e.g. totals). */
  footer?: ReactNode;
  style?: CSSProperties;
}

const thBase: CSSProperties = {
  position: "sticky",
  top: 0,
  background: "var(--surface-2)",
  color: "var(--text-2)",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
  zIndex: 1,
};

const tdBase: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  fontSize: 13,
  color: "var(--text)",
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  stickyHeader = false,
  empty,
  footer,
  style,
}: DataTableProps<T>) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }
  return (
    <div style={{ width: "100%", overflowX: "auto", ...style }}>
      <table
        className="tbl"
        style={{ width: "100%", borderCollapse: "collapse" }}
      >
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  ...thBase,
                  position: stickyHeader ? "sticky" : "static",
                  textAlign: c.align ?? "left",
                  width: c.width,
                  ...c.style,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              style={{
                cursor: onRowClick ? "pointer" : "default",
                transition: "background .1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--surface-3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={c.numeric ? "tabular" : undefined}
                  style={{
                    ...tdBase,
                    textAlign: c.align ?? (c.numeric ? "right" : "left"),
                    ...c.style,
                  }}
                >
                  {c.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

/* ---------- BarCell: in-cell share bar (ported from charts.jsx) ---------- */
export interface BarCellProps {
  pct: number;
  color?: string;
  label?: ReactNode;
}
export function BarCell({ pct, color = "var(--c-blue)", label }: BarCellProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 96 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--surface-3)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: Math.max(2, Math.min(100, pct)) + "%",
            height: "100%",
            background: color,
            borderRadius: 6,
          }}
        />
      </div>
      <span
        className="tabular"
        style={{ fontSize: 12, color: "var(--text-2)", width: 38, textAlign: "right" }}
      >
        {label ?? pct.toFixed(1) + "%"}
      </span>
    </div>
  );
}
