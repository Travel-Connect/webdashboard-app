/**
 * 総合ダッシュボード overview を実 buildOverview で検証（直接 pg 接続）。
 *   npx tsx scripts/verify/overview-check.ts
 */
import { Pool } from "pg";
import { loadEnv, isConfigured } from "../db/load-env";
import { buildOverview } from "../../lib/api/overview";
import type { DashboardFilters } from "../../lib/api/types";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) { console.error("SUPABASE_DB_URL 未設定"); process.exit(1); }
const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const r0 = (v: number | null | undefined) => (v == null ? "-" : String(Math.round(v)));
const pc = (v: number | null | undefined) => (v == null ? "-" : (v * 100).toFixed(1) + "%");

async function run(label: string, f: DashboardFilters) {
  const res = await buildOverview(pool, f);
  console.log(`\n[${label}] 施設数=${res.scope.facilityCount}`);
  const t = res.totals.current, p = res.totals.previousYear, b = res.totals.budget;
  console.log(`  合算 売上=${r0(t.revenue)} 室=${r0(t.soldRoomNights)} 稼働=${pc(t.occupancyRate)} ADR=${r0(t.adr)} 同伴=${t.avgGuestsPerRoom?.toFixed(2)} 平均泊=${t.avgNights?.toFixed(2)} ｷｬﾝｾﾙ率=${pc(t.cancelRate)}`);
  console.log(`  前年 売上=${r0(p.revenue)} 室=${r0(p.soldRoomNights)} / 予算 売上=${b ? r0(b.revenue) : "なし"} 達成率=${pc(res.budget.achievementRate)}`);
  console.log(`  heatmap(${res.heatmap.grain}) cur=${res.heatmap.current.length}cells py=${res.heatmap.previousYear.length}`);
  console.log(`  国籍TOP10=${res.nationalities.top10.length}件 1位=${res.nationalities.top10[0]?.country}(${pc(res.nationalities.top10[0]?.share)}) 不明=${res.nationalities.unknown ? pc(res.nationalities.unknown.share) : "-"}`);
  console.log(`  国内海外: ${res.domesticOverseas.current.map((s) => `${s.label}${pc(s.share)}`).join(" / ")}`);
  console.log(`  経路=${res.channels.current.length}件 1位=${res.channels.current[0]?.channel}(${pc(res.channels.current[0]?.share)})`);
  for (const fac of res.perFacility.slice(0, 3)) {
    const c = fac.current;
    console.log(`   - ${fac.name.slice(0, 14).padEnd(14)} 室${fac.roomsPerDay ?? "?"} 売上=${r0(c.revenue)} 稼働=${pc(c.occupancyRate)} ADR=${r0(c.adr)} 平均泊=${c.avgNights?.toFixed(2)} ｷｬﾝｾﾙ=${pc(c.cancelRate)} 予算=${fac.budget ? r0(fac.budget.revenue) : "なし"}`);
  }
}

async function main() {
  await run("all/2026-06/monthly/gross", { facilityId: "all", year: 2026, month: 6, period: "monthly", taxMode: "gross" });
  await run("all/2026/yearly/gross", { facilityId: "all", year: 2026, period: "yearly", taxMode: "gross" });
  await pool.end();
}
main().catch(async (e) => { console.error("ERROR:", (e as Error).message); try { await pool.end(); } catch {} process.exit(1); });
