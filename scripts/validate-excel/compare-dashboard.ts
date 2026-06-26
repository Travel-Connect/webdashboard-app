/**
 * コルディオレポートNEW.xlsm vs Web ダッシュボード（mart/API）数値突合 — 2026年・税込既定。
 *
 *   NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/validate-excel/compare-dashboard.ts [xlsm] [--year 2026] [--tax gross|net]
 *
 * Excel 側: xlsm 内の集計シート（親/子データ集計・泊数分布・国籍別・BC）を data-only で読む。
 * Web 側: lib/api/build* を直接呼ぶ（Next サーバー不要）。
 * 許容差: 室数/件数=完全一致、金額=±1円、比率=±0.01pt。
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { Pool } from "pg";
import { loadEnv, isConfigured } from "../db/load-env";
import { buildAnnualSales } from "../../lib/api/annualsales";
import { buildBookingCurve } from "../../lib/api/bookingcurve";
import { buildChannels } from "../../lib/api/channels";
import { buildNationalities } from "../../lib/api/nationalities";
import { buildOccupancy } from "../../lib/api/occupancy";
import { buildRoomTypes } from "../../lib/api/roomtypes";
import { buildStayNights } from "../../lib/api/staynights";
import type { DashboardFilters, NightsBucket } from "../../lib/api/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_XLSM =
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\コルディオレポートNEW.xlsm";

const TOL = { money: 1, rate: 0.01, int: 0 };

type Row = Record<string, number>;
type DiffStatus = "pass" | "warn" | "fail";
interface DiffRow {
  dashboard: string;
  metric: string;
  key: string;
  excel: number | null;
  web: number | null;
  diff: number | null;
  status: DiffStatus;
}

const diffs: DiffRow[] = [];
let pass = 0, warn = 0, fail = 0;

function parseArgs() {
  const args = process.argv.slice(2);
  let xlsm = DEFAULT_XLSM;
  let year = 2026;
  let tax: "gross" | "net" = "gross";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year") year = Number(args[++i]);
    else if (args[i] === "--tax") tax = args[++i] as "gross" | "net";
    else if (!args[i].startsWith("-")) xlsm = args[i];
  }
  return { xlsm, year, tax };
}

function serialToYmd(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

const add = (m: Row, k: string, v: number) => {
  m[k] = (m[k] ?? 0) + v;
};

function readSheet(wb: XLSX.WorkBook, name: string): { header: string[]; rows: unknown[][] } {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`シート無: ${name}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  return { header: (rows[0] as string[]).map((s) => String(s ?? "").trim()), rows: rows.slice(1) };
}

function resolveSheet(wb: XLSX.WorkBook, candidates: string[]): string {
  for (const c of candidates) if (wb.SheetNames.includes(c)) return c;
  throw new Error(`シートが見つかりません: ${candidates.join(" | ")}`);
}

function sheetAgg(
  wb: XLSX.WorkBook,
  name: string,
  keyCols: string[],
  metricCol: string,
  dateCols: string[] = [],
): Row {
  const { header, rows } = readSheet(wb, name);
  const idx = (n: string) => header.indexOf(n);
  const out: Row = {};
  for (const r of rows) {
    if (r[idx(keyCols[0])] === undefined || r[idx(keyCols[0])] === "") continue;
    const key = keyCols
      .map((c) => (dateCols.includes(c) ? serialToYmd(Number(r[idx(c)])) : String(r[idx(c)])))
      .join("|");
    add(out, key, Number(r[idx(metricCol)]) || 0);
  }
  return out;
}

function sheetAggK(
  wb: XLSX.WorkBook,
  name: string,
  metricCol: string,
  keyFn: (r: unknown[], idx: (n: string) => number) => string | null,
): Row {
  const { header, rows } = readSheet(wb, name);
  const idx = (n: string) => header.indexOf(n);
  const out: Row = {};
  for (const r of rows) {
    const k = keyFn(r, idx);
    if (k == null) continue;
    add(out, k, Number(r[idx(metricCol)]) || 0);
  }
  return out;
}

function inYear(key: string, year: number): boolean {
  return key.split("|").some((p) => p.startsWith(`${year}-`));
}

function filterYear(row: Row, year: number): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (inYear(k, year)) out[k] = v;
  return out;
}

function classifyDiff(
  dashboard: string,
  metric: string,
  key: string,
  excel: number,
  web: number,
  kind: "int" | "money" | "rate",
): void {
  const diff = web - excel;
  const ad = Math.abs(diff);
  const tol = kind === "int" ? TOL.int : kind === "money" ? TOL.money : TOL.rate;
  const status: DiffStatus = ad <= tol ? "pass" : "fail";
  if (status === "pass") pass++;
  else fail++;
  diffs.push({ dashboard, metric, key, excel, web, diff, status });
}

function compareRows(
  dashboard: string,
  metric: string,
  web: Row,
  excel: Row,
  kind: "int" | "money" | "rate",
  maxSamples = 5,
): { ok: boolean; samples: string[] } {
  const keys = new Set([...Object.keys(web), ...Object.keys(excel)]);
  const samples: string[] = [];
  let bad = 0;
  for (const k of keys) {
    const e = excel[k] ?? 0;
    const w = web[k] ?? 0;
    const cmp =
      kind === "int"
        ? Math.round(w) === Math.round(e)
        : kind === "money"
          ? Math.round(w) === Math.round(e) || Math.abs(w - e) <= TOL.money
          : Math.abs(w - e) <= TOL.rate;
    classifyDiff(dashboard, metric, k, e, w, kind);
    if (!cmp) {
      bad++;
      if (samples.length < maxSamples) samples.push(`  ${k} excel=${Math.round(e)} web=${Math.round(w)} diff=${Math.round(w - e)}`);
    }
  }
  return { ok: bad === 0, samples };
}

function logCompare(label: string, r: { ok: boolean; samples: string[] }, keys: number, sm: number, sr: number) {
  console.log(`  ${r.ok ? "✅" : "❌"} ${label}: keys=${keys} 総計 excel=${sr.toLocaleString()} web=${sm.toLocaleString()}`);
  if (r.samples.length) console.log(r.samples.join("\n"));
}

function sumRow(r: Row): number {
  return Object.values(r).reduce((s, v) => s + v, 0);
}

function filterFacilities(row: Row, facNames: Set<string>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    const fac = k.split("|")[0];
    if (facNames.has(fac)) out[k] = v;
  }
  return out;
}

async function cordioFacilities(pool: Pool): Promise<Set<string>> {
  const gid = (await pool.query("select id from app.groups where slug='cordio' limit 1")).rows[0].id;
  const r = await pool.query<{ display_name: string }>(
    "select display_name from app.facilities where group_id = $1 order by display_order",
    [gid],
  );
  return new Set(r.rows.map((x) => x.display_name));
}

function baseFilters(year: number, tax: "gross" | "net"): DashboardFilters {
  return { facilityId: "all", year, period: "yearly", taxMode: tax };
}

async function compareAnnualSales(pool: Pool, wb: XLSX.WorkBook, year: number, tax: "gross" | "net") {
  console.log("\n[全施設年間売上]");
  const parentSheet = resolveSheet(wb, ["親データ集計(日付)"]);
  const excelRev = filterYear(
    sheetAgg(wb, parentSheet, ["施設名", "部屋利用日"], "宿泊費", ["部屋利用日"]),
    year,
  );
  const excelByFacMonth: Row = {};
  for (const [k, v] of Object.entries(excelRev)) {
    const [fac, date] = k.split("|");
    add(excelByFacMonth, `${fac}|${monthStart(date)}`, v);
  }

  const res = await buildAnnualSales(pool, baseFilters(year, tax));
  const idToName = new Map(res.matrix!.facilities.map((f) => [f.id, f.name]));
  const webByFacMonth: Row = {};
  for (const row of res.matrix!.rows) {
    for (const fc of res.matrix!.facilities) {
      const name = idToName.get(fc.id)!;
      webByFacMonth[`${name}|${year}-${String(row.month).padStart(2, "0")}-01`] = row.cells[fc.id]?.actual ?? 0;
    }
  }
  const r = compareRows("annual-sales", "売上(施設×月)", webByFacMonth, excelByFacMonth, "money");
  logCompare("施設×月 売上", r, new Set([...Object.keys(webByFacMonth), ...Object.keys(excelByFacMonth)]).size, sumRow(webByFacMonth), sumRow(excelByFacMonth));
}

async function compareChannels(pool: Pool, wb: XLSX.WorkBook, year: number, tax: "gross" | "net") {
  console.log("\n[経路分析]");
  const parentSheet = resolveSheet(wb, ["親データ集計 (予約経路)", "親データ集計(予約経路)"]);
  const excelRev = filterYear(
    sheetAgg(wb, parentSheet, ["施設名", "部屋利用月", "予約経路"], "宿泊費", ["部屋利用月"]),
    year,
  );

  const res = await buildChannels(pool, { ...baseFilters(year, tax), period: "yearly" });
  const webRev: Row = {};
  for (const row of res.matrix!.rows) {
    for (const col of res.matrix!.columns) {
      webRev[`${row.channel}|${year}-${String(col.key).padStart(2, "0")}-01`] = row.cells[col.key] ?? 0;
    }
  }
  const excelByChMonth: Row = {};
  for (const [k, v] of Object.entries(excelRev)) {
    const [fac, mon, ch] = k.split("|");
    add(excelByChMonth, `${ch}|${mon}`, v);
  }
  const webByChMonth: Row = {};
  for (const [k, v] of Object.entries(webRev)) webByChMonth[k] = v;

  const r = compareRows("channels-yearly", "売上(経路×月)", webByChMonth, excelByChMonth, "money");
  logCompare("経路×月 売上", r, new Set([...Object.keys(webByChMonth), ...Object.keys(excelByChMonth)]).size, sumRow(webByChMonth), sumRow(excelByChMonth));

  // 月間: 6月を代表（xlsm スライサーが 2026-06 相当の serial 46235）
  console.log("\n[経路分析 月間 代表=6月]");
  const resM = await buildChannels(pool, { ...baseFilters(year, tax), period: "monthly", month: 6 });
  const webFac: Row = {};
  for (const row of resM.matrix!.rows) {
    for (const col of resM.matrix!.columns) {
      const facName = col.label;
      webFac[`${row.channel}|${facName}`] = row.cells[col.key] ?? 0;
    }
  }
  const excelFac: Row = {};
  for (const [k, v] of Object.entries(excelRev)) {
    const [fac, mon, ch] = k.split("|");
    if (mon === `${year}-06-01`) excelFac[`${ch}|${fac}`] = v;
  }
  const r2 = compareRows("channels-monthly", "売上(経路×施設 6月)", webFac, excelFac, "money");
  logCompare("6月 経路×施設", r2, new Set([...Object.keys(webFac), ...Object.keys(excelFac)]).size, sumRow(webFac), sumRow(excelFac));
}

async function compareOccupancy(pool: Pool, wb: XLSX.WorkBook, year: number, tax: "gross" | "net") {
  console.log("\n[稼働分析 年間]");
  const childSheet = resolveSheet(wb, ["子データ集計(日付)"]);
  const parentSheet = resolveSheet(wb, ["親データ集計(日付)"]);
  const excelSold = filterYear(sheetAgg(wb, childSheet, ["施設名", "部屋利用日"], "室数", ["部屋利用日"]), year);
  const excelGuest = filterYear(sheetAgg(wb, childSheet, ["施設名", "部屋利用日"], "合計人数", ["部屋利用日"]), year);
  const excelRev = filterYear(sheetAgg(wb, parentSheet, ["施設名", "部屋利用日"], "宿泊費", ["部屋利用日"]), year);

  const agg = (src: Row): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(src)) {
      const [fac, date] = k.split("|");
      add(out, `${fac}|${monthStart(date)}`, v);
    }
    return out;
  };
  const exSold = agg(excelSold);
  const exGuest = agg(excelGuest);
  const exRev = agg(excelRev);

  const facs = await pool.query<{ id: string; display_name: string }>(
    `select id, display_name from app.facilities
     where group_id = (select id from app.groups where slug='cordio' limit 1)
     order by coalesce(display_order,999999), display_name`,
  );

  const webSold: Row = {}, webGuest: Row = {}, webRev: Row = {};
  for (const f of facs.rows) {
    const res = await buildOccupancy(pool, {
      facilityId: f.id,
      year,
      period: "yearly",
      taxMode: tax,
    });
    for (const row of res.rows) {
      const k = `${f.display_name}|${row.date}`;
      webSold[k] = row.soldRoomNights;
      webGuest[k] = row.guestCount;
      webRev[k] = row.roomRevenue;
    }
  }

  for (const [label, web, ex, kind] of [
    ["販売室数", webSold, exSold, "int"],
    ["宿泊人数", webGuest, exGuest, "int"],
    ["客室売上", webRev, exRev, "money"],
  ] as const) {
    const r = compareRows("occupancy-yearly", label, web, ex, kind);
    logCompare(label, r, new Set([...Object.keys(web), ...Object.keys(ex)]).size, sumRow(web), sumRow(ex));
  }
}

function matchFac(name: string, facNames: Set<string>): string | null {
  if (facNames.has(name)) return name;
  for (const f of facNames) {
    if (f.startsWith(name) || name.startsWith(f.slice(0, Math.min(f.length, name.length)))) return f;
  }
  return null;
}

async function compareNationalities(pool: Pool, wb: XLSX.WorkBook, year: number, tax: "gross" | "net") {
  console.log("\n[国籍別分析]");
  const facNames = await cordioFacilities(pool);
  // xlsm は 集計データ.xlsx とシート構成が異なる（子/親データ集計(国籍別) を使用）
  const childNat = resolveSheet(wb, ["子データ集計(国籍別)"]);
  const parentNat = resolveSheet(wb, ["親データ集計(国籍別)"]);
  const natKey = (r: unknown[], idx: (n: string) => number) =>
    `${r[idx("施設名")]}|${r[idx("大分類")]}|${r[idx("中分類")]}|${r[idx("国")]}|${serialToYmd(Number(r[idx("月の開始日")]))}`;

  const exRooms = filterFacilities(
    filterYear(sheetAggK(wb, childNat, "室数", (r, i) => natKey(r, i)), year),
    facNames,
  );
  const exRev = filterFacilities(
    filterYear(sheetAggK(wb, parentNat, "宿泊費", (r, i) => natKey(r, i)), year),
    facNames,
  );

  const res = await buildNationalities(pool, baseFilters(year, tax));
  const webRooms: Row = {}, webRev: Row = {};
  for (const row of res.matrix!.rows) {
    for (let m = 0; m < 12; m++) {
      const k = `${row.country}|${year}-${String(m + 1).padStart(2, "0")}-01`;
      add(webRooms, k, row.months[m].rooms);
      add(webRev, k, row.months[m].rev);
    }
  }

  /** 大分類(海外/不明)の差を吸収し、国×月で突合（ダッシュボード表示粒度） */
  const rollupCountry = (src: Row): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(src)) {
      const p = k.split("|");
      add(out, `${p[3]}|${p[4]}`, v);
    }
    return out;
  };
  const r1 = compareRows("nationalities", "室数(国×月)", webRooms, rollupCountry(exRooms), "int");
  logCompare("国×月 室数", r1, 0, sumRow(webRooms), sumRow(rollupCountry(exRooms)));
  const r2 = compareRows("nationalities", "売上(国×月)", webRev, rollupCountry(exRev), "money");
  logCompare("国×月 売上", r2, 0, sumRow(webRev), sumRow(rollupCountry(exRev)));
}

