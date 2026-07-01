"use client";

/* ============================================================
   top-shared.tsx — 総合ダッシュボード(TOP)共通ヘルパー。
   screens-top.jsx 準拠: 中立トーン（増減を色で良し悪し断定しない）。
   ============================================================ */

import { type CSSProperties, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { yen, integer } from "@/lib/dashboard/format";

// パレット（screens-top.jsx TOP_PAL）
export const TOP_PAL = {
  blue: "#2563EB",
  teal: "#0F766E",
  amber: "#D97706",
  rose: "#E11D48",
  violet: "#7C3AED",
  gray: "#94A3B8",
} as const;

export type KpiUnit = "yen" | "rooms" | "people" | "nights" | "percent";
export const UNIT_SUFFIX: Record<KpiUnit, string> = { yen: "", rooms: "室", people: "人", nights: "泊", percent: "%" };

/** KPI 値の整形（unit 別）。null/NaN → '—'。 */
export function fmtKpiValue(unit: KpiUnit, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (unit === "yen") return yen(v);
  if (unit === "rooms") return integer(v);
  if (unit === "people" || unit === "nights") return v.toFixed(2);
  if (unit === "percent") return v.toFixed(1);
  return String(v);
}

/**
 * 中立デルタ表示（矢印＋符号＋テキスト、ニュートラル色）。
 * @param kind 'pct'=百分率差 / 'abs'=絶対差（unit に従って整形）
 */
export function NeutralDelta({
  value,
  kind,
  unit,
  strong,
}: {
  value: number | null | undefined;
  kind: "pct" | "abs";
  unit: KpiUnit;
  strong?: boolean;
}) {
  if (value == null || Number.isNaN(value)) {
    return <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>;
  }
  const zero = Math.abs(value) < (kind === "pct" ? 0.05 : unit === "yen" || unit === "rooms" ? 0.5 : 0.005);
  const arrow = zero ? "Minus" : value > 0 ? "ArrowUp" : "ArrowDown";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const mag = Math.abs(value);
  let txt: string;
  if (kind === "pct") txt = sign + mag.toFixed(1) + "%";
  else if (unit === "yen") txt = sign + yen(mag);
  else if (unit === "rooms") txt = sign + integer(mag) + "室";
  else if (unit === "percent") txt = sign + mag.toFixed(1) + "pt";
  else txt = sign + mag.toFixed(2) + (unit === "people" ? "人" : "泊");
  const wrap: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    color: strong ? "var(--text)" : "var(--text-2)",
    fontWeight: strong ? 700 : 600,
    fontSize: strong ? 13 : 12,
  };
  return (
    <span className="tabular" style={wrap}>
      <Icon name={arrow} size={strong ? 13 : 12} strokeWidth={2.5} style={{ color: "var(--text-3)" }} />
      {txt}
    </span>
  );
}

/* ============================================================
   共通カード枠（screens-top.jsx ModuleCard 準拠）。
   header(タイトル/サブ/アクション) + body + footer。
   ============================================================ */
export function WidgetCard({
  title,
  sub,
  actions,
  footer,
  children,
  minHeight,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  minHeight?: number;
}) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
        minHeight,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "13px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{title}</h3>
          {sub && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-3)" }}>{sub}</p>}
        </div>
        {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
      </header>
      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column" }}>{children}</div>
      {footer && <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px" }}>{footer}</div>}
    </section>
  );
}

/* 状態: 空（モジュール内中央寄せ） */
export function ModuleEmpty({ icon = "Inbox", msg }: { icon?: IconName; msg: string }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 140,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "var(--text-3)",
        textAlign: "center",
        padding: 16,
      }}
    >
      <Icon name={icon} size={26} />
      <span style={{ fontSize: 12.5 }}>{msg}</span>
    </div>
  );
}

/* 相対バー（国籍別TOP10 等の「構成（相対）」セル） */
export function BarCell({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 8,
          minWidth: 40,
          borderRadius: 999,
          background: "var(--surface-3)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: p + "%", height: "100%", borderRadius: 999, background: "var(--primary)" }} />
      </div>
      <span className="tabular" style={{ fontSize: 11, color: "var(--text-3)", width: 34, textAlign: "right" }}>
        {p.toFixed(0)}%
      </span>
    </div>
  );
}

/* ============================================================
   ドリルダウン遷移（現在の期間フィルタ year/month/period/taxMode を引き継ぐ）。
   facilityId/facilityIds は引き継がない（遷移先は単一施設フィルタのため）。
   ============================================================ */
const CARRY_PARAMS = ["year", "month", "period", "taxMode"] as const;
function withFilterParams(route: string, sp: URLSearchParams): string {
  const p = new URLSearchParams();
  for (const k of CARRY_PARAMS) {
    const v = sp.get(k);
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `${route}?${qs}` : route;
}

/** route へ遷移する関数を返す（期間フィルタ引き継ぎ）。 */
export function useDrill(): (route: string) => void {
  const router = useRouter();
  const sp = useSearchParams();
  return (route: string) => router.push(withFilterParams(route, sp));
}

/** カード末尾のドリルリンク（「○○分析を見る ›」）。 */
export function FooterLink({ label, route }: { label: string; route: string }) {
  const drill = useDrill();
  return (
    <button
      onClick={() => drill(route)}
      style={{
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        color: "var(--primary)",
        fontSize: 12.5,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
      <Icon name="ChevronRight" size={14} />
    </button>
  );
}
