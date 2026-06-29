/**
 * Supabase 接続チェック。秘密値は一切表示しない。
 *   npx tsx scripts/db/check.ts
 */
import { Client } from "pg";
import { loadEnv, isConfigured } from "./load-env";

loadEnv();

const NEEDED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
];
console.log("=== .env.local 設定状況（値は非表示）===");
for (const k of NEEDED) console.log(`  ${isConfigured(k) ? "✅" : "❌"} ${k}`);

async function main() {
  if (!isConfigured("SUPABASE_DB_URL")) {
    console.log("\nSUPABASE_DB_URL が未設定です。接続チェックを中止。");
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    const info = await c.query("select current_database() db, current_user usr, version() v");
    console.log("\n=== 接続OK ===");
    console.log("  database:", info.rows[0].db, "/ user:", info.rows[0].usr);
    console.log("  pg:", String(info.rows[0].v).split(",")[0]);
    const sch = await c.query(
      "select schema_name from information_schema.schemata where schema_name = any($1) order by 1",
      [["app", "ingest", "mart"]],
    );
    console.log("  our schemas:", sch.rows.map((r) => r.schema_name).join(", ") || "(まだ無し)");
    const tbl = await c.query(
      "select count(*)::int n from information_schema.tables where table_schema = any($1)",
      [["app", "ingest", "mart"]],
    );
    console.log("  our tables:", tbl.rows[0].n);
  } catch (e) {
    console.log("\n=== 接続NG ===");
    console.log("  error:", (e as Error).message);
    console.log("  ヒント: 直接接続(db.<ref>.supabase.co:5432)が IPv4 環境で繋がらない場合は、");
    console.log("         Supabase の Connection string → 'Session pooler'(IPv4) の URI を SUPABASE_DB_URL に使ってください。");
    process.exit(1);
  } finally {
    await c.end();
  }
}
main();
