"use client";

/* ============================================================
   tables.tsx — 泊数分析表 tables (販売室数 / 売上 / ADR / 同伴係数).
   Faithful port of docs/.../screens-stay.jsx using live pivoted data.
   ============================================================ */

import type { CSSProperties } from "react";
import {
  STAY_BUCKETS,
  STAY_MONTHS,
  columnTotals,
  adrColumnAverages,
  compColumnAverages,
  type MonthRow,
} from "./model";

/* 配色：分析画面共通のブルー基調トークン */
const STAY_PINK = "rgba(37,111,219,0.08)";
const STAY_PINK_LINE = "var(--border)";
const STAY_BLUE = "rgba(37,111,219,0.12)";
const STAY_BLUE_TAB = "var(--primary)";

const stThBase: CSSProperties = {
  background: STAY_PINK,
  color: "var(--text-2)",
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 5px",
  textAlign: "right",
  whiteSpace: "normal",
  lineHeight: 1.18,
  verticalAlign: "bottom",
  borderBottom: "1px solid " + STAY_PINK_LINE,
  borderRight: "1px solid var(--border)",
};
const stTd: CSSProperties = {
  padding: "0 6px",
  height: 30,
  lineHeight: "30px",
  fontSize: 11.5,
  textAlign: "right",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--border)",
};
const stTot: CSSProperties = {
  padding: "0 6px",
  height: 32,
  lineHeight: "32px",
  fontSize: 11.5,
  fontWeight: 700,
  textAlign: "right",
  whiteSpace: "nowrap",
  background: STAY_BLUE,
  borderTop: "2px solid var(--border-strong)",
  color: "var(--text)",
};

const th = (headTop: number | null, extra?: CSSProperties): CSSProperties =>
  Object.assign(
    {},
    stThBase,
    headTop != null ? { position: "sticky" as const, top: headTop, zIndex: 1 } : {},
    extra,
  );

/* 数値ヘルパ */
const stN = (n: number | null | undefined): string =>
  n == null || isNaN(n) ? "—" : new Intl.NumberFormat("ja-JP").format(Math.round(n));
const stPct1 = (n: number | null | undefined): string =>
  n == null || isNaN(n) ? "" : n.toFixed(1) + "%";

const hoverOn = (e: React.MouseEvent<HTMLTableRowElement>) => {
  e.currentTarget.style.background = "var(--surface-3)";
};
const hoverOff = (e: React.MouseEvent<HTMLTableRowElement>) => {
  e.currentTarget.style.background = "";
};

/* 当年/前年 の小見出しタブ */
export function YearTab({ year, prior }: { year: number; prior?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 7px" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          fontWeight: 700,
          background: prior ? "var(--surface-3)" : STAY_BLUE_TAB,
          color: prior ? "var(--text-2)" : "#fff",
          padding: "3px 13px",
          borderRadius: "var(--r-md)",
        }}
      >
        {prior ? "前年実績" : "当年"}　{year}年
      </span>
    </div>
  );
}

interface TableProps {
  rows: MonthRow[];
  year: number;
  prior?: boolean;
  headTop: number | null;
}