function nightsBucket(n: number): NightsBucket {
  if (n <= 1) return "1";
  if (n === 2) return "2";
  if (n <= 4) return "3_4";
  if (n <= 6) return "5_6";
  return "7_plus";
}

async function compareStayNights(pool: Pool, wb: XLSX.WorkBook, year: number, tax: "gross" | "net") {
  console.log("\n[泊数分布]");
  const snSheet = resolveSheet(wb, ["泊数分布", "泊数分布 (部屋タイプ別)"]);
  const { header, rows } = readSheet(wb, snSheet);
  const idx = (n: string) => header.indexOf(n);
  const exCnt: Row = {}, exRev: Row = {};
  for (const r of rows) {
    if (r[idx("施設名")] === undefined || r[idx("施設名")] === "") continue;
    const mon = serialToYmd(Number(r[idx("チェックイン月")]));
    if (!mon.startsWith(`${year}-`)) continue;
    const k = `${r[idx("施設名")]}|${mon}|${nightsBucket(Number(r[idx("泊数")]))}`;
    add(exCnt, k, Number(r[idx("予約件数")]) || 0);
    add(exRev, k, Number(r[idx("宿泊費")]) || 0);
  }

  const facs = await pool.query<{ id: string; display_name: string }>(
    `select id, display_name from app.facilities
     where group_id = (select id from app.groups where slug='cordio' limit 1)
     order by coalesce(display_order,999999), display_name`,
  );
  const webCnt: Row = {}, webRev: Row = {};
  for (const f of facs.rows) {
    const res = await buildStayNights(pool, { ...baseFilters(year, tax), facilityId: f.id });
    for (const row of res.rows) {
      const k = `${f.display_name}|${row.month}|${row.nightsBucket}`;
      add(webCnt, k, row.reservationCount);
      add(webRev, k, row.revenue);
    }
  }

  const r1 = compareRows("stay-nights", "予約件数(施設×月×bucket)", webCnt, exCnt, "int");
  logCompare("予約件数", r1, 0, sumRow(webCnt), sumRow(exCnt));
  const r2 = compareRows("stay-nights", "宿泊費", webRev, exRev, "money");
  logCompare("宿泊費", r2, 0, sumRow(webRev), sumRow(exRev));
}

