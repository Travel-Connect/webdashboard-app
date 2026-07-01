"use client";

/* ============================================================
   calendar-heatmap.tsx — 日別ヒートマップ（カレンダービュー）。
   screens-top.jsx CalendarHeatmapCard 準拠。当月内の相対ヒートマップ。
   売上高 / 販売室数 を内部トグルで切替。月合計を併記。
   period=yearly のときは 12ヶ月グリッドにフォールバック。
   ============================================================ */

import { Fragment, useState } from "react";
import { Segmented } from "@/components/ui/primitives";
import { WidgetCard, ModuleEmpty, FooterLink } from "./top-shared";
import { integer, yen } from "@/lib/dashboard/format";
import type { OverviewHeat, OverviewHeatCell, Period } from "@/lib/api/types";

const CAL_WD = ["日", "月", "火", "水", "木", "金", "土"];
const CAL_JP_WD = ["日", "月", "火", "水", "木", "金", "土"];

/* 低→高 5段階（業務トーンにやや抑えた配色）。dark=白文字＋影で可読性確保。 */
const CAL_HEAT = [
  { bg: "#0E8C78", fg: "#ffffff", dark: true },
  { bg: "#8FC79A", fg: "#143A28", dark: false },
  { bg: "#F0DB8A", fg: "#5D4C10", dark: false },
  { bg: "#ECA85C", fg: "#5A3210", dark: false },
  { bg: "#D9564B", fg: "#ffffff", dark: true },
] as const;

function calHeatBand(v: number | null, min: number, max: number): number {
  if (v == null) return -1;
  if (max <= min) return 2;
  const t = (v - min) / (max - min);
  return Math.max(0, Math.min(4, Math.floor(t * 5)));
}

function calIsoWeek(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ft = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - ft + 3);
  return 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 864e5));
}

export interface CalendarHeatmapProps {
  heat: OverviewHeat;
  period: Period;
  year: number;
  month?: number;
  taxLabel: string;
  /** 施設別モードで「合算」ウィジェットであることを示す補足。 */
  subnote?: string;
}

type Metric = "rev" | "rooms";

