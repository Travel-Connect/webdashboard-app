import { Pool, types } from "pg";

/**
 * サーバ専用の Postgres 接続プール（dashboard API が mart を読む）。
 * SUPABASE_DB_URL は server-only。ブラウザに出さない。
 * ※ 初期実装は直接 pg 接続。将来は supabase-js + RLS(ユーザーセッション) へ移行予定。
 */
// DATE(OID 1082) は 'YYYY-MM-DD' 文字列のまま返す（Date化による JST タイムゾーンずれを防ぐ）
types.setTypeParser(1082, (v) => v);

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) throw new Error("SUPABASE_DB_URL is not set");
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 5 });
  }
  return pool;
}
