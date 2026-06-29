/**
 * CSV seed（国分類・チャネル）を DB に投入。
 *   npx tsx scripts/db/seed-csv.ts
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { loadEnv, isConfigured } from "./load-env";
import { decodeUtf8, parseCsv, toRecords } from "../../lib/adapters/shared";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) {
  console.error("SUPABASE_DB_URL 未設定");
  process.exit(1);
}
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

function read(path: string) {
  return toRecords(parseCsv(decodeUtf8(new Uint8Array(readFileSync(path))))).records;
}

async function main() {
  await c.connect();

  const countries = read("supabase/seed/country_mappings.csv");
  for (const r of countries) {
    const p = r.payload;
    await c.query(
      "insert into app.country_mappings (country_raw, country_normalized, country_major, country_middle) values ($1,$2,$3,$4) on conflict (country_raw) do nothing",
      [p.country_raw, p.country_normalized, p.country_major, p.country_middle],
    );
  }

  const channels = read("supabase/seed/channel_mappings.csv");
  for (const r of channels) {
    const p = r.payload;
    await c.query(
      "insert into app.channel_mappings (source_system, channel_raw, channel_normalized, channel_group, is_active) values ($1,$2,$3,$4,$5) on conflict (source_system, channel_raw) do nothing",
      [p.source_system, p.channel_raw, p.channel_normalized, p.channel_group, p.is_active === "true"],
    );
  }

  const cc = await c.query("select count(*)::int n from app.country_mappings");
  const ch = await c.query("select count(*)::int n from app.channel_mappings");
  console.log(`country_mappings=${cc.rows[0].n}  channel_mappings=${ch.rows[0].n}`);
  await c.end();
}
main().catch(async (e) => {
  console.log("ERROR:", (e as Error).message);
  try { await c.end(); } catch { /* noop */ }
  process.exit(1);
});
