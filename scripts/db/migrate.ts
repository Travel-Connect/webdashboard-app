/**
 * supabase/migrations/*.sql を順に適用し、続けて seed.sql を流す。
 *   npx tsx scripts/db/migrate.ts
 * 秘密値は出力しない。
 */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, isConfigured } from "./load-env";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) {
  console.error("SUPABASE_DB_URL が未設定です");
  process.exit(1);
}

const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

async function run(label: string, sql: string) {
  process.stdout.write(`  ${label} ... `);
  await c.query(sql);
  console.log("OK");
}

async function main() {
  await c.connect();
  const dir = "supabase/migrations";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  console.log(`migrations (${files.length}):`);
  for (const f of files) await run(f, readFileSync(join(dir, f), "utf8"));
  console.log("seed:");
  await run("seed.sql", readFileSync("supabase/seed.sql", "utf8"));

  const t = await c.query(
    "select table_schema, count(*)::int n from information_schema.tables where table_schema=any($1) group by 1 order by 1",
    [["app", "ingest", "mart"]],
  );
  console.log("\ntables:", t.rows.map((r) => `${r.table_schema}=${r.n}`).join("  "));
  const fac = await c.query("select count(*)::int n from app.facilities");
  const fee = await c.query("select count(*)::int n from app.fee_adjustment_rules");
  const sf = await c.query("select count(*)::int n from app.source_facilities");
  console.log(`facilities=${fac.rows[0].n}  source_facilities=${sf.rows[0].n}  fee_rules=${fee.rows[0].n}`);
  await c.end();
}

main().catch(async (e) => {
  console.log("\nERROR:", (e as Error).message);
  try { await c.end(); } catch { /* noop */ }
  process.exit(1);
});
