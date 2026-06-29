/**
 * 部屋タイプ別 客室数マスタ app.room_type_inventory の投入ツール。
 *
 *   npx tsx scripts/db/room-type-inventory.ts suggest   (既定)
 *     canonical から客室数を推定し、未登録分だけ暫定投入(note='暫定(自動推定)')。
 *     併せて supabase/seed/room_type_inventory.csv を出力（実数編集用テンプレ）。
 *     推定 = 直近24ヶ月の (施設×部屋タイプ) で、日別の
 *            「物理部屋番号のDISTINCT数(minpakuIN) と 販売室数(neppan)」の大きい方の最大値。
 *            ＝ピーク稼働日の使用部屋数。実容量の下限寄りなので要確認。
 *
 *   npx tsx scripts/db/room-type-inventory.ts load
 *     supabase/seed/room_type_inventory.csv を読み、room_count を実数で upsert(note='manual')。
 *     room_count が空/非数値の行はスキップ。
 *
 * 秘密値は出力しない。
 */
import { Client } from "pg";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadEnv, isConfigured } from "./load-env";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) {
  console.error("SUPABASE_DB_URL 未設定");
  process.exit(1);
}
const CSV_PATH = "supabase/seed/room_type_inventory.csv";
const mode = (process.argv[2] ?? "suggest").toLowerCase();
const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const csvEscape = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function suggest() {
  const q = await c.query<{
    facility_id: string; facility_code: string; display_name: string; rt: string; suggested: number;
  }>(
    `with daily as (
       select facility_id, room_type_normalized,
              count(distinct nullif(room_no,'')) as distinct_rooms,
              sum(sold_room_nights) as sold
       from app.reservation_stay_nights
       where is_stay_night and not is_cancelled
         and room_type_normalized is not null and room_type_normalized <> ''
         and stay_date >= (current_date - interval '24 months')
       group by facility_id, room_type_normalized, stay_date
     ),
     peak as (
       select facility_id, room_type_normalized,
              max(greatest(distinct_rooms, ceil(sold)))::int as suggested
       from daily group by facility_id, room_type_normalized
     )
     select f.id facility_id, f.facility_code, f.display_name, p.room_type_normalized rt, p.suggested
     from peak p join app.facilities f on f.id = p.facility_id
     where p.suggested > 0
     order by f.facility_code, p.suggested desc`,
  );

  let inserted = 0;
  for (const r of q.rows) {
    const res = await c.query(
      `insert into app.room_type_inventory (facility_id, room_type_normalized, room_count, note)
       values ($1,$2,$3,'暫定(自動推定)')
       on conflict (facility_id, room_type_normalized) do nothing`,
      [r.facility_id, r.rt, r.suggested],
    );
    inserted += res.rowCount ?? 0;
  }

  const header = "facility_code,facility_name,room_type_normalized,room_count,note";
  const lines = q.rows.map((r) =>
    [r.facility_code, r.display_name, r.rt, String(r.suggested), "暫定(自動推定)"].map(csvEscape).join(","),
  );
  writeFileSync(CSV_PATH, header + "\n" + lines.join("\n") + "\n", "utf8");

  console.log(`suggest: 候補 ${q.rows.length} 件 / 新規投入 ${inserted} 件（既存は据え置き）`);
  console.log(`CSV 出力: ${CSV_PATH}  ← room_count を実数に直して 'load' で反映`);
}

async function load() {
  if (!existsSync(CSV_PATH)) {
    console.error(`CSV が見つかりません: ${CSV_PATH}（先に 'suggest' でテンプレ生成）`);
    process.exit(1);
  }
  const fac = await c.query<{ id: string; facility_code: string }>("select id, facility_code from app.facilities");
  const byCode = new Map(fac.rows.map((r) => [r.facility_code, r.id]));

  const lines = readFileSync(CSV_PATH, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  let upserts = 0, skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const [code, , rt, countStr] = parseCsvLine(lines[i]);
    const facilityId = byCode.get(code);
    const count = Number(countStr);
    if (!facilityId || !rt || countStr == null || countStr.trim() === "" || !Number.isFinite(count) || count < 0) {
      skipped++;
      continue;
    }
    await c.query(
      `insert into app.room_type_inventory (facility_id, room_type_normalized, room_count, note, updated_at)
       values ($1,$2,$3,'manual', now())
       on conflict (facility_id, room_type_normalized)
       do update set room_count = excluded.room_count, note = 'manual', updated_at = now()`,
      [facilityId, rt, Math.round(count)],
    );
    upserts++;
  }
  console.log(`load: upsert ${upserts} 件 / skip ${skipped} 件`);
}

