/**
 * 指定日取込(as-of)用: 日次 base.csv スナップショットを集計して
 * mart.daily_facility_metrics_snapshot へ投入する（minpakuIN のみ）。
 *
 * 既存 load-canonical と同じ adapter で canonical をメモリ生成し、refresh-marts と
 * 同一の検証済み FILTER（ROOMS / AMT）で (facility_id, stay_date) 日次集計する。
 * live canonical / live mart は一切変更しない。
 *
 *   # 月末＋直近30日を投入（既定）。重いので大きめのヒープ推奨:
 *   NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/db/load-snapshots.ts "<dir>"
 *   # オプション:
 *   --recent N        直近 N 日（既定 30）
 *   --no-month-ends   月末を含めない
 *   --only 20260623,20260624   指定日のみ
 *   --force           既投入の snapshot_date も再投入
 *   --reset           投入前に snapshot テーブルを truncate（取込日ルール変更時の貼り直し用）
 *   --verify "<base.csv>"  集計のみ（保存しない）→ live mart と ±0 か確認（パリティゲート）
 *
 * snapshot_date は base.csv の【更新日時(mtime)の日付】。ファイル名(YYYYMMDD)は
 * アーカイブ作成日で実データより1日進むため使わない（例: 20260624_base.csv は 06-23 取込）。
 */
import { Client } from "pg";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { loadEnv, isConfigured } from "./load-env";
import { decodeUtf8 } from "../../lib/adapters/shared";
import type { CanonicalStayNight, FeeAdjustmentRule } from "../../lib/adapters/canonical-schema";
import type { NormalizeContext } from "../../lib/adapters/types";
import { buildCanonicalRows as buildMinpaku, parseMinpakuinCsv, MINPAKU_COLUMNS } from "../../lib/adapters/minpakuin";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) { console.error("SUPABASE_DB_URL 未設定"); process.exit(1); }

const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const cleanRoomType = (s: string) => (s ?? "").replace(/\t/g, "").replace(/　/g, " ").trim();

// ---- args ----
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]?.startsWith("--")));
const DIR = positional[0];
const RECENT = Number(opt("--recent") ?? 30);
const NO_MONTH_ENDS = flag("--no-month-ends");
const ONLY = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const FORCE = flag("--force");
const RESET = flag("--reset");
const VERIFY = opt("--verify");

/** ファイルの更新日時(mtime, ローカル=JST)を YYYY-MM-DD で返す＝実際の取込日。
 *  base.csv のファイル名はアーカイブ作成日で実データより1日進むため使わない。 */
