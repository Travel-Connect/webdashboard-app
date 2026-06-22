import type { Pool } from "pg";
import type {
  DashboardFilters,
  RoomTypeRow,
  RoomTypesResponse,
  RoomTypeMatrix,
  RtCell,
  RtMatrixRow,
} from "./types";
import { monthBounds, ratio } from "./period";
import { activeGroupId, facilityScopeSql } from "./group";

/* ============================================================
   部屋タイプ別分析 — 既存Excel忠実再現。
   matrix: 部屋タイプ × 12ヶ月 クロスタブ（指標は base measures から算出）。
   mart.monthly_room_type_metrics の grain = (facility_id, stay_month, room_type)。
   ============================================================ */

const emptyCell = (): RtCell => ({ rev: 0, rooms: 0, guests: 0 });
function addCell(t: RtCell, s: RtCell): void {
  t.rev += s.rev;
  t.rooms += s.rooms;
  t.guests += s.guests;
}

async function roomTypeMatrix(pool: Pool, f: DashboardFilters, facName: string): Promise<RoomTypeMatrix> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const [ya, yb] = monthBounds("yearly", f.year);
  const gid = await activeGroupId(pool);
  const q = await pool.query<{ rt: string; mon: number; rooms: number; guests: number; rev: number }>(
    `select room_type_normalized rt, extract(month from stay_month)::int mon,
       coalesce(sum(sold_room_nights),0)::float8 rooms,
       coalesce(sum(guest_count),0)::int guests,
       coalesce(sum(${revCol}),0)::float8 rev
     from mart.monthly_room_type_metrics
     where ($1::uuid is null or facility_id = $1) and stay_month between $2 and $3
       and ${facilityScopeSql(gid)}
     group by room_type_normalized, mon`,
    [facId, ya, yb],
  );

  const byType = new Map<string, RtCell[]>();
  for (const r of q.rows) {
    const m = Number(r.mon) - 1;
    if (m < 0 || m > 11) continue;
    let months = byType.get(r.rt);
    if (!months) {
      months = Array.from({ length: 12 }, emptyCell);
      byType.set(r.rt, months);
    }
    months[m] = { rev: Number(r.rev), rooms: Number(r.rooms), guests: Number(r.guests) };
  }

  const rows: RtMatrixRow[] = [...byType.entries()]
    .map(([roomType, months]) => {
      const total = emptyCell();
      for (const c of months) addCell(total, c);
      return { roomType, months, total };
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

// GET /api/dashboard/room-types — 部屋タイプ別分析
export async function buildRoomTypes(pool: Pool, f: DashboardFilters): Promise<RoomTypesResponse> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const [a, b] = monthBounds(f.period, f.year, f.month);
  const gid = await activeGroupId(pool);

  // flat rows + summary（契約維持・期間フィルタ準拠）
  const q = await pool.query(
    `select room_type_normalized rt, budget_room_type bt,
       coalesce(sum(sold_room_nights),0)::float8 sold,
       coalesce(sum(guest_count),0)::int guest,
       coalesce(sum(reservation_count),0)::int resv,
       coalesce(sum(${revCol}),0)::float8 revenue
     from mart.monthly_room_type_metrics
     where ($1::uuid is null or facility_id = $1) and stay_month between $2 and $3
       and ${facilityScopeSql(gid)}
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

  let facName = "全施設";
  if (facId) {
    const fr = await pool.query<{ display_name: string }>(
      "select display_name from app.facilities where id = $1",
      [facId],
    );
    facName = fr.rows[0]?.display_name ?? "施設";
  }
  const matrix = await roomTypeMatrix(pool, f, facName);

  return { filters: f, summary, rows, matrix, generatedAt: new Date().toISOString() };
}
