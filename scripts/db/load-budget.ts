/**
 * コルディオレポートNEW.xlsm「予算表」→ app.room_inventory_months(販売可能室数=稼働日数)
 * ＋ app.budgets(売上予算税込 / 室数予算=使用客室数)。コルディオのみ・2025/2026。
 *   npx tsx scripts/db/load-budget.ts ["<xlsm path>"]
 * 施設キー: アクアパレス北谷の行は「施設名キー(アクアパレス)」(本体/結の家/ANNEX)、他は「施設名」列。
 * minpakuIN 実績の無い テラスガーデン北谷美浜リゾート / プールヴィラ恩納村 は除外（ユーザー決定）。
 */
import * as XLSX from "xlsx";
import { Client } from "pg";
import { loadEnv, isConfigured } from "./load-env";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) { console.error("SUPABASE_DB_URL 未設定"); process.exit(1); }
const XLSM = process.argv[2] ??
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\コルディオレポートNEW.xlsm";

// 予算表の施設名 → app.facilities.facility_code（表記差を吸収。除外2施設は含めない）
const NAME_TO_CODE: Record<string, string> = {
  "アクアパレス北谷": "aquapalace",
  "結の家": "yuinoie",
  "アクアパレス北谷ANNEX（クローバー桑江）": "aquapalace_annex",
  "エルズイン那覇": "elsinn_naha",
  "サンセットリゾートカンプー": "Canpou",
  "シティコンド ジョイントホーム那覇": "joint",
  "ファミリーコンド 北谷ヒルズ": "chatanhills",
  "プールヴィラ屋我地島": "villayagaji",
  "プールヴィラ古宇利島": "villakouri",
  "プールヴィラ今泊": "imadomari",
  "プライベートコンド 古宇利島": "kondokouri",
  "プライベートコンド北谷 ジャーガル": "jyagal",
  "ミュージックホテルコザ": "koza",
  "ヤンバルプールコンド屋我地島": "poolcondyagaji",
  "畳の宿那覇壺屋": "tataminoyadonaha",
  "琉心 恩納": "rusin",
};

function serialToMonthStart(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function daysInMonth(ymd: string): number {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const wb = XLSX.readFile(XLSM, { bookVBA: false });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["予算表"]);
  await c.connect();
  const fac = await c.query("select facility_code, id from app.facilities");
  const codeToId = new Map(fac.rows.map((r) => [r.facility_code, r.id]));

  const agg = new Map<string, { facilityId: string; month: string; sellable: number; budRev: number; budRooms: number }>();
  let skipped = 0;
  for (const r of rows) {
    const sName = String(r["施設名"] ?? "").trim();
    const keyName = String(r["施設名キー(アクアパレス)"] ?? "").trim();
    const name = sName === "アクアパレス北谷" ? keyName : sName;
    const code = NAME_TO_CODE[name];
    const facilityId = code ? codeToId.get(code) : undefined;
    if (!facilityId) { skipped++; continue; }
    const month = serialToMonthStart(Number(r["年月初日"]));
    const k = `${facilityId}|${month}`;
    const e = agg.get(k) ?? { facilityId, month, sellable: 0, budRev: 0, budRooms: 0 };
    e.sellable += Number(r["稼働日数"]) || 0;
    e.budRev += Number(r["売上予算(税込)"]) || 0;
    e.budRooms += Number(r["使用客室数"]) || 0;
    agg.set(k, e);
  }
  console.log(`予算表 ${rows.length}行 → ${agg.size} (施設×月) / 除外行 ${skipped}`);

  await c.query("truncate app.room_inventory_months");
  await c.query("truncate app.budgets");
  for (const e of agg.values()) {
    const days = daysInMonth(e.month);
    await c.query(
      "insert into app.room_inventory_months (facility_id, month, sellable_rooms_per_day, sellable_room_nights) values ($1,$2,$3,$4)",
      [e.facilityId, e.month, Math.round(e.sellable / days), Math.round(e.sellable)],
    );
    await c.query(
      "insert into app.budgets (facility_id, month, budget_room_type, budget_amount, budget_room_nights) values ($1,$2,'',$3,$4)",
      [e.facilityId, e.month, Math.round(e.budRev), Math.round(e.budRooms)],
    );
  }
  const ri = await c.query("select count(*)::int n, coalesce(sum(sellable_room_nights),0)::int s from app.room_inventory_months");
  const bg = await c.query("select count(*)::int n, coalesce(sum(budget_amount),0)::bigint s from app.budgets");
  console.log(`room_inventory_months: ${ri.rows[0].n}行 / 販売可能室数合計 ${ri.rows[0].s.toLocaleString()}`);
  console.log(`budgets: ${bg.rows[0].n}行 / 売上予算(税込)合計 ${Number(bg.rows[0].s).toLocaleString()}`);
  // 稼働率スポット: アクアパレス北谷 2025-01（実績 sold / 予算 sellable）
  const occ = await c.query(`
    select f.display_name, ri.sellable_room_nights sellable,
      coalesce((select sum(d.sold_room_nights) from mart.daily_facility_metrics d
                where d.facility_id=ri.facility_id and date_trunc('month',d.stay_date)=ri.month),0)::int sold
    from app.room_inventory_months ri join app.facilities f on f.id=ri.facility_id
    where ri.month=date '2025-01-01' and f.facility_code='aquapalace'`);
  if (occ.rows[0]) console.log(`spot稼働率(アクアパレス北谷 2025-01): sold ${occ.rows[0].sold} / sellable ${occ.rows[0].sellable} = ${(occ.rows[0].sold / occ.rows[0].sellable * 100).toFixed(1)}%`);
  await c.end();
}
main().catch(async (e) => { console.log("ERROR:", (e as Error).message); try { await c.end(); } catch {} process.exit(1); });
