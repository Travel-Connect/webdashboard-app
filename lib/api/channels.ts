import type { Pool } from "pg";
import type {
  ChannelMatrix,
  ChannelMatrixColumn,
  ChannelMatrixRow,
  ChannelRow,
  ChannelsResponse,
  ChannelSummary,
  DashboardFilters,
} from "./types";
import { monthBounds, ratio } from "./period";
import { activeGroupId } from "./group";

/* ============================================================
   経路分析 — 既存Excel「経路別実績一覧」踏襲のクロスタブ集計。
   monthly: 経路 × 施設（全施設横断・エリアグループ列）
   yearly : 経路 × 12ヶ月（選択施設 or 全施設）
   mart.monthly_channel_metrics の grain = (facility_id, stay_month, channel)。
   ============================================================ */

/** monthly view: 経路 × 施設。列は display_order を持つ「現行レポート対象施設」の
 *  固定セット（その月に売上が無い施設も 0 で常時表示＝Excel と同じ列構成）。
 *  列順・エリア順は display_order 昇順から導出。順序はマスタで変更可。 */
async function facilityMatrix(
  pool: Pool,
  f: DashboardFilters,
  year: number,
): Promise<{ matrix: ChannelMatrix; sold: number }> {
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const [a, b] = monthBounds(f.period, year, f.month);
  const gid = await activeGroupId(pool);

  // 1) 固定の列セット = アクティブグループの施設（売上有無に依らず常時表示）
  const fac = await pool.query<{ id: string; display_name: string; area: string }>(
    `select id, display_name, coalesce(area_name,'') area
       from app.facilities
      where group_id = '${gid}'
      order by coalesce(display_order, 999999), display_name`,
  );
  const columns: ChannelMatrixColumn[] = fac.rows.map((r) => ({
    key: r.id,
    label: r.display_name,
    group: r.area,
  }));
  const facIds = new Set(fac.rows.map((r) => r.id));

  // 2) 経路×施設の売上（レポート対象施設のみ）。欠損セルは 0 のまま。
  const q = await pool.query<{ facility_id: string; channel: string; revenue: number; sold: number }>(
    `select m.facility_id, m.channel,
       coalesce(sum(m.${revCol}),0)::float8 revenue,
       coalesce(sum(m.sold_room_nights),0)::float8 sold
     from mart.monthly_channel_metrics m
     join app.facilities f on f.id = m.facility_id
     where m.stay_month between $1 and $2
       and f.group_id = '${gid}'
     group by m.facility_id, m.channel`,
    [a, b],
  );

  const chan = new Map<string, ChannelMatrixRow>();
  let grand = 0;
  let grandSold = 0;
  for (const r of q.rows) {
    if (!facIds.has(r.facility_id)) continue;
    const rev = Number(r.revenue);
    let row = chan.get(r.channel);
    if (!row) {
      row = { channel: r.channel, total: 0, cells: {} };
      chan.set(r.channel, row);
    }
    row.cells[r.facility_id] = (row.cells[r.facility_id] ?? 0) + rev;
    row.total += rev;
    grand += rev;
    grandSold += Number(r.sold);
  }

  const rows = [...chan.values()].sort((x, y) => y.total - x.total);
  return { matrix: { columnKind: "facility", columns, rows, grandTotal: grand }, sold: grandSold };
}

/** yearly view: 経路 × 12ヶ月（facilityId を尊重）。 */
async function monthMatrix(
  pool: Pool,
  f: DashboardFilters,
  year: number,
  groupLabel: string,
): Promise<{ matrix: ChannelMatrix; sold: number }> {
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const [a, b] = monthBounds("yearly", year);
  const gid = await activeGroupId(pool);
  const q = await pool.query<{ mon: number; channel: string; revenue: number; sold: number }>(
    `select extract(month from m.stay_month)::int mon, m.channel,
       coalesce(sum(m.${revCol}),0)::float8 revenue,
       coalesce(sum(m.sold_room_nights),0)::float8 sold
     from mart.monthly_channel_metrics m
     join app.facilities f on f.id = m.facility_id
     where m.stay_month between $1 and $2
       and f.group_id = '${gid}'
       and ($3::uuid is null or m.facility_id = $3)
     group by mon, m.channel`,
    [a, b, facId],
  );

  const chan = new Map<string, ChannelMatrixRow>();
  let grand = 0;
  let grandSold = 0;
  for (const r of q.rows) {
    const rev = Number(r.revenue);
    const mk = String(r.mon);
    let row = chan.get(r.channel);
    if (!row) {
      row = { channel: r.channel, total: 0, cells: {} };
      chan.set(r.channel, row);
    }
    row.cells[mk] = (row.cells[mk] ?? 0) + rev;
    row.total += rev;
    grand += rev;
    grandSold += Number(r.sold);
  }

  const columns: ChannelMatrixColumn[] = Array.from({ length: 12 }, (_, i) => ({
    key: String(i + 1),
    label: `${i + 1}月`,
  }));
  const rows = [...chan.values()].sort((x, y) => y.total - x.total);
  return { matrix: { columnKind: "month", groupLabel, columns, rows, grandTotal: grand }, sold: grandSold };
}

// GET /api/dashboard/channels — 経路分析（クロスタブ matrix + 任意で前年 matrix）
export async function buildChannels(pool: Pool, f: DashboardFilters): Promise<ChannelsResponse> {
  const isMonthly = f.period === "monthly";

  let facName = "全施設";
  if (f.facilityId !== "all") {
    const fr = await pool.query<{ display_name: string }>(
      "select display_name from app.facilities where id = $1",
      [f.facilityId],
    );
    facName = fr.rows[0]?.display_name ?? "施設";
  }

  const build = (year: number) =>
    isMonthly
      ? facilityMatrix(pool, f, year)
      : monthMatrix(pool, f, year, `${facName} · ${year}年`);

  const cur = await build(f.year);
  const matrix = cur.matrix;
  const matrixPrevious =
    f.compareWith === "previous_year" ? (await build(f.year - 1)).matrix : null;

  const totalRevenue = matrix.grandTotal;
  const rows: ChannelRow[] = matrix.rows.map((ch) => ({
    channel: ch.channel,
    revenue: ch.total,
    soldRoomNights: 0,
    compositionRate: ratio(ch.total, totalRevenue),
  }));
  const summary: ChannelSummary = {
    totalRevenue,
    totalSoldRoomNights: cur.sold,
    channelCount: rows.length,
  };

  return { filters: f, summary, rows, matrix, matrixPrevious, generatedAt: new Date().toISOString() };
}
