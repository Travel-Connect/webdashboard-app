"use client";

/* ============================================================
   matrix-col.tsx — accent-topped scrollable column wrapper for the
   matrix band. Ported from screens-occupancy.jsx MatrixCol.
   ============================================================ */

import type { ReactNode } from "react";

export interface MatrixColProps {
  title: string;
  sub?: ReactNode;
  accent: string;
  children: ReactNode;
}

export function MatrixCol({ title, sub, accent, children }: MatrixColProps) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          padding: "7px 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          borderTop: "2px solid " + accent,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>{title}</h3>
        {sub && (
          <span
            style={{
              fontSize: 10.5,
              color: "var(--text-3)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {sub}
          </span>
        )}
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
    </section>
  );
}
