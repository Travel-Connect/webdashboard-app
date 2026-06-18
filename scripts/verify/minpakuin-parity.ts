/**
 * minpakuIN adapter × create_report.py（集計データ.xlsx）数値パリティ検証（全シート）。
 *
 *   NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/verify/minpakuin-parity.ts [base.csv] [集計データ.xlsx]
 *
 * 比較対象シート:
 *   - 親/子データ集計(日付) : 施設×日       室数/人数/宿泊費/消費税
 *   - 親/子データ集計(予約経路): 施設×月×経路
 *   - 親/子データ集計(部屋タイプ別): 施設×月×部屋タイプ
 *   - 泊数分布            : 施設×チェックイン月×部屋タイプ×泊数（予約単位）
 *   - ブッキングカーブ    : 集計区分×施設×部屋利用月×リードタイム累積
 *
 * create_report.py の前処理（部屋タイプ清掃・施設分割・施設名リネーム・Agoda/Trip補正・
 * 親子判別）を context 側で忠実に再現。フィルタは create_report に合わせる:
 *   金額 = 宿泊費!=0 & 非キャンセル（is_stay_night では絞らない）
 *   室数/人数 = 親子判別=1(is_stay_night) & 非キャンセル
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { decodeUtf8, parseDate, dayDiff, monthStart } from "../../lib/adapters/shared";
import { buildCanonicalRows, parseMinpakuinCsv } from "../../lib/adapters/minpakuin";
import type { CanonicalStayNight } from "../../lib/adapters/canonical-schema";
import type { FeeAdjustmentRule, NormalizeContext, ParsedSourceRows } from "../../lib/adapters/types";

const BASE = process.argv[2] ??
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\minpakuIN-download\\base.csv";
const XLSXP = process.argv[3] ??
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\集計データ.xlsx";

const AQUA_PALACE_FACILITY_MAP: Record<string, string> = {
  "【別邸】結の家 Ⅰ": "結の家",
  "【別邸】結の家 Ⅱ": "結の家",
  "【別邸】クローバー": "アクアパレス北谷ANNEX（クローバー桑江）",
};
const FACILITY_RENAME_MAP: Record<string, string> = { "琉心 恩納": "琉心 プライベートプール 恩納" };

const cleanRoomType = (s: string): string => (s ?? "").replace(/\t/g, "").replace(/　/g, " ").trim();
function effectiveFacility(name: string, cleanedRoomType: string): string {
  let fac = name;
  if (fac === "アクアパレス北谷" && AQUA_PALACE_FACILITY_MAP[cleanedRoomType]) fac = AQUA_PALACE_FACILITY_MAP[cleanedRoomType];
  return FACILITY_RENAME_MAP[fac] ?? fac;
}

const FEE_RULES: FeeAdjustmentRule[] = [
  { id: "rule-agoda", ruleCode: "agoda_202601", channelNormalized: "Agoda", validFrom: "2026-01-01", grossDivisor: 0.88, taxRate: 0.1, taxRounding: "floor" },
  { id: "rule-trip", ruleCode: "tripcom_202602", channelNormalized: "Trip.com", validFrom: "2026-02-01", grossDivisor: 0.85, taxRate: 0.1, taxRounding: "floor" },
];

const ctx: NormalizeContext = {
  resolveFacilityId: ({ sourceFacilityName }) => sourceFacilityName || null,
  resolveRoomType: ({ roomTypeRaw }) => ({ roomTypeNormalized: roomTypeRaw, budgetRoomType: roomTypeRaw }),
  resolveChannel: ({ channelRaw }) => {
    const t = (channelRaw ?? "").trim();
    if (t.toLowerCase() === "agoda") return { channelNormalized: "Agoda" };
    if (t === "Trip.com" || t === "Trip.com Group(new)") return { channelNormalized: "Trip.com" };
    return { channelNormalized: t };
  },
  resolveCountry: () => null,
  feeRules: FEE_RULES,
};

function serialToYmd(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

type Row = Record<string, number>;
const add = (m: Row, k: string, v: number) => { m[k] = (m[k] ?? 0) + v; };

function readSheet(wb: XLSX.WorkBook, name: string): { header: string[]; rows: unknown[][] } {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`シート無: ${name}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  return { header: (rows[0] as string[]).map((s) => String(s).trim()), rows: rows.slice(1) };
}

let totalPass = 0, totalFail = 0;
function compare(label: string, mine: Row, ref: Row, tol = 0) {
  const keys = new Set([...Object.keys(mine), ...Object.keys(ref)]);
  let exact = 0, off = 0, maxDiff = 0, sumMine = 0, sumRef = 0;
  const samples: string[] = [];
  for (const k of keys) {
    const a = Math.round(mine[k] ?? 0), b = Math.round(ref[k] ?? 0);
    sumMine += a; sumRef += b;
    const d = Math.abs(a - b);
    if (d <= tol) exact++;
    else { off++; maxDiff = Math.max(maxDiff, d); if (samples.length < 5) samples.push(`      ${k}  mine=${a} ref=${b} d=${a - b}`); }
  }
  const ok = off === 0;
  if (ok) totalPass++; else totalFail++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}: ${exact}/${keys.size}一致 総計 mine=${sumMine.toLocaleString()} ref=${sumRef.toLocaleString()} diff=${sumMine - sumRef}${off ? ` 最大差=${maxDiff}` : ""}`);
  if (samples.length) console.log(samples.join("\n"));
}

// canonical 集約
// keyFn が null を返した行は除外（pandas groupby(dropna=True) の NaN グループ脱落を再現）
function childAgg(canon: CanonicalStayNight[], keyFn: (c: CanonicalStayNight) => string | null) {
  const rooms: Row = {}, guests: Row = {};
  for (const c of canon) if (c.isStayNight && !c.isCancelled) { const k = keyFn(c); if (k == null) continue; add(rooms, k, c.soldRoomNights); add(guests, k, c.guestCount ?? 0); }
  return { rooms, guests };
}
function parentAgg(canon: CanonicalStayNight[], keyFn: (c: CanonicalStayNight) => string | null) {
  const gross: Row = {}, tax: Row = {};
  for (const c of canon) { const g = c.feeAdjustedGrossAmount ?? 0; if (g !== 0 && !c.isCancelled) { const k = keyFn(c); if (k == null) continue; add(gross, k, g); add(tax, k, c.taxAmount ?? 0); } }
  return { gross, tax };
}
// sheet 集約
function sheetAgg(wb: XLSX.WorkBook, name: string, keyCols: string[], metricCol: string, dateCols: string[] = []) {
  const { header, rows } = readSheet(wb, name);
  const idx = (n: string) => header.indexOf(n);
  const out: Row = {};
  for (const r of rows) {
    if (r[idx(keyCols[0])] === undefined || r[idx(keyCols[0])] === "") continue;
    const key = keyCols.map((c) => (dateCols.includes(c) ? serialToYmd(Number(r[idx(c)])) : String(r[idx(c)]))).join("|");
    add(out, key, Number(r[idx(metricCol)]) || 0);
  }
  return out;
}

function main() {
  console.log("base.csv:", BASE);
  const text = decodeUtf8(new Uint8Array(readFileSync(BASE)));
  const parsed = parseMinpakuinCsv(text, "base");
  for (const r of parsed.rows) {
    const cleaned = cleanRoomType(r.payload["部屋タイプ"] ?? "");
    r.payload["部屋タイプ"] = cleaned;
    r.payload["施設名"] = effectiveFacility(r.payload["施設名"] ?? "", cleaned);
  }
  const canon = buildCanonicalRows(parsed, ctx);
  const wb = XLSX.readFile(XLSXP);
  console.log(`raw=${parsed.rows.length} canonical=${canon.length}\n`);

  // ---- 日付 ----
  console.log("[親/子データ集計(日付)]");
  const dKey = (c: CanonicalStayNight) => `${c.facilityId}|${c.stayDate}`;
  const dc = childAgg(canon, dKey), dp = parentAgg(canon, dKey);
  compare("子・室数", dc.rooms, sheetAgg(wb, "子データ集計(日付)", ["施設名", "部屋利用日"], "室数", ["部屋利用日"]));
  compare("子・人数", dc.guests, sheetAgg(wb, "子データ集計(日付)", ["施設名", "部屋利用日"], "合計人数", ["部屋利用日"]));
  compare("親・宿泊費", dp.gross, sheetAgg(wb, "親データ集計(日付)", ["施設名", "部屋利用日"], "宿泊費", ["部屋利用日"]));
  compare("親・消費税", dp.tax, sheetAgg(wb, "親データ集計(日付)", ["施設名", "部屋利用日"], "消費税", ["部屋利用日"]));

  // ---- 予約経路 ----
  console.log("[親/子データ集計(予約経路)]");
  const chKey = (c: CanonicalStayNight) => (c.channel ? `${c.facilityId}|${c.stayMonth}|${c.channel}` : null);
  const cc = childAgg(canon, chKey), cp = parentAgg(canon, chKey);
  compare("子・室数", cc.rooms, sheetAgg(wb, "子データ集計(予約経路別)", ["施設名", "部屋利用月", "予約経路"], "室数", ["部屋利用月"]));
  compare("子・人数", cc.guests, sheetAgg(wb, "子データ集計(予約経路別)", ["施設名", "部屋利用月", "予約経路"], "合計人数", ["部屋利用月"]));
  compare("親・宿泊費", cp.gross, sheetAgg(wb, "親データ集計 (予約経路)", ["施設名", "部屋利用月", "予約経路"], "宿泊費", ["部屋利用月"]));
  compare("親・消費税", cp.tax, sheetAgg(wb, "親データ集計 (予約経路)", ["施設名", "部屋利用月", "予約経路"], "消費税", ["部屋利用月"]));

  // ---- 部屋タイプ別 ----
  console.log("[親/子データ集計(部屋タイプ別)]");
  const rtKey = (c: CanonicalStayNight) => (c.roomTypeRaw ? `${c.facilityId}|${c.stayMonth}|${c.roomTypeRaw}` : null);
  const rc = childAgg(canon, rtKey), rp = parentAgg(canon, rtKey);
  compare("子・室数", rc.rooms, sheetAgg(wb, "子データ集計(部屋タイプ別)", ["施設名", "部屋利用月", "部屋タイプ"], "室数", ["部屋利用月"]));
  compare("子・人数", rc.guests, sheetAgg(wb, "子データ集計(部屋タイプ別)", ["施設名", "部屋利用月", "部屋タイプ"], "合計人数", ["部屋利用月"]));
  compare("親・宿泊費", rp.gross, sheetAgg(wb, "親データ集計 (部屋タイプ別)", ["施設名", "部屋利用月", "部屋タイプ"], "宿泊費", ["部屋利用月"]));
  compare("親・消費税", rp.tax, sheetAgg(wb, "親データ集計 (部屋タイプ別)", ["施設名", "部屋利用月", "部屋タイプ"], "消費税", ["部屋利用月"]));

  // ---- 泊数分布（予約単位）----
  console.log("[泊数分布]（予約単位: 施設×OTA予約番号×部屋タイプ）");
  staynights(canon, wb);

  // ---- ブッキングカーブ ----
  console.log("[ブッキングカーブ]（リードタイム累積・室数）");
  bookingCurve(canon, parsed, wb);

  console.log(`\n結果: ✅${totalPass} / ❌${totalFail}`);
}

// 泊数分布: canonical を (施設, OTA予約番号, 部屋タイプ) で予約単位に畳み、チェックイン月×泊数で集計
function staynights(canon: CanonicalStayNight[], wb: XLSX.WorkBook) {
  interface Res { checkin: string; nights: number; gross: number; tax: number; guestsFirst: number; firstStay: string }
  const res = new Map<string, Res>();
  for (const c of canon) {
    if (!c.isStayNight || c.isCancelled) continue;
    const n = c.nights ?? 0;
    if (n <= 0) continue;
    if (!c.otaReservationNo || !c.roomTypeRaw) continue; // groupby(dropna): 空 OTA/部屋タイプ は脱落
    const k = `${c.facilityId}|${c.otaReservationNo}|${c.roomTypeRaw}`;
    const cur = res.get(k);
    // create_report: 合計人数=first(グループ内の最初の行), チェックイン日=min(部屋利用日)。
    // canon は CSV(入力)順なので、最初に出現した行の guestCount を first として保持する。
    if (!cur) res.set(k, { checkin: c.stayDate, nights: n, gross: c.feeAdjustedGrossAmount ?? 0, tax: c.taxAmount ?? 0, guestsFirst: c.guestCount ?? 0, firstStay: c.stayDate });
    else {
      cur.gross += c.feeAdjustedGrossAmount ?? 0;
      cur.tax += c.taxAmount ?? 0;
      if (c.stayDate < cur.checkin) cur.checkin = c.stayDate; // チェックイン月は最小利用日。guestsFirst は最初の行のまま
    }
  }
  const cnt: Row = {}, guests: Row = {}, gross: Row = {}, tax: Row = {};
  for (const [k, r] of res) {
    const facility = k.split("|")[0];
    const month = `${r.checkin.slice(0, 7)}-01`;
    const cell = `${facility}|${month}|${k.split("|")[2]}|${r.nights}`;
    add(cnt, cell, 1);
    add(guests, cell, r.guestsFirst);
    add(gross, cell, r.gross);
    add(tax, cell, r.tax);
  }
  compare("予約件数", cnt, sheetAgg(wb, "泊数分布", ["施設名", "チェックイン月", "部屋タイプ", "泊数"], "予約件数", ["チェックイン月"]));
  compare("宿泊費", gross, sheetAgg(wb, "泊数分布", ["施設名", "チェックイン月", "部屋タイプ", "泊数"], "宿泊費", ["チェックイン月"]));
  compare("消費税", tax, sheetAgg(wb, "泊数分布", ["施設名", "チェックイン月", "部屋タイプ", "泊数"], "消費税", ["チェックイン月"]));
  compare("合計人数", guests, sheetAgg(wb, "泊数分布", ["施設名", "チェックイン月", "部屋タイプ", "泊数"], "合計人数", ["チェックイン月"]));
}

const BUCKETS: [string, number][] = [
  ["当日", 0], ["前日", 1], ["2日前", 2], ["3～6日前", 3], ["7～13日前", 7], ["14～20日前", 14],
  ["21～30日前", 21], ["31～60日前", 31], ["61～90日前", 61], ["91～120日前", 91], ["121～150日前", 121], ["151日以上前", 151],
];
function bookingCurve(canon: CanonicalStayNight[], parsed: ParsedSourceRows, wb: XLSX.WorkBook) {
  const { header, rows: sheetRows } = readSheet(wb, "ブッキングカーブ");
  const idx = (n: string) => header.indexOf(n);
  for (const [scope, includeCancel] of [["キャンセル含む", true], ["キャンセル除外", false]] as [string, boolean][]) {
    const mine: Row = {}, faith: Row = {}, ref: Row = {};
    // canonical 版
    for (const c of canon) {
      if (!c.isStayNight) continue;
      if (!includeCancel && c.isCancelled) continue;
      if (c.leadTimeDays == null || c.leadTimeDays < 0) continue;
      const cell = `${scope}|${c.facilityId}|${c.stayMonth}`;
      for (const [label, th] of BUCKETS) if (c.leadTimeDays >= th) add(mine, `${cell}|${label}`, c.soldRoomNights);
    }
    // faithful-direct 版（parsed 行から create_report 再現）
    for (const r of parsed.rows) {
      const p = r.payload;
      if (!includeCancel && (p["ステータス"] ?? "") === "キャンセル済み") continue;
      const sd = parseDate(p["部屋利用日"]); const bd = parseDate(p["予約受付日"]);
      if (!sd || !bd) continue;
      const co = parseDate(p["チェックアウト日"]);
      if (co && sd === co) continue; // 親子判別=0
      const lead = dayDiff(sd, bd);
      if (lead < 0) continue;
      const cell = `${scope}|${p["施設名"]}|${monthStart(sd)}`;
      for (const [label, th] of BUCKETS) if (lead >= th) add(faith, `${cell}|${label}`, 1);
    }
    for (const r of sheetRows) {
      if (String(r[idx("集計区分")]) !== scope) continue;
      const cell = `${scope}|${r[idx("施設名")]}|${serialToYmd(Number(r[idx("部屋利用月")]))}`;
      for (const [label] of BUCKETS) add(ref, `${cell}|${label}`, Number(r[idx(label)]) || 0);
    }
    compare(`${scope} canonical`, mine, ref);
    compare(`${scope} faithful`, faith, ref);
  }
}

main();