async function compareRoomTypes(pool: Pool, wb: XLSX.WorkBook, year: number, tax: "gross" | "net") {
  console.log("\n[部屋タイプ別]");
  const childSheet = resolveSheet(wb, ["子データ集計(部屋タイプ別)"]);
  const parentSheet = resolveSheet(wb, ["親データ集計 (部屋タイプ別)", "親データ集計(部屋タイプ別)"]);
  const exRooms = filterYear(sheetAgg(wb, childSheet, ["施設名", "部屋利用月", "部屋タイプ"], "室数", ["部屋利用月"]), year);
  const exRev = filterYear(sheetAgg(wb, parentSheet, ["施設名", "部屋利用月", "部屋タイプ"], "宿泊費", ["部屋利用月"]), year);

  const res = await buildRoomTypes(pool, baseFilters(year, tax));
  const webRooms: Row = {}, webRev: Row = {};
  for (const row of res.matrix!.rows) {
    for (let m = 0; m < 12; m++) {
      const k = `${year}-${String(m + 1).padStart(2, "0")}-01|${row.roomType}`;
      webRooms[k] = row.months[m].rooms;
      webRev[k] = row.months[m].rev;
    }
  }

  const rollupRt = (src: Row): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(src)) {
      const p = k.split("|");
      add(out, `${p[1]}|${p[2]}`, v);
    }
    return out;
  };
  const r1 = compareRows("room-types", "室数(月×RT)", webRooms, rollupRt(exRooms), "int");
  logCompare("室数", r1, 0, sumRow(webRooms), sumRow(rollupRt(exRooms)));
  const r2 = compareRows("room-types", "売上", webRev, rollupRt(exRev), "money");
  logCompare("売上", r2, 0, sumRow(webRev), sumRow(rollupRt(exRev)));
}

