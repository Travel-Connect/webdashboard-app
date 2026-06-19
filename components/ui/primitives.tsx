"use client";

/* ============================================================
   primitives.tsx — ported from docs/.../ui.jsx
   MetricDelta, Badge, Tabs, Segmented, Panel, EmptyState,
   LoadingSkeleton, Btn. All design-token driven.
   ============================================================ */

import { type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";

/* ---------- MetricDelta ---------- */
export interface MetricDeltaProps {
  value: number | null | undefined;
  unit?: string;
  size?: "sm" | "md";
  /** When true, negative is "good" (green) and positive is "bad" (red). */
  invert?: boolean;
  muted?: boolean;
}
export function MetricDelta({
  value,
  unit = "%",
  size = "sm",
  invert = false,
  muted,
}: MetricDeltaProps) {
  if (value == null || Number.isNaN(value)) {
    return (
      <span style={{ color: "var(--text-3)", fontSize: size === "sm" ? 12 : 13 }}>
        —
      </span>
    );
  }
  const pos = invert ? value < 0 : value > 0;
  const zero = Math.abs(value) < 0.05;
  const color = zero
    ? "var(--text-2)"
    : pos
      ? "var(--positive)"
      : "var(--danger)";
  const arrow: IconName = zero ? "Minus" : value > 0 ? "ArrowUp" : "ArrowDown";
  const txt = (value > 0 ? "+" : "") + value.toFixed(1) + unit;
  return (
    <span
      className="tabular"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        color: muted ? "var(--text-2)" : color,
        fontSize: size === "sm" ? 12 : 13,
        fontWeight: 600,
      }}
    >
      <Icon name={arrow} size={size === "sm" ? 12 : 14} strokeWidth={2.5} />
      {txt}
    </span>
  );
}

/* ---------- Badge / Pill ---------- */
export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "warning"
  | "danger"
  | "positive";
const TONES: Record<BadgeTone, [string, string]> = {
  neutral: ["var(--surface-3)", "var(--text-2)"],
  primary: ["var(--primary-weak)", "var(--primary-ink)"],
  accent: ["var(--accent-weak)", "var(--accent)"],
  warning: ["var(--warning-weak)", "var(--warning)"],
  danger: ["var(--danger-weak)", "var(--danger)"],
  positive: ["var(--positive-weak)", "var(--positive)"],
};
export interface BadgeProps {
  tone?: BadgeTone;
  icon?: IconName;
  children?: ReactNode;
  dot?: boolean;
  style?: CSSProperties;
}
export function Badge({ tone = "neutral", icon, children, dot, style }: BadgeProps) {
  const [bg, fg] = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 600,
        padding: dot ? "3px 9px 3px 8px" : "3px 9px",
        borderRadius: 999,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && (
        <i style={{ width: 6, height: 6, borderRadius: 8, background: fg }} />
      )}
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

/* ---------- Tabs (underline) ---------- */
export interface TabItem {
  value: string;
  label: ReactNode;
}
export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
}
export function Tabs({ tabs, value, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            style={{
              border: "none",
              background: "none",
              padding: "10px 14px 11px",
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              color: active ? "var(--text)" : "var(--text-2)",
              borderBottom: "2px solid " + (active ? "var(--primary)" : "transparent"),
              marginBottom: -1,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Segmented control ---------- */
export type SegmentedOption<V extends string = string> =
  | V
  | { value: V; label: ReactNode };
export interface SegmentedProps<V extends string = string> {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: "sm" | "md";
}
export function Segmented<V extends string = string>({
  options,
  value,
  onChange,
  size = "md",
}: SegmentedProps<V>) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "var(--surface-3)",
        borderRadius: "var(--r-md)",
        padding: 2,
        gap: 2,
      }}
    >
      {options.map((o) => {
        const v = (typeof o === "string" ? o : o.value) as V;
        const label = typeof o === "string" ? o : o.label;
        const active = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              border: "none",
              borderRadius: "var(--r-sm)",
              padding: size === "sm" ? "4px 10px" : "6px 14px",
              fontSize: size === "sm" ? 12 : 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--text)" : "var(--text-2)",
              boxShadow: active ? "var(--shadow-card)" : "none",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Card shell ---------- */
export interface PanelProps {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  pad?: boolean;
  style?: CSSProperties;
}
export function Panel({ title, sub, actions, children, pad = true, style }: PanelProps) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || actions) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <h3
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                {title}
              </h3>
            )}
            {sub && (
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-2)" }}>
                {sub}
              </p>
            )}
          </div>
          {actions && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}
            >
              {actions}
            </div>
          )}
        </header>
      )}
      <div style={pad ? { padding: 18 } : undefined}>{children}</div>
    </section>
  );
}

/* ---------- States ---------- */
export interface EmptyStateProps {
  icon?: IconName;
  title?: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}
export function EmptyState({ icon = "Inbox", title, body, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-2)" }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "var(--r-lg)",
          background: "var(--surface-3)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <Icon name={icon} size={22} style={{ color: "var(--text-3)" }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{title}</div>
      {body && (
        <div
          style={{
            fontSize: 13,
            marginTop: 6,
            maxWidth: 420,
            marginInline: "auto",
            lineHeight: 1.6,
          }}
        >
          {body}
        </div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export interface LoadingSkeletonProps {
  rows?: number;
  height?: number;
}
export function LoadingSkeleton({ rows = 4, height = 16 }: LoadingSkeletonProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skel"
          style={{ height, width: 90 - i * 8 + "%", borderRadius: 6 }}
        />
      ))}
    </div>
  );
}

/* ---------- Button ---------- */
export type BtnVariant = "primary" | "default" | "ghost" | "danger" | "accent";
export interface BtnProps {
  variant?: BtnVariant;
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  style?: CSSProperties;
  type?: "button" | "submit";
}
export function Btn({
  variant = "default",
  icon,
  iconRight,
  children,
  onClick,
  disabled,
  size = "md",
  style,
  type = "button",
}: BtnProps) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    fontSize: size === "sm" ? 13 : 14,
    fontWeight: 600,
    borderRadius: "var(--r-md)",
    padding: size === "sm" ? "6px 11px" : "8px 14px",
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition: "background .12s, border-color .12s",
  };
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: { background: "var(--primary)", color: "#fff", border: "1px solid var(--primary)" },
    default: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" },
    ghost: { background: "transparent", color: "var(--text-2)", border: "1px solid transparent" },
    danger: { background: "var(--danger)", color: "#fff", border: "1px solid var(--danger)" },
    accent: { background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" },
  };
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}
