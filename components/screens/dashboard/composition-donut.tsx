"use client";

/* ============================================================
   composition-donut.tsx — 汎用 構成比ドーナツ。
   国内・海外比 / 経路別シェア / 泊数分布 で再利用。
   DonutChart（components/charts）でリングと凡例を描画。
   売上↔販売室数の内部トグル（toggle=false で固定）。
   ============================================================ */

import { useState } from "react";
import { Segmented } from "@/components/ui/primitives";
import type { IconName } from "@/components/ui/icon";
import { DonutChart } from "@/components/charts";
import { WidgetCard, ModuleEmpty, FooterLink, TOP_PAL } from "./top-shared";
import { integer, yenCompact } from "@/lib/dashboard/format";

type Metric = "rev" | "rooms";

export interface CompositionSlice {
  label: string;
  revenue: number;
  soldRoomNights: number;
  share: number | null;
}

export interface CompositionDonutProps {
  title: string;
  /** 追加サブ文（例: 税表示の有無）。 */
  sub?: string;
  slices: CompositionSlice[];
  /** 指標トグルを表示するか（泊数分布など室数固定では false）。 */
  toggle?: boolean;
  defaultMetric?: Metric;
  /** スライス色（index 対応）。未指定は標準パレット。 */
  colors?: string[];
  taxLabel?: string;
  footerLink?: { label: string; route: string };
  subnote?: string;
  /** 空表示時のアイコン。 */
  emptyIcon?: IconName;
}

const DEFAULT_PALETTE = [TOP_PAL.blue, TOP_PAL.teal, TOP_PAL.amber, TOP_PAL.rose, TOP_PAL.violet, TOP_PAL.gray];

export function CompositionDonut({
  title,
  sub,
  slices,
  toggle = true,
  defaultMetric = "rev",
  colors,
  taxLabel,
  footerLink,
  subnote,
  emptyIcon = "ChartPie",
}: CompositionDonutProps) {
  const [metric, setMetric] = useState<Metric>(defaultMetric);
  const m = toggle ? metric : defaultMetric;
  const isRev = m === "rev";
  const pal = colors ?? DEFAULT_PALETTE;

  const data = slices
    .map((s, i) => ({
      label: s.label,
      value: isRev ? s.revenue : s.soldRoomNights,
      color: pal[i % pal.length],
    }))
    .filter((d) => d.value > 0);
  const total = data.reduce((a, d) => a + d.value, 0);
  const fmtV = (v: number) => (isRev ? yenCompact(v) : integer(v) + "室");

  const toggleEl = toggle ? (
    <Segmented<Metric>
      size="sm"
      value={metric}
      onChange={setMetric}
      options={[
        { value: "rev", label: "売上" },
        { value: "rooms", label: "販売室数" },
      ]}
    />
  ) : undefined;

  const subParts: string[] = [];
  if (subnote) subParts.push(subnote);
  subParts.push(isRev ? "売上" : "販売室数");
  if (isRev && taxLabel) subParts.push(taxLabel);
  if (sub) subParts.push(sub);

  const footer = footerLink ? (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <FooterLink label={footerLink.label} route={footerLink.route} />
    </div>
  ) : undefined;

  return (
    <WidgetCard title={title} sub={subParts.join(" ・ ")} actions={toggleEl} footer={footer}>
      {total <= 0 ? (
        <ModuleEmpty icon={emptyIcon} msg="該当期間のデータがありません" />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <DonutChart
            data={data}
            size={176}
            thickness={28}
            centerLabel={fmtV(total)}
            centerSub="合計"
            valueFmt={fmtV}
          />
        </div>
      )}
    </WidgetCard>
  );
}