async function compareBookingCurve(pool: Pool, wb: XLSX.WorkBook, xlsmPath: string, year: number) {
  console.log("\n[ブッキングカーブ]");
  const facNames = await cordioFacilities(pool);
  // xlsm には raw「ブッキングカーブ」シートが無い → 同フォルダの 集計データ.xlsx を参照（create_report 出力）
  const shukei = join(dirname(xlsmPath), "集計データ.xlsx");
  const bcWb = existsSync(shukei)
    ? XLSX.readFile(shukei, { bookVBA: false, sheets: ["ブッキングカーブ"] })
    : wb;
  const bcSheet = resolveSheet(bcWb, ["ブッキングカーブ", "ブッキングカーブ集計", "ブッキングカーブ(NEW)"]);
  const TOTAL_LABEL = "151日以上前";
  const { header, rows } = readSheet(bcWb, bcSheet);
  const idx = (n: string) => header.indexOf(n);
  const ex: Row = {};
  for (const r of rows) {
    const scope = String(r[idx("集計区分")] ?? "");
    if (!scope.includes("キャンセル")) continue;
    const facRaw = String(r[idx("施設名")] ?? "");
    const fac = matchFac(facRaw, facNames);
    if (!fac) continue;
    const mon = serialToYmd(Number(r[idx("部屋利用月")]));
    if (!mon.startsWith(`${year}-`)) continue;
    if (idx(TOTAL_LABEL) < 0) continue;
    ex[`${scope}|${fac}|${mon}`] = Number(r[idx(TOTAL_LABEL)]) || 0;
  }

  const scopeJa: Record<string, string> = { with_cancelled: "キャンセル含む", without_cancelled: "キャンセル除外" };
  const web: Row = {};
  const gid = (await pool.query("select id from app.groups where slug='cordio' limit 1")).rows[0].id;
  const q = await pool.query(
    `select f.display_name fac, to_char(stay_month,'YYYY-MM-DD') mon, cancel_scope,
       coalesce(one_fifty_one_plus_days_before,0)::float8 total
     from mart.booking_curve_monthly m
     join app.facilities f on f.id = m.facility_id
     where f.group_id = $1 and stay_month between $2 and $3`,
    [gid, `${year}-01-01`, `${year}-12-01`],
  );
  for (const r of q.rows) {
    const scope = scopeJa[r.cancel_scope as string] ?? String(r.cancel_scope);
    web[`${scope}|${r.fac}|${r.mon}`] = Number(r.total) || 0;
  }

  const r = compareRows("booking-curve", "累積室数(151日以上前)", web, ex, "int");
  logCompare("151日以上前 bucket", r, 0, sumRow(web), sumRow(ex));
}

