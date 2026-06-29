import type { Pool } from "pg";
import type { DashboardFilters, NightsBucket, StayNightsResponse, StayNightsRow, StayNightsSummary } from "./types";
import { monthBounds, ratio } from "./period";
import { activeGroupId, facilityScopeSql } from "./group";

const BUCKET_ORDER: Record<NightsBucket, number> = { "1": 0, "2": 1, "3_4": 2, "5_6": 3, "7_plus": 4 };

// GET /api/dashboard/stay-nights — 泊数分布
export async function buildStayNights(pool: Pool, f: DashboardFilters): Promise<StayNightsResponse> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  // 占有売上（ADR の分子）も taxMode で税込/税抜を切替（稼働分析と同基準）。
  const occRevCol = f.taxMode === "net" ? "occ_net_amount" : "occ_gross_amount";
  // 部屋タイプ絞り込み（未指定=全室タイプ＝横断）
  const roomType = f.roomType && f.roomType.trim() ? f.roomType : null;
  const [a, b] = monthBounds(f.period, f.year, f.month);
  const gid = await activeGroupId(pool);
  // 選択可能な部屋タイプ一覧（施設×期間。絞り込みは無視＝母集合）。売上降順。
  const rtQ = await pool.query(
    `select room_type_normalized as rt
       from mart.stay_nights_distribution
      where ($1::uuid is null or facility_id = $1) and checkin_month between $2 and $3
        and coalesce(room_type_normalized,'') <> ''
        and ${facilityScopeSql(gid)}
      group by room_type_normalized
      order by sum(gross_amount) desc, room_type_normalized`,
    [facId, a, b],
  );
  const roomTypes = rtQ.rows.map((r) => r.rt as string);
  const q = await pool.query(
    `select to_char(checkin_month,'YYYY-MM-DD') as "month", nights_bucket,
       coalesce(sum(reservation_count),0)::int resv,
       coalesce(sum(sold_room_nights),0)::float8 rooms,
       coalesce(sum(guest_count),0)::int guests,
       coalesce(sum(${revCol}),0)::float8 revenue,
       coalesce(sum(adr_weighted_num),0)::float8 adr_wnum,
       coalesce(sum(comp_weighted_num),0)::float8 comp_wnum,
       coalesce(sum(occ_sold_room_nights),0)::float8 occ_sold,
       coalesce(sum(occ_guest_count),0)::int occ_guest,
       coalesce(sum(${occRevCol}),0)::float8 occ_rev
     from mart.stay_nights_distribution
     where ($1::uuid is null or facility_id = $1) and checkin_month between $2 and $3
       and ($4::text is null or room_type_normalized = $4)
       and ${facilityScopeSql(gid)}
     group by checkin_month, nights_bucket`,
    [facId, a, b, roomType],
  );
  const rows: StayNightsRow[] = q.rows
    .map((r) => {
      const resv = Number(r.resv), rooms = Number(r.rooms), guests = Number(r.guests), revenue = Number(r.revenue);
      // ADR / 同伴係数 は占有母数（稼働分析と同基準）。販売室数（実室泊）で割る。
      const occSoldRoomNights = Number(r.occ_sold), occGuestCount = Number(r.occ_guest), occRevenue = Number(r.occ_rev);
      const adrWeightedNum = Number(r.adr_wnum);
      const compWeightedNum = Number(r.comp_wnum);
      return {
        month: r.month as string,
        nightsBucket: r.nights_bucket as NightsBucket,
        reservationCount: resv,
        soldRoomNights: rooms,
        guestCount: guests,
        revenue,
        adr: ratio(occRevenue, occSoldRoomNights), // Σ占有売上 / Σ販売室数
        guestFactor: ratio(occGuestCount, occSoldRoomNights), // Σ宿泊人数 / Σ販売室数
        occSoldRoomNights,
        occGuestCount,
        occRevenue,
        adrWeightedNum,
        compWeightedNum,
      };
    })
    .sort((x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : BUCKET_ORDER[x.nightsBucket] - BUCKET_ORDER[y.nightsBucket]));

  const summary: StayNightsSummary = {
    totalReservations: rows.reduce((s, r) => s + r.reservationCount, 0),
    totalSoldRoomNights: rows.reduce((s, r) => s + r.soldRoomNights, 0),
    totalGuestCount: rows.reduce((s, r) => s + r.guestCount, 0),
    totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
  };
  return { filters: f, summary, rows, roomTypes, generatedAt: new Date().toISOString() };
}
