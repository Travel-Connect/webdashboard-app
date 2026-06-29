/**
 * 部屋タイプ別分析の「月間」明細(monthlyDetail)を実 buildRoomTypes で検証。
 * 当月×前年同月×先月の populate / 売上シェア合計≈100% / 平均泊数の妥当性を確認。
 * 直接 pg 接続で実行（Next を経由しない）。
 *   npx tsx scripts/verify/roomtypes-monthly-check.ts
 */
import { Pool } from "pg";
import { loadEnv, isConfigured } from "../db/load-env";
import { buildRoomTypes } from "../../lib/api/roomtypes";
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

const r0 = (v: number | null | undefined) => (v == null ? "-" : String(Math.round(v)));
const pct = (v: number | null | undefined) => (v == null ? "-" : (v * 100).toFixed(1) + "%");

async function run(f: DashboardFilters) {
  const res = await buildRoomTypes(pool, f);
  const d = res.monthlyDetail;
  console.log(`\n[${f.facilityId}/${f.year}-${String(f.month).padStart(2, "0")}] monthlyDetail rows=${d?.rows.length ?? "-"}`);
  if (!d) return;
  const shareSum = d.rows.reduce((s, r) => s + (r.revenueShare ?? 0), 0);
  console.log(`  売上シェア率合計=${(shareSum * 100).toFixed(1)}%  (≈100 期待)`);
  for (const r of d.rows.slice(0, 8)) {
    console.log(
      `  ${r.roomType.slice(0, 20).padEnd(20)} 売上=${r0(r.revenue)} 室=${r.soldRoomNights} 前年室=${r0(r.soldRoomNightsPrevYear)} 先月室=${r0(r.soldRoomNightsPrevMonth)} ` +
        `ADR=${r0(r.adr)} 前年=${r0(r.adrPrevYear)} 先月=${r0(r.adrPrevMonth)} 同伴=${r.companion?.toFixed(2) ?? "-"} 平均泊=${r.avgNights?.toFixed(2) ?? "-"} ` +
        `稼働=${pct(r.occupancy)} 前年=${pct(r.occupancyPrevYear)} 先月=${pct(r.occupancyPrevMonth)}`,
    );
  }
  const t = d.total;
  console.log(`  (合計) 売上=${r0(t.revenue)} 室=${t.soldRoomNights} 前年室=${r0(t.soldRoomNightsPrevYear)} 先月室=${r0(t.soldRoomNightsPrevMonth)} ADR=${r0(t.adr)} 同伴=${t.companion?.toFixed(2) ?? "-"} 平均泊=${t.avgNights?.toFixed(2) ?? "-"}`);
}

async function main() {
  // 引数指定（facilityId year month）があれば単発、なければ既定3ケース
  const [fid, yStr, mStr] = process.argv.slice(2);
  if (fid && yStr && mStr) {
    await run({ facilityId: fid, year: Number(yStr), month: Number(mStr), period: "monthly", taxMode: "gross" });
  } else {
    await run({ facilityId: "all", year: 2025, month: 5, period: "monthly", taxMode: "gross" });
    await run({ facilityId: "all", year: 2026, month: 5, period: "monthly", taxMode: "gross" });
    await run({ facilityId: "all", year: 2026, month: 1, period: "monthly", taxMode: "gross" }); // 先月=2025-12 跨ぎ
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error("ERROR:", (e as Error).message);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