/** 日次の販売可能室数を記入するためのロング形式テンプレCSVを出力（1行 = 施設×部屋タイプ×日）。 */
async function templateDaily() {
  const rows = await c.query<{ facility_code: string; display_name: string; rt: string; cnt: number }>(
    `select f.facility_code, f.display_name, i.room_type_normalized rt, i.room_count cnt
     from app.room_type_inventory i join app.facilities f on f.id = i.facility_id
     order by f.facility_code, i.room_count desc`,
  );
  const out = "supabase/seed/room_type_inventory_daily_template.csv";
  const header = "facility_code,facility_name,room_type_normalized,date,sellable_rooms";
  // 各キー1行のサンプル（date/sellable_rooms は雛形値）。実運用では date を1日ずつ展開し、
  // その日に販売可能だった室数を sellable_rooms に入れる（1施設×1部屋タイプ×1日 = 1行）。
  const lines = rows.rows.map((r) =>
    [r.facility_code, r.display_name, r.rt, "2026-06-01", String(r.cnt)].map(csvEscape).join(","),
  );
  writeFileSync(out, header + "\n" + lines.join("\n") + "\n", "utf8");
  console.log(`daily template: ${rows.rows.length} キー -> ${out}`);
  console.log("  列: facility_code, facility_name(参考), room_type_normalized, date(YYYY-MM-DD), sellable_rooms");
  console.log("  ※ date を1日ずつ展開し、その日の販売可能室数を入れてください（行を増やす）");
}

/** 日次 販売可能室数CSV (facility_code, *, room_type_normalized, date, sellable_rooms) を upsert。 */
async function loadDaily() {
  const path = process.argv[3] ?? "supabase/seed/room_type_inventory_daily.csv";
  if (!existsSync(path)) {
    console.error(`CSV が見つかりません: ${path}（room_type_inventory_daily_template.csv を編集→この名前で保存）`);
    process.exit(1);
  }
  const fac = await c.query<{ id: string; facility_code: string }>("select id, facility_code from app.facilities");
  const byCode = new Map(fac.rows.map((r) => [r.facility_code, r.id]));

  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const fids: string[] = [], rts: string[] = [], dates: string[] = [], srs: number[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const [code, , rt, dateStr, srStr] = parseCsvLine(lines[i]);
    const facilityId = byCode.get(code);
    const sr = Number(srStr);
    if (!facilityId || !rt || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? "") || !Number.isFinite(sr) || sr < 0) {
      skipped++;
      continue;
    }
    fids.push(facilityId); rts.push(rt); dates.push(dateStr); srs.push(Math.round(sr));
  }
  if (fids.length === 0) {
    console.log(`load-daily: 有効行なし（skip ${skipped}）`);
    return;
  }
  await c.query(
    `insert into app.room_type_inventory_days (facility_id, room_type_normalized, date, sellable_rooms)
     select fid, rt, d::date, sr
     from unnest($1::uuid[], $2::text[], $3::text[], $4::int[]) as t(fid, rt, d, sr)
     on conflict (facility_id, room_type_normalized, date)
     do update set sellable_rooms = excluded.sellable_rooms, updated_at = now()`,
    [fids, rts, dates, srs],
  );
  // 代表客室数(room_type_inventory.room_count)を日次の最頻値で更新。稼働率の「欠け日」補完に使う。
  const mres = await c.query(
    `insert into app.room_type_inventory (facility_id, room_type_normalized, room_count, note, updated_at)
     select facility_id, room_type_normalized,
            mode() within group (order by sellable_rooms)::int, 'daily-mode', now()
     from app.room_type_inventory_days
     group by facility_id, room_type_normalized
     on conflict (facility_id, room_type_normalized)
     do update set room_count = excluded.room_count, note = 'daily-mode', updated_at = now()`,
  );
  console.log(`load-daily: upsert ${fids.length} 行 / skip ${skipped} 行（${path}）`);
  console.log(`  代表客室数(最頻値)を更新: ${mres.rowCount} キー（note='daily-mode'）`);
}

/** 日次在庫を削除（引数に facility_code を渡すとその施設のみ、無ければ全件）。 */
async function clearDaily() {
  const code = process.argv[3];
  if (code) {
    const f = await c.query<{ id: string }>("select id from app.facilities where facility_code=$1", [code]);
    if (!f.rows[0]) { console.error(`施設コード不明: ${code}`); process.exit(1); }
    const r = await c.query("delete from app.room_type_inventory_days where facility_id=$1", [f.rows[0].id]);
    console.log(`clear-daily: ${code} の日次在庫 ${r.rowCount} 行削除`);
  } else {
    const r = await c.query("delete from app.room_type_inventory_days");
    console.log(`clear-daily: 全日次在庫 ${r.rowCount} 行削除`);
  }
}

