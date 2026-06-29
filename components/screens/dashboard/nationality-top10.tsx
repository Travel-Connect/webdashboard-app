"use client";

/* ============================================================
   nationality-top10.tsx — 国籍別分析 TOP10。
   screens-top.jsx NationalityTopTenCard 準拠。
   順位 / 国籍 / 値 / 構成（相対バー）。売上↔販売室数の内部トグル。
   「不明を表示」チェックでランキング外の不明行を併記。
   ============================================================ */

import { useState } from "react";
import { Segmented } from "@/components/ui/primitives";
import { WidgetCard, ModuleEmpty, BarCell, FooterLink } from "./top-shared";
import { integer, yen } from "@/lib/dashboard/format";
import type { CountrySliceRow, OverviewNationalities } from "@/lib/api/types";

type Metric = "rev" | "rooms";

export interface NationalityTop10Props {
  nat: OverviewNationalities;
  taxLabel: string;
  subnote?: string;
}

export function NationalityTop10({ nat, taxLabel, subnote }: NationalityTop10Props) {
  const [metric, setMetric] = useState<Metric>("rev");
  const [showUnknown, setShowUnknown] = useState(false);

  const rows = nat.top10 ?? [];
  const unk = nat.unknown;
  const valOf = (r: CountrySliceRow) => (metric === "rev" ? r.revenue : r.soldRoomNights);
  const fmtV = (v: number) => (metric === "rev" ? yen(v) : integer(v) + " 室");
  const head = metric === "rev" ? "売上" : "販売室数";
  const maxV = rows.length ? Math.max(...rows.map(valOf), 1) : 1;

  const toggle = (
    <Segmented<Metric>
      size="sm"
      value={metric}
      onChange={setMetric}
      options={[
        { value: "rev", label: "売上" },
        { value: "rooms", label: "販売室数" },
      ]}
    />
  );

  const subParts = [`指標: ${head}`];
  if (metric === "rev") subParts.push(taxLabel);
  subParts.push("不明/未設定はランキング対象外");
  if (subnote) subParts.unshift(subnote);

  const footer = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 12,
          color: "var(--text-2)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={showUnknown}
          onChange={(e) => setShowUnknown(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: "var(--primary)" }}
        />
        不明を表示
      </label>
      <FooterLink label="国籍別分析を見る" route="/dashboard/nationalities" />
    </div>
  );

  return (
    <WidgetCard title="国籍別分析 TOP10" sub={subParts.join(" ・ ")} actions={toggle} footer={footer}>
      {rows.length === 0 ? (
        <ModuleEmpty icon="Globe" msg="該当期間の国籍データがありません" />
      ) : (
        <div style={{ overflowX: "auto", margin: -2 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
            <thead>
              <tr>
                {["順位", "国籍", head, "構成（相対）"].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      textAlign: i >= 2 ? "right" : "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-3)",
                      padding: "0 8px 8px",
                      whiteSpace: "nowrap",
                      width: i === 0 ? 44 : i === 3 ? 150 : "auto",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const rank = idx + 1;
                const v = valOf(r);
                return (
                  <tr key={r.country} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px" }}>
                      <span
                        className="tabular"
                        style={{
                          display: "inline-grid",
                          placeItems: "center",
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 800,
                          background: rank <= 3 ? "var(--primary-weak)" : "var(--surface-3)",
                          color: rank <= 3 ? "var(--primary-ink)" : "var(--text-2)",
                        }}
                      >
                        {rank}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        fontSize: 12.5,
                        fontWeight: 600,
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.country}
                    </td>
                    <td
                      className="tabular"
                      style={{ padding: "7px 8px", fontSize: 12.5, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}
                    >
                      {fmtV(v)}
                    </td>
                    <td style={{ padding: "7px 8px" }}>
                      <BarCell pct={(v / maxV) * 100} />
                    </td>
                  </tr>
                );
              })}
              {showUnknown && unk && (
                <tr style={{ borderTop: "1px dashed var(--border-strong)", background: "var(--surface-2)" }}>
                  <td style={{ padding: "7px 8px" }}>
                    <span
                      style={{
                        display: "inline-grid",
                        placeItems: "center",
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        fontSize: 10.5,
                        fontWeight: 700,
                        background: "var(--surface-3)",
                        color: "var(--text-3)",
                      }}
                    >
                      —
                    </span>
                  </td>
                  <td style={{ padding: "7px 8px", fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>
                    不明 / 未設定
                    <span style={{ fontSize: 10.5, color: "var(--text-3)", marginLeft: 6 }}>ランキング外</span>
                  </td>
                  <td
                    className="tabular"
                    style={{ padding: "7px 8px", fontSize: 12.5, fontWeight: 700, textAlign: "right", color: "var(--text-2)" }}
                  >
                    {fmtV(valOf(unk))}
                  </td>
                  <td style={{ padding: "7px 8px", color: "var(--text-3)", fontSize: 11, textAlign: "right" }}>—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </WidgetCard>
  );
}
