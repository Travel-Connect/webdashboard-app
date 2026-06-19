import type { Pool } from "pg";
import type { DashboardFilters, NationalitiesResponse, NationalityRow, NationalitySummary } from "./types";
import { monthBounds, ratio } from "./period";

// GET /api/dashboard/nationalities — 国籍別分析
export async function buildNationalities(pool: Pool, f: DashboardFilters): Promise<NationalitiesResponse> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const [a, b] = monthBounds(f.period, f.year, f.month);
  const q = await pool.query(
    `select country_major, country_middle, country_normalized,
       coalesce(sum(sold_room_nights),0)::float8 rooms,
       coalesce(sum(guest_count),0)::int guests,
       coalesce(sum(${revCol}),0)::float8 revenue,
       coalesce(sum(reservation_count),0)::int resv,
       coalesce(sum(multi_night_reservation_count),0)::int multi,
       coalesce(sum(lead_time_total),0)::bigint lt_total,
       coalesce(sum(lead_time_count),0)::int lt_count
     from mart.monthly_country_metrics
     where ($1::uuid is null or facility_id = $1) and stay_month between $2 and $3
     group by country_major, country_middle, country_normalized`,
    [facId, a, b],
  );
  const rows: NationalityRow[] = q.rows
    .map((r) => {
      const rooms = Number(r.rooms), revenue = Number(r.revenue), guests = Number(r.guests), resv = Number(r.resv);
      const ltCount = Number(r.lt_count);
      return {
        countryMajor: r.country_major as string,
        countryMiddle: r.country_middle as string,
        country: r.country_normalized as string,
        revenue,
        soldRoomNights: rooms,
        guestCount: guests,
        adr: ratio(revenue, rooms),
        reservationCount: resv,
        avgGuestsPerRoom: ratio(guests, rooms),
        multiNightRate: ratio(Number(r.multi), resv),
        avgLeadTime: ratio(Number(r.lt_total), ltCount),
      };
    })
    .sort((x, y) => y.revenue - x.revenue);

  const tot = (k: keyof NationalityRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const ltTotal = q.rows.reduce((s, r) => s + Number(r.lt_total), 0);
  const ltCount = q.rows.reduce((s, r) => s + Number(r.lt_count), 0);
  const summary: NationalitySummary = {
    totalRevenue: tot("revenue"),
    totalSoldRoomNights: tot("soldRoomNights"),
    totalGuestCount: tot("guestCount"),
    totalReservationCount: tot("reservationCount"),
    avgLeadTime: ratio(ltTotal, ltCount),
    countryCount: rows.length,
  };
  return { filters: f, summary, rows, generatedAt: new Date().toISOString() };
}
