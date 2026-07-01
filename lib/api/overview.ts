import type { Pool } from "pg";
import type {
  DashboardFilters,
  OverviewResponse,
  OverviewMetricSet,
  OverviewFacility,
  OverviewHeat,
  OverviewHeatCell,
  OverviewNationalities,
  OverviewDomesticOverseas,
  OverviewChannels,
  OverviewStayNights,
  StayNightBucket,
  CountrySliceRow,
  DomesticOverseasSplit,
  ChannelSliceRow,
  BudgetAchievementFacility,
} from "./types";
import { activeGroupId } from "./group";

/* ============================================================
   overview.ts — 総合ダッシュボード /api/dashboard/overview
   選択施設SET×期間で「当年・前年同期・予算」をまとめて集計。
   施設ごと(perFacility) と 合算(totals) の両方を返す。
   - 各ウィジェット（ヒート/国籍/国内海外/経路/泊数）は施設別に GROUP BY facility_id
     で1パス集計し、施設マップと合算(merge)の両方を作る（N往復を避ける）。
   - 値は各分析画面の定義に一致させる:
       売上/販売室数/ADR/同伴 = 稼働分析(occupancy.ts)
       平均泊数               = 泊数分析表(staynights.ts, Σsold/Σreservation)
       キャンセル率           = canonical reservation_stay_nights 直集計
       国籍別/国内海外        = 国籍別分析(nationalities.ts, mart.monthly_country_metrics 売上構成比)
       経路別                 = 経路分析(channels.ts, mart.monthly_channel_metrics 売上構成比)
       泊数別                 = 泊数分布(staynights.ts, mart.stay_nights_distribution バケット)
       予算達成率             = 実績(稼働分析売上) / 予算(app.budgets, annualsales.ts と同定義)
   - mart はキャンセル除外 → キャンセル率は canonical 直集計。
   - 日次ヒート/国籍/経路/国内海外 に予算は無い（提供しない）。
   ============================================================ */

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dateStr = (v: unknown) =>
  v instanceof Date ? v.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) : String(v).slice(0, 10);

interface Bounds {
  start: string; // 日付範囲（stay_date 系）
  end: string;
  months: string[]; // 月初日配列（inventory/budget の month = any）
  monStart: string; // 月レンジ下限（stay_month/checkin_month 系）
  monEnd: string;
}
function boundsFor(period: "monthly" | "yearly", year: number, month?: number): Bounds {
  if (period === "monthly") {
    const m = month ?? 1;
    return {
      start: ymd(year, m, 1),
      end: ymd(year, m, daysIn(year, m)),
      months: [ymd(year, m, 1)],
      monStart: ymd(year, m, 1),
      monEnd: ymd(year, m, 1),
    };
  }
  return {
    start: ymd(year, 1, 1),
    end: ymd(year, 12, 31),
    months: Array.from({ length: 12 }, (_, i) => ymd(year, i + 1, 1)),
    monStart: ymd(year, 1, 1),
    monEnd: ymd(year, 12, 1),
  };
}

/** 期間内の日付キー配列（monthly=その月の全日 / yearly=全12月の月初）。 */
function dateListOf(period: "monthly" | "yearly", year: number, month?: number): string[] {
  return period === "monthly"
    ? Array.from({ length: daysIn(year, month ?? 1) }, (_, i) => ymd(year, month ?? 1, i + 1))
    : Array.from({ length: 12 }, (_, i) => ymd(year, i + 1, 1));
}

// ---- KPI（実績）: 稼働分析と同定義（売上/販売室数/在庫/同伴/ADR）＋泊数分析(平均泊数)＋キャンセル率 ----
interface FacRaw {
  sold: number;
  guest: number;
  revenue: number;
  srn: number;
  cancelledResv: number;
  totalResv: number;
  anRn: number; // 平均泊数 分子（Σ sold_room_nights, 予約粒度）
  anResv: number; // 平均泊数 分母（Σ reservation_count）
}
const emptyFacRaw = (): FacRaw => ({ sold: 0, guest: 0, revenue: 0, srn: 0, cancelledResv: 0, totalResv: 0, anRn: 0, anResv: 0 });

