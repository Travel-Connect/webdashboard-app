"use client";

/* ============================================================
   overview-card.tsx — KPI overview tile for the 総合ダッシュボード.
   Ported from docs/.../screens-dashboard.jsx (OverviewCard, inline delta variant).
   Screen-local: lives only under the dashboard home screen.
   ============================================================ */

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { MetricDelta } from "@/components/ui/primitives";

export type CardStatus = "ok" | "warn" | "danger";

const STATUS_DOT: Record<CardStatus, string> = {
  ok: "var(--positive)",
  warn: "var(--warning)",
  danger: "var(--danger)",
};
const STATUS_LABEL: Record<CardStatus, string> = {
  ok: "正常",
  warn: "要確認",
  danger: "異常",
};

export interface OverviewKpi {
  key: string;
  href: string;
  icon: IconName;
  title: string;
  /** Sub caption under the title. */
  sub: string;
  /** Pre-formatted main value (already run through the format helpers; "—" allowed). */
  main: ReactNode;
  /** YoY delta value (null/undefined → "—"). */
  yoy?: number | null;
  /** Unit for the YoY delta (e.g. "%", "pt"). */
  yoyUnit?: string;
  /** Budget delta value (null/undefined → "—"). */
  budget?: number | null;
  /** Unit for the budget delta. */
  budgetUnit?: string;
  status: CardStatus;
  /** Footer note line. */
  note: ReactNode;
}

export function OverviewCard({ k }: { k: OverviewKpi }) {
  const dot = STATUS_DOT[k.status];
  const hasBudget = k.budget !== undefined;
  return (
    <Link
      href={k.href}
      style={{
        textDecoration: "none",
        color: "inherit",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        position: "relative",
      }}
    >
      {/* head */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          <Icon name={k.icon} size={18} style={{ color: "var(--text)" }} />
        </span>
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
            {k.title}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{k.sub}</div>
        </div>
        <span
          title={STATUS_LABEL[k.status]}
          style={{
            marginLeft: "auto",
            width: 8,
            height: 8,
            borderRadius: 8,
            background: dot,
            flexShrink: 0,
          }}
        />
      </div>

      {/* value */}
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
        {k.main}
      </div>

      {/* deltas (inline variant) */}
      <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
        <span style={{ color: "var(--text-2)" }}>
          前年 <MetricDelta value={k.yoy ?? null} unit={k.yoyUnit ?? "%"} />
        </span>
        {hasBudget && (
          <span style={{ color: "var(--text-2)" }}>
            予算 <MetricDelta value={k.budget ?? null} unit={k.budgetUnit ?? "%"} />
          </span>
        )}
      </div>

      {/* note */}
      <div
        style={{
          fontSize: 11.5,
          color: "var(--text-2)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderTop: "1px solid var(--border)",
          paddingTop: 10,
        }}
      >
        {k.status !== "ok" && (
          <Icon name="CircleAlert" size={13} style={{ color: dot, flexShrink: 0 }} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{k.note}</span>
      </div>
    </Link>
  );
}
