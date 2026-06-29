"use client";

/* ============================================================
   alert-strip.tsx — derived data-quality alerts for the overview.
   Ported from docs/.../screens-dashboard.jsx (AlertStrip).
   Alerts are derived from the live summaries (no mock data).
   ============================================================ */

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

export type AlertLevel = "danger" | "warning";

export interface OverviewAlert {
  level: AlertLevel;
  icon: IconName;
  title: ReactNode;
  body: ReactNode;
  cta: string;
  href: string;
}

const COLORS: Record<AlertLevel, [string, string]> = {
  danger: ["var(--danger-weak)", "var(--danger)"],
  warning: ["var(--warning-weak)", "var(--warning)"],
};

export function AlertStrip({ alerts }: { alerts: OverviewAlert[] }) {
  if (!alerts.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {alerts.map((a, i) => {
        const [bg, fg] = COLORS[a.level];
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 11,
              padding: "11px 14px",
              borderRadius: "var(--r-md)",
              background: bg,
              border: "1px solid " + fg + "33",
            }}
          >
            <Icon
              name={a.icon}
              size={17}
              style={{ color: fg, flexShrink: 0, marginTop: 1 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {a.title}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text-2)",
                  marginTop: 1,
                  lineHeight: 1.5,
                }}
              >
                {a.body}
              </div>
            </div>
            <Link
              href={a.href}
              style={{
                flexShrink: 0,
                border: "1px solid " + fg + "55",
                background: "var(--surface)",
                color: fg,
                borderRadius: "var(--r-md)",
                padding: "5px 11px",
                fontSize: 12.5,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                textDecoration: "none",
              }}
            >
              {a.cta}
              <Icon name="ArrowRight" size={13} />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
