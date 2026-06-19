import type { Pool } from "pg";
import type { DashboardFilters, NightsBucket, StayNightsResponse, StayNightsRow, StayNightsSummary } from "./types";
import { monthBounds, ratio } from "./period";

const BUCKET_ORDER: Record<NightsBucket, number> = { "1": 0, "2": 1, "3_4": 2, "5_6": 3, "7_plus": 4 };

// GET /api/dashboard/stay-nights — 泊数分布
export async function buildStayNights(pool: Pool, f: DashboardFilters): Promise<StayNightsResponse> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const [a, b] = monthBounds(f.period, f.year, f.month);
  const q = await pool.query(
    `select to_char(checkin_month,'YYYY-MM-DD') as "month", nights_bucket,
       coalesce(sum(reservation_count),0)::int resv,
       coalesce(sum(sold_room_nights),0)::float8 rooms,
       coalesce(sum(guest_count),0)::int guests,
       coalesce(sum(${revCol}),0)::float8 revenue
     from mart.stay_nights_distribution
     where ($1::uuid is null or facility_id = $1) and checkin_month between $2 and $3
     group by checkin_month, nights_bucket`,
    [facId, a, b],
  );
  const rows: StayNightsRow[] = q.rows
    .map((r) => {
      const resv = Number(r.resv), rooms = Number(r.rooms), guests = Number(r.guests), revenue = Number(r.revenue);
      return {
        month: r.month as string,
        nightsBucket: r.nights_bucket as NightsBucket,
        reservationCount: resv,
        soldRoomNights: rooms,
        guestCount: guests,
        revenue,
        adr: ratio(revenue, rooms),
        guestFactor: ratio(guests, resv), // 1予約あたり平均人数
      };
    })
    .sort((x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : BUCKET_ORDER[x.nightsBucket] - BUCKET_ORDER[y.nightsBucket]));

  const summary: StayNightsSummary = {
    totalReservations: rows.reduce((s, r) => s + r.reservationCount, 0),
    totalSoldRoomNights: rows.reduce((s, r) => s + r.soldRoomNights, 0),
    totalGuestCount: rows.reduce((s, r) => s + r.guestCount, 0),
    totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
  };
  return { filters: f, summary, rows, generatedAt: new Date().toISOString() };
}
