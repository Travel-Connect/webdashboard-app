"use client";

/* ============================================================
   glyph.tsx — 編集タイル内の軽いプレビュー模式図（実カードは使わない）＋
   span バッジ ＋ 編集モード用スタイル注入。
   claude.ai/design app/widget-layout-model.jsx の TdwGlyph/TdwSpanBadge/TdwStyles 移植。
   ============================================================ */

import { TDW_CSS, type WidgetGlyph } from "@/lib/dashboard/widget-layout";

export function TdwGlyph({ kind, tone }: { kind: WidgetGlyph; tone?: string }) {
  const c1 = "var(--border-strong)";
  const c2 = "var(--surface-3)";
  const pri = tone || "var(--primary)";
  if (kind === "num") {
    return (
      <svg width="100%" height="30" viewBox="0 0 120 30" style={{ display: "block" }} aria-hidden="true">
        <rect x="0" y="1" width="60" height="13" rx="3" fill={c1} opacity="0.5" />
        <rect x="0" y="21" width="28" height="6" rx="3" fill={c2} />
        <rect x="35" y="21" width="22" height="6" rx="3" fill={c2} />
      </svg>
    );
  }
  if (kind === "cal") {
    const cells = [];
    for (let r = 0; r < 3; r++)
      for (let cN = 0; cN < 7; cN++) {
        const on = (r * 7 + cN) % 3 === 0;
        cells.push(
          <rect key={r + "-" + cN} x={cN * 15} y={r * 10.5} width="12" height="8" rx="2" fill={on ? pri : c2} opacity={on ? 0.32 : 1} />,
        );
      }
    return (
      <svg width="100%" height="30" viewBox="0 0 105 30" style={{ display: "block" }} aria-hidden="true">
        {cells}
      </svg>
    );
  }
  if (kind === "rank") {
    const ws = [96, 74, 58, 40];
    return (
      <svg width="100%" height="30" viewBox="0 0 100 30" style={{ display: "block" }} aria-hidden="true">
        {ws.map((w, i) => (
          <rect key={i} x="0" y={i * 7.5} width={w} height="5" rx="2.5" fill={i === 0 ? pri : c1} opacity={i === 0 ? 0.4 : 0.5} />
        ))}
      </svg>
    );
  }
  if (kind === "bars") {
    const hs = [12, 20, 28, 16, 24];
    return (
      <svg width="100%" height="30" viewBox="0 0 120 30" style={{ display: "block" }} aria-hidden="true">
        {hs.map((h, i) => (
          <rect key={i} x={i * 15} y={30 - h} width="10" height={h} rx="2" fill={i === 2 ? pri : c1} opacity={i === 2 ? 0.4 : 0.5} />
        ))}
      </svg>
    );
  }
  if (kind === "gauge") {
    return (
      <svg width="100%" height="30" viewBox="0 0 120 30" style={{ display: "block" }} aria-hidden="true">
        <path d="M14 27 A26 26 0 0 1 106 27" fill="none" stroke={c2} strokeWidth="7" strokeLinecap="round" />
        <path d="M14 27 A26 26 0 0 1 74 12" fill="none" stroke={pri} strokeWidth="7" strokeLinecap="round" opacity="0.5" />
      </svg>
    );
  }
  // donut
  return (
    <svg width="100%" height="30" viewBox="0 0 120 30" style={{ display: "block" }} aria-hidden="true">
      <circle cx="18" cy="15" r="12" fill="none" stroke={c2} strokeWidth="6" />
      <circle cx="18" cy="15" r="12" fill="none" stroke={pri} strokeWidth="6" strokeDasharray="48 76" strokeLinecap="round" opacity="0.5" transform="rotate(-90 18 15)" />
      <rect x="40" y="7" width="60" height="5" rx="2.5" fill={c1} opacity="0.5" />
      <rect x="40" y="18" width="42" height="5" rx="2.5" fill={c2} />
    </svg>
  );
}

export function TdwSpanBadge({ span, tone }: { span: number; tone?: "on" }) {
  return (
    <span
      className="tabular"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10.5,
        fontWeight: 700,
        color: tone === "on" ? "var(--primary-ink)" : "var(--text-3)",
        background: tone === "on" ? "var(--primary-weak)" : "var(--surface-3)",
        padding: "1px 6px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {span}
      <span style={{ fontSize: 9.5, fontWeight: 700 }}>マス</span>
    </span>
  );
}

export function TdwStyles() {
  return <style>{TDW_CSS}</style>;
}