function metricSet(r: FacRaw): OverviewMetricSet {
  return {
    soldRoomNights: r.sold,
    sellableRoomNights: r.srn,
    revenue: r.revenue,
    guestCount: r.guest,
    occupancyRate: ratio(r.sold, r.srn),
    adr: ratio(r.revenue, r.sold),
    avgGuestsPerRoom: ratio(r.guest, r.sold),
    avgNights: ratio(r.anRn, r.anResv),
    cancelRate: ratio(r.cancelledResv, r.totalResv),
  };
}

/** 指定年の per-facility 生集計（実績）。Map<facilityId, FacRaw>。 */
async function perFacilityYear(
  pool: Pool,
  ids: string[],
  b: Bounds,
  revCol: string,
): Promise<Map<string, FacRaw>> {
  const m = new Map<string, FacRaw>();
  const get = (id: string) => {
    let v = m.get(id);
    if (!v) { v = emptyFacRaw(); m.set(id, v); }
    return v;
  };
  const [kpi, inv, cancel, an] = await Promise.all([
    pool.query<{ facility_id: string; sold: number; guest: number; revenue: number }>(
      `select facility_id,
         coalesce(sum(sold_room_nights),0)::float8 sold,
         coalesce(sum(guest_count),0)::int guest,
         coalesce(sum(${revCol}),0)::float8 revenue
       from mart.daily_facility_metrics
       where stay_date between $1 and $2 and facility_id = any($3::uuid[])
       group by facility_id`,
      [b.start, b.end, ids],
    ),
    pool.query<{ facility_id: string; srn: number }>(
      `select facility_id, coalesce(sum(sellable_room_nights),0)::int srn
       from app.room_inventory_months
       where month = any($1::date[]) and facility_id = any($2::uuid[])
       group by facility_id`,
      [b.months, ids],
    ),
    pool.query<{ facility_id: string; cancelled_resv: number; total_resv: number }>(
      `select facility_id,
         count(distinct reservation_key) filter (where is_cancelled)::int cancelled_resv,
         count(distinct reservation_key)::int total_resv
       from app.reservation_stay_nights
       where stay_month between $1 and $2 and facility_id = any($3::uuid[])
       group by facility_id`,
      [b.monStart, b.monEnd, ids],
    ),
    pool.query<{ facility_id: string; rn: number; resv: number }>(
      `select facility_id,
         coalesce(sum(sold_room_nights),0)::float8 rn,
         coalesce(sum(reservation_count),0)::int resv
       from mart.stay_nights_distribution
       where checkin_month between $1 and $2 and facility_id = any($3::uuid[])
       group by facility_id`,
      [b.monStart, b.monEnd, ids],
    ),
  ]);
  for (const r of kpi.rows) { const v = get(r.facility_id); v.sold = Number(r.sold); v.guest = Number(r.guest); v.revenue = Number(r.revenue); }
  for (const r of inv.rows) get(r.facility_id).srn = Number(r.srn);
  for (const r of cancel.rows) { const v = get(r.facility_id); v.cancelledResv = Number(r.cancelled_resv); v.totalResv = Number(r.total_resv); }
  for (const r of an.rows) { const v = get(r.facility_id); v.anRn = Number(r.rn); v.anResv = Number(r.resv); }
  return m;
}

/** 指定年の予算 per-facility（budgets + inventory）。Map<facId, {amt,rn,guest,srn,n}>。 */
async function budgetYear(pool: Pool, ids: string[], b: Bounds, useNet: boolean) {
  const budCol = useNet ? "budget_net_amount" : "budget_amount";
  const [bud, inv] = await Promise.all([
    pool.query<{ facility_id: string; amt: number; rn: number; guest: number; n: number }>(
      `select facility_id,
         coalesce(sum(${budCol}),0)::float8 amt,
         coalesce(sum(budget_room_nights),0)::int rn,
         coalesce(sum(budget_guest_count),0)::int guest,
         count(*)::int n
       from app.budgets
       where month = any($1::date[]) and facility_id = any($2::uuid[])
       group by facility_id`,
      [b.months, ids],
    ),
    pool.query<{ facility_id: string; srn: number }>(
      `select facility_id, coalesce(sum(sellable_room_nights),0)::int srn
       from app.room_inventory_months
       where month = any($1::date[]) and facility_id = any($2::uuid[])
       group by facility_id`,
      [b.months, ids],
    ),
  ]);
  const m = new Map<string, { amt: number; rn: number; guest: number; srn: number; n: number }>();
  for (const r of bud.rows) m.set(r.facility_id, { amt: Number(r.amt), rn: Number(r.rn), guest: Number(r.guest), srn: 0, n: Number(r.n) });
  for (const r of inv.rows) { const v = m.get(r.facility_id); if (v) v.srn = Number(r.srn); }
  return m;
}

