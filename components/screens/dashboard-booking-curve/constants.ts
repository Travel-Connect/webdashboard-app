/* ============================================================
   constants.ts — booking-curve screen-local constants.
   Lead-time bucket order + field mapping, taken from the live
   BookingCurveRow / CurveTotals shape (lib/api/types.ts).
   ============================================================ */

import type { CurveTotals } from "@/lib/api/types";

/* Lead-time buckets, Excel column order (当日 → 過去). */
export const BUCKET_FIELDS: (keyof CurveTotals)[] = [
  "sameDay",
  "oneDayBefore",
  "twoDaysBefore",
  "threeToSixDaysBefore",
  "sevenToThirteenDaysBefore",
  "fourteenToTwentyDaysBefore",
  "twentyOneToThirtyDaysBefore",
  "thirtyOneToSixtyDaysBefore",
  "sixtyOneToNinetyDaysBefore",
  "ninetyOneToOneTwentyDaysBefore",
  "oneTwentyOneToOneFiftyDaysBefore",
  "oneFiftyOnePlusDaysBefore",
];

export const BUCKET_LABELS: string[] = [
  "当日",
  "前日",
  "2日前",
  "3〜6日前",
  "7〜13日前",
  "14〜20日前",
  "21〜30日前",
  "31〜60日前",
  "61〜90日前",
  "91〜120日前",
  "121〜150日前",
  "151日以上前",
];

/* Curve line colors (primary blue / orange, matching prototype idiom). */
export const COLOR_CUR = "#2563EB"; // キャンセルを除く（実需）
export const COLOR_CANCEL = "#ED7D31"; // キャンセルを含む

/** Pull the 12 bucket values out of a CurveTotals in display order. */
export function bucketValues(t: CurveTotals): number[] {
  return BUCKET_FIELDS.map((k) => Number(t[k]) || 0);
}
