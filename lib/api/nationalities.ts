import type { Pool } from "pg";
import type {
  DashboardFilters,
  NationalitiesResponse,
  NationalityMatrix,
  NationalityRow,
  NationalitySummary,
  NatCell,
  NatMatrixRow,
} from "./types";
import { monthBounds, ratio } from "./period";

/* ============================================================
   国籍別分析 — 既存Excel「国籍別分析」忠実再現。
   matrix: 国籍 × 12ヶ月 クロスタブ（指標はフロントで base measures から算出）。
   mart.monthly_country_metrics の grain = (facility_id, stay_month, country)。
   ============================================================ */

const emptyCell = (): NatCell => ({
  rev: 0,
  rooms: 0,
  guests: 0,
  resv: 0,
  multi: 0,
  ltTotal: 0,
  ltCount: 0,
});

function addCell(t: NatCell, s: NatCell): void {
  t.rev += s.rev;
  t.rooms += s.rooms;
  t.guests += s.guests;
  t.resv += s.resv;
  t.multi += s.multi;
  t.ltTotal += s.ltTotal;
  t.ltCount += s.ltCount;
}

interface MatrixQueryRow {
  country: string;
  region: string;
  mon: number;
  rooms: number;
  guests: number;
  rev: number;
  resv: number;
  multi: number;
  lt_total: string;
  lt_count: number;
}

/** 国籍×12ヶ月 マトリクスを mart から構築（その年の全12ヶ月・facilityId 尊重）。 */
async function nationalityMatrix(
  pool: Pool,
  f: DashboardFilters,
  facName: string,
): Promise<NationalityMatrix> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const [ya, yb] = monthBounds("yearly", f.year);
  const q = await pool.query<MatrixQueryRow>(
    `select country_normalized country, country_major region,
       extract(month from stay_month)::int mon,
       coalesce(sum(sold_room_nights),0)::float8 rooms,
       coalesce(sum(guest_count),0)::int guests,
       coalesce(sum(${revCol}),0)::float8 rev,
       coalesce(sum(reservation_count),0)::int resv,
       coalesce(sum(multi_night_reservation_count),0)::int multi,
       coalesce(sum(lead_time_total),0)::bigint lt_total,
       coalesce(sum(lead_time_count),0)::int lt_count
     from mart.monthly_country_metrics
     where ($1::uuid is null or facility_id = $1) and stay_month between $2 and $3
     group by country_normalized, country_major, mon`,
    [facId, ya, yb],
  );

  const byCountry = new Map<string, { region: string; months: NatCell[] }>();
  for (const r of q.rows) {
    const m = Number(r.mon) - 1;
    if (m < 0 || m > 11) continue;
    let e = byCountry.get(r.country);
    if (!e) {
      e = { region: r.region, months: Array.from({ length: 12 }, emptyCell) };
      byCountry.set(r.country, e);
    }
    e.months[m] = {
      rev: Number(r.rev),
      rooms: Number(r.rooms),
      guests: Number(r.guests),
      resv: Number(r.resv),
      multi: Number(r.multi),
      ltTotal: Number(r.lt_total),
      ltCount: Number(r.lt_count),
    };
  }

  const rows: NatMatrixRow[] = [...byCountry.entries()]
    .map(([country, e]) => {
      const total = emptyCell();
      for (const c of e.months) addCell(total, c);
      return { country, region: e.region, months: e.months, total };
    })
    .sort((x, y) => y.total.rev - x.total.rev);

  const colTotals = Array.from({ length: 12 }, emptyCell);
  const grand = emptyCell();
  for (const row of rows) {
    for (let m = 0; m < 12; m++) addCell(colTotals[m], row.months[m]);
    addCell(grand, row.total);
  }

  return { facName, year: f.year, rows, colTotals, grand };
}

// GET /api/dashboard/nationalities — 国籍別分析
export async function buildNationalities(pool: Pool, f: DashboardFilters): Promise<NationalitiesResponse> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const [a, b] = monthBounds(f.period, f.year, f.month);

  // flat rows + summary（契約維持・期間フィルタ準拠）
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

  // facName for the matrix header
  let facName = "全施設";
  if (facId) {
    const fr = await pool.query<{ display_name: string }>(
      "select display_name from app.facilities where id = $1",
      [facId],
    );
    facName = fr.rows[0]?.display_name ?? "施設";
  }
  const matrix = await nationalityMatrix(pool, f, facName);

  return { filters: f, summary, rows, matrix, generatedAt: new Date().toISOString() };
}