/* ---------------- 販売室数 ---------------- */
export function RoomsTable({ rows, year, prior, headTop }: TableProps) {
  const tot = columnTotals(rows, "rooms");
  const grand = tot.reduce((a, b) => a + b, 0);
  return (
    <div>
      <YearTab year={year} prior={prior} />
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "10%" }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <col key={i} style={{ width: "7%" }} />
          ))}
          <col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "13%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={th(headTop, { textAlign: "left" })}>日付</th>
            {STAY_BUCKETS.map((b) => (
              <th key={b} style={th(headTop)}>
                {b}
              </th>
            ))}
            <th style={th(headTop)}>総泊数</th>
            <th style={th(headTop)}>平均泊数</th>
            <th style={th(headTop)}>1泊比率</th>
            <th style={th(headTop)}>2泊比率</th>
            <th style={th(headTop)}>3泊以上比率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const cnt = r.resv.reduce((a, b) => a + b, 0);
            const tn = r.rooms.reduce((a, b) => a + b, 0);
            const avg = cnt ? tn / cnt : 0;
            const r1 = cnt ? (r.resv[0] / cnt) * 100 : 0;
            const r2 = cnt ? (r.resv[1] / cnt) * 100 : 0;
            const r3 = cnt ? ((r.resv[2] + r.resv[3] + r.resv[4]) / cnt) * 100 : 0;
            return (
              <tr key={i} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                <td style={{ ...stTd, textAlign: "left", fontWeight: 600 }}>{STAY_MONTHS[r.month - 1]}</td>
                {r.rooms.map((v, k) => (
                  <td
                    key={k}
                    className="tabular"
                    style={{ ...stTd, color: v === 0 ? "var(--text-3)" : "var(--text)" }}
                  >
                    {stN(v)}
                  </td>
                ))}
                <td className="tabular" style={{ ...stTd, fontWeight: 700 }}>
                  {stN(tn)}
                </td>
                <td className="tabular" style={{ ...stTd, color: "var(--text-2)" }}>
                  {avg.toFixed(2)}
                </td>
                <td className="tabular" style={{ ...stTd, color: "var(--text-2)" }}>
                  {stPct1(r1)}
                </td>
                <td className="tabular" style={{ ...stTd, color: "var(--text-2)" }}>
                  {stPct1(r2)}
                </td>
                <td className="tabular" style={{ ...stTd, color: "var(--text-2)" }}>
                  {stPct1(r3)}
                </td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...stTot, textAlign: "left" }}>合計</td>
            {tot.map((v, k) => (
              <td key={k} className="tabular" style={stTot}>
                {stN(v)}
              </td>
            ))}
            <td className="tabular" style={stTot}>
              {stN(grand)}
            </td>
            <td style={stTot}></td>
            <td style={stTot}></td>
            <td style={stTot}></td>
            <td style={stTot}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- 売上 ---------------- */
