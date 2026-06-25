import type { Pool } from "pg";
import type { DashboardFilters, OccupancyResponse, OccupancyRow, OccupancySummary, OccupancyTargeting } from "./types";
import { activeGroupId, facilityScopeSql } from "./group";
import { cmp, occupancyMetrics } from "./compare";

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dateStr = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

interface PeriodAgg {
  rows: OccupancyRow[];
  summary: OccupancySummary;
}

/** 指定年(+月)の稼働集計を mart + 在庫から構築。
 *  snapshotDate 指定時は live mart の代わりに …_snapshot を当該取込日で読む（指定日取込/as-of）。
 *  在庫(sellable)は常に現マスタを使う（capacity はブッキング状態に依らない）。 */
async function aggregate(pool: Pool, f: DashboardFilters, year: number, snapshotDate?: string): Promise<PeriodAgg> {
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
  const fromTbl = snapshotDate ? "mart.daily_facility_metrics_snapshot" : "mart.daily_facility_metrics";
  const snapPred = snapshotDate ? " and d.snapshot_date = $4" : "";
  const rowsParams = snapshotDate ? [facId, start, end, snapshotDate] : [facId, start, end];
  const rowsQ = await pool.query(
    `select ${grain} as dt,
       coalesce(sum(d.sold_room_nights),0)::float8 sold,
       coalesce(sum(d.guest_count),0)::int guest,
       coalesce(sum(d.${revCol}),0)::float8 revenue
     from ${fromTbl} d
     where ($1::uuid is null or d.facility_id = $1) and d.stay_date between $2 and $3
       and ${facilityScopeSql(gid, "d.facility_id")}${snapPred}
     group by 1 order by 1`,
    rowsParams,
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

  // mart 行を日付キーで引けるように（予約ゼロの日は mart に存在しないため後で 0 補完）
  const byDate = new Map<string, { sold: number; guest: number; revenue: number }>();
  for (const r of rowsQ.rows) {
    byDate.set(dateStr(r.dt), { sold: Number(r.sold), guest: Number(r.guest), revenue: Number(r.revenue) });
  }
  // 期間内の全日付を生成（monthly=その月の全日 / yearly=全12月）。欠落日は 0 行で補完して
  // カレンダーが歯抜けにならないようにする。
  const dateList: string[] =
    f.period === "monthly"
      ? Array.from({ length: daysIn(year, f.month!) }, (_, i) => ymd(year, f.month!, i + 1))
      : Array.from({ length: 12 }, (_, i) => ymd(year, i + 1, 1));

  const rows: OccupancyRow[] = dateList.map((date) => {
    const v = byDate.get(date) ?? { sold: 0, guest: 0, revenue: 0 };
    const sold = v.sold, guest = v.guest, revenue = v.revenue;
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

interface BudgetAgg {
  summary: {
    roomRevenue: number; // 売上予算（taxMode に応じ 税込/税抜）合計
    soldRoomNights: number; // 室数予算 合計
    sellableRoomNights: number; // 期間の販売可能室泊（実績と同じ分母）
    occupancyRate: number | null;
    adr: number | null;
    revpar: number | null;
    guestCount: number; // 宿泊人数予算 合計
  };
  rows: OccupancyRow[]; // 月別予算行（年間ビューの3列帯用）
  hasData: boolean; // 対象施設×期間に予算が1件でもあるか
}

/**
 * 予算(app.budgets)を施設×月で集計し、稼働分析の baseline を構築。年間ビュー用に月別行も返す。
 * 税込/税抜は budget_amount(税込) / budget_net_amount(税抜) を taxMode で切替。
 * 人数(budget_guest_count)・同伴係数(=人数/室数)・客単価(=売上/人数) も予算から算出する。
 */
async function aggregateBudget(pool: Pool, f: DashboardFilters): Promise<BudgetAgg> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const gid = await activeGroupId(pool);
  const useNet = f.taxMode === "net";
  const months =
    f.period === "monthly"
      ? [ymd(f.year, f.month!, 1)]
      : Array.from({ length: 12 }, (_, i) => ymd(f.year, i + 1, 1));

  const budQ = await pool.query(
    `select to_char(month,'YYYY-MM-01') m,
            coalesce(sum(budget_amount),0)::float8 gross,
            coalesce(sum(budget_net_amount),0)::float8 net,
            coalesce(sum(budget_room_nights),0)::int rn,
            coalesce(sum(budget_guest_count),0)::int guest,
            count(*)::int n
     from app.budgets
     where ($1::uuid is null or facility_id = $1) and month = any($2::date[])
       and ${facilityScopeSql(gid)}
     group by month`,
    [facId, months],
  );
  const invQ = await pool.query(
    `select to_char(month,'YYYY-MM-01') m, coalesce(sum(sellable_room_nights),0)::int srn
     from app.room_inventory_months
     where ($1::uuid is null or facility_id = $1) and month = any($2::date[])
       and ${facilityScopeSql(gid)}
     group by month`,
    [facId, months],
  );
  const budMap = new Map(
    budQ.rows.map((r) => [r.m, { amt: useNet ? Number(r.net) : Number(r.gross), rn: Number(r.rn), guest: Number(r.guest) }]),
  );
  const invMap = new Map(invQ.rows.map((r) => [r.m, Number(r.srn)]));
  const totalN = budQ.rows.reduce((s, r) => s + Number(r.n), 0);

  const rows: OccupancyRow[] = months.map((m) => {
    const b = budMap.get(m) ?? { amt: 0, rn: 0, guest: 0 };
    const srn = invMap.get(m) ?? 0;
    return {
      date: m,
      soldRoomNights: b.rn,
      sellableRoomNights: srn,
      remainingRoomNights: srn - b.rn,
      occupancyRate: ratio(b.rn, srn),
      guestCount: b.guest,
      roomRevenue: b.amt,
      guestUnitPrice: ratio(b.amt, b.guest),
      adr: ratio(b.amt, b.rn),
      revpar: ratio(b.amt, srn),
      avgGuestsPerRoom: ratio(b.guest, b.rn),
    };
  });

  const totRn = rows.reduce((s, r) => s + r.soldRoomNights, 0);
  const totAmt = rows.reduce((s, r) => s + r.roomRevenue, 0);
  const totSrn = rows.reduce((s, r) => s + r.sellableRoomNights, 0);
  const totGuest = rows.reduce((s, r) => s + r.guestCount, 0);
  return {
    summary: {
      roomRevenue: totAmt,
      soldRoomNights: totRn,
      sellableRoomNights: totSrn,
      occupancyRate: ratio(totRn, totSrn),
      adr: ratio(totAmt, totRn),
      revpar: ratio(totAmt, totSrn),
      guestCount: totGuest,
    },
    rows,
    hasData: totalN > 0,
  };
}

/** 指定日取込の取込日を解決。f.asOfDate があれば（投入済みなら）採用、
 *  無ければ「当日(JST)より前の最新スナップショット」=前回取込 を既定とする。 */
async function resolveAsOfDate(pool: Pool, f: DashboardFilters): Promise<string | null> {
  if (f.asOfDate) {
    const r = await pool.query(
      "select 1 from mart.daily_facility_metrics_snapshot where snapshot_date = $1 limit 1",
      [f.asOfDate],
    );
    return r.rowCount ? f.asOfDate : null;
  }
  const r = await pool.query(
    "select to_char(max(snapshot_date),'YYYY-MM-DD') d from mart.daily_facility_metrics_snapshot where snapshot_date < (now() at time zone 'Asia/Tokyo')::date",
  );
  if (r.rows[0].d) return r.rows[0].d as string;
  const r2 = await pool.query("select to_char(max(snapshot_date),'YYYY-MM-DD') d from mart.daily_facility_metrics_snapshot");
  return (r2.rows[0].d as string | null) ?? null;
}

export async function buildOccupancy(pool: Pool, f: DashboardFilters): Promise<OccupancyResponse> {
  const cur = await aggregate(pool, f, f.year);
  const res: OccupancyResponse = {
    filters: f,
    summary: cur.summary,
    rows: cur.rows,
    generatedAt: new Date().toISOString(),
  };

  // 「A室数の試算」用に予算・前年を一度だけ取得し、各比較分岐でも流用する（二重取得を避ける）。
  const bud = await aggregateBudget(pool, f);
  const prev = await aggregate(pool, f, f.year - 1);

  if (f.compareWith === "previous_year") {
    res.comparison = {
      basis: "previous_year",
      metrics: occupancyMetrics(cur.summary, prev.summary),
      rows: prev.rows,
    };
  } else if (f.compareWith === "budget") {
    if (bud.hasData) {
      const s = cur.summary, b = bud.summary;
      res.comparison = {
        basis: "budget",
        metrics: [
          cmp("soldRoomNights", s.soldRoomNights, b.soldRoomNights),
          cmp("occupancyRate", s.occupancyRate, b.occupancyRate),
          cmp("roomRevenue", s.roomRevenue, b.roomRevenue),
          cmp("adr", s.adr, b.adr),
          cmp("revpar", s.revpar, b.revpar),
          cmp("guestCount", s.guestCount, b.guestCount),
        ],
        // 年間ビューは月別予算行で3列帯（当年実績｜予算差｜予算）を描画。
        // 月間ビューは日別予算が無いため行は出さず、フロントで「年間予算をご確認ください」案内。
        rows: f.period === "yearly" ? bud.rows : [],
      };
    } else {
      // 対象施設×期間に予算未登録 → 比較なし（フロントで「予算未登録」を表示）
      res.comparison = null;
    }
  } else if (f.compareWith === "previous_snapshot") {
    // 指定日取込(as-of): 取込日時点のスナップショットを baseline に比較。差分=ピックアップ。
    const asOf = await resolveAsOfDate(pool, f);
    if (asOf) {
      const snap = await aggregate(pool, f, f.year, asOf);
      res.comparison = {
        basis: "previous_snapshot",
        metrics: occupancyMetrics(cur.summary, snap.summary),
        rows: snap.rows,
        asOf,
      };
    } else {
      res.comparison = null; // スナップショット未投入 → フロントで通知
    }
  }

  // 「A室数の試算」: 残室・目標達成まで残り・必要単価・前年比。比較基準に依らず常に付与。
  const budgetRevenue = bud.hasData ? bud.summary.roomRevenue : null;
  const previousYearRevenue = prev.summary.roomRevenue;
  const revenueGap = budgetRevenue != null ? budgetRevenue - cur.summary.roomRevenue : null;
  const requiredAdr =
    revenueGap != null && revenueGap > 0 && cur.summary.remainingRoomNights > 0
      ? revenueGap / cur.summary.remainingRoomNights
      : null;
  const targeting: OccupancyTargeting = {
    sellableRoomNights: cur.summary.sellableRoomNights,
    remainingRoomNights: cur.summary.remainingRoomNights,
    soldRoomNights: cur.summary.soldRoomNights,
    roomRevenue: cur.summary.roomRevenue,
    budgetRevenue,
    revenueGap,
    requiredAdr,
    previousYearRevenue: previousYearRevenue > 0 ? previousYearRevenue : null,
    yoyRate: previousYearRevenue > 0 ? cur.summary.roomRevenue / previousYearRevenue : null,
  };
  res.targeting = targeting;

  return res;
}
