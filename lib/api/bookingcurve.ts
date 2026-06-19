import type { Pool } from "pg";
import type { BookingCurveResponse, BookingCurveRow, BookingCurveSummary, CurveTotals, DashboardFilters } from "./types";
import { monthBounds } from "./period";

const FIELDS: (keyof CurveTotals)[] = [
  "sameDay", "oneDayBefore", "twoDaysBefore", "threeToSixDaysBefore", "sevenToThirteenDaysBefore",
  "fourteenToTwentyDaysBefore", "twentyOneToThirtyDaysBefore", "thirtyOneToSixtyDaysBefore",
  "sixtyOneToNinetyDaysBefore", "ninetyOneToOneTwentyDaysBefore", "oneTwentyOneToOneFiftyDaysBefore", "oneFiftyOnePlusDaysBefore",
];
const COLS: Record<keyof CurveTotals, string> = {
  sameDay: "same_day", oneDayBefore: "one_day_before", twoDaysBefore: "two_days_before", threeToSixDaysBefore: "three_to_six_days_before",
  sevenToThirteenDaysBefore: "seven_to_thirteen_days_before", fourteenToTwentyDaysBefore: "fourteen_to_twenty_days_before",
  twentyOneToThirtyDaysBefore: "twenty_one_to_thirty_days_before", thirtyOneToSixtyDaysBefore: "thirty_one_to_sixty_days_before",
  sixtyOneToNinetyDaysBefore: "sixty_one_to_ninety_days_before", ninetyOneToOneTwentyDaysBefore: "ninety_one_to_one_twenty_days_before",
  oneTwentyOneToOneFiftyDaysBefore: "one_twenty_one_to_one_fifty_days_before", oneFiftyOnePlusDaysBefore: "one_fifty_one_plus_days_before",
};
const zeroTotals = (): CurveTotals => Object.fromEntries(FIELDS.map((k) => [k, 0])) as CurveTotals;

// GET /api/dashboard/booking-curve — ブッキングカーブ（リードタイム累積・室数。taxMode 非依存）
export async function buildBookingCurve(pool: Pool, f: DashboardFilters): Promise<BookingCurveResponse> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const [a, b] = monthBounds(f.period, f.year, f.month);
  const sumCols = FIELDS.map((k) => `coalesce(sum(${COLS[k]}),0)::float8 "${k}"`).join(", ");
  const q = await pool.query(
    `select to_char(stay_month,'YYYY-MM-DD') as "month", cancel_scope, ${sumCols}
     from mart.booking_curve_monthly
     where ($1::uuid is null or facility_id = $1) and stay_month between $2 and $3
     group by stay_month, cancel_scope`,
    [facId, a, b],
  );
  const rows: BookingCurveRow[] = q.rows
    .map((r) => ({
      month: r.month as string,
      cancelScope: r.cancel_scope as BookingCurveRow["cancelScope"],
      ...(Object.fromEntries(FIELDS.map((k) => [k, Number(r[k])])) as CurveTotals),
    }))
    .sort((x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : x.cancelScope.localeCompare(y.cancelScope)));

  const withCancelled = zeroTotals(), withoutCancelled = zeroTotals();
  const months = new Set<string>();
  for (const row of rows) {
    months.add(row.month);
    const tgt = row.cancelScope === "with_cancelled" ? withCancelled : withoutCancelled;
    for (const k of FIELDS) tgt[k] = (tgt[k] as number) + (row[k] as number);
  }
  const summary: BookingCurveSummary = { months: months.size, withCancelled, withoutCancelled };
  return { filters: f, summary, rows, generatedAt: new Date().toISOString() };
}
