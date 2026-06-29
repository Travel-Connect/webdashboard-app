/**
 * 稼働分析の予算比較(compareWith=budget)を実 buildOccupancy で検証。
 * 直接 pg 接続で実行（Next を経由しない）。
 *   npx tsx scripts/verify/occupancy-budget-check.ts
 */
import { Pool } from "pg";
import { loadEnv, isConfigured } from "../db/load-env";
import { buildOccupancy } from "../../lib/api/occupancy";
import type { DashboardFilters } from "../../lib/api/types";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) {
  console.error("SUPABASE_DB_URL 未設定");
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const AQUA = "496e4842-9164-455e-a2b8-12e07b8ffa55";

async function run(label: string, f: DashboardFilters) {
  const res = await buildOccupancy(pool, f);
  const c = res.comparison;
  console.log(`\n[${label}] basis=${c?.basis ?? "(none)"} rowsLen=${c?.rows.length ?? "-"}`);
  console.log(`  current 売上=${Math.round(res.summary.roomRevenue)} 稼働率=${res.summary.occupancyRate}`);
  for (const m of c?.metrics ?? []) {
    console.log(`  ${m.metric}: cur=${m.current} base=${m.baseline} diff=${m.diff} rate=${m.rate}`);
  }
  return c;
}

async function main() {
  // 1) 全施設 2026 年間 予算
  const c1 = await run("all/2026/yearly/budget", {
    facilityId: "all", year: 2026, period: "yearly", taxMode: "gross", compareWith: "budget",
  });

  // 直接 budgets 合計で baseline を突合
  const gid = (await pool.query("select id from app.groups where slug='cordio'")).rows[0].id;
  const direct = await pool.query(
    `select coalesce(sum(budget_amount),0)::float8 amt,
            coalesce(sum(budget_room_nights),0)::int rn
     from app.budgets
     where date_part('year', month)=2026
       and facility_id in (select id from app.facilities where group_id=$1)`,
    [gid],
  );
  const rev1 = c1?.metrics.find((m) => m.metric === "roomRevenue");
  const sold1 = c1?.metrics.find((m) => m.metric === "soldRoomNights");
  console.log(`\n  直接budgets合計 amt=${direct.rows[0].amt} rn=${direct.rows[0].rn}`);
  console.log(`  突合 売上予算: API=${rev1?.baseline} vs direct=${direct.rows[0].amt} => ${rev1?.baseline === direct.rows[0].amt ? "±0 OK" : "MISMATCH"}`);
  console.log(`  突合 室数予算: API=${sold1?.baseline} vs direct=${direct.rows[0].rn} => ${sold1?.baseline === direct.rows[0].rn ? "±0 OK" : "MISMATCH"}`);

  // 2) アクアパレス北谷 2026-05 月間 予算（monthly パス）
  await run("aqua/2026-05/monthly/budget", {
    facilityId: AQUA, year: 2026, month: 5, period: "monthly", taxMode: "gross", compareWith: "budget",
  });

  // 3) 予算未登録年（2024）→ comparison=null を期待
  const c3 = await run("aqua/2024/yearly/budget", {
    facilityId: AQUA, year: 2024, period: "yearly", taxMode: "gross", compareWith: "budget",
  });
  console.log(`  2024予算なし: comparison=${c3 === null ? "null OK" : "NOT null (要確認)"}`);

  // 4) 前年実績がリグレッションしていないこと（basis=previous_year, metrics 6, rows あり）
  const c4 = await run("aqua/2026-05/monthly/previous_year", {
    facilityId: AQUA, year: 2026, month: 5, period: "monthly", taxMode: "gross", compareWith: "previous_year",
  });
  console.log(`  前年実績: metrics=${c4?.metrics.length} rows=${c4?.rows.length} (>0 期待)`);

  await pool.end();
}

main().catch(async (e) => {
  console.error("ERROR:", (e as Error).message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
