import type { Pool } from "pg";
import type { DashboardFilters, RoomTypeRow, RoomTypesResponse } from "./types";
import { monthBounds, ratio } from "./period";

// GET /api/dashboard/room-types — 部屋タイプ別分析
export async function buildRoomTypes(pool: Pool, f: DashboardFilters): Promise<RoomTypesResponse> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const [a, b] = monthBounds(f.period, f.year, f.month);
  const q = await pool.query(
    `select room_type_normalized rt, budget_room_type bt,
       coalesce(sum(sold_room_nights),0)::float8 sold,
       coalesce(sum(guest_count),0)::int guest,
       coalesce(sum(reservation_count),0)::int resv,
       coalesce(sum(${revCol}),0)::float8 revenue
     from mart.monthly_room_type_metrics
     where ($1::uuid is null or facility_id = $1) and stay_month between $2 and $3
     group by room_type_normalized, budget_room_type`,
    [facId, a, b],
  );
  const rows: RoomTypeRow[] = q.rows
    .map((r) => {
      const sold = Number(r.sold), revenue = Number(r.revenue);
      return {
        roomType: r.rt as string,
        budgetRoomType: (r.bt as string) ?? "",
        revenue,
        soldRoomNights: sold,
        guestCount: Number(r.guest),
        reservationCount: Number(r.resv),
        adr: ratio(revenue, sold),
      };
    })
    .sort((x, y) => y.revenue - x.revenue);

  const sum = (k: keyof RoomTypeRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const totSold = sum("soldRoomNights"), totRev = sum("revenue");
  const summary: RoomTypeRow = {
    roomType: "(合計)",
    budgetRoomType: "",
    revenue: totRev,
    soldRoomNights: totSold,
    guestCount: sum("guestCount"),
    reservationCount: sum("reservationCount"),
    adr: ratio(totRev, totSold),
  };
  return { filters: f, summary, rows, generatedAt: new Date().toISOString() };
}
