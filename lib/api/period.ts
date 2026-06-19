import type { Period } from "./types";

/** 期間の stay_month 範囲（月初日）。monthly=単月、yearly=その年の1〜12月。 */
export function monthBounds(period: Period, year: number, month?: number): [string, string] {
  if (period === "monthly") {
    const m = String(month).padStart(2, "0");
    return [`${year}-${m}-01`, `${year}-${m}-01`];
  }
  return [`${year}-01-01`, `${year}-12-01`];
}

export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
