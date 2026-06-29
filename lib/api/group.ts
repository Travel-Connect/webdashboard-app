import type { Pool } from "pg";

/* ============================================================
   group.ts — アクティブグループ解決（マルチテナント・ステップ2）。
   当面は env `ACTIVE_GROUP_SLUG`（既定 'cordio'）で単一グループにスコープ。
   認証ステップでは URL slug / ユーザーセッション由来に置き換える。
   返す id は app.groups 由来の検証済み uuid（SQLに直接埋めても安全）。
   ============================================================ */

const SLUG = process.env.ACTIVE_GROUP_SLUG || "cordio";

let cache: { id: string; slug: string; name: string } | null = null;

export async function activeGroup(pool: Pool): Promise<{ id: string; slug: string; name: string }> {
  if (cache) return cache;
  const r = await pool.query<{ id: string; slug: string; name: string }>(
    "select id, slug, name from app.groups where slug = $1 and is_active limit 1",
    [SLUG],
  );
  if (!r.rows[0]) throw new Error(`active group not found: ${SLUG}`);
  cache = r.rows[0];
  return cache;
}

/** アクティブグループの id（uuid）。 */
export async function activeGroupId(pool: Pool): Promise<string> {
  return (await activeGroup(pool)).id;
}

/** mart クエリ用の施設スコープ SQL 断片（`and ${scope}` で結合）。gid は検証済み uuid。 */
export function facilityScopeSql(gid: string, col = "facility_id"): string {
  return `${col} in (select id from app.facilities where group_id = '${gid}')`;
}