// ---- 施設別ヒートマップ（grain日/月）。欠落日は 0 補完。Map<facId, cells[]>。 ----
async function heatByFacility(
  pool: Pool,
  ids: string[],
  b: Bounds,
  period: "monthly" | "yearly",
  year: number,
  month: number | undefined,
  revCol: string,
): Promise<Map<string, OverviewHeatCell[]>> {
  const grain = period === "monthly" ? "stay_date" : "date_trunc('month', stay_date)::date";
  const q = await pool.query<{ facility_id: string; dt: unknown; sold: number; revenue: number }>(
    `select facility_id, ${grain} dt,
       coalesce(sum(sold_room_nights),0)::float8 sold,
       coalesce(sum(${revCol}),0)::float8 revenue
     from mart.daily_facility_metrics
     where stay_date between $1 and $2 and facility_id = any($3::uuid[])
     group by 1, 2`,
    [b.start, b.end, ids],
  );
  const byFac = new Map<string, Map<string, { sold: number; revenue: number }>>();
  for (const r of q.rows) {
    let m = byFac.get(r.facility_id);
    if (!m) { m = new Map(); byFac.set(r.facility_id, m); }
    m.set(dateStr(r.dt), { sold: Number(r.sold), revenue: Number(r.revenue) });
  }
  const dates = dateListOf(period, year, month);
  const out = new Map<string, OverviewHeatCell[]>();
  for (const id of ids) {
    const m = byFac.get(id) ?? new Map<string, { sold: number; revenue: number }>();
    out.set(
      id,
      dates.map((date) => {
        const v = m.get(date) ?? { sold: 0, revenue: 0 };
        return { date, soldRoomNights: v.sold, revenue: v.revenue };
      }),
    );
  }
  return out;
}

/** 合算ヒート = 施設別セルの日付インデックス毎の和（全施設同じ日付リスト）。 */
function mergeHeat(perFac: Map<string, OverviewHeatCell[]>, ids: string[]): OverviewHeatCell[] {
  const arrays = ids.map((id) => perFac.get(id) ?? []);
  const template = arrays.find((a) => a.length > 0);
  if (!template) return [];
  return template.map((cell, i) => {
    let sold = 0;
    let revenue = 0;
    for (const a of arrays) {
      const c = a[i];
      if (c) { sold += c.soldRoomNights; revenue += c.revenue; }
    }
    return { date: cell.date, soldRoomNights: sold, revenue };
  });
}

// ---- 施設別 国籍別（mart.monthly_country_metrics・売上構成比）----
interface CountryRaw { country: string; major: string; revenue: number; rooms: number; }
async function countryByFacility(pool: Pool, ids: string[], b: Bounds, revCol: string): Promise<Map<string, CountryRaw[]>> {
  const q = await pool.query<{ facility_id: string; country: string; major: string; revenue: number; rooms: number }>(
    `select facility_id, country_normalized country, max(country_major) major,
       coalesce(sum(${revCol}),0)::float8 revenue,
       coalesce(sum(sold_room_nights),0)::float8 rooms
     from mart.monthly_country_metrics
     where stay_month between $1 and $2 and facility_id = any($3::uuid[])
     group by facility_id, country_normalized`,
    [b.monStart, b.monEnd, ids],
  );
  const out = new Map<string, CountryRaw[]>();
  for (const r of q.rows) {
    const arr = out.get(r.facility_id) ?? [];
    arr.push({ country: r.country, major: r.major, revenue: Number(r.revenue), rooms: Number(r.rooms) });
    out.set(r.facility_id, arr);
  }
  for (const arr of out.values()) arr.sort((a, c) => c.revenue - a.revenue);
  return out;
}

