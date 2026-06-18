/**
 * minpakuIN adapter × create_report.py（集計データ.xlsx）数値パリティ検証。
 *
 * 使い方:
 *   NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/verify/minpakuin-parity.ts [base.csv] [集計データ.xlsx]
 *
 * 比較対象:
 *   - 子データ集計(日付): 施設名 × 部屋利用日 → 室数 / 合計人数
 *   - 親データ集計(日付): 施設名 × 部屋利用日 → 宿泊費 / 消費税 / 宿泊費(税抜)
 *
 * create_report.py の前処理（部屋タイプ清掃・アクアパレス施設分割・施設名リネーム・
 * Agoda/Trip.com 補正・親子判別）を context 側で忠実に再現する。
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { decodeUtf8, parseDate } from "../../lib/adapters/shared";
import { buildCanonicalRows, parseMinpakuinCsv } from "../../lib/adapters/minpakuin";
import type { FeeAdjustmentRule, NormalizeContext } from "../../lib/adapters/types";

const BASE = process.argv[2] ??
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\base.csv";
const XLSXP = process.argv[3] ??
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\集計データ.xlsx";

// --- create_report.py のマッピング（line 78-99）---
const AQUA_PALACE_FACILITY_MAP: Record<string, string> = {
  "【別邸】結の家 Ⅰ": "結の家",
  "【別邸】結の家 Ⅱ": "結の家",
  "【別邸】クローバー": "アクアパレス北谷ANNEX（クローバー桑江）",
};
const FACILITY_RENAME_MAP: Record<string, string> = { "琉心 恩納": "琉心 プライベートプール 恩納" };

function cleanRoomType(s: string): string {
  return (s ?? "").replace(/\t/g, "").replace(/　/g, " ").trim();
}
function effectiveFacility(name: string, cleanedRoomType: string): string {
  let fac = name;
  if (fac === "アクアパレス北谷" && AQUA_PALACE_FACILITY_MAP[cleanedRoomType]) {
    fac = AQUA_PALACE_FACILITY_MAP[cleanedRoomType];
  }
  return FACILITY_RENAME_MAP[fac] ?? fac;
}

const FEE_RULES: FeeAdjustmentRule[] = [
  { id: "rule-agoda", ruleCode: "agoda_202601", channelNormalized: "Agoda", validFrom: "2026-01-01", grossDivisor: 0.88, taxRate: 0.1, taxRounding: "floor" },
  { id: "rule-trip", ruleCode: "tripcom_202602", channelNormalized: "Trip.com", validFrom: "2026-02-01", grossDivisor: 0.85, taxRate: 0.1, taxRounding: "floor" },
];

// 施設名（分割後）を facility "id" として使う忠実 context
const ctx: NormalizeContext = {
  resolveFacilityId: ({ sourceFacilityName }) => sourceFacilityName || null,
  resolveRoomType: ({ roomTypeRaw }) => ({ roomTypeNormalized: roomTypeRaw, budgetRoomType: roomTypeRaw }),
  resolveChannel: ({ channelRaw }) => {
    const t = (channelRaw ?? "").trim();
    if (t.toLowerCase() === "agoda") return { channelNormalized: "Agoda" }; // create_report: 完全一致
    if (t === "Trip.com" || t === "Trip.com Group(new)") return { channelNormalized: "Trip.com" };
    return { channelNormalized: t };
  },
  resolveCountry: () => null, // base.csv に国列なし → 不明
  feeRules: FEE_RULES,
};

function serialToYmd(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

type Agg = Record<string, number>;
function add(m: Agg, k: string, v: number) {
  m[k] = (m[k] ?? 0) + v;
}

function readSheet(wb: XLSX.WorkBook, name: string): { header: string[]; rows: unknown[][] } {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`シートが見つかりません: ${name}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  return { header: (rows[0] as string[]).map((s) => String(s).trim()), rows: rows.slice(1) };
}

function main() {
  console.log("base.csv 読込:", BASE);
  const text = decodeUtf8(new Uint8Array(readFileSync(BASE)));
  const parsed = parseMinpakuinCsv(text, "base");
  console.log(`  raw rows: ${parsed.rows.length}`);

  // 前処理: 部屋タイプ清掃 + 施設名分割/リネーム
  for (const r of parsed.rows) {
    const cleaned = cleanRoomType(r.payload["部屋タイプ"] ?? "");
    r.payload["部屋タイプ"] = cleaned;
    r.payload["施設名"] = effectiveFacility(r.payload["施設名"] ?? "", cleaned);
  }

  const canon = buildCanonicalRows(parsed, ctx);
  console.log(`  canonical rows: ${canon.length}`);

  // create_report.py の子データ集計を parsed 行から直接再現（canonical を経由しない忠実版）
  const faithRooms: Agg = {};
  const debugCells = new Set(["サンセットリゾート カンプー|2026-07-03", "畳の宿 北谷美浜|2026-08-16"]);
  const debugRows: Record<string, string[]> = {};
  for (const r of parsed.rows) {
    const p = r.payload;
    if ((p["ステータス"] ?? "") === "キャンセル済み") continue;
    const sd = parseDate(p["部屋利用日"]);
    if (!sd) continue;
    const co = parseDate(p["チェックアウト日"]);
    const oyako1 = !(co && sd === co); // 親子判別=1（部屋利用日==チェックアウト日 の行のみ 0）
    if (!oyako1) continue;
    const cell = `${p["施設名"]}|${sd}`;
    add(faithRooms, cell, 1);
    if (debugCells.has(cell)) {
      (debugRows[cell] ??= []).push(
        `OTA=${p["OTA予約番号"]} 部屋番号=${p["部屋番号"]} 部屋タイプ=${p["部屋タイプ"]} CO=${p["チェックアウト日"]} 人数=${p["合計人数"]} 経路=${p["予約経路"]}`,
      );
    }
  }

  // --- 自前集計 ---
  const myRooms: Agg = {}, myGuests: Agg = {}, myGross: Agg = {}, myTax: Agg = {};
  const canonDump: Record<string, string[]> = {};
  let edgeCheckoutWithAmount = 0;
  for (const c of canon) {
    const key = `${c.facilityId}|${c.stayDate}`;
    // 室数/人数: 親子判別=1(is_stay_night) かつ 非キャンセル
    if (c.isStayNight && !c.isCancelled) {
      add(myRooms, key, c.soldRoomNights);
      add(myGuests, key, c.guestCount ?? 0);
      if (debugCells.has(key)) {
        (canonDump[key] ??= []).push(`sold=${c.soldRoomNights} CO=${c.checkoutDate} rt=${c.roomTypeRaw} no=${c.roomNo} rk=${c.reservationKey.slice(0, 24)}`);
      }
    }
    // 金額: 補正後宿泊費!=0 かつ 非キャンセル（create_report は is_stay_night で絞らない）
    const g = c.feeAdjustedGrossAmount ?? 0;
    if (g !== 0 && !c.isCancelled) {
      add(myGross, key, g);
      add(myTax, key, c.taxAmount ?? 0);
      if (!c.isStayNight) edgeCheckoutWithAmount++;
    }
  }

  // --- 参照(Excel) ---
  const wb = XLSX.readFile(XLSXP);
  const refRooms: Agg = {}, refGuests: Agg = {}, refGross: Agg = {}, refTax: Agg = {}, refNet: Agg = {};

  const child = readSheet(wb, "子データ集計(日付)");
  const ci = (n: string) => child.header.indexOf(n);
  for (const row of child.rows) {
    if (!row[ci("施設名")]) continue;
    const key = `${row[ci("施設名")]}|${serialToYmd(Number(row[ci("部屋利用日")]))}`;
    add(refRooms, key, Number(row[ci("室数")]) || 0);
    add(refGuests, key, Number(row[ci("合計人数")]) || 0);
  }

  const parent = readSheet(wb, "親データ集計(日付)");
  const pi = (n: string) => parent.header.indexOf(n);
  for (const row of parent.rows) {
    if (!row[pi("施設名")]) continue;
    const key = `${row[pi("施設名")]}|${serialToYmd(Number(row[pi("部屋利用日")]))}`;
    add(refGross, key, Number(row[pi("宿泊費")]) || 0);
    add(refTax, key, Number(row[pi("消費税")]) || 0);
    add(refNet, key, Number(row[pi("宿泊費(税抜)")]) || 0);
  }

  compare("室数 canonical vs ref", myRooms, refRooms, 0);
  compare("室数 faithful-direct vs ref", faithRooms, refRooms, 0);
  compare("室数 canonical vs faithful-direct", myRooms, faithRooms, 0);
  compare("合計人数 (子データ)", myGuests, refGuests, 0);
  for (const cell of debugCells) {
    const cr = canonDump[cell] ?? [];
    const total = cr.reduce((s, r) => s + Number(r.match(/sold=(\d+)/)?.[1] ?? 0), 0);
    console.log(`\n[DEBUG canonical] ${cell}  canonical室数合計=${total} (${cr.length}行) / ref=${refRooms[cell] ?? 0}`);
    cr.slice(0, 30).forEach((s) => console.log("    " + s));
  }
  compare("宿泊費 (親データ・補正後)", myGross, refGross, 1);
  compare("消費税 (親データ)", myTax, refTax, 1);
  console.log(`\n[注] is_stay_night=false かつ 補正後宿泊費!=0 の金額行数: ${edgeCheckoutWithAmount}（spec の is_stay_night フィルタと差が出る対象）`);
}

function compare(label: string, mine: Agg, ref: Agg, tol: number) {
  const keys = new Set([...Object.keys(mine), ...Object.keys(ref)]);
  let exact = 0, within = 0, off = 0, maxDiff = 0, sumMine = 0, sumRef = 0;
  const samples: string[] = [];
  for (const k of keys) {
    const a = Math.round(mine[k] ?? 0), b = Math.round(ref[k] ?? 0);
    sumMine += a; sumRef += b;
    const d = Math.abs(a - b);
    if (d === 0) exact++;
    else if (d <= tol) within++;
    else {
      off++;
      if (d > maxDiff) maxDiff = d;
      if (samples.length < 8) samples.push(`    ${k}  mine=${a} ref=${b} diff=${a - b}`);
    }
  }
  console.log(`\n=== ${label} ===`);
  console.log(`  セル数: ${keys.size} / 完全一致: ${exact} / ±${tol}以内: ${within} / 不一致(>${tol}): ${off} / 最大差: ${maxDiff}`);
  console.log(`  総計  mine=${sumMine.toLocaleString()}  ref=${sumRef.toLocaleString()}  diff=${(sumMine - sumRef).toLocaleString()}`);
  if (samples.length) console.log("  不一致サンプル:\n" + samples.join("\n"));
}

main();
