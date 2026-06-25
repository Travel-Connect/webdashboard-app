/**
 * 修正点5/6 検証: 泊数分布(stay-nights)の ADR・同伴係数（占有母数基準）が
 * 稼働分析(occupancy)の 平均室単価・平均宿泊者数 と一致するかを実データで確認する。
 *
 *   NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/verify/occupancy-staynights-parity.ts [year]
 *
 * occupancy = mart.daily_facility_metrics（宿泊日基準）。
 * stay-nights = mart.stay_nights_distribution の occ_* 列（チェックイン月基準）。
 * 月基準の違い・dropna・年跨ぎ予約により厳密一致はしないが、年間総計はほぼ一致するはず。
 * 秘密値は出力しない。
 */
import { Client } from "pg";
import { loadEnv, isConfigured } from "../db/load-env";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) { console.error("SUPABASE_DB_URL 未設定"); process.exit(1); }
const YEAR = Number(process.argv[2] ?? 2026);
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const adr = (g: number, s: number) => { const r = ratio(g, s); return r == null ? "—" : String(Math.round(r)); };
const cf = (g: number, s: number) => { const r = ratio(g, s); return r == null ? "—" : r.toFixed(2); };
const pct = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? (((a - b) / b) * 100).toFixed(2) + "%" : "—");

async function main() {
  await c.connect();
  const start = `${YEAR}-01-01`, end = `${YEAR}-12-31`, mStart = `${YEAR}-01-01`, mEnd = `${YEAR}-12-01`;

  const facs = await c.query(
    `select id, display_name from app.facilities order by coalesce(display_order,999999), display_name`,
  );
  const targets = [{ id: null as string | null, display_name: "★ 全施設" }, ...facs.rows];

  console.log(`=== occupancy(稼働分析) vs stay-nights(泊数分布 occ-basis) ${YEAR}年・税込 ===`);
  console.log("施設 | ADR(占) ADR(泊) Δ | 同伴(占) 同伴(泊) Δ");
  let worstAdr = 0, worstCmp = 0;
  for (const f of targets) {
    const occ = (await c.query(
      `select coalesce(sum(sold_room_nights),0)::float8 sold, coalesce(sum(gross_amount),0)::float8 gross,
              coalesce(sum(guest_count),0)::float8 guest
         from mart.daily_facility_metrics
        where ($1::uuid is null or facility_id=$1) and stay_date between $2 and $3`,
      [f.id, start, end],
    )).rows[0];
    const sn = (await c.query(
      `select coalesce(sum(occ_sold_room_nights),0)::float8 sold, coalesce(sum(occ_gross_amount),0)::float8 gross,
              coalesce(sum(occ_guest_count),0)::float8 guest
         from mart.stay_nights_distribution
        where ($1::uuid is null or facility_id=$1) and checkin_month between $2 and $3`,
      [f.id, mStart, mEnd],
    )).rows[0];
    const aOcc = ratio(occ.gross, occ.sold), aSn = ratio(sn.gross, sn.sold);
    const cOcc = ratio(occ.guest, occ.sold), cSn = ratio(sn.guest, sn.sold);
    if (occ.sold > 0 && sn.sold > 0) {
      worstAdr = Math.max(worstAdr, Math.abs(((aSn! - aOcc!) / aOcc!) * 100));
      worstCmp = Math.max(worstCmp, Math.abs(((cSn! - cOcc!) / cOcc!) * 100));
    }
    if (occ.sold === 0 && sn.sold === 0) continue;
    console.log(
      `${f.display_name} | ${adr(occ.gross, occ.sold)} ${adr(sn.gross, sn.sold)} ${pct(aSn, aOcc)} | ` +
      `${cf(occ.guest, occ.sold)} ${cf(sn.guest, sn.sold)} ${pct(cSn, cOcc)}`,
    );
  }
  console.log(`\n最大乖離: ADR ${worstAdr.toFixed(2)}%  同伴係数 ${worstCmp.toFixed(2)}%`);
  console.log("（月基準差・dropna・年跨ぎによる残差。小さければ統一成功）");
  await c.end();
}
main().catch(async (e) => { console.log("ERROR:", (e as Error).message); try { await c.end(); } catch { /* noop */ } process.exit(1); });