/** 合算 国籍 = 国コードで施設横断マージ（売上降順）。major は max（=同一国は同一分類）。 */
function mergeCountry(perFac: Map<string, CountryRaw[]>, ids: string[]): CountryRaw[] {
  const m = new Map<string, CountryRaw>();
  for (const id of ids) {
    for (const r of perFac.get(id) ?? []) {
      const e = m.get(r.country);
      if (!e) m.set(r.country, { country: r.country, major: r.major, revenue: r.revenue, rooms: r.rooms });
      else { e.revenue += r.revenue; e.rooms += r.rooms; if (r.major > e.major) e.major = r.major; }
    }
  }
  return [...m.values()].sort((a, c) => c.revenue - a.revenue);
}

// ---- 施設別 経路別（mart.monthly_channel_metrics・売上構成比）----
interface ChannelRaw { channel: string; revenue: number; rooms: number; }
async function channelByFacility(pool: Pool, ids: string[], b: Bounds, revCol: string): Promise<Map<string, ChannelRaw[]>> {
  const q = await pool.query<{ facility_id: string; channel: string; revenue: number; rooms: number }>(
    `select facility_id, channel,
       coalesce(sum(${revCol}),0)::float8 revenue,
       coalesce(sum(sold_room_nights),0)::float8 rooms
     from mart.monthly_channel_metrics
     where stay_month between $1 and $2 and facility_id = any($3::uuid[])
     group by facility_id, channel`,
    [b.monStart, b.monEnd, ids],
  );
  const out = new Map<string, ChannelRaw[]>();
  for (const r of q.rows) {
    const arr = out.get(r.facility_id) ?? [];
    arr.push({ channel: r.channel, revenue: Number(r.revenue), rooms: Number(r.rooms) });
    out.set(r.facility_id, arr);
  }
  for (const arr of out.values()) arr.sort((a, c) => c.revenue - a.revenue);
  return out;
}

function mergeChannel(perFac: Map<string, ChannelRaw[]>, ids: string[]): ChannelRaw[] {
  const m = new Map<string, ChannelRaw>();
  for (const id of ids) {
    for (const r of perFac.get(id) ?? []) {
      const e = m.get(r.channel);
      if (!e) m.set(r.channel, { channel: r.channel, revenue: r.revenue, rooms: r.rooms });
      else { e.revenue += r.revenue; e.rooms += r.rooms; }
    }
  }
  return [...m.values()].sort((a, c) => c.revenue - a.revenue);
}

// ---- 施設別 泊数分布（mart.stay_nights_distribution・バケット別）----
const BUCKET_ORDER: StayNightBucket["bucket"][] = ["1", "2", "3_4", "5_6", "7_plus"];
async function stayByFacility(pool: Pool, ids: string[], b: Bounds, revCol: string): Promise<Map<string, StayNightBucket[]>> {
  const q = await pool.query<{ facility_id: string; bucket: string; resv: number; rooms: number; revenue: number }>(
    `select facility_id, nights_bucket bucket,
       coalesce(sum(reservation_count),0)::int resv,
       coalesce(sum(sold_room_nights),0)::float8 rooms,
       coalesce(sum(${revCol}),0)::float8 revenue
     from mart.stay_nights_distribution
     where checkin_month between $1 and $2 and facility_id = any($3::uuid[])
     group by facility_id, nights_bucket`,
    [b.monStart, b.monEnd, ids],
  );
  const raw = new Map<string, Map<string, { resv: number; rooms: number; revenue: number }>>();
  for (const r of q.rows) {
    let m = raw.get(r.facility_id);
    if (!m) { m = new Map(); raw.set(r.facility_id, m); }
    m.set(r.bucket, { resv: Number(r.resv), rooms: Number(r.rooms), revenue: Number(r.revenue) });
  }
  const out = new Map<string, StayNightBucket[]>();
  for (const id of ids) {
    const m = raw.get(id) ?? new Map<string, { resv: number; rooms: number; revenue: number }>();
    out.set(
      id,
      BUCKET_ORDER.map((bucket) => {
        const r = m.get(bucket);
        return { bucket, reservations: r ? r.resv : 0, soldRoomNights: r ? r.rooms : 0, revenue: r ? r.revenue : 0 };
      }),
    );
  }
  return out;
}

