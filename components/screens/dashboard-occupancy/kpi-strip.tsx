"use client";

/* ============================================================
   kpi-strip.tsx — 稼働分析 KPI strip (9 metrics, one row)
   Ported from screens-occupancy.jsx OccKpiStrip, wired to live
   OccupancySummary + optional previous_year comparison metrics.
   ============================================================ */

import { Icon } from "@/components/ui/icon";
import { MetricDelta } from "@/components/ui/primitives";
import { yen, integer, percent } from "@/lib/dashboard/format";
import type { MetricComparison, OccupancySummary } from "@/lib/api/types";

type KpiType = "pct" | "yen" | "int" | "ratio";

interface KpiDef {
  label: string;
  type: KpiType;
  value: number | null;
  /** comparison metric key (matches lib/api/occupancy.ts cmp() metric names) */
  cmpKey?: string;
  unit?: string;
  primary?: boolean;
  /** when true negative delta is "good" (e.g. 残室) */
  invert?: boolean;
}

function kval(type: KpiType, v: number | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (type === "pct") return percent(v);
  if (type === "yen") return yen(v);
  if (type === "ratio") return v.toFixed(2);
  return integer(v);
}

/** white-on-primary delta (▲▼) for the highlighted card */
function DeltaInv({ value, unit }: { value: number | null; unit: string }) {
  if (value == null || Number.isNaN(value))
    return <span style={{ color: "rgba(255,255,255,.5)", fontSize: 11.5 }}>—</span>;
  const up = value > 0;
  return (
    <span
      className="tabular"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        fontSize: 11.5,
        fontWeight: 700,
        color: up ? "#86efac" : "#fca5a5",
      }}
    >
      <Icon name={up ? "ArrowUp" : "ArrowDown"} size={11} strokeWidth={2.5} />
      {(up ? "+" : "") + value.toFixed(1) + unit}
    </span>
  );
}

export interface OccKpiStripProps {
  summary: OccupancySummary;
  /** previous_year metrics from response.comparison (null when not requested) */
  metrics?: MetricComparison[] | null;
}

export function OccKpiStrip({ summary, metrics }: OccKpiStripProps) {
  const s = summary;
  const list: KpiDef[] = [
    { label: "稼働率", type: "pct", value: pct100(s.occupancyRate), cmpKey: "occupancyRate", primary: true },
    { label: "売上", type: "yen", value: s.roomRevenue, cmpKey: "roomRevenue" },
    { label: "販売室数", type: "int", value: s.soldRoomNights, cmpKey: "soldRoomNights", unit: "室" },
    { label: "残室数", type: "int", value: s.remainingRoomNights, unit: "室", invert: true },
    { label: "宿泊人数", type: "int", value: s.guestCount, cmpKey: "guestCount", unit: "名" },
    { label: "ADR", type: "yen", value: s.adr, cmpKey: "adr" },
    { label: "RevPAR", type: "yen", value: s.revpar, cmpKey: "revpar" },
    { label: "客単価", type: "yen", value: s.guestUnitPrice },
    { label: "平均人数", type: "ratio", value: s.avgGuestsPerRoom, unit: "名" },
  ];

  const byKey = new Map((metrics ?? []).map((m) => [m.metric, m]));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 8 }}>
      {list.map((k) => {
        const primary = !!k.primary;
        const m = k.cmpKey ? byKey.get(k.cmpKey) : undefined;
        // occupancyRate → point diff (pt); all other metrics → % rate change
        const isPoint = k.cmpKey === "occupancyRate";
        const cmpVal =
          m == null ? null : isPoint ? pct100(m.diff) : ratePct(m.rate);
        const cmpUnit = isPoint ? "pt" : "%";
        return (
          <div
            key={k.label}
            style={{
              background: primary ? "var(--primary)" : "var(--surface)",
              border: "1px solid " + (primary ? "var(--primary)" : "var(--border)"),
              borderRadius: "var(--r-md)",
              padding: "9px 11px",
              boxShadow: "var(--shadow-card)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: primary ? "rgba(255,255,255,.7)" : "var(--text-2)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {k.label}
            </div>
            <div
              className="tabular"
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "-.02em",
                lineHeight: 1,
                color: primary ? "#fff" : "var(--text)",
                whiteSpace: "nowrap",
              }}
            >
              {kval(k.type, k.value)}
              {k.type === "int" && k.unit && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    marginLeft: 1,
                    color: primary ? "rgba(255,255,255,.65)" : "var(--text-3)",
                  }}
                >
                  {k.unit}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 10, color: primary ? "rgba(255,255,255,.55)" : "var(--text-3)" }}>
                前年
              </span>
              {primary ? (
                <DeltaInv value={cmpVal} unit={cmpUnit} />
              ) : (
                <MetricDelta value={cmpVal} unit={cmpUnit} invert={k.invert} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** API occupancyRate / diff are fractions (0–1); scale to percent/point units. */
function pct100(v: number | null): number | null {
  return v == null || Number.isNaN(v) ? null : v * 100;
}
/** rate is current/baseline; render as % change. */
function ratePct(rate: number | null): number | null {
  return rate == null || Number.isNaN(rate) ? null : (rate - 1) * 100;
}