/** 日次在庫のカバレッジ確認（期間・キー数・"その月の全日が揃っていない" key×月 を検出）。 */
async function coverage() {
  const s = await c.query<{ rows: number; keys: number; mn: string; mx: string }>(
    `select count(*)::int rows,
            count(distinct facility_id::text||'|'||room_type_normalized)::int keys,
            min(date)::text mn, max(date)::text mx
     from app.room_type_inventory_days`,
  );
  const g = s.rows[0];
  console.log(`日次在庫: ${g.rows} 行 / キー(施設×部屋タイプ) ${g.keys} / 期間 ${g.mn} 〜 ${g.mx}`);

  const inc = await c.query<{ facility_code: string; rt: string; ym: string; present: number; dim: number }>(
    `select f.facility_code, d.room_type_normalized rt,
            to_char(date_trunc('month', d.date),'YYYY-MM') ym,
            count(distinct d.date)::int present,
            extract(day from (date_trunc('month', d.date) + interval '1 month - 1 day'))::int dim
     from app.room_type_inventory_days d join app.facilities f on f.id = d.facility_id
     group by f.facility_code, d.room_type_normalized, date_trunc('month', d.date)
     having count(distinct d.date) < extract(day from (date_trunc('month', d.date) + interval '1 month - 1 day'))
     order by ym, f.facility_code, rt`,
  );
  const byMonth = new Map<string, number>();
  for (const r of inc.rows) byMonth.set(r.ym, (byMonth.get(r.ym) ?? 0) + 1);
  console.log(`\n不完全な月（全日が揃っていない key×月）: ${inc.rows.length} 件`);
  for (const [ym, n] of [...byMonth.entries()].sort()) console.log(`  ${ym}: ${n} 件`);
  if (inc.rows.length > 0) {
    console.log("サンプル(先頭10):");
    for (const r of inc.rows.slice(0, 10)) console.log(`  ${r.ym} ${r.facility_code} ${r.rt.slice(0, 16)}: ${r.present}/${r.dim}日`);
  }
}

/** 指定月の cordio 施設×部屋タイプの sold vs sellable(日次+最頻値補完) を稼働率降順で出力（>100%の原因追跡用）。 */
async function audit() {
  const y = Number(process.argv[3]);
  const m = Number(process.argv[4]);
  if (!y || !m) { console.error("usage: audit <year> <month>"); process.exit(1); }
  const rows = await c.query<{ facility_code: string; rt: string; sold: number; ssum: number; sdays: number; mode: number }>(
    `with sold as (
       select facility_id, room_type_normalized rt, coalesce(sum(sold_room_nights),0)::float8 sold
       from mart.monthly_room_type_metrics where stay_month = make_date($1,$2,1)
       group by facility_id, room_type_normalized
     ),
     sell as (
       select facility_id, room_type_normalized rt,
              coalesce(sum(sellable_rooms),0)::float8 ssum, count(distinct date)::int sdays
       from app.room_type_inventory_days
       where date between make_date($1,$2,1) and (make_date($1,$2,1) + interval '1 month - 1 day')
       group by facility_id, room_type_normalized
     )
     select f.facility_code, coalesce(s.rt, e.rt) rt,
            coalesce(s.sold,0) sold, coalesce(e.ssum,0) ssum, coalesce(e.sdays,0) sdays,
            coalesce(i.room_count,0) mode
     from sold s
     full join sell e on e.facility_id = s.facility_id and e.rt = s.rt
     join app.facilities f on f.id = coalesce(s.facility_id, e.facility_id)
     left join app.room_type_inventory i
       on i.facility_id = coalesce(s.facility_id, e.facility_id) and i.room_type_normalized = coalesce(s.rt, e.rt)
     where f.group_id = (select id from app.groups where slug='cordio')`,
    [y, m],
  );
  const filt = process.argv[5]; // 任意: 部屋タイプ名の部分一致フィルタ
  const dim = new Date(y, m, 0).getDate();
  const out = rows.rows
    .map((r) => {
      const sellable = Number(r.ssum) + Number(r.mode) * Math.max(0, dim - Number(r.sdays));
      const occ = sellable > 0 ? Number(r.sold) / sellable : null;
      return { ...r, sellable, occ };
    })
    .filter((r) => Number(r.sold) > 0 && (!filt || r.rt.includes(filt)))
    .sort((a, b) => (b.occ ?? 0) - (a.occ ?? 0));
  const limit = filt ? out.length : 15;
  console.log(`audit ${y}-${String(m).padStart(2, "0")} (cordio, sold>0${filt ? `, rt~"${filt}"` : ", 稼働率降順 上位15"}):`);
  for (const r of out.slice(0, limit)) {
    console.log(
      `  ${((r.occ ?? 0) * 100).toFixed(1).padStart(6)}%  ${r.facility_code.padEnd(16)} ${r.rt.slice(0, 22).padEnd(22)} sold=${Math.round(Number(r.sold))} sellable=${Math.round(r.sellable)} (日次${r.sdays}/${dim}日, 最頻${r.mode})`,
    );
  }
}

async function main() {
  await c.connect();
  if (mode === "load") await load();
  else if (mode === "template-daily") await templateDaily();
  else if (mode === "load-daily") await loadDaily();
  else if (mode === "clear-daily") await clearDaily();
  else if (mode === "coverage") await coverage();
  else if (mode === "audit") await audit();
  else await suggest();
  await c.end();
}

main().catch(async (e) => {
  console.error("ERROR:", (e as Error).message);
  try { await c.end(); } catch {}
  process.exit(1);
});