function mergeStay(perFac: Map<string, StayNightBucket[]>, ids: string[]): StayNightBucket[] {
  return BUCKET_ORDER.map((bucket, i) => {
    let reservations = 0;
    let soldRoomNights = 0;
    let revenue = 0;
    for (const id of ids) {
      const cell = perFac.get(id)?.[i];
      if (cell) { reservations += cell.reservations; soldRoomNights += cell.soldRoomNights; revenue += cell.revenue; }
    }
    return { bucket, reservations, soldRoomNights, revenue };
  });
}

// ---- 合算補助 ----
const sumFac = (vals: FacRaw[]): FacRaw =>
  vals.reduce((s, v) => ({
    sold: s.sold + v.sold, guest: s.guest + v.guest, revenue: s.revenue + v.revenue, srn: s.srn + v.srn,
    cancelledResv: s.cancelledResv + v.cancelledResv, totalResv: s.totalResv + v.totalResv,
    anRn: s.anRn + v.anRn, anResv: s.anResv + v.anResv,
  }), emptyFacRaw());

/** 国別行 → 構成比付き CountrySliceRow（売上母数で割る）。 */
function withShare(rows: CountryRaw[], totalRev: number): CountrySliceRow[] {
  return rows.map((r) => ({ country: r.country, major: r.major, revenue: r.revenue, soldRoomNights: r.rooms, share: ratio(r.revenue, totalRev) }));
}

/** 国籍別ウィジェット（TOP10・不明・前年TOP10）を構築。不明はランキング対象外。 */
function buildNationalities(curRows: CountryRaw[], pyRows: CountryRaw[]): OverviewNationalities {
  const totalRev = curRows.reduce((s, r) => s + r.revenue, 0);
  const totalRooms = curRows.reduce((s, r) => s + r.rooms, 0);
  const known = curRows.filter((r) => r.major !== "不明");
  const unknownRow = curRows.find((r) => r.major === "不明") ?? null;
  const top10 = withShare(known.slice(0, 10), totalRev);
  const unknown = unknownRow ? withShare([unknownRow], totalRev)[0] : null;
  const pyTotalRev = pyRows.reduce((s, r) => s + r.revenue, 0);
  const previousYearTop10 = withShare(pyRows.filter((r) => r.major !== "不明").slice(0, 10), pyTotalRev);
  return { total: { revenue: totalRev, soldRoomNights: totalRooms }, top10, unknown, previousYearTop10 };
}

/** 国内/海外/不明の売上構成比。 */
function splitOf(rows: CountryRaw[], totRev: number): DomesticOverseasSplit[] {
  const labels: DomesticOverseasSplit["label"][] = ["日本", "海外", "不明"];
  return labels.map((label) => {
    const matched = rows.filter((r) => r.major === label);
    const revenue = matched.reduce((s, r) => s + r.revenue, 0);
    const rooms = matched.reduce((s, r) => s + r.rooms, 0);
    return { label, revenue, soldRoomNights: rooms, share: ratio(revenue, totRev) };
  });
}

function buildDomesticOverseas(curRows: CountryRaw[], pyRows: CountryRaw[]): OverviewDomesticOverseas {
  const curTot = curRows.reduce((s, r) => s + r.revenue, 0);
  const pyTot = pyRows.reduce((s, r) => s + r.revenue, 0);
  return { current: splitOf(curRows, curTot), previousYear: splitOf(pyRows, pyTot) };
}

function channelSlices(rows: ChannelRaw[], totRev: number): ChannelSliceRow[] {
  return rows.map((r) => ({ channel: r.channel, revenue: r.revenue, soldRoomNights: r.rooms, share: ratio(r.revenue, totRev) }));
}

function buildChannelsWidget(curRows: ChannelRaw[], pyRows: ChannelRaw[]): OverviewChannels {
  const totRev = curRows.reduce((s, r) => s + r.revenue, 0);
  const totRooms = curRows.reduce((s, r) => s + r.rooms, 0);
  const pyTotRev = pyRows.reduce((s, r) => s + r.revenue, 0);
  return {
    total: { revenue: totRev, soldRoomNights: totRooms },
    current: channelSlices(curRows, totRev),
    previousYear: channelSlices(pyRows, pyTotRev),
  };
}

