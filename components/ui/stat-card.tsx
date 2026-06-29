"use client";

/* ============================================================
   stat-card.tsx — KPI / stat cards.
   Distilled from docs/.../screens-dashboard.jsx (OverviewCard).
   ============================================================ */

import { type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { MetricDelta } from "./primitives";

/* ---------- StatCard: compact single metric tile ---------- */
export interface StatCardProps {
  /** Metric label, e.g. "稼働率". */
  label: ReactNode;
  /** Formatted main value, e.g. "83.8%". */
  value: ReactNode;
  /** Optional sub caption under the value. */
  sub?: ReactNode;
  /** Optional leading icon. */
  icon?: IconName;
  /** Optional delta vs comparison (number, rendered via MetricDelta). */
  deltaValue?: number | null;
  deltaUnit?: string;
  /** Negative-is-good metrics (e.g. 残室). */
  deltaInvert?: boolean;
  /** Status dot color (e.g. "var(--danger)"); omit for none. */
  statusColor?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  deltaValue,
  deltaUnit = "%",
  deltaInvert,
  statusColor,
  onClick,
  style,
}: StatCardProps) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      style={{
        textAlign: "left",
        cursor: interactive ? "pointer" : "default",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        transition: "border-color .12s, box-shadow .12s",
        position: "relative",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {icon && (
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--r-md)",
              background: "var(--surface-3)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon name={icon} size={18} style={{ color: "var(--text)" }} />
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </div>
          {sub && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{sub}</div>}
        </div>
        {statusColor && (
          <span
            style={{
              marginLeft: "auto",
              width: 8,
              height: 8,
              borderRadius: 8,
              background: statusColor,
              flexShrink: 0,
            }}
          />
        )}
      </div>

      <div
        className="tabular"
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "-.02em",
          lineHeight: 1.1,
          color: "var(--text)",
        }}
      >
        {value}
      </div>

      {deltaValue !== undefined && (
        <div>
          <MetricDelta
            value={deltaValue}
            unit={deltaUnit}
            size="md"
            invert={deltaInvert}
          />
        </div>
      )}
    </button>
  );
}

/* ---------- KpiGrid: responsive auto-fit grid wrapper ---------- */
export interface KpiGridProps {
  children: ReactNode;
  /** Minimum tile width in px (default 220). */
  minWidth?: number;
  style?: CSSProperties;
}
export function KpiGrid({ children, minWidth = 220, style }: KpiGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
