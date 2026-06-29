import type { Pool } from "pg";
import type {
  DashboardFilters,
  RoomTypeRow,
  RoomTypesResponse,
  RoomTypeMatrix,
  RoomTypeMonthlyDetail,
  RoomTypeMonthlyRow,
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

/* ---- 月間明細（部屋タイプ別: 当月 + 前年同月 + 先月） ---- */
interface RtAgg {
  rooms: number;
  rev: number;
  guests: number;
  resv: number;
}

/** 指定 stay_month 範囲の部屋タイプ別集計（room_type_normalized 粒度）。前年同月・先月の比較に再利用。 */
async function roomTypeAgg(
  pool: Pool,
  f: DashboardFilters,
  a: string,
  b: string,
  gid: string,
): Promise<Map<string, RtAgg>> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const q = await pool.query<{ rt: string; rooms: number; rev: number; guests: number; resv: number }>(
    `select room_type_normalized rt,
       coalesce(sum(sold_room_nights),0)::float8 rooms,
       coalesce(sum(${revCol}),0)::float8 rev,
       coalesce(sum(guest_count),0)::int guests,
       coalesce(sum(reservation_count),0)::int resv
     from mart.monthly_room_type_metrics
     where ($1::uuid is null or facility_id = $1) and stay_month between $2 and $3
       and ${facilityScopeSql(gid)}
     group by room_type_normalized`,
    [facId, a, b],
  );
  const m = new Map<string, RtAgg>();
  for (const r of q.rows) {
    m.set(r.rt, { rooms: Number(r.rooms), rev: Number(r.rev), guests: Number(r.guests), resv: Number(r.resv) });
  }
  return m;
}

const sumAgg = (mp: Map<string, RtAgg>): RtAgg =>
  [...mp.values()].reduce(
    (s, v) => ({ rooms: s.rooms + v.rooms, rev: s.rev + v.rev, guests: s.guests + v.guests, resv: s.resv + v.resv }),
    { rooms: 0, rev: 0, guests: 0, resv: 0 },
  );

/**
 * 部屋タイプ別の「当月 販売可能室泊」（稼働率の分母）。
 * 施設×部屋タイプ単位で「実日次合計 ＋ 代表客室数(room_count) × 欠け日数」を求めてから
 * room_type_normalized で合算する。
 * ※ 施設ごとに補完してから足すので、ある施設の日次が丸ごと無くてもその施設の代表客室数で
 *   補完され、全施設集計の分母欠落（＝稼働率の過大）を防ぐ。
 */
async function roomTypeSellableMonth(
  pool: Pool,
  facId: string | null,
  gid: string,
  d1: string,
  d2: string,
  daysInMonth: number,
): Promise<Map<string, number>> {
  const q = await pool.query<{ rt: string; sellable: number }>(
    `select i.room_type_normalized rt,
            sum( coalesce(d.ssum,0) + i.room_count * ($4::int - coalesce(d.sdays,0)) )::float8 sellable
     from app.room_type_inventory i
     left join (
       select facility_id, room_type_normalized,
              sum(sellable_rooms)::float8 ssum, count(distinct date)::int sdays
       from app.room_type_inventory_days
       where date between $2 and $3
       group by facility_id, room_type_normalized
     ) d on d.facility_id = i.facility_id and d.room_type_normalized = i.room_type_normalized
     where ($1::uuid is null or i.facility_id = $1) and ${facilityScopeSql(gid, "i.facility_id")}
     group by i.room_type_normalized`,
    [facId, d1, d2, daysInMonth],
  );
  const m = new Map<string, number>();
  for (const r of q.rows) m.set(r.rt, Number(r.sellable));
  return m;
}

/** 稼働率 = 販売室数 / 販売可能室泊（分母 null/0 は算出不可 → null）。 */
const occRate = (sold: number | null | undefined, sellable: number | null): number | null =>
  sold != null && sellable != null && sellable > 0 ? sold / sellable : null;