export function SalesTable({ rows, year, prior, headTop }: TableProps) {
  const colTot = columnTotals(rows, "revenue");
  const grand = colTot.reduce((a, b) => a + b, 0);
  const cTd: CSSProperties = { ...stTd, fontSize: 10.5, padding: "0 5px" };
  const cTot: CSSProperties = { ...stTot, fontSize: 10.5, padding: "0 5px" };
  return (
    <div>
      <YearTab year={year} prior={prior} />
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "6%" }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <col key={i} style={{ width: "11%" }} />
          ))}
          <col style={{ width: "13%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "5.33%" }} />
          <col style={{ width: "5.33%" }} />
          <col style={{ width: "5.33%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={th(headTop, { textAlign: "left", fontSize: 10.5, padding: "7px 5px" })}>日付</th>
            {STAY_BUCKETS.map((b) => (
              <th key={b} style={th(headTop, { fontSize: 10.5, padding: "7px 5px" })}>
                {b}
              </th>
            ))}
            <th style={th(headTop, { fontSize: 10.5, padding: "7px 5px" })}>総売上</th>
            <th style={th(headTop, { fontSize: 10.5, padding: "7px 5px" })}>平均売上</th>
            <th style={th(headTop, { fontSize: 10, padding: "7px 4px" })}>
              1泊
              <br />
              構成比
            </th>
            <th style={th(headTop, { fontSize: 10, padding: "7px 4px" })}>
              2泊
              <br />
              構成比
            </th>
            <th style={th(headTop, { fontSize: 10, padding: "7px 4px" })}>
              3泊以上
              <br />
              構成比
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const tot = r.revenue.reduce((a, b) => a + b, 0);
            const p1 = tot ? (r.revenue[0] / tot) * 100 : 0;
            const p2 = tot ? (r.revenue[1] / tot) * 100 : 0;
            const p3 = tot ? ((r.revenue[2] + r.revenue[3] + r.revenue[4]) / tot) * 100 : 0;
            return (
              <tr key={i} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                <td style={{ ...cTd, textAlign: "left", fontWeight: 600 }}>{STAY_MONTHS[r.month - 1]}</td>
                {r.revenue.map((v, k) => (
                  <td
                    key={k}
                    className="tabular"
                    style={{ ...cTd, color: v === 0 ? "var(--text-3)" : "var(--text)" }}
                  >
                    {stN(v)}
                  </td>
                ))}
                <td className="tabular" style={{ ...cTd, fontWeight: 700 }}>
                  {stN(tot)}
                </td>
                <td className="tabular" style={{ ...cTd, color: "var(--text-2)" }}>
                  {stN(tot / 5)}
                </td>
                <td className="tabular" style={{ ...cTd, color: "var(--text-2)" }}>
                  {stPct1(p1)}
                </td>
                <td className="tabular" style={{ ...cTd, color: "var(--text-2)" }}>
                  {stPct1(p2)}
                </td>
                <td className="tabular" style={{ ...cTd, color: "var(--text-2)" }}>
                  {stPct1(p3)}
                </td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...cTot, textAlign: "left" }}>合計</td>
            {colTot.map((v, k) => (
              <td key={k} className="tabular" style={cTot}>
                {stN(v)}
              </td>
            ))}
            <td className="tabular" style={cTot}>
              {stN(grand)}
            </td>
            <td className="tabular" style={cTot}>
              {stN(grand / 5)}
            </td>
            <td style={cTot}></td>
            <td style={cTot}></td>
            <td style={cTot}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- ADR / 同伴係数（5バケット + 平均 1列） ---------------- */
interface MetricTableProps extends TableProps {
  /** which per-bucket field to read */
  metric: "adr" | "comp";
  lastLabel: string;
  footLabel: string;
}

export function MetricTable({ rows, year, prior, headTop, metric, lastLabel, footLabel }: MetricTableProps) {
  const dash = metric === "comp";
  const fmt = (v: number | null | undefined): string => {
    if (v == null || isNaN(v)) return "—";
    if (dash) return v.toFixed(2); // 同伴係数
    return v === 0 ? "0" : stN(v); // ADR
  };
  const avgCols = metric === "adr" ? adrColumnAverages(rows) : compColumnAverages(rows);
  // row average across that row's buckets (weighted)
  const rowAvg = (r: MonthRow): number | null => {
    if (metric === "adr") {
      const rev = r.revenue.reduce((a, b) => a + b, 0);
      const rooms = r.rooms.reduce((a, b) => a + b, 0);
      return rooms > 0 ? rev / rooms : null;
    }
    const guests = r.guests.reduce((a, b) => a + b, 0);
    const resv = r.resv.reduce((a, b) => a + b, 0);
    return resv > 0 ? guests / resv : null;
  };
  // grand average column footer
  const grandAvg = ((): number | null => {
    if (metric === "adr") {
      const rev = rows.reduce((s, r) => s + r.revenue.reduce((a, b) => a + b, 0), 0);
      const rooms = rows.reduce((s, r) => s + r.rooms.reduce((a, b) => a + b, 0), 0);
      return rooms > 0 ? rev / rooms : null;
    }
    const guests = rows.reduce((s, r) => s + r.guests.reduce((a, b) => a + b, 0), 0);
    const resv = rows.reduce((s, r) => s + r.resv.reduce((a, b) => a + b, 0), 0);
    return resv > 0 ? guests / resv : null;
  })();

  return (
    <div>
      <YearTab year={year} prior={prior} />
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "16%" }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <col key={i} style={{ width: "13%" }} />
          ))}
          <col style={{ width: "19%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={th(headTop, { textAlign: "left" })}>日付</th>
            {STAY_BUCKETS.map((b) => (
              <th key={b} style={th(headTop)}>
                {b}
              </th>
            ))}
            <th style={th(headTop)}>{lastLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const cells = metric === "adr" ? r.adr : r.comp;
            return (
              <tr key={i} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                <td style={{ ...stTd, textAlign: "left", fontWeight: 600 }}>{STAY_MONTHS[r.month - 1]}</td>
                {cells.map((v, k) => (
                  <td
                    key={k}
                    className="tabular"
                    style={{ ...stTd, color: v === 0 || v == null ? "var(--text-3)" : "var(--text)" }}
                  >
                    {fmt(v)}
                  </td>
                ))}
                <td className="tabular" style={{ ...stTd, fontWeight: 700 }}>
                  {fmt(rowAvg(r))}
                </td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...stTot, textAlign: "left" }}>{footLabel}</td>
            {avgCols.map((v, k) => (
              <td key={k} className="tabular" style={stTot}>
                {fmt(v)}
              </td>
            ))}
            <td className="tabular" style={stTot}>
              {fmt(grandAvg)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
