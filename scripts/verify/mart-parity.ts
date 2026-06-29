/**
 * lib/mart/aggregate.ts（国籍別 / 泊数分布 / ブッキングカーブ）を Excel(集計データ.xlsx) と ±0 検証。
 *   NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/verify/mart-parity.ts
 * canonical は base.csv から構築し、国分類は DB と同じ supabase/seed/country_mappings.csv を使用
 * （= DB canonical を再現）。これが ±0 なら DB の mart も Excel と一致する。
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { decodeUtf8 } from "../../lib/adapters/shared";
import { buildCanonicalRows, parseMinpakuinCsv } from "../../lib/adapters/minpakuin";
import type { CanonicalStayNight } from "../../lib/adapters/canonical-schema";
import type { FeeAdjustmentRule, NormalizeContext } from "../../lib/adapters/types";
import { aggregateBookingCurve, aggregateCountry, stayNightReservations, type BookingCurveMartRow } from "../../lib/mart/aggregate";

const BASE = process.argv[2] ??
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\minpakuIN-download\\base.csv";
const XLSXP = process.argv[3] ??
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\集計データ.xlsx";

const AQUA: Record<string, string> = {
  "【別邸】結の家 Ⅰ": "結の家", "【別邸】結の家 Ⅱ": "結の家", "【別邸】クローバー": "アクアパレス北谷ANNEX（クローバー桑江）",
};
const RENAME: Record<string, string> = { "琉心 恩納": "琉心 プライベートプール 恩納" };
const cleanRoomType = (s: string) => (s ?? "").replace(/\t/g, "").replace(/　/g, " ").trim();
const effectiveFacility = (name: string, rt: string) => {
  let fac = name;
  if (fac === "アクアパレス北谷" && AQUA[rt]) fac = AQUA[rt];
  return RENAME[fac] ?? fac;
};
const FEE_RULES: FeeAdjustmentRule[] = [
  { id: "rule-agoda", ruleCode: "agoda_202601", channelNormalized: "Agoda", validFrom: "2026-01-01", grossDivisor: 0.88, taxRate: 0.1, taxRounding: "floor" },
  { id: "rule-trip", ruleCode: "tripcom_202602", channelNormalized: "Trip.com", validFrom: "2026-02-01", grossDivisor: 0.85, taxRate: 0.1, taxRounding: "floor" },
];

// 国分類: 国分類リスト.xlsx を (施設名|国) で引く（create_report と同一）。
// 分割施設(結の家/ANNEX)や未登録の (施設×国) は miss → 大分類/中分類=不明。
const CLASSIFY = process.argv[4] ??
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\minpakuIN-download\\国分類リスト.xlsx";
const clMap = new Map<string, { major: string; middle: string }>();
{
  const wb = XLSX.readFile(CLASSIFY);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  const h = (rows[0] as string[]).map((s) => String(s).trim());
  const hi = (n: string) => h.indexOf(n);
  for (const r of rows.slice(1)) {
    const fnRaw = String(r[hi("施設名")] ?? "").trim();
    const kuni = String(r[hi("国")] ?? "").trim();
    if (!fnRaw || !kuni) continue;
    const fac = RENAME[fnRaw] ?? fnRaw; // create_report は分類側にも rename を適用
    clMap.set(`${fac}|${kuni}`, { major: String(r[hi("大分類")] ?? "").trim() || "不明", middle: String(r[hi("中分類")] ?? "").trim() || "不明" });
  }
}
const classify = (facility: string, country: string) => clMap.get(`${facility}|${country}`) ?? null;

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
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
type Row = Record<string, number>;
const add = (m: Row, k: string, v: number) => { m[k] = (m[k] ?? 0) + v; };
function sheet(wb: XLSX.WorkBook, name: string) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true });
  const header = (rows[0] as string[]).map((s) => String(s).trim());
  return { header, idx: (n: string) => header.indexOf(n), rows: rows.slice(1) };
}
function sheetAggK(wb: XLSX.WorkBook, name: string, metric: string, keyFn: (r: unknown[], idx: (n: string) => number) => string | null): Row {
  const s = sheet(wb, name); const out: Row = {};
  for (const r of s.rows) { const k = keyFn(r, s.idx); if (k == null) continue; add(out, k, Number(r[s.idx(metric)]) || 0); }
  return out;
}
let pass = 0, fail = 0;
function compare(label: string, mine: Row, ref: Row) {
  const keys = new Set([...Object.keys(mine), ...Object.keys(ref)]);
  let off = 0, maxD = 0, sm = 0, sr = 0; const samples: string[] = [];
  for (const k of keys) {
    const a = Math.round(mine[k] ?? 0), b = Math.round(ref[k] ?? 0); sm += a; sr += b;
    if (a !== b) { off++; maxD = Math.max(maxD, Math.abs(a - b)); if (samples.length < 5) samples.push(`      ${k} mine=${a} ref=${b}`); }
  }
  if (off === 0) pass++; else fail++;
  console.log(`  ${off === 0 ? "✅" : "❌"} ${label}: ${keys.size - off}/${keys.size} 総計 mine=${sm.toLocaleString()} ref=${sr.toLocaleString()} diff=${sm - sr}${off ? ` 最大差=${maxD}` : ""}`);
  if (samples.length) console.log(samples.join("\n"));
}

function main() {
  const parsed = parseMinpakuinCsv(decodeUtf8(new Uint8Array(readFileSync(BASE))), "base");
  for (const r of parsed.rows) {
    const cleaned = cleanRoomType(r.payload["部屋タイプ"] ?? "");
    r.payload["部屋タイプ"] = cleaned;
    r.payload["施設名"] = effectiveFacility(r.payload["施設名"] ?? "", cleaned);
  }
  const canon: CanonicalStayNight[] = buildCanonicalRows(parsed, ctx);
  const wb = XLSX.readFile(XLSXP);
  console.log(`canonical=${canon.length}\n`);

  // ---- 国籍別 ----
  console.log("[国籍別]");
  const country = aggregateCountry(canon, classify);
  const cRows = { rooms: {} as Row, guests: {} as Row, gross: {} as Row, tax: {} as Row, cnt: {} as Row, multi: {} as Row, ltc: {} as Row, lts: {} as Row };
  for (const r of country) {
    const k = `${r.facilityId}|${r.countryMajor}|${r.countryMiddle}|${r.countryNormalized}|${r.stayMonth}`;
    cRows.rooms[k] = r.soldRoomNights; cRows.guests[k] = r.guestCount; cRows.gross[k] = r.grossAmount; cRows.tax[k] = r.taxAmount;
    cRows.cnt[k] = r.reservationCount; cRows.multi[k] = r.multiNightReservationCount; cRows.ltc[k] = r.leadTimeCount; cRows.lts[k] = r.leadTimeTotal;
  }
  const sk = (col: string) => (r: unknown[], i: (n: string) => number) => `${r[i("施設名")]}|${r[i("大分類")]}|${r[i("中分類")]}|${r[i("国")]}|${serialToYmd(Number(r[i(col)]))}`;
  compare("室数", cRows.rooms, sheetAggK(wb, "月別×国籍別(室数・人数)", "室数", sk("月の開始日")));
  compare("人数", cRows.guests, sheetAggK(wb, "月別×国籍別(室数・人数)", "合計人数", sk("月の開始日")));
  compare("宿泊費", cRows.gross, sheetAggK(wb, "月別×国籍別(金額)", "宿泊費", sk("月の開始日")));
  compare("消費税", cRows.tax, sheetAggK(wb, "月別×国籍別(金額)", "消費税", sk("月の開始日")));
  compare("予約件数", cRows.cnt, sheetAggK(wb, "月別×国籍別(予約指標)", "予約件数", sk("月の開始日")));
  compare("連泊予約件数", cRows.multi, sheetAggK(wb, "月別×国籍別(予約指標)", "連泊予約件数", sk("月の開始日")));
  compare("LT対象件数", cRows.ltc, sheetAggK(wb, "月別×国籍別(予約指標)", "リードタイム対象予約件数", sk("月の開始日")));
  compare("LT合計", cRows.lts, sheetAggK(wb, "月別×国籍別(予約指標)", "リードタイム合計", sk("月の開始日")));

  // ---- 泊数分布（exact nights で検証）----
  console.log("[泊数分布]（予約単位・exact泊数）");
  const snCnt: Row = {}, snG: Row = {}, snGr: Row = {}, snT: Row = {};
  for (const r of stayNightReservations(canon)) {
    const month = `${r.checkin.slice(0, 7)}-01`;
    const cell = `${r.facilityId}|${month}|${r.roomType}|${r.nights}`;
    add(snCnt, cell, 1); add(snG, cell, r.guestsFirst); add(snGr, cell, r.gross); add(snT, cell, r.tax);
  }
  const snk = (col: string) => (r: unknown[], i: (n: string) => number) => `${r[i("施設名")]}|${serialToYmd(Number(r[i("チェックイン月")]))}|${r[i("部屋タイプ")]}|${r[i(col)]}`;
  compare("予約件数", snCnt, sheetAggK(wb, "泊数分布", "予約件数", snk("泊数")));
  compare("合計人数", snG, sheetAggK(wb, "泊数分布", "合計人数", snk("泊数")));
  compare("宿泊費", snGr, sheetAggK(wb, "泊数分布", "宿泊費", snk("泊数")));
  compare("消費税", snT, sheetAggK(wb, "泊数分布", "消費税", snk("泊数")));

  // ---- ブッキングカーブ ----
  console.log("[ブッキングカーブ]（リードタイム累積）");
  const LABEL: [keyof BookingCurveMartRow, string][] = [
    ["sameDay", "当日"], ["oneDayBefore", "前日"], ["twoDaysBefore", "2日前"], ["threeToSixDaysBefore", "3～6日前"],
    ["sevenToThirteenDaysBefore", "7～13日前"], ["fourteenToTwentyDaysBefore", "14～20日前"], ["twentyOneToThirtyDaysBefore", "21～30日前"],
    ["thirtyOneToSixtyDaysBefore", "31～60日前"], ["sixtyOneToNinetyDaysBefore", "61～90日前"], ["ninetyOneToOneTwentyDaysBefore", "91～120日前"],
    ["oneTwentyOneToOneFiftyDaysBefore", "121～150日前"], ["oneFiftyOnePlusDaysBefore", "151日以上前"],
  ];
  const scopeJa: Record<string, string> = { with_cancelled: "キャンセル含む", without_cancelled: "キャンセル除外" };
  const bc = aggregateBookingCurve(canon);
  const bcMine: Row = {};
  for (const r of bc) for (const [field, label] of LABEL) bcMine[`${scopeJa[r.cancelScope]}|${r.facilityId}|${r.stayMonth}|${label}`] = r[field] as number;
  const bcRef: Row = {};
  { const s = sheet(wb, "ブッキングカーブ"); for (const r of s.rows) { const scope = String(r[s.idx("集計区分")]); for (const [, label] of LABEL) add(bcRef, `${scope}|${r[s.idx("施設名")]}|${serialToYmd(Number(r[s.idx("部屋利用月")]))}|${label}`, Number(r[s.idx(label)]) || 0); } }
  compare("累積(全区分)", bcMine, bcRef);

  console.log(`\n結果: ✅${pass} / ❌${fail}`);
}
main();
