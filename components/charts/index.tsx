"use client";

/* ============================================================
   charts/index.tsx — hand-built SVG charts ported from charts.jsx
   No chart library. Token-unified. Typed props.
   Exports: ComboChart, MultiLineChart, Sparkline.
   ============================================================ */

import { useId, useRef, useState } from "react";

/* ---------- ComboChart: bars + line (+ optional LY line) ---------- */
export interface ComboDatum {
  [key: string]: number | string;
}
export interface ComboChartProps<D extends ComboDatum> {
  data: D[];
  /** key for x-axis label. */
  xKey: keyof D & string;
  /** key for bar value. */
  barKey: keyof D & string;
  /** key for primary line value. */
  lineKey: keyof D & string;
  /** optional key for last-year (dashed gray) line value. */
  ly?: keyof D & string;
  height?: number;
  barColor?: string;
  lineColor?: string;
  /** formatter for the bar hover readout. */
  barFmt?: (v: number) => string;
  /** max for the line axis (default 100, e.g. occupancy %). */
  lineMax?: number;
  lineUnit?: string;
}

export function ComboChart<D extends ComboDatum>({
  data,
  xKey,
  barKey,
  lineKey,
  ly,
  height = 240,
  barColor = "var(--c-blue)",
  lineColor = "var(--c-teal)",
  barFmt,
  lineMax = 100,
  lineUnit = "%",
}: ComboChartProps<D>) {
  const W = 880;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = data.length;
  const slot = innerW / Math.max(1, n);
  const barW = Math.min(34, slot * 0.5);
  const num = (d: D, k: keyof D & string) => Number(d[k]) || 0;
  const maxBar = Math.max(...data.map((d) => num(d, barKey)), 1) * 1.12;

  const xAt = (i: number) => padL + slot * i + slot / 2;
  const yBar = (v: number) => padT + innerH - (v / maxBar) * innerH;
  const yLine = (v: number) => padT + innerH - (v / lineMax) * innerH;

  const linePts = data.map((d, i) => [xAt(i), yLine(num(d, lineKey))] as const);
  const lyPts = ly ? data.map((d, i) => [xAt(i), yLine(num(d, ly))] as const) : null;
  const toPath = (pts: readonly (readonly [number, number])[]) =>
    pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => padT + innerH - f * innerH);

  return (
    <div style={{ width: "100%", overflow: "visible" }}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHover(null)}
      >
        {gridY.map((y, i) => (
          <line
            key={i}
            x1={padL}
            x2={W - padR}
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray={i === 4 ? "0" : "3 4"}
            opacity={i === 4 ? 1 : 0.7}
          />
        ))}
        {data.map((d, i) => {
          const h = innerH - (yBar(num(d, barKey)) - padT);
          const active = hover === i;
          return (
            <rect
              key={i}
              x={xAt(i) - barW / 2}
              y={yBar(num(d, barKey))}
              width={barW}
              height={Math.max(1, h)}
              rx="2"
              fill={barColor}
              opacity={active ? 1 : 0.22}
              onMouseEnter={() => setHover(i)}
              style={{ transition: "opacity .12s" }}
            />
          );
        })}
        {lyPts && (
          <path
            d={toPath(lyPts)}
            fill="none"
            stroke="var(--c-gray)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        )}
        <path d={toPath(linePts)} fill="none" stroke={lineColor} strokeWidth="2.25" />
        {linePts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={hover === i ? 4 : 2.5}
            fill="var(--surface)"
            stroke={lineColor}
            strokeWidth="2"
          />
        ))}
        {data.map((d, i) => {
          const show = n <= 12 || i % Math.ceil(n / 12) === 0;
          return show ? (
            <text
              key={i}
              x={xAt(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-3)"
            >
              {String(d[xKey])}
            </text>
          ) : null;
        })}
        {hover != null && (
          <line
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={padT}
            y2={padT + innerH}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
        )}
        {data.map((d, i) => (
          <rect
            key={"h" + i}
            x={padL + slot * i}
            y={padT}
            width={slot}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {hover != null && (
        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
            marginTop: 6,
            fontSize: 12,
            color: "var(--text-2)",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--text)" }}>
            {String(data[hover][xKey])}
          </span>
          <span>
            <i
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: barColor,
                marginRight: 5,
              }}
            />
            {barFmt ? barFmt(num(data[hover], barKey)) : num(data[hover], barKey)}
          </span>
          <span>
            <i
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 8,
                background: lineColor,
                marginRight: 5,
              }}
            />
            {num(data[hover], lineKey)}
            {lineUnit}
          </span>
          {ly && (
            <span style={{ color: "var(--text-3)" }}>
              前年 {num(data[hover], ly)}
              {lineUnit}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Sparkline (tiny, inline) ---------- */
export interface SparklineProps {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
}
export function Sparkline({ data, w = 76, h = 26, color = "var(--c-blue)" }: SparklineProps) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map(
    (v, i) => [(i / Math.max(1, data.length - 1)) * w, h - ((v - min) / rng) * (h - 4) - 2] as const,
  );
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = d + ` L${w} ${h} L0 ${h} Z`;
  const id = "sp" + useId().replace(/:/g, "");
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} />}
    </svg>
  );
}

