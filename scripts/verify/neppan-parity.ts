/**
 * ねっぱん adapter × 入込状況表(onhand Supabase app.reservation_stay_fact) 数値突合。
 *
 *   NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/verify/neppan-parity.ts <neppan.csv> [施設名]
 *
 * 自前側を「滞在月 × (室数 / 売上)」で出力する。参照(Supabase)側は SQL Editor で
 * docs/onhand-supabase-data-access.md の SQL を実行して得る（別プロジェクト・直アクセス禁止のため）。
 *
 * 売上の定義差（重要）:
 *   - 旧onhand ETL revenue = 大人+子供+幼児合計額（**3要素**）
 *   - 新 canonical gross   = 大人+子供+幼児+その他合計額（**4要素**, D2決定）
 * → 突合は **rev3(faithful) vs 参照** が ±0 になるかを見る。gross4 は その他 の分だけ多い（仕様差）。
 */
import { readFileSync } from "node:fs";
import {
  addDays,
  decodeShiftJis,
  monthStart,
  parseCsv,
  parseDate,
  toNumOr0,
  toRecords,
} from "../../lib/adapters/shared";
import { buildCanonicalRows, parseNeppanCsv } from "../../lib/adapters/neppan";
import type { NormalizeContext } from "../../lib/adapters/types";

const FILE = process.argv[2]!;
const FACILITY = process.argv[3] ?? "コテージスターハウス今帰仁";
const text = decodeShiftJis(new Uint8Array(readFileSync(FILE)));

const FAC = "33333333-3333-4333-8333-333333333333";
const ctx: NormalizeContext = {
  resolveFacilityId: () => FAC,
  resolveRoomType: ({ roomTypeRaw }) => (roomTypeRaw ? { roomTypeNormalized: roomTypeRaw, budgetRoomType: roomTypeRaw } : null),
  resolveChannel: ({ channelRaw }) => (channelRaw ? { channelNormalized: channelRaw } : null),
  resolveCountry: () => null,
  feeRules: [],
};

// --- A) adapter canonical（4要素 gross, sold=室数）by 滞在月（非キャンセル）---
const canon = buildCanonicalRows(parseNeppanCsv(text, "n"), ctx);
const a = new Map<string, { rooms: number; gross4: number }>();
for (const c of canon) {
  if (c.isCancelled) continue;
  const m = c.stayMonth;
  const e = a.get(m) ?? { rooms: 0, gross4: 0 };
  e.rooms += c.soldRoomNights;
  e.gross4 += c.feeAdjustedGrossAmount ?? 0;
  a.set(m, e);
}

// --- B) faithful（旧ETL再現: (予約番号,滞在日)で dedup, rev3=Σ(大人+子供+幼児), rooms=max）---
const { records } = toRecords(parseCsv(text));
const grp = new Map<string, { rev3: number; other: number; rooms: number; month: string }>();
for (const r of records) {
  const p = r.payload;
  if ((p["予約区分"] ?? "") === "キャンセル") continue;
  const checkin = parseDate(p["チェックイン日"]);
  const idx = p["泊目"] ? Math.trunc(toNumOr0(p["泊目"])) : NaN;
  if (!checkin || !Number.isFinite(idx) || idx < 1) continue;
  const stayDate = addDays(checkin, idx - 1);
  const key = `${(p["予約番号"] ?? "").trim()}|${stayDate}`;
  const rev3 = toNumOr0(p["大人合計額"]) + toNumOr0(p["子供合計額"]) + toNumOr0(p["幼児合計額"]);
  const other = toNumOr0(p["その他合計額"]);
  const rooms = toNumOr0(p["室数"]);
  const g = grp.get(key) ?? { rev3: 0, other: 0, rooms: 0, month: monthStart(stayDate) };
  g.rev3 += rev3;
  g.other += other;
  g.rooms = Math.max(g.rooms, rooms);
  grp.set(key, g);
}
const b = new Map<string, { rooms: number; rev3: number; other: number }>();
for (const g of grp.values()) {
  const e = b.get(g.month) ?? { rooms: 0, rev3: 0, other: 0 };
  e.rooms += g.rooms;
  e.rev3 += g.rev3;
  e.other += g.other;
  b.set(g.month, e);
}

const months = [...new Set([...a.keys(), ...b.keys()])].sort();
console.log(`施設: ${FACILITY} / canonical行: ${canon.length}`);
console.log("滞在月\t室数(adapter)\t室数(faithful)\trev3(faithful)\tgross4(adapter)\tその他差");
let tR = 0, tRev3 = 0, tG4 = 0, tOther = 0;
for (const m of months) {
  const ae = a.get(m) ?? { rooms: 0, gross4: 0 };
  const be = b.get(m) ?? { rooms: 0, rev3: 0, other: 0 };
  tR += be.rooms; tRev3 += be.rev3; tG4 += ae.gross4; tOther += be.other;
  console.log(`${m}\t${ae.rooms}\t${be.rooms}\t${be.rev3.toLocaleString()}\t${ae.gross4.toLocaleString()}\t${be.other.toLocaleString()}`);
}
console.log(`--- 合計 ---`);
console.log(`室数(faithful)=${tR.toLocaleString()}  rev3(faithful=旧ETL定義)=${tRev3.toLocaleString()}  gross4(adapter)=${tG4.toLocaleString()}  その他合計=${tOther.toLocaleString()}`);
console.log(`検算: rev3 + その他 = ${(tRev3 + tOther).toLocaleString()} （= gross4 と一致するはず）`);
console.log(`\n▶ Supabase SQL Editor で以下を実行し、上の rev3/室数 と突合:`);
console.log(`  select stay_month, sum(rooms) rooms, sum(revenue) rev`);
console.log(`  from app.reservation_stay_fact`);
console.log(`  where facility_name = '${FACILITY}' and reservation_type <> 'キャンセル'`);
console.log(`  group by stay_month order by stay_month;`);
