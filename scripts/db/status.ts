/**
 * live Supabase のデータ状況サマリ（秘密値は出力しない）。
 *   npx tsx scripts/db/status.ts
 */
import { Client } from "pg";
import { loadEnv, isConfigured } from "./load-env";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) { console.error("SUPABASE_DB_URL 未設定"); process.exit(1); }
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await c.connect();
  const one = async (s: string) => (await c.query(s)).rows[0];

  const can = await c.query("select source_system, count(*)::int n from app.reservation_stay_nights group by 1 order by 1");
  console.log("canonical:", can.rows.map((r) => `${r.source_system}=${r.n.toLocaleString()}`).join("  ") || "(空)");

  const mart: string[] = [];
  for (const t of ["daily_facility_metrics", "monthly_channel_metrics", "monthly_room_type_metrics", "monthly_country_metrics", "stay_nights_distribution", "booking_curve_monthly"]) {
    mart.push(`${t.replace("_metrics", "").replace("monthly_", "")}=${(await one(`select count(*)::int n from mart.${t}`)).n}`);
  }
  console.log("mart:", mart.join("  "));

  const masters: string[] = [];
  for (const t of ["facilities", "source_facilities", "room_type_mappings", "channel_mappings", "country_mappings", "fee_adjustment_rules", "room_inventory_months", "budgets"]) {
    masters.push(`${t}=${(await one(`select count(*)::int n from app.${t}`)).n}`);
  }
  console.log("master:", masters.join("  "));

  await c.end();
}
main().catch(async (e) => { console.log("ERROR:", (e as Error).message); try { await c.end(); } catch {} process.exit(1); });