export async function buildOverview(pool: Pool, f: DashboardFilters): Promise<OverviewResponse> {
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const useNet = f.taxMode === "net";
  const gid = await activeGroupId(pool);
  const period = f.period;
  const month = f.month;
  const year = f.year;

  // 施設SET解決（グループ所属でホワイトリスト化）。facilityIds 優先、無ければ単一facilityId(uuid)、'all'/未指定=全施設。
  const single = f.facilityId && f.facilityId !== "all" ? [f.facilityId] : null;
  const requested = f.facilityIds && f.facilityIds.length > 0 ? f.facilityIds : single;
  const facQ = await pool.query<{ id: string; name: string; area: string; display_order: number | null; spd: number | null }>(
    `select f.id, f.display_name name, coalesce(f.area_name,'') area, f.display_order,
            (select round(avg(rim.sellable_rooms_per_day))::int
               from app.room_inventory_months rim where rim.facility_id = f.id) spd
     from app.facilities f
     where f.group_id = $1::uuid and ($2::uuid[] is null or f.id = any($2::uuid[]))
     order by coalesce(f.display_order, 999999), f.display_name`,
    [gid, requested],
  );
  const facList = facQ.rows;
  const ids = facList.map((r) => r.id);

  const cur = boundsFor(period, year, month);
  const py = boundsFor(period, year - 1, month);

  const emptyHeat: OverviewHeat = { grain: period === "monthly" ? "day" : "month", current: [], previousYear: [] };
  if (ids.length === 0) {
    const empty: OverviewMetricSet = metricSet(emptyFacRaw());
    return {
      filters: f,
      scope: { facilityIds: [], facilityCount: 0 },
      totals: { current: empty, previousYear: empty, budget: null },
      perFacility: [],
      heatmap: emptyHeat,
      nationalities: { total: { revenue: 0, soldRoomNights: 0 }, top10: [], unknown: null, previousYearTop10: [] },
      domesticOverseas: { current: [], previousYear: [] },
      channels: { total: { revenue: 0, soldRoomNights: 0 }, current: [], previousYear: [] },
      stayNights: { current: [], previousYear: [] },
      budget: { hasData: false, revenueActual: 0, revenueBudget: null, achievementRate: null, soldRoomNightsActual: 0, soldRoomNightsBudget: null, perFacility: [] },
      generatedAt: new Date().toISOString(),
    };
  }

  const [
    curFac, pyFac, budFac,
    heatCurFac, heatPyFac,
    countryCurFac, countryPyFac,
    channelCurFac, channelPyFac,
    stayCurFac, stayPyFac,
  ] = await Promise.all([
    perFacilityYear(pool, ids, cur, revCol),
    perFacilityYear(pool, ids, py, revCol),
    budgetYear(pool, ids, cur, useNet),
    heatByFacility(pool, ids, cur, period, year, month, revCol),
    heatByFacility(pool, ids, py, period, year - 1, month, revCol),
    countryByFacility(pool, ids, cur, revCol),
    countryByFacility(pool, ids, py, revCol),
    channelByFacility(pool, ids, cur, revCol),
    channelByFacility(pool, ids, py, revCol),
    stayByFacility(pool, ids, cur, revCol),
    stayByFacility(pool, ids, py, revCol),
  ]);

  const heatGrain: "day" | "month" = period === "monthly" ? "day" : "month";

  // perFacility（KPI＋予算＋施設別ウィジェット）
  const perFacility: OverviewFacility[] = facList.map((fr) => {
    const c = curFac.get(fr.id) ?? emptyFacRaw();
    const p = pyFac.get(fr.id) ?? emptyFacRaw();
    const bd = budFac.get(fr.id);
    const budgetSet: OverviewMetricSet | null =
      bd && bd.n > 0
        ? {
            soldRoomNights: bd.rn,
            sellableRoomNights: bd.srn,
            revenue: bd.amt,
            guestCount: bd.guest,
            occupancyRate: ratio(bd.rn, bd.srn),
            adr: ratio(bd.amt, bd.rn),
            avgGuestsPerRoom: ratio(bd.guest, bd.rn),
            avgNights: null,
            cancelRate: null,
          }
        : null;

    const curCountry = countryCurFac.get(fr.id) ?? [];
    const pyCountry = countryPyFac.get(fr.id) ?? [];
    const curChannel = channelCurFac.get(fr.id) ?? [];
    const pyChannel = channelPyFac.get(fr.id) ?? [];

    return {
      facilityId: fr.id,
      name: fr.name,
      area: fr.area,
      displayOrder: fr.display_order,
      roomsPerDay: fr.spd ?? null,
      current: metricSet(c),
      previousYear: metricSet(p),
      budget: budgetSet,
      heatmap: { grain: heatGrain, current: heatCurFac.get(fr.id) ?? [], previousYear: heatPyFac.get(fr.id) ?? [] },
      nationalities: buildNationalities(curCountry, pyCountry),
      domesticOverseas: buildDomesticOverseas(curCountry, pyCountry),
      channels: buildChannelsWidget(curChannel, pyChannel),
      stayNights: { current: stayCurFac.get(fr.id) ?? [], previousYear: stayPyFac.get(fr.id) ?? [] },
    };
  });

  // totals（合算 → 占有母数で ratio 再計算）
  const curTot = sumFac([...curFac.values()]);
  const pyTot = sumFac([...pyFac.values()]);
  const budList = [...budFac.values()].filter((bd) => bd.n > 0);
  const budTotRaw = budList.reduce((s, v) => ({ amt: s.amt + v.amt, rn: s.rn + v.rn, guest: s.guest + v.guest, srn: s.srn + v.srn }), { amt: 0, rn: 0, guest: 0, srn: 0 });
  const budgetTotals: OverviewMetricSet | null =
    budList.length > 0
      ? {
          soldRoomNights: budTotRaw.rn,
          sellableRoomNights: budTotRaw.srn,
          revenue: budTotRaw.amt,
          guestCount: budTotRaw.guest,
          occupancyRate: ratio(budTotRaw.rn, budTotRaw.srn),
          adr: ratio(budTotRaw.amt, budTotRaw.rn),
          avgGuestsPerRoom: ratio(budTotRaw.guest, budTotRaw.rn),
          avgNights: null,
          cancelRate: null,
        }
      : null;

  // 予算達成率（合算＋施設別）: 実績=稼働分析売上 / 予算=budgets（税表示反映）。
  const perBudget: BudgetAchievementFacility[] = facList.map((fr) => {
    const actual = (curFac.get(fr.id) ?? emptyFacRaw()).revenue;
    const bd = budFac.get(fr.id);
    const rb = bd && bd.n > 0 ? bd.amt : null;
    return { facilityId: fr.id, name: fr.name, revenueActual: actual, revenueBudget: rb, achievementRate: rb != null ? ratio(actual, rb) : null };
  });

  // 合算ウィジェット（選択施設の施設別データをマージ）
  const heatCur = mergeHeat(heatCurFac, ids);
  const heatPy = mergeHeat(heatPyFac, ids);
  const countryCur = mergeCountry(countryCurFac, ids);
  const countryPy = mergeCountry(countryPyFac, ids);
  const channelCur = mergeChannel(channelCurFac, ids);
  const channelPy = mergeChannel(channelPyFac, ids);
  const stayCur = mergeStay(stayCurFac, ids);
  const stayPy = mergeStay(stayPyFac, ids);

  return {
    filters: f,
    scope: { facilityIds: ids, facilityCount: ids.length },
    totals: { current: metricSet(curTot), previousYear: metricSet(pyTot), budget: budgetTotals },
    perFacility,
    heatmap: { grain: heatGrain, current: heatCur, previousYear: heatPy },
    nationalities: buildNationalities(countryCur, countryPy),
    domesticOverseas: buildDomesticOverseas(countryCur, countryPy),
    channels: buildChannelsWidget(channelCur, channelPy),
    stayNights: { current: stayCur, previousYear: stayPy },
    budget: {
      hasData: budList.length > 0,
      revenueActual: curTot.revenue,
      revenueBudget: budgetTotals ? budgetTotals.revenue : null,
      achievementRate: budgetTotals ? ratio(curTot.revenue, budgetTotals.revenue) : null,
      soldRoomNightsActual: curTot.sold,
      soldRoomNightsBudget: budgetTotals ? budgetTotals.soldRoomNights : null,
      perFacility: perBudget,
    },
    generatedAt: new Date().toISOString(),
  };
}
