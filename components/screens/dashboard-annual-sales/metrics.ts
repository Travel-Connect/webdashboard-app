/* 全施設年間売上の指標カタログ（docs/.../screens-annual.jsx AF_METRICS 準拠）。 */
export type AfMetricId = "actual" | "budget" | "pct" | "diff";

export interface AfMetric {
  id: AfMetricId;
  label: string;
  /** カード副題（{tax}/{year} を後で埋める）。 */
  sub: (tax: string, year: number) => string;
}

export const AF_METRICS: AfMetric[] = [
  { id: "actual", label: "実績", sub: (tax, y) => `客室販売金額（${tax}）· ${y}年` },
  { id: "budget", label: "予算", sub: (tax, y) => `客室販売金額（${tax}）· ${y}年` },
  { id: "pct", label: "予算達成率", sub: () => "実績 ÷ 予算 ・ 100%未満は赤字" },
  { id: "diff", label: "予算差", sub: (tax) => `実績 − 予算（${tax}・円）・ マイナスは赤の括弧表示` },
];

export const AF_VIO = "37,111,219";
