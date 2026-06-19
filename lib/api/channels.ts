import type { Pool } from "pg";
import type { ChannelRow, ChannelsResponse, ChannelSummary, DashboardFilters } from "./types";
import { monthBounds, ratio } from "./period";

async function channelMap(pool: Pool, f: DashboardFilters, year: number): Promise<Map<string, { sold: number; revenue: number }>> {
  const facId = f.facilityId === "all" ? null : f.facilityId;
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const [a, b] = monthBounds(f.period, year, f.month);
  const q = await pool.query(
    `select channel,
       coalesce(sum(sold_room_nights),0)::float8 sold,
       coalesce(sum(${revCol}),0)::float8 revenue
     from mart.monthly_channel_metrics
     where ($1::uuid is null or facility_id = $1) and stay_month between $2 and $3
     group by channel`,
    [facId, a, b],
  );
  return new Map(q.rows.map((r) => [r.channel as string, { sold: Number(r.sold), revenue: Number(r.revenue) }]));
}

// GET /api/dashboard/channels — 経路分析（raw channel グルーピング、構成比、任意で前年比）
export async function buildChannels(pool: Pool, f: DashboardFilters): Promise<ChannelsResponse> {
  const cur = await channelMap(pool, f, f.year);
  const prev = f.compareWith === "previous_year" ? await channelMap(pool, f, f.year - 1) : null;

  const totalRevenue = [...cur.values()].reduce((s, v) => s + v.revenue, 0);
  const totalSold = [...cur.values()].reduce((s, v) => s + v.sold, 0);

  const rows: ChannelRow[] = [...cur.entries()]
    .map(([channel, v]) => {
      const row: ChannelRow = {
        channel,
        revenue: v.revenue,
        soldRoomNights: v.sold,
        compositionRate: ratio(v.revenue, totalRevenue),
      };
      if (prev) {
        const pr = prev.get(channel)?.revenue ?? 0;
        row.previousYearRevenue = pr;
        row.yoyDiff = v.revenue - pr;
        row.yoyRate = pr !== 0 ? v.revenue / pr : null;
      }
      return row;
    })
    .sort((x, y) => y.revenue - x.revenue);

  const summary: ChannelSummary = { totalRevenue, totalSoldRoomNights: totalSold, channelCount: rows.length };
  return { filters: f, summary, rows, generatedAt: new Date().toISOString() };
}