function writeReport(year: number, xlsm: string) {
  const outDir = join(ROOT, "reports");
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `excel-diff-${year}.md`);
  const failed = diffs.filter((d) => d.status === "fail");
  const lines = [
    `# Excel vs Web 差分レポート (${year}年)`,
    "",
    `- xlsm: \`${xlsm}\``,
    `- 実行: ${new Date().toISOString()}`,
    `- 結果: pass=${pass} warn=${warn} fail=${fail}`,
    "",
    "## サマリ（dashboard別 fail 件数）",
    "",
  ];
  const byDash = new Map<string, number>();
  for (const d of failed) byDash.set(d.dashboard, (byDash.get(d.dashboard) ?? 0) + 1);
  for (const [dash, n] of [...byDash.entries()].sort((a, b) => b[1] - a[1])) lines.push(`- ${dash}: ${n} fail`);
  if (failed.length === 0) lines.push("- （fail なし）");
  lines.push("", "## 最大乖離 Top 20", "", "| dashboard | metric | key | excel | web | diff |", "|---|---|---|---:|---:|---:|");
  for (const d of failed.sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0)).slice(0, 20)) {
    lines.push(`| ${d.dashboard} | ${d.metric} | ${d.key.slice(0, 40)} | ${d.excel} | ${d.web} | ${d.diff} |`);
  }
  writeFileSync(path, lines.join("\n"), "utf8");
  console.log(`\nレポート: ${path}`);
}

