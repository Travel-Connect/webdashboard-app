/**
 * dashboard API ビルダの smoke（実DB・秘密非出力）。
 *   npx tsx scripts/api/smoke.ts
 */
import { Client } from "pg";
import { loadEnv } from "../db/load-env";
import { getPool } from "../../lib/db/pool";
import { buildOccupancy } from "../../lib/api/occupancy";

loadEnv();

async function facId(code: string): Promise<string> {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("select id from app.facilities where facility_code=$1", [code]);
  await c.end();
  return r.rows[0].id;
}
const pct = (v: number | null) => (v == null ? "-" : (v * 100).toFixed(1) + "%");
const yen = (v: number | null) => (v == null ? "-" : Math.round(v).toLocaleString());

async function main() {
  const pool = getPool();
  const aqua = await facId("aquapalace");

  const r1 = await buildOccupancy(pool, { facilityId: aqua, year: 2025, month: 1, period: "monthly", taxMode: "gross" });
  const s = r1.summary;
  console.log("=== アクアパレス北谷 2025-01 (monthly, 税込) ===");
  console.log(`sold=${s.soldRoomNights} sellable=${s.sellableRoomNights} 稼働率=${pct(s.occupancyRate)} 売上=${yen(s.roomRevenue)} ADR=${yen(s.adr)} RevPAR=${yen(s.revpar)} 客単価=${yen(s.guestUnitPrice)} 平均人数=${s.avgGuestsPerRoom?.toFixed(2)}`);
  console.log(`日別rows=${r1.rows.length} 先頭=${r1.rows[0]?.date} (sold=${r1.rows[0]?.soldRoomNights} 稼働=${pct(r1.rows[0]?.occupancyRate ?? null)})`);

  const r2 = await buildOccupancy(pool, { facilityId: aqua, year: 2025, month: 1, period: "monthly", taxMode: "gross", compareWith: "previous_year" });
  console.log("\n=== 同上 vs 前年(2024-01) ===");
  console.log(r2.comparison?.metrics.map((m) => `${m.metric}: ${m.current?.toLocaleString() ?? "-"} vs ${m.baseline?.toLocaleString() ?? "-"} (${m.rate != null ? (m.rate * 100).toFixed(0) + "%" : "-"})`).join("\n"));

  await pool.end();
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