/* ---------- DonutChart: composition ring (channels / room-types) ----------
   Not in the original charts.jsx; built in the same SVG/token idiom so
   composition screens have a ring without pulling in a chart library. */
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}
export interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  /** ring thickness in px. */
  thickness?: number;
  /** big number rendered in the hole (e.g. total). */
  centerLabel?: string;
  centerSub?: string;
  /** show the right-side legend with values. */
  legend?: boolean;
  /** format a slice value for the legend. */
  valueFmt?: (v: number) => string;
}

export function DonutChart({
  data,
  size = 180,
  thickness = 26,
  centerLabel,
  centerSub,
  legend = true,
  valueFmt,
}: DonutChartProps) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  let acc = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          data.map((d, i) => {
            const frac = (d.value || 0) / total;
            const dash = frac * c;
            const offset = -acc * c;
            acc += frac;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
          })}
        {centerLabel && (
          <text
            x={cx}
            y={cy - (centerSub ? 2 : -4)}
            textAnchor="middle"
            className="tabular"
            fontSize={size / 7}
            fontWeight={800}
            fill="var(--text)"
          >
            {centerLabel}
          </text>
        )}
        {centerSub && (
          <text
            x={cx}
            y={cy + size / 9}
            textAnchor="middle"
            fontSize={size / 14}
            fill="var(--text-3)"
          >
            {centerSub}
          </text>
        )}
      </svg>
      {legend && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
          {data.map((d, i) => {
            const pct = total > 0 ? ((d.value || 0) / total) * 100 : 0;
            return (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}
              >
                <i
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: d.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: "var(--text-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 160,
                  }}
                >
                  {d.label}
                </span>
                <span className="tabular" style={{ marginLeft: "auto", fontWeight: 600 }}>
                  {valueFmt ? valueFmt(d.value) : d.value}
                </span>
                <span className="tabular" style={{ color: "var(--text-3)", width: 44, textAlign: "right" }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- MultiLineChart: N lines, optional dual-axis ---------- */
export interface LineSeries {
  label: string;
  values: number[];
  color: string;
  /** "right" plots against the right axis. */
  axis?: "left" | "right";
  /** dashed (e.g. previous-year / cancelled scope). */
  dashed?: boolean;
}
export interface MultiLineChartProps {
  series: LineSeries[];
  xLabels: string[];
  /** left-axis tick formatter. */
  yFmt?: (v: number) => string | number;
  /** right-axis tick formatter. */
  yFmtRight?: (v: number) => string | number;
  height?: number;
  yTicks?: number;
  /** hover readout formatter (left axis). */
  hoverFmt?: (v: number) => string | number;
  hoverFmtRight?: (v: number) => string | number;
}

export function MultiLineChart({
  series,
  xLabels,
  yFmt,
  yFmtRight,
  height = 320,
  yTicks = 5,
  hoverFmt,
  hoverFmtRight,
}: MultiLineChartProps) {
  const hasRight = series.some((s) => s.axis === "right");
  const W = 1000;
  const H = height;
  const padL = 64;
  const padR = hasRight ? 72 : 16;
  const padT = 16;
  const padB = 64;
  const [hover, setHover] = useState<number | null>(null);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = xLabels.length;
  const niceMax = (m: number) => {
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    const f = m / p;
    const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return step * p * Math.ceil(m / (step * p));
  };
  const maxOf = (pred: (s: LineSeries) => boolean) => {
    const vals = series
      .filter(pred)
      .flatMap((s) => s.values)
      .filter((v) => v != null);
    return niceMax(Math.max(...vals, 1) * 1.05);
  };
  const maxL = maxOf((s) => s.axis !== "right");
  const maxR = hasRight ? maxOf((s) => s.axis === "right") : maxL;
  const xAt = (i: number) => padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const yAt = (v: number, axis?: "left" | "right") =>
    padT + innerH - (v / (axis === "right" ? maxR : maxL)) * innerH;
  const toPath = (s: LineSeries) =>
    s.values.map((v, i) => (i ? "L" : "M") + xAt(i).toFixed(1) + " " + yAt(v, s.axis).toFixed(1)).join(" ");
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => i / yTicks);

  return (
    <div style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((f, i) => {
          const y = padT + innerH - f * innerH;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth="1"
                strokeDasharray={i === 0 ? "0" : "3 4"}
                opacity={i === 0 ? 1 : 0.7}
              />
              <text
                x={padL - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-3)"
                className="tabular"
              >
                {yFmt ? yFmt(maxL * f) : Math.round(maxL * f)}
              </text>
              {hasRight && (
                <text
                  x={W - padR + 10}
                  y={y + 4}
                  textAnchor="start"
                  fontSize="11"
                  fill="var(--text-3)"
                  className="tabular"
                >
                  {(yFmtRight || yFmt || ((v: number) => Math.round(v)))(maxR * f)}
                </text>
              )}
            </g>
          );
        })}
        {xLabels.map((lb, i) => (
          <text
            key={i}
            x={xAt(i)}
            y={H - padB + 20}
            textAnchor="end"
            fontSize="10.5"
            fill="var(--text-3)"
            transform={`rotate(-32 ${xAt(i)} ${H - padB + 20})`}
          >
            {lb}
          </text>
        ))}
        {hover != null && (
          <line
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={padT}
            y2={padT + innerH}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
        )}
        {series.map((s, si) => (
          <path
            key={si}
            d={toPath(s)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.dashed ? 1.75 : 2.5}
            strokeDasharray={s.dashed ? "5 4" : "0"}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((s, si) =>
          s.values.map((v, i) => (
            <circle
              key={si + "-" + i}
              cx={xAt(i)}
              cy={yAt(v, s.axis)}
              r={hover === i ? 4 : 2.4}
              fill="var(--surface)"
              stroke={s.color}
              strokeWidth="2"
            />
          )),
        )}
        {xLabels.map((_, i) => (
          <rect
            key={i}
            x={xAt(i) - innerW / Math.max(1, n - 1) / 2}
            y={padT}
            width={innerW / Math.max(1, n - 1)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          gap: 18,
          justifyContent: "center",
          flexWrap: "wrap",
          marginTop: 4,
        }}
      >
        {series.map((s, si) => (
          <span
            key={si}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--text-2)",
            }}
          >
            <i
              style={{
                display: "inline-block",
                width: 16,
                height: 3,
                borderRadius: 2,
                background: s.color,
                opacity: s.dashed ? 0.55 : 1,
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
      {hover != null && (
        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 6,
            fontSize: 12,
            color: "var(--text-2)",
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--text)" }}>{xLabels[hover]}</span>
          {series.map((s, si) => {
            const f =
              s.axis === "right" ? hoverFmtRight || yFmtRight : hoverFmt || yFmt;
            return (
              <span key={si}>
                <i
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 8,
                    background: s.color,
                    marginRight: 5,
                  }}
                />
                {s.label}：{(f || ((v: number) => v))(s.values[hover])}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