async function main() {
  loadEnv();
  if (!isConfigured("SUPABASE_DB_URL")) {
    console.error("SUPABASE_DB_URL 未設定");
    process.exit(1);
  }
  const { xlsm, year, tax } = parseArgs();
  console.log(`compare-dashboard: xlsm=${xlsm} year=${year} tax=${tax}`);
  const neededSheets = [
    "親データ集計(日付)", "子データ集計(日付)",
    "親データ集計 (予約経路)", "子データ集計(予約経路別)",
    "子データ集計(部屋タイプ別)", "親データ集計 (部屋タイプ別)",
    "子データ集計(国籍別)", "親データ集計(国籍別)",
    "泊数分布", "泊数分布 (部屋タイプ別)",
    "ブッキングカーブ", "ブッキングカーブ集計", "ブッキングカーブ(NEW)",
  ];
  console.log("xlsm 読込中（必要シートのみ）…");
  const wb = XLSX.readFile(xlsm, { bookVBA: false, sheets: neededSheets });
  console.log(`  sheets=${wb.SheetNames.length}`);

  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    await compareAnnualSales(pool, wb, year, tax);
    await compareChannels(pool, wb, year, tax);
    await compareOccupancy(pool, wb, year, tax);
    await compareNationalities(pool, wb, year, tax);
    await compareStayNights(pool, wb, year, tax);
    await compareRoomTypes(pool, wb, year, tax);
    await compareBookingCurve(pool, wb, xlsm, year);
  } finally {
    await pool.end();
  }

  console.log(`\n=== 結果: pass=${pass} warn=${warn} fail=${fail} ===`);
  writeReport(year, xlsm);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("ERROR:", (e as Error).message);
  process.exit(1);
});
