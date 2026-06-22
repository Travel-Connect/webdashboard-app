import type { Pool } from "pg";
import type { DashboardFilters, OccupancyResponse, OccupancyRow, OccupancySummary, MetricComparison } from "./types";
import { activeGroupId, facilityScopeSql } from "./group";

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dateStr = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

interface PeriodAgg {
  rows: OccupancyRow[];
  summary: OccupancySummary;
}

/** 指定年(+月)の稼働集計を mart + 在庫から構築 */
async function aggregate(pool: Pool, f: DashboardFilters, year: number): Promise<PeriodAgg> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const gid = await activeGroupId(pool);

  let start: string, end: string, months: string[];
  if (f.period === "monthly") {
    const m = f.month!;
    start = ymd(year, m, 1);
    end = ymd(year, m, daysIn(year, m));
    months = [ymd(year, m, 1)];
  } else {
    start = ymd(year, 1, 1);
    end = ymd(year, 12, 31);
    months = Array.from({ length: 12 }, (_, i) => ymd(year, i + 1, 1));
  }
  // monthly → 日別、yearly → 月別
  const grain = f.period === "monthly" ? "d.stay_date" : "date_trunc('month', d.stay_date)::date";
  const rowsQ = await pool.query(
    `select ${grain} as dt,
       coalesce(sum(d.sold_room_nights),0)::float8 sold,
       coalesce(sum(d.guest_count),0)::int guest,
       coalesce(sum(d.${revCol}),0)::float8 revenue
     from mart.daily_facility_metrics d
     where ($1::uuid is null or d.facility_id = $1) and d.stay_date between $2 and $3
       and ${facilityScopeSql(gid, "d.facility_id")}
     group by 1 order by 1`,
    [facId, start, end],
  );
  const invQ = await pool.query(
    `select to_char(month,'YYYY-MM-01') m,
       coalesce(sum(sellable_room_nights),0)::int srn,
       coalesce(sum(sellable_rooms_per_day),0)::int spd
     from app.room_inventory_months
     where ($1::uuid is null or facility_id = $1) and month = any($2::date[])
       and ${facilityScopeSql(gid)}
     group by month`,
    [facId, months],
  );
  const inv = new Map(invQ.rows.map((r) => [r.m, { srn: Number(r.srn), spd: Number(r.spd) }]));

  const rows: OccupancyRow[] = rowsQ.rows.map((r) => {
    const date = dateStr(r.dt);
    const sold = Number(r.sold), guest = Number(r.guest), revenue = Number(r.revenue);
    const monthKey = f.period === "monthly" ? months[0] : `${date.slice(0, 7)}-01`;
    const im = inv.get(monthKey);
    // monthly: 日次 sellable = 1日あたり室数 / yearly: 月次 sellable = 月合計室泊
    const sellable = f.period === "monthly" ? (im?.spd ?? 0) : (im?.srn ?? 0);
    return {
      date,
      soldRoomNights: sold,
      sellableRoomNights: sellable,
      remainingRoomNights: sellable - sold,
      occupancyRate: ratio(sold, sellable),
      guestCount: guest,
      roomRevenue: revenue,
      guestUnitPrice: ratio(revenue, guest),
      adr: ratio(revenue, sold),
      revpar: ratio(revenue, sellable),
      avgGuestsPerRoom: ratio(guest, sold),
    };
  });

  const totSold = rows.reduce((s, r) => s + r.soldRoomNights, 0);
  const totGuest = rows.reduce((s, r) => s + r.guestCount, 0);
  const totRev = rows.reduce((s, r) => s + r.roomRevenue, 0);
  const totSellable = [...inv.values()].reduce((s, v) => s + v.srn, 0); // 期間の月次 sellable 合計
  const summary: OccupancySummary = {
    soldRoomNights: totSold,
    sellableRoomNights: totSellable,
    remainingRoomNights: totSellable - totSold,
    occupancyRate: ratio(totSold, totSellable),
    guestCount: totGuest,
    roomRevenue: totRev,
    guestUnitPrice: ratio(totRev, totGuest),
    adr: ratio(totRev, totSold),
    revpar: ratio(totRev, totSellable),
    avgGuestsPerRoom: ratio(totGuest, totSold),
  };
  return { rows, summary };
}

const cmp = (metric: string, current: number | null, baseline: number | null): MetricComparison => ({
  metric,
  current,
  baseline,
  diff: current != null && baseline != null ? current - baseline : null,
  rate: current != null && baseline != null && baseline !== 0 ? current / baseline : null,
});

export async function buildOccupancy(pool: Pool, f: DashboardFilters): Promise<OccupancyResponse> {
  const cur = await aggregate(pool, f, f.year);
  const res: OccupancyResponse = {
    filters: f,
    summary: cur.summary,
    rows: cur.rows,
    generatedAt: new Date().toISOString(),
  };

  if (f.compareWith === "previous_year") {
    const prev = await aggregate(pool, f, f.year - 1);
    const s = cur.summary, p = prev.summary;
    res.comparison = {
      basis: "previous_year",
      metrics: [
        cmp("soldRoomNights", s.soldRoomNights, p.soldRoomNights),
        cmp("occupancyRate", s.occupancyRate, p.occupancyRate),
        cmp("roomRevenue", s.roomRevenue, p.roomRevenue),
        cmp("adr", s.adr, p.adr),
        cmp("revpar", s.revpar, p.revpar),
        cmp("guestCount", s.guestCount, p.guestCount),
      ],
      rows: prev.rows,
    };
  } else if (f.compareWith === "previous_snapshot") {
    // 初期実装では snapshot 機能無効
    res.comparison = null;
  }
  return res;
}