function mtimeDate(file: string): string {
  const m = statSync(file).mtime;
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

// ---- context (load-canonical と同じ DB seed から構築) ----
async function buildContext(): Promise<{ ctx: NormalizeContext; aquaSplit: Map<string, string> }> {
  const fac = await c.query("select id, display_name from app.facilities");
  const sf = await c.query("select source_facility_name, facility_id from app.source_facilities where source_system='minpakuin'");
  const nameToId = new Map<string, string>();
  const idToName = new Map<string, string>();
  for (const r of fac.rows) { nameToId.set(r.display_name, r.id); idToName.set(r.id, r.display_name); }
  for (const r of sf.rows) nameToId.set(r.source_facility_name, r.facility_id);
  const split = await c.query(
    "select rtm.room_type_raw, f.display_name from app.room_type_mappings rtm join app.facilities f on f.id=rtm.override_facility_id where rtm.source_system='minpakuin' and rtm.override_facility_id is not null");
  const aquaSplit = new Map<string, string>();
  for (const r of split.rows) aquaSplit.set(r.room_type_raw, r.display_name);
  const ch = await c.query("select channel_raw, channel_normalized from app.channel_mappings where source_system='minpakuin'");
  const chMap = new Map<string, string>();
  for (const r of ch.rows) chMap.set(r.channel_raw, r.channel_normalized);
  const ct = await c.query("select country_raw, country_normalized, country_major, country_middle from app.country_mappings");
  const ctMap = new Map<string, { countryNormalized: string; countryMajor: string; countryMiddle: string }>();
  for (const r of ct.rows) ctMap.set(r.country_raw, { countryNormalized: r.country_normalized, countryMajor: r.country_major, countryMiddle: r.country_middle });
  const fr = await c.query(
    "select id, rule_code, source_system, channel_normalized, valid_from::text vf, valid_to::text vt, gross_divisor::float8 gd, tax_rate::float8 tr, tax_rounding from app.fee_adjustment_rules where source_system is null or source_system='minpakuin'");
  const feeRules: FeeAdjustmentRule[] = fr.rows.map((r) => ({
    id: r.id, ruleCode: r.rule_code, sourceSystem: r.source_system, channelNormalized: r.channel_normalized,
    validFrom: r.vf, validTo: r.vt, grossDivisor: r.gd, taxRate: r.tr, taxRounding: r.tax_rounding,
  }));
  const ctx: NormalizeContext = {
    resolveFacilityId: ({ sourceFacilityName }) => nameToId.get(sourceFacilityName ?? "") ?? null,
    resolveRoomType: ({ facilityId, roomTypeRaw }) =>
      roomTypeRaw ? { roomTypeNormalized: roomTypeRaw, budgetRoomType: idToName.get(facilityId) ?? roomTypeRaw } : null,
    resolveChannel: ({ channelRaw }) => {
      const n = chMap.get(channelRaw);
      return n ? { channelNormalized: n } : channelRaw ? { channelNormalized: channelRaw } : null;
    },
    resolveCountry: ({ countryRaw }) => ctMap.get(countryRaw) ?? null,
    feeRules,
  };
  return { ctx, aquaSplit };
}

// ---- 1 ファイル → canonical（load-canonical と同一処理） ----
function csvToCanonical(file: string, ctx: NormalizeContext, aquaSplit: Map<string, string>): CanonicalStayNight[] {
  const parsed = parseMinpakuinCsv(decodeUtf8(new Uint8Array(readFileSync(file))), "load");
  for (const row of parsed.rows) {
    const cleaned = cleanRoomType(row.payload[MINPAKU_COLUMNS.roomType] ?? "");
    row.payload[MINPAKU_COLUMNS.roomType] = cleaned;
    const base = row.payload[MINPAKU_COLUMNS.facilityName] ?? "";
    if (base === "アクアパレス北谷" && aquaSplit.has(cleaned)) row.payload[MINPAKU_COLUMNS.facilityName] = aquaSplit.get(cleaned)!;
  }
  return buildMinpaku(parsed, ctx).filter((x) => x.facilityId);
}

// ---- 日次集計（refresh-marts の ROOMS / AMT FILTER を JS で再現） ----
interface DailyRow { facility_id: string; stay_date: string; sold_room_nights: number; guest_count: number; gross_amount: number; tax_amount: number; net_amount: number; }
function aggregateDaily(canon: CanonicalStayNight[]): DailyRow[] {
  const m = new Map<string, DailyRow>();
  for (const x of canon) {
    const key = x.facilityId + "|" + x.stayDate;
    let a = m.get(key);
    if (!a) { a = { facility_id: x.facilityId!, stay_date: x.stayDate, sold_room_nights: 0, guest_count: 0, gross_amount: 0, tax_amount: 0, net_amount: 0 }; m.set(key, a); }
    const rooms = x.isStayNight && !x.isCancelled;                                  // ROOMS
    const amt = (Number(x.feeAdjustedGrossAmount) || 0) !== 0 && !x.isCancelled;    // AMT
    if (rooms) { a.sold_room_nights += Number(x.soldRoomNights) || 0; a.guest_count += Number(x.guestCount) || 0; }
    if (amt) {
      a.gross_amount += Number(x.feeAdjustedGrossAmount) || 0;
      a.tax_amount += Number(x.feeAdjustedTaxAmount) || 0;
      a.net_amount += Number(x.feeAdjustedNetAmount) || 0;
    }
  }
  // HAVING sold<>0 or gross<>0
  return [...m.values()].filter((a) => a.sold_room_nights !== 0 || a.gross_amount !== 0);
}

async function ensureTable() {
  await c.query(`create table if not exists mart.daily_facility_metrics_snapshot (
    snapshot_date date not null,
    facility_id uuid not null references app.facilities(id) on delete cascade,
    stay_date date not null,
    sold_room_nights numeric not null default 0,
    guest_count integer not null default 0,
    gross_amount numeric not null default 0,
    tax_amount numeric not null default 0,
    net_amount numeric not null default 0,
    primary key (snapshot_date, facility_id, stay_date))`);
  await c.query("create index if not exists daily_facility_metrics_snapshot_date_idx on mart.daily_facility_metrics_snapshot (snapshot_date)");
  await c.query("alter table mart.daily_facility_metrics_snapshot enable row level security");
  await c.query(`drop policy if exists "facility scoped select" on mart.daily_facility_metrics_snapshot`);
  await c.query(`create policy "facility scoped select" on mart.daily_facility_metrics_snapshot for select to authenticated using (app.can_access_facility(facility_id))`);
}

async function storeSnapshot(snapshotDate: string, rows: DailyRow[]) {
  await c.query("delete from mart.daily_facility_metrics_snapshot where snapshot_date=$1", [snapshotDate]);
  const BATCH = 5000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await c.query(
      `insert into mart.daily_facility_metrics_snapshot (snapshot_date, facility_id, stay_date, sold_room_nights, guest_count, gross_amount, tax_amount, net_amount)
       select $2::date, facility_id, stay_date, sold_room_nights, guest_count, gross_amount, tax_amount, net_amount
       from jsonb_to_recordset($1::jsonb) as x(facility_id uuid, stay_date date, sold_room_nights numeric, guest_count int, gross_amount numeric, tax_amount numeric, net_amount numeric)`,
      [JSON.stringify(batch), snapshotDate],
    );
  }
}

