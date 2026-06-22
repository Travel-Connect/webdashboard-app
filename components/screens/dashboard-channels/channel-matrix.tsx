"use client";

/* ============================================================
   channel-matrix.tsx — 経路×施設 / 経路×月 のクロスタブ表。
   docs/.../screens-stub.jsx (ChannelsMonthly / ChannelsAnnual) を移植。
   売上セクション + 構成比（列内シェア・青ヒートシェード）セクションの2段。
   スティッキー多段ヘッダー（エリア/期間 colSpan）+ 合計列 + 合計行。
   ============================================================ */

import { type CSSProperties } from "react";
import type { ChannelMatrix } from "@/lib/api/types";
import { integer } from "@/lib/dashboard/format";

const CH_BLUE = "37,111,219"; // --c-blue (#2563EB) as rgb triple for alpha shading

export interface ChannelMatrixTableProps {
  matrix: ChannelMatrix;
  taxLabel: string; // 税込 / 税抜
  hideZero: boolean;
  /** facility id to highlight (monthly view only). */
  selectedColKey?: string | null;
}

export function ChannelMatrixTable({
  matrix,
  taxLabel,
  hideZero,
  selectedColKey,
}: ChannelMatrixTableProps) {
  const { columns, rows: allRows, columnKind, groupLabel } = matrix;
  const nCol = columns.length;
  const rows = hideZero ? allRows.filter((r) => r.total > 0) : allRows;

  // 列合計（全経路ベース。ゼロ経路を隠しても列合計は不変）
  const colTot = columns.map((c) => allRows.reduce((s, r) => s + (r.cells[c.key] ?? 0), 0));
  const grand = colTot.reduce((a, b) => a + b, 0);

  // 上段ヘッダー（施設=エリアごと colSpan / 月=期間ラベルで全列 colSpan）
  const groups: { label: string; span: number }[] = [];
  if (columnKind === "facility") {
    columns.forEach((c) => {
      const g = c.group ?? "—";
      const last = groups[groups.length - 1];
      if (last && last.label === g) last.span++;
      else groups.push({ label: g, span: 1 });
    });
  } else {
    groups.push({ label: groupLabel ?? "", span: nCol });
  }

  const firstW = 184;
  const colW = columnKind === "facility" ? 84 : 80;
  const totW = 116;
  const minWidth = firstW + nCol * colW + totW;
  const selIdx = selectedColKey ? columns.findIndex((c) => c.key === selectedColKey) : -1;

  const wrap: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-lg)",
    background: "var(--surface)",
    boxShadow: "var(--shadow-card)",
  };
  const cName: CSSProperties = {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--surface)",
    textAlign: "left",
    padding: "0 10px",
    fontSize: 11.5,
    height: 24,
    whiteSpace: "nowrap",
    borderRight: "1px solid var(--border-strong)",
    borderBottom: "1px solid var(--border)",
  };
  const cNum: CSSProperties = {
    padding: "0 6px",
    fontSize: 11,
    height: 24,
    textAlign: "right",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border)",
  };
  const hArea: CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 5,
    height: 28,
    boxSizing: "border-box",
    background: "var(--surface-2)",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-2)",
    padding: "0 8px",
    textAlign: "center",
    borderBottom: "1px solid var(--border)",
    borderLeft: "1px solid var(--border)",
    whiteSpace: "nowrap",
  };
  const hCol: CSSProperties = {
    position: "sticky",
    top: 27,
    zIndex: 4,
    height: 40,
    boxSizing: "border-box",
    background: "var(--surface-2)",
    fontSize: 10,
    fontWeight: 600,
    color: "var(--text-2)",
    padding: "3px 5px",
    textAlign: "right",
    borderBottom: "1px solid var(--border-strong)",
    whiteSpace: "normal",
    lineHeight: 1.12,
    wordBreak: "break-word",
    verticalAlign: "bottom",
  };
  const selBg = `rgba(${CH_BLUE},0.06)`;

  const sectionRow = (label: string, key: string) => (
    <tr key={key}>
      <td
        colSpan={nCol + 2}
        style={{
          position: "sticky",
          left: 0,
          background: `rgba(${CH_BLUE},0.1)`,
          color: "var(--primary-ink)",
          fontSize: 11.5,
          fontWeight: 700,
          padding: "6px 10px",
          letterSpacing: ".02em",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border-strong)",
        }}
      >
        {label}
      </td>
    </tr>
  );

  return (
    <div style={wrap}>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", minWidth }}>
        <colgroup>
          <col style={{ width: firstW }} />
          {columns.map((c) => (
            <col key={c.key} style={{ width: colW }} />
          ))}
          <col style={{ width: totW }} />
        </colgroup>
        <thead>
          <tr>
            <th
              rowSpan={2}
              style={{
                ...hArea,
                position: "sticky",
                left: 0,
                top: 0,
                zIndex: 7,
                height: "auto",
                textAlign: "left",
                borderRight: "1px solid var(--border-strong)",
              }}
            >
              {columnKind === "facility" ? "経路 \\ 施設" : "経路 \\ 月"}
            </th>
            {groups.map((g, gi) => (
              <th key={gi} colSpan={g.span} style={hArea}>
                {g.label}
              </th>
            ))}
            <th
              rowSpan={2}
              style={{ ...hArea, top: 0, zIndex: 6, borderLeft: "1px solid var(--border-strong)", textAlign: "right" }}
            >
              合計
            </th>
          </tr>
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.key}
                title={c.label}
                style={{
                  ...hCol,
                  background: i === selIdx ? `rgba(${CH_BLUE},0.12)` : "var(--surface-2)",
                  color: i === selIdx ? "var(--primary-ink)" : "var(--text-2)",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 売上 */}
          {sectionRow(`売上（${taxLabel}）`, "rev-head")}
          {rows.map((r, ri) => (
            <tr
              key={"r" + ri}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <td style={cName}>{r.channel}</td>
              {columns.map((c, ci) => {
                const v = r.cells[c.key] ?? 0;
                return (
                  <td
                    key={c.key}
                    className="tabular"
                    style={{
                      ...cNum,
                      color: v === 0 ? "var(--text-3)" : "var(--text)",
                      background: ci === selIdx ? selBg : undefined,
                    }}
                  >
                    {integer(v)}
                  </td>
                );
              })}
              <td
                className="tabular"
                style={{
                  ...cNum,
                  fontWeight: 700,
                  background: "var(--surface-2)",
                  borderLeft: "1px solid var(--border-strong)",
                  color: r.total === 0 ? "var(--text-3)" : "var(--text)",
                }}
              >
                {integer(r.total)}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cName, fontWeight: 700, background: "var(--surface-2)", borderTop: "2px solid var(--border-strong)" }}>
              合計
            </td>
            {colTot.map((v, ci) => (
              <td
                key={ci}
                className="tabular"
                style={{
                  ...cNum,
                  fontWeight: 700,
                  background: ci === selIdx ? `rgba(${CH_BLUE},0.1)` : "var(--surface-2)",
                  borderTop: "2px solid var(--border-strong)",
                }}
              >
                {integer(v)}
              </td>
            ))}
            <td
              className="tabular"
              style={{
                ...cNum,
                fontWeight: 800,
                background: "var(--surface-2)",
                borderTop: "2px solid var(--border-strong)",
                borderLeft: "1px solid var(--border-strong)",
              }}
            >
              {integer(grand)}
            </td>
          </tr>

          {/* 構成比 */}
          {sectionRow(columnKind === "facility" ? "構成比（施設内シェア）" : "構成比（月内シェア）", "pct-head")}
          {rows.map((r, ri) => (
            <tr
              key={"p" + ri}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <td style={cName}>{r.channel}</td>
              {columns.map((c, ci) => {
                const v = r.cells[c.key] ?? 0;
                const ct = colTot[ci];
                const p = ct ? (v / ct) * 100 : 0;
                const a = (p / 100) * 0.55;
                return (
                  <td
                    key={c.key}
                    className="tabular"
                    style={{
                      ...cNum,
                      color: v === 0 ? "var(--text-3)" : "var(--text)",
                      background:
                        v === 0
                          ? ci === selIdx
                            ? selBg
                            : undefined
                          : `rgba(${CH_BLUE},${a.toFixed(3)})`,
                      borderLeft: ci === selIdx ? `1px solid rgba(${CH_BLUE},.4)` : undefined,
                    }}
                  >
                    {p >= 10 ? Math.round(p) : p.toFixed(1)}%
                  </td>
                );
              })}
              <td
                className="tabular"
                style={{
                  ...cNum,
                  fontWeight: 700,
                  background: "var(--surface-2)",
                  borderLeft: "1px solid var(--border-strong)",
                  color: r.total === 0 ? "var(--text-3)" : "var(--text)",
                }}
              >
                {grand ? ((r.total / grand) * 100).toFixed(1) : "0.0"}%
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cName, fontWeight: 700, background: "var(--surface-2)", borderTop: "2px solid var(--border-strong)" }}>
              合計
            </td>
            {colTot.map((v, ci) => (
              <td
                key={ci}
                className="tabular"
                style={{
                  ...cNum,
                  fontWeight: 700,
                  background: ci === selIdx ? `rgba(${CH_BLUE},0.1)` : "var(--surface-2)",
                  borderTop: "2px solid var(--border-strong)",
                }}
              >
                {v ? "100%" : "0%"}
              </td>
            ))}
            <td
              className="tabular"
              style={{
                ...cNum,
                fontWeight: 800,
                background: "var(--surface-2)",
                borderTop: "2px solid var(--border-strong)",
                borderLeft: "1px solid var(--border-strong)",
              }}
            >
              100%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
