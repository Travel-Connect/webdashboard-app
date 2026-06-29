import type { Pool } from "pg";
import type { BcCell, BookingCurveMatrix, BookingCurveResponse, BookingCurveRow, BookingCurveSummary, BookingCurveYear, CurveTotals, DashboardFilters } from "./types";
import { monthBounds } from "./period";
import { activeGroupId, facilityScopeSql } from "./group";

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

const LEAD_BUCKETS: { key: string; label: string }[] = [
  { key: "sameDay", label: "当日" },
  { key: "oneDayBefore", label: "前日" },
  { key: "twoDaysBefore", label: "2日前" },
  { key: "threeToSixDaysBefore", label: "3〜6日前" },
  { key: "sevenToThirteenDaysBefore", label: "7〜13日前" },
  { key: "fourteenToTwentyDaysBefore", label: "14〜20日前" },
  { key: "twentyOneToThirtyDaysBefore", label: "21〜30日前" },
  { key: "thirtyOneToSixtyDaysBefore", label: "31〜60日前" },
  { key: "sixtyOneToNinetyDaysBefore", label: "61〜90日前" },
  { key: "ninetyOneToOneTwentyDaysBefore", label: "91〜120日前" },
  { key: "oneTwentyOneToOneFiftyDaysBefore", label: "121〜150日前" },
  { key: "oneFiftyOnePlusDaysBefore", label: "151日以上前" },
];

/** 当年/前年 × キャンセル区分 × リードタイム別 累積（販売室数+売上 と 稼働率分母）。 */
async function bookingCurveMatrix(
  pool: Pool,
  f: DashboardFilters,
  facId: string | null,
  gid: string,
  facName: string,
): Promise<BookingCurveMatrix> {
  const scope = facilityScopeSql(gid);
  const buildYear = async (year: number): Promise<BookingCurveYear> => {
    const [a, b] = monthBounds(f.period, year, f.month);
    const q = await pool.query<{ cancel_scope: string; lead_bucket: string; rooms: number; gross: number; net: number }>(
      `select cancel_scope, lead_bucket,
         coalesce(sum(sold_room_nights),0)::float8 rooms,
         coalesce(sum(gross_amount),0)::float8 gross,
         coalesce(sum(net_amount),0)::float8 net
       from mart.booking_curve_lead_metrics
       where stay_month between $1 and $2 and ${scope} and ($3::uuid is null or facility_id = $3)
       group by cancel_scope, lead_bucket`,
      [a, b, facId],
    );
    const cells = (cs: string): BcCell[] =>
      LEAD_BUCKETS.map((bk) => {
        const r = q.rows.find((x) => x.cancel_scope === cs && x.lead_bucket === bk.key);
        return { rooms: Number(r?.rooms ?? 0), gross: Number(r?.gross ?? 0), net: Number(r?.net ?? 0) };
      });
    const inv = await pool.query<{ srn: number }>(
      `select coalesce(sum(sellable_room_nights),0)::float8 srn from app.room_inventory_months
       where month between $1 and $2 and ${scope} and ($3::uuid is null or facility_id = $3)`,
      [a, b, facId],
    );
    return {
      year,
      withoutCancelled: cells("without_cancelled"),
      withCancelled: cells("with_cancelled"),
      sellable: Number(inv.rows[0]?.srn ?? 0),
    };
  };
  return {
    facName,
    buckets: LEAD_BUCKETS,
    current: await buildYear(f.year),
    previous: await buildYear(f.year - 1),
  };
}

// GET /api/dashboard/booking-curve — ブッキングカーブ（リードタイム累積・室数。taxMode 非依存）
export async function buildBookingCurve(pool: Pool, f: DashboardFilters): Promise<BookingCurveResponse> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const [a, b] = monthBounds(f.period, f.year, f.month);
  const gid = await activeGroupId(pool);
  const sumCols = FIELDS.map((k) => `coalesce(sum(${COLS[k]}),0)::float8 "${k}"`).join(", ");
  const q = await pool.query(
    `select to_char(stay_month,'YYYY-MM-DD') as "month", cancel_scope, ${sumCols}
     from mart.booking_curve_monthly
     where ($1::uuid is null or facility_id = $1) and stay_month between $2 and $3
       and ${facilityScopeSql(gid)}
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

  let facName = "全施設";
  if (facId) {
    const fr = await pool.query<{ display_name: string }>(
      "select display_name from app.facilities where id = $1",
      [facId],
    );
    facName = fr.rows[0]?.display_name ?? "施設";
  }
  const matrix = await bookingCurveMatrix(pool, f, facId, gid, facName);
  return { filters: f, summary, rows, matrix, generatedAt: new Date().toISOString() };
}