export function CalendarHeatmap({ heat, period, year, month, taxLabel, subnote }: CalendarHeatmapProps) {
  const [metric, setMetric] = useState<Metric>("rev");
  const isRev = metric === "rev";
  const metricLabel = isRev ? "売上高" : "販売室数";
  const valOf = (c: OverviewHeatCell) => (isRev ? c.revenue : c.soldRoomNights);
  const fmtFull = (v: number | null) => (v == null ? "—" : isRev ? yen(v) : integer(v) + "室");

  const toggle = (
    <Segmented<Metric>
      size="sm"
      value={metric}
      onChange={setMetric}
      options={[
        { value: "rev", label: "売上高" },
        { value: "rooms", label: "販売室数" },
      ]}
    />
  );

  const subParts = [
    metricLabel + " 日別実績" + (isRev ? `（${taxLabel}）` : ""),
    "当月内の相対ヒートマップ",
  ];
  if (subnote) subParts.unshift(subnote);
  const sub = subParts.join(" ・ ");

  const footer = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>低</span>
        <span style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)" }}>
          {CAL_HEAT.map((h, i) => (
            <span key={i} style={{ width: 20, height: 12, background: h.bg }} />
          ))}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>高</span>
      </span>
      <FooterLink label="日別推移を見る" route="/dashboard/occupancy" />
    </div>
  );

  /* ---------- データ整形 ---------- */
  const monthly = period === "monthly" && month != null && heat.grain === "day";

  if (monthly) {
    // 当月の日別マップ
    const byDate = new Map<string, OverviewHeatCell>();
    heat.current.forEach((c) => byDate.set(c.date, c));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

    const days: { day: number; value: number | null }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cell = byDate.get(key);
      days.push({ day: d, value: cell ? valOf(cell) : null });
    }
    const values = days.map((d) => d.value).filter((v): v is number => v != null);
    const hasData = values.length > 0 && values.some((v) => v !== 0);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    const total = values.reduce((a, v) => a + v, 0);

    // 週ごとに分割
    const cells: ({ day: number; value: number | null } | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    days.forEach((d) => cells.push(d));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: ({ day: number; value: number | null } | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return (
      <WidgetCard title="カレンダービュー" sub={sub} actions={toggle} footer={footer}>
        {!hasData ? (
          <ModuleEmpty icon="CalendarOff" msg="選択施設・期間の日別データがありません" />
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span className="tabular" style={{ fontSize: 14.5, fontWeight: 700 }}>
                {year}年{month}月
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                月合計{" "}
                <strong className="tabular" style={{ color: "var(--text-2)", fontWeight: 700 }}>
                  {fmtFull(total)}
                </strong>
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "26px repeat(7, minmax(0, 1fr))", alignItems: "stretch" }}>
              <div />
              {CAL_WD.map((wd) => (
                <div key={wd} style={{ padding: "0 6px 7px", fontSize: 11, fontWeight: 600, color: "var(--text-3)" }}>
                  {wd}
                </div>
              ))}
              {weeks.map((wk, wi) => {
                const firstDay = wk.find((c) => c != null) || days[0];
                const wkNum = calIsoWeek(year, month, firstDay ? firstDay.day : 1);
                return (
                  <Fragment key={wi}>
                    <div className="tabular" style={{ display: "grid", placeItems: "center", fontSize: 10, color: "var(--text-3)" }}>
                      {wkNum}
                    </div>
                    {wk.map((c, di) => {
                      if (c == null) return <div key={di} />;
                      const band = calHeatBand(c.value, min, max);
                      const h = band < 0 ? { bg: "var(--surface-2)", fg: "var(--text-3)", dark: false } : CAL_HEAT[band];
                      const dow = (firstDow + (c.day - 1)) % 7;
                      const valTxt =
                        c.value == null ? "—" : isRev ? integer(Math.round(c.value / 10000)) : integer(c.value);
                      const tip = `${month}月${c.day}日(${CAL_JP_WD[dow]}) ・ ${metricLabel} ${fmtFull(c.value)}`;
                      return (
                        <div
                          key={di}
                          title={tip}
                          style={{
                            position: "relative",
                            minHeight: 60,
                            padding: "4px 6px 5px",
                            display: "flex",
                            flexDirection: "column",
                            border: "1px solid rgba(15,23,42,.12)",
                            background: h.bg,
                            color: h.fg,
                            overflow: "hidden",
                          }}
                        >
                          <span
                            className="tabular"
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              textAlign: "right",
                              color: h.dark ? "rgba(255,255,255,.85)" : "rgba(15,23,42,.5)",
                              lineHeight: 1,
                            }}
                          >
                            {c.day}
                          </span>
                          <span style={{ flex: 1, display: "grid", placeItems: "center" }}>
                            <span
                              className="tabular"
                              style={{
                                display: "inline-flex",
                                alignItems: "baseline",
                                gap: 1,
                                fontWeight: 800,
                                fontSize: 18,
                                letterSpacing: "-.01em",
                                textShadow: h.dark ? "0 1px 2px rgba(0,0,0,.3)" : "none",
                              }}
                            >
                              {valTxt}
                              {isRev && c.value != null && <span style={{ fontSize: 10, fontWeight: 700 }}>万</span>}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
      </WidgetCard>
    );
  }

  /* ---------- 年間: 12ヶ月グリッド ---------- */
  const months: { m: number; value: number | null }[] = [];
  const byMonth = new Map<number, OverviewHeatCell>();
  heat.current.forEach((c) => {
    const mm = Number(c.date.slice(5, 7));
    if (mm >= 1 && mm <= 12) byMonth.set(mm, c);
  });
  for (let m = 1; m <= 12; m++) {
    const cell = byMonth.get(m);
    months.push({ m, value: cell ? valOf(cell) : null });
  }
  const mvals = months.map((x) => x.value).filter((v): v is number => v != null);
  const hasData = mvals.length > 0 && mvals.some((v) => v !== 0);
  const min = mvals.length ? Math.min(...mvals) : 0;
  const max = mvals.length ? Math.max(...mvals) : 0;
  const total = mvals.reduce((a, v) => a + v, 0);

  const yearSub = [metricLabel + " 月別実績" + (isRev ? `（${taxLabel}）` : ""), "通年の相対ヒートマップ"];
  if (subnote) yearSub.unshift(subnote);

  return (
    <WidgetCard title="カレンダービュー" sub={yearSub.join(" ・ ")} actions={toggle} footer={footer}>
      {!hasData ? (
        <ModuleEmpty icon="CalendarOff" msg="選択施設・期間の月別データがありません" />
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span className="tabular" style={{ fontSize: 14.5, fontWeight: 700 }}>
              {year}年（通年）
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              年合計{" "}
              <strong className="tabular" style={{ color: "var(--text-2)", fontWeight: 700 }}>
                {fmtFull(total)}
              </strong>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
            {months.map((x) => {
              const band = calHeatBand(x.value, min, max);
              const h = band < 0 ? { bg: "var(--surface-2)", fg: "var(--text-3)", dark: false } : CAL_HEAT[band];
              const valTxt = x.value == null ? "—" : isRev ? integer(Math.round(x.value / 10000)) : integer(x.value);
              return (
                <div
                  key={x.m}
                  title={`${x.m}月 ・ ${metricLabel} ${fmtFull(x.value)}`}
                  style={{
                    minHeight: 58,
                    padding: "7px 9px",
                    borderRadius: "var(--r-md)",
                    border: "1px solid rgba(15,23,42,.12)",
                    background: h.bg,
                    color: h.fg,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <span
                    className="tabular"
                    style={{ fontSize: 11, fontWeight: 600, color: h.dark ? "rgba(255,255,255,.85)" : "rgba(15,23,42,.5)" }}
                  >
                    {x.m}月
                  </span>
                  <span style={{ flex: 1, display: "grid", placeItems: "center" }}>
                    <span
                      className="tabular"
                      style={{
                        fontWeight: 800,
                        fontSize: 18,
                        textShadow: h.dark ? "0 1px 2px rgba(0,0,0,.3)" : "none",
                      }}
                    >
                      {valTxt}
                      {isRev && x.value != null && <span style={{ fontSize: 10, fontWeight: 700 }}>万</span>}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
