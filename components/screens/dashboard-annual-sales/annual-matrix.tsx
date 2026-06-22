"use client";

/* ============================================================
   annual-matrix.tsx — 12ヶ月(行) × 施設(列) クロスタブ（1指標分）。
   docs/.../screens-annual.jsx (AfTable) を移植。エリア超見出し（colSpan）+
   スティッキー月ラベル列 + 合計列/行。kind=実績/予算/予算達成率/予算差。
   ============================================================ */

import { type CSSProperties } from "react";
import type { AnnualCell, AnnualMatrix } from "@/lib/api/types";
import type { AfMetricId } from "./metrics";

const AF_GREEN = "rgba(37,111,219,0.08)";
const AF_GREEN_D = "rgba(37,111,219,0.14)";
const AF_ZEBRA = "#F7F9FC";
const RED = "var(--danger)";
const nf = new Intl.NumberFormat("ja-JP");
const yen0 = (v: number) => (v === 0 ? "¥0" : "¥" + nf.format(Math.round(v)));

function areaTint(area: string): string {
  if (area.startsWith("北谷")) return "rgba(37,99,235,0.07)";
  if (area.startsWith("北部")) return "rgba(15,118,110,0.08)";
  if (area.startsWith("那覇")) return "rgba(217,119,6,0.08)";
  if (area.startsWith("沖縄市")) return "rgba(124,58,237,0.07)";
  return "rgba(124,58,237,0.07)";
}

/** 1セルを kind に応じて表示文字列＋色へ。 */
function render(cell: AnnualCell, kind: AfMetricId): { text: string; color: string } {
  const text = "var(--text)";
  const gray = "var(--text-3)";
  if (kind === "actual") return { text: yen0(cell.actual), color: cell.actual === 0 ? gray : text };
  if (kind === "budget")
    return cell.budget == null
      ? { text: "—", color: gray }
      : { text: yen0(cell.budget), color: cell.budget === 0 ? gray : text };
  if (kind === "pct") {
    const v = cell.budget && cell.budget !== 0 ? (cell.actual / cell.budget) * 100 : null;
    return { text: v == null ? "—" : v.toFixed(1) + "%", color: v == null ? gray : v < 100 ? RED : text };
  }
  // diff = 実績 − 予算
  if (cell.budget == null) return { text: "—", color: gray };
  const r = Math.round(cell.actual - cell.budget);
  const s = nf.format(Math.abs(r));
  return { text: r === 0 ? "0" : r < 0 ? `(${s})` : `+${s}`, color: r < 0 ? RED : r === 0 ? gray : text };
}

export function AnnualMatrixTable({ matrix, kind }: { matrix: AnnualMatrix; kind: AfMetricId }) {
  const { facilities, rows, facilityTotals, grand } = matrix;
  const nF = facilities.length;

  // エリア超見出し（連続する同一エリアを colSpan）
  const groups: { area: string; span: number }[] = [];
  for (const f of facilities) {
    const last = groups[groups.length - 1];
    if (last && last.area === f.area) last.span++;
    else groups.push({ area: f.area || "—", span: 1 });
  }

  const monthW = 64;
  const facW = 92;
  const totW = 116;
  const minWidth = monthW + nF * facW + totW;

  const td: CSSProperties = {
    padding: "0 6px",
    height: 26,
    lineHeight: "26px",
    fontSize: 10.5,
    textAlign: "right",
    whiteSpace: "nowrap",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const monthCell: CSSProperties = {
    ...td,
    textAlign: "center",
    fontWeight: 600,
    color: "var(--text)",
    position: "sticky",
    left: 0,
    zIndex: 2,
  };
  const head: CSSProperties = {
    background: AF_GREEN,
    fontSize: 10.5,
    fontWeight: 700,
    color: "var(--text)",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    padding: "3px 5px",
    textAlign: "center",
    lineHeight: 1.18,
    verticalAlign: "middle",
    position: "sticky",
    boxSizing: "border-box",
  };

  const cellNode = (cell: AnnualCell, key: string, strong?: boolean, bg?: string) => {
    const { text, color } = render(cell, kind);
    return (
      <td
        key={key}
        className="tabular"
        style={{ ...td, color, ...(strong ? { fontWeight: 700 } : null), ...(bg ? { background: bg } : null) }}
      >
        {text}
      </td>
    );
  };

  return (
    <table
      style={{
        borderCollapse: "collapse",
        tableLayout: "fixed",
        width: "100%",
        minWidth,
        borderTop: "1px solid var(--border)",
        borderLeft: "1px solid var(--border)",
      }}
    >
      <colgroup>
        <col style={{ width: monthW }} />
        {facilities.map((f) => (
          <col key={f.id} style={{ width: facW }} />
        ))}
        <col style={{ width: totW }} />
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={2} style={{ ...head, left: 0, top: 0, zIndex: 6, textAlign: "center" }}>
            月 \ 施設
          </th>
          {groups.map((g, gi) => (
            <th key={gi} colSpan={g.span} style={{ ...head, top: 0, zIndex: 4, background: areaTint(g.area) }}>
              {g.area}エリア
            </th>
          ))}
          <th rowSpan={2} style={{ ...head, top: 0, zIndex: 5, background: AF_GREEN_D }}>
            合計
          </th>
        </tr>
        <tr>
          {facilities.map((f) => (
            <th
              key={f.id}
              title={f.name}
              style={{
                ...head,
                top: 27,
                zIndex: 3,
                fontWeight: 600,
                fontSize: 9.5,
                padding: "3px 3px",
                height: 40,
                whiteSpace: "normal",
                wordBreak: "break-word",
                lineHeight: 1.12,
              }}
            >
              {f.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, mi) => {
          const zebra = mi % 2 ? AF_ZEBRA : "#fff";
          return (
            <tr key={mi} style={{ background: zebra }}>
              <td style={{ ...monthCell, background: zebra }}>{row.month}月</td>
              {facilities.map((f) => cellNode(row.cells[f.id] ?? { actual: 0, budget: null }, f.id))}
              {cellNode(row.total, "tot", true, AF_GREEN)}
            </tr>
          );
        })}
        <tr style={{ background: AF_GREEN }}>
          <td style={{ ...monthCell, background: AF_GREEN, fontWeight: 700, borderTop: "2px solid var(--border-strong)" }}>
            合計
          </td>
          {facilities.map((f) => {
            const { text, color } = render(facilityTotals[f.id] ?? { actual: 0, budget: null }, kind);
            return (
              <td
                key={f.id}
                className="tabular"
                style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--border-strong)", color }}
              >
                {text}
              </td>
            );
          })}
          {(() => {
            const { text, color } = render(grand, kind);
            return (
              <td
                className="tabular"
                style={{ ...td, fontWeight: 800, borderTop: "2px solid var(--border-strong)", background: AF_GREEN_D, color }}
              >
                {text}
              </td>
            );
          })()}
        </tr>
      </tbody>
    </table>
  );
}