/** 対象ファイル選択（月末＋直近 / --only / --verify）。dir 内 YYYYMMDD_base.csv を走査。 */
function pickFiles(): { date: string; file: string }[] {
  const all = readdirSync(DIR!)
    .map((f) => /^(\d{4})(\d{2})(\d{2})_base\.csv$/.exec(f))
    .filter((mm): mm is RegExpExecArray => !!mm)
    .map((mm) => ({ date: `${mm[1]}-${mm[2]}-${mm[3]}`, ym: `${mm[1]}-${mm[2]}`, file: join(DIR!, mm[0]) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // desc
  if (ONLY) return all.filter((x) => ONLY.includes(x.date.replace(/-/g, "")));
  const picked = new Map<string, { date: string; file: string }>();
  // 直近 N
  for (const x of all.slice(0, RECENT)) picked.set(x.date, x);
  // 月末（各月の最大日）
  if (!NO_MONTH_ENDS) {
    const byMonth = new Map<string, { date: string; file: string }>();
    for (const x of all) if (!byMonth.has(x.ym)) byMonth.set(x.ym, x); // all は desc なので各月の最初=最大日
    for (const x of byMonth.values()) picked.set(x.date, x);
  }
  return [...picked.values()].sort((a, b) => (a.date < b.date ? -1 : 1)); // asc
}

async function main() {
  await c.connect();
  await ensureTable();
  const { ctx, aquaSplit } = await buildContext();

  // ---- verify モード（パリティゲート）----
  // 同一入力(csv→canonical)に対し JS集計 と refresh-marts の SQL FILTER集計 を突合し ±0 を確認。
  // （live mart は minpakuIN＋ねっぱん混在かつ版ズレのため直接比較は不可。同一入力で論理一致を担保する。）
  if (VERIFY) {
    console.log(`verify(parity): ${basename(VERIFY)} の JS集計 vs SQL集計（同一 canonical）`);
    const canon = csvToCanonical(VERIFY, ctx, aquaSplit);
    const js = aggregateDaily(canon);
    await c.query(`create temp table _logic_stage (facility_id uuid, stay_date date, sold_room_nights numeric, guest_count int,
      fee_adjusted_gross_amount numeric, fee_adjusted_tax_amount numeric, fee_adjusted_net_amount numeric,
      is_stay_night boolean, is_cancelled boolean)`);
    const B = 5000;
    for (let i = 0; i < canon.length; i += B) {
      const batch = canon.slice(i, i + B).map((x) => ({
        facility_id: x.facilityId, stay_date: x.stayDate, sold_room_nights: x.soldRoomNights, guest_count: x.guestCount ?? null,
        fee_adjusted_gross_amount: x.feeAdjustedGrossAmount ?? null, fee_adjusted_tax_amount: x.feeAdjustedTaxAmount ?? null,
        fee_adjusted_net_amount: x.feeAdjustedNetAmount ?? null, is_stay_night: x.isStayNight, is_cancelled: x.isCancelled,
      }));
      await c.query(`insert into _logic_stage select * from jsonb_to_recordset($1::jsonb) as x(facility_id uuid, stay_date date,
        sold_room_nights numeric, guest_count int, fee_adjusted_gross_amount numeric, fee_adjusted_tax_amount numeric,
        fee_adjusted_net_amount numeric, is_stay_night boolean, is_cancelled boolean)`, [JSON.stringify(batch)]);
    }
    const ROOMS = "filter (where is_stay_night and not is_cancelled)";
    const AMT = "filter (where fee_adjusted_gross_amount <> 0 and not is_cancelled)";
    const sql = await c.query(`select facility_id::text fid, to_char(stay_date,'YYYY-MM-DD') sd,
        coalesce(sum(sold_room_nights) ${ROOMS},0)::float8 sold,
        coalesce(sum(guest_count) ${ROOMS},0)::float8 guest,
        coalesce(sum(fee_adjusted_gross_amount) ${AMT},0)::float8 gross,
        coalesce(sum(fee_adjusted_net_amount) ${AMT},0)::float8 net
      from _logic_stage group by facility_id, stay_date
      having coalesce(sum(sold_room_nights) ${ROOMS},0) <> 0 or coalesce(sum(fee_adjusted_gross_amount) ${AMT},0) <> 0`);
    const sqlMap = new Map(sql.rows.map((r) => [r.fid + "|" + r.sd, r]));
    const jsMap = new Map(js.map((a) => [a.facility_id + "|" + a.stay_date, a]));
    let mismatch = 0, onlyJs = 0, onlySql = 0, maxSold = 0, maxGross = 0, maxNet = 0;
    for (const [k, a] of jsMap) {
      const s = sqlMap.get(k); if (!s) { onlyJs++; continue; }
      const ds = Math.abs(a.sold_room_nights - Number(s.sold)), dg = Math.abs(a.gross_amount - Number(s.gross)), dn = Math.abs(a.net_amount - Number(s.net));
      if (ds > 1e-6 || dg > 1e-6 || dn > 1e-6) mismatch++;
      maxSold = Math.max(maxSold, ds); maxGross = Math.max(maxGross, dg); maxNet = Math.max(maxNet, dn);
    }
    for (const k of sqlMap.keys()) if (!jsMap.has(k)) onlySql++;
    console.log(`  js rows=${js.length}  sql rows=${sql.rows.length}`);
    console.log(`  mismatch=${mismatch}  onlyJs=${onlyJs}  onlySql=${onlySql}  maxΔsold=${maxSold}  maxΔgross=${maxGross}  maxΔnet=${maxNet}`);
    console.log(mismatch === 0 && onlyJs === 0 && onlySql === 0 ? "  => ±0 OK（JS集計=SQL集計, ロジック一致）" : "  => 不一致（JS集計の修正が必要）");
    await c.end();
    return;
  }

  if (!DIR) { console.error("dir 引数が必要です（minpakuIN-download ディレクトリ）"); process.exit(1); }
  if (RESET) { await c.query("truncate mart.daily_facility_metrics_snapshot"); console.log("snapshot テーブルを truncate しました（--reset）"); }
  const targets = pickFiles();
  const loaded = new Set((await c.query("select distinct to_char(snapshot_date,'YYYY-MM-DD') d from mart.daily_facility_metrics_snapshot")).rows.map((r) => r.d));
  console.log(`対象 ${targets.length} ファイル / 既投入 ${loaded.size} 日${FORCE ? "（--force: 再投入）" : ""}`);

  let done = 0;
  for (const t of targets) {
    const snapDate = mtimeDate(t.file); // 取込日 = ファイルの更新日時(JST)。ファイル名は+1日ずれるため使わない。
    if (!FORCE && loaded.has(snapDate)) { console.log(`  skip ${snapDate}（投入済み）`); continue; }
    const t0 = Date.now();
    const canon = csvToCanonical(t.file, ctx, aquaSplit);
    const rows = aggregateDaily(canon);
    await storeSnapshot(snapDate, rows);
    done++;
    console.log(`  ${basename(t.file)} → ${snapDate}: canonical ${canon.length} → snapshot rows ${rows.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  const tot = await c.query("select count(distinct snapshot_date)::int days, count(*)::int rows from mart.daily_facility_metrics_snapshot");
  console.log(`完了: 新規 ${done} 日 / 累計 ${tot.rows[0].days} 日 ${tot.rows[0].rows} 行`);
  await c.end();
}
main().catch(async (e) => { console.log("ERROR:", (e as Error).message); try { await c.end(); } catch { /* noop */ } process.exit(1); });