/** period=monthly: 当月 × 前年同月 × 先月 の部屋タイプ別明細を組み立てる。 */
async function roomTypeMonthlyDetail(
  pool: Pool,
  f: DashboardFilters,
  facName: string,
  gid: string,
): Promise<RoomTypeMonthlyDetail> {
  const month = f.month ?? 1;
  const [ca, cb] = monthBounds("monthly", f.year, month);
  const [pya, pyb] = monthBounds("monthly", f.year - 1, month); // 前年同月
  const prevMonthYear = month === 1 ? f.year - 1 : f.year; // 先月（暦月-1, 1月なら前年12月）
  const prevMonth = month === 1 ? 12 : month - 1;
  const [pma, pmb] = monthBounds("monthly", prevMonthYear, prevMonth);

  const facId = f.facilityId === "all" ? null : f.facilityId;
  const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate(); // 月の暦日数
  const dCur = daysIn(f.year, month);
  const dPY = daysIn(f.year - 1, month);
  const dPM = daysIn(prevMonthYear, prevMonth);
  // 日次在庫テーブルの月内 date 範囲（[月初, 月末]）。
  const dr = (y: number, m: number): [string, string] => {
    const mm = String(m).padStart(2, "0");
    return [`${y}-${mm}-01`, `${y}-${mm}-${String(daysIn(y, m)).padStart(2, "0")}`];
  };
  const [crA, crB] = dr(f.year, month);
  const [pyrA, pyrB] = dr(f.year - 1, month);
  const [pmrA, pmrB] = dr(prevMonthYear, prevMonth);

  const [cur, py, pm, sellCur, sellPY, sellPM] = await Promise.all([
    roomTypeAgg(pool, f, ca, cb, gid),
    roomTypeAgg(pool, f, pya, pyb, gid),
    roomTypeAgg(pool, f, pma, pmb, gid),
    roomTypeSellableMonth(pool, facId, gid, crA, crB, dCur),
    roomTypeSellableMonth(pool, facId, gid, pyrA, pyrB, dPY),
    roomTypeSellableMonth(pool, facId, gid, pmrA, pmrB, dPM),
  ]);

  // 販売可能室泊（分母）は施設単位で補完済み（roomTypeSellableMonth）。null/0 は算出不可。
  const sellableOf = (sm: Map<string, number>, rt: string): number | null => {
    const v = sm.get(rt);
    return v != null && v > 0 ? v : null;
  };
  const totSell = (sm: Map<string, number>): number =>
    [...cur.keys()].reduce((s, rt) => s + (sm.get(rt) ?? 0), 0);

  const totRev = sumAgg(cur).rev;
  const rows: RoomTypeMonthlyRow[] = [...cur.entries()]
    .map(([roomType, c]) => {
      const p = py.get(roomType) ?? null;
      const q = pm.get(roomType) ?? null;
      return {
        roomType,
        revenue: c.rev,
        revenueShare: ratio(c.rev, totRev),
        soldRoomNights: c.rooms,
        soldRoomNightsPrevYear: p ? p.rooms : null,
        soldRoomNightsPrevMonth: q ? q.rooms : null,
        guestCount: c.guests,
        adr: ratio(c.rev, c.rooms),
        adrPrevYear: p ? ratio(p.rev, p.rooms) : null,
        adrPrevMonth: q ? ratio(q.rev, q.rooms) : null,
        companion: ratio(c.guests, c.rooms),
        avgNights: ratio(c.rooms, c.resv),
        occupancy: occRate(c.rooms, sellableOf(sellCur, roomType)),
        occupancyPrevYear: occRate(p?.rooms, sellableOf(sellPY, roomType)),
        occupancyPrevMonth: occRate(q?.rooms, sellableOf(sellPM, roomType)),
      };
    })
    .sort((x, y) => y.revenue - x.revenue);

  const c = sumAgg(cur), p = sumAgg(py), q = sumAgg(pm);
  const total: RoomTypeMonthlyRow = {
    roomType: "(合計)",
    revenue: c.rev,
    revenueShare: ratio(c.rev, totRev),
    soldRoomNights: c.rooms,
    soldRoomNightsPrevYear: p.rooms,
    soldRoomNightsPrevMonth: q.rooms,
    guestCount: c.guests,
    adr: ratio(c.rev, c.rooms),
    adrPrevYear: ratio(p.rev, p.rooms),
    adrPrevMonth: ratio(q.rev, q.rooms),
    companion: ratio(c.guests, c.rooms),
    avgNights: ratio(c.rooms, c.resv),
    occupancy: occRate(c.rooms, totSell(sellCur)),
    occupancyPrevYear: occRate(p.rooms, totSell(sellPY)),
    occupancyPrevMonth: occRate(q.rooms, totSell(sellPM)),
  };

  return { facName, year: f.year, month, rows, total };
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
  const monthlyDetail =
    f.period === "monthly" ? await roomTypeMonthlyDetail(pool, f, facName, gid) : null;

  return { filters: f, summary, rows, matrix, monthlyDetail, generatedAt: new Date().toISOString() };
}
