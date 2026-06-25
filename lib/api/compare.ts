/* ============================================================
   compare.ts — dashboard 比較ヘルパ（再利用可能な共通部品）
   occupancy 以外のタブへ横展開できるよう、cmp / 標準メトリクスを
   ここに集約する（現状は occupancy が利用）。
   ============================================================ */

import type { MetricComparison, OccupancySummary } from "./types";

/**
 * 単一指標の比較を生成。
 * diff = current − baseline（両方非nullのみ）。
 * rate = current ÷ baseline（両方非null かつ baseline≠0 のみ）。
 */
export const cmp = (
  metric: string,
  current: number | null,
  baseline: number | null,
): MetricComparison => ({
  metric,
  current,
  baseline,
  diff: current != null && baseline != null ? current - baseline : null,
  rate: current != null && baseline != null && baseline !== 0 ? current / baseline : null,
});

/**
 * 稼働分析の標準6指標の比較配列。
 * current/baseline がともに完全な OccupancySummary である比較
 * （previous_year など）で使う。予算比較のように baseline 側に
 * 一部指標が無い場合は、呼び出し側で cmp を直接組み立てる。
 */
export function occupancyMetrics(
  current: OccupancySummary,
  baseline: OccupancySummary,
): MetricComparison[] {
  return [
    cmp("soldRoomNights", current.soldRoomNights, baseline.soldRoomNights),
    cmp("occupancyRate", current.occupancyRate, baseline.occupancyRate),
    cmp("roomRevenue", current.roomRevenue, baseline.roomRevenue),
    cmp("adr", current.adr, baseline.adr),
    cmp("revpar", current.revpar, baseline.revpar),
    cmp("guestCount", current.guestCount, baseline.guestCount),
  ];
}
