/**
 * 検証済み adapter で実CSV → canonical を生成し app.reservation_stay_nights へ投入。
 *   npx tsx scripts/db/load-canonical.ts minpakuin <base.csv>
 *   npx tsx scripts/db/load-canonical.ts neppan <neppan.csv> <施設名>
 * resolver は DB の seed（source_facilities / room_type_mappings override / channel /
 * country / fee_adjustment_rules）から構築。detail-design §11.1 に従い source 単位で
 * delete → insert（再ロード冪等）。秘密値は出力しない。
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { loadEnv, isConfigured } from "./load-env";
import { decodeUtf8, decodeShiftJis } from "../../lib/adapters/shared";
import type { CanonicalStayNight, FeeAdjustmentRule } from "../../lib/adapters/canonical-schema";
import type { NormalizeContext } from "../../lib/adapters/types";
import { buildCanonicalRows as buildMinpaku, parseMinpakuinCsv, MINPAKU_COLUMNS } from "../../lib/adapters/minpakuin";
import { buildCanonicalRows as buildNeppan, parseNeppanCsv } from "../../lib/adapters/neppan";

const SOURCE = process.argv[2] as "minpakuin" | "neppan";
const FILE = process.argv[3]!;
const NEPPAN_FACILITY = process.argv[4]; // ねっぱんは施設名（=ファイル名 stem）

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) { console.error("SUPABASE_DB_URL 未設定"); process.exit(1); }
if (SOURCE !== "minpakuin" && SOURCE !== "neppan") { console.error("引数: minpakuin|neppan <file> [施設名]"); process.exit(1); }

const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const cleanRoomType = (s: string) => (s ?? "").replace(/\t/g, "").replace(/　/g, " ").trim();

const COLS = [
  "source_system", "current_record_key", "facility_id", "reservation_key", "checkin_code",
  "ota_reservation_no", "status", "is_cancelled", "channel", "stay_date", "stay_month",
  "checkin_date", "checkout_date", "booked_at", "room_type_raw", "room_type_normalized",
  "budget_room_type", "room_no", "nights", "stay_night_index", "sold_room_nights", "guest_count",
  "adult_count", "child_count", "gross_amount", "tax_amount", "net_amount",
  "fee_adjusted_gross_amount", "fee_adjusted_tax_amount", "fee_adjusted_net_amount",
  "fee_adjustment_rule_id", "country_raw", "country_normalized", "country_major", "country_middle",
  "is_stay_night", "lead_time_days", "is_valid_lead_time", "source_updated_at",
];
const COLDEF =
  "source_system text, current_record_key text, facility_id uuid, reservation_key text, checkin_code text," +
  "ota_reservation_no text, status text, is_cancelled boolean, channel text, stay_date date, stay_month date," +
  "checkin_date date, checkout_date date, booked_at timestamptz, room_type_raw text, room_type_normalized text," +
  "budget_room_type text, room_no text, nights int, stay_night_index int, sold_room_nights numeric, guest_count int," +
  "adult_count int, child_count int, gross_amount numeric, tax_amount numeric, net_amount numeric," +
  "fee_adjusted_gross_amount numeric, fee_adjusted_tax_amount numeric, fee_adjusted_net_amount numeric," +
  "fee_adjustment_rule_id uuid, country_raw text, country_normalized text, country_major text, country_middle text," +
  "is_stay_night boolean, lead_time_days int, is_valid_lead_time boolean, source_updated_at timestamptz";

function toRow(x: CanonicalStayNight): Record<string, unknown> {
  return {
    source_system: x.sourceSystem, current_record_key: x.currentRecordKey, facility_id: x.facilityId,
    reservation_key: x.reservationKey, checkin_code: x.checkinCode ?? null, ota_reservation_no: x.otaReservationNo ?? null,
    status: x.status ?? null, is_cancelled: x.isCancelled, channel: x.channel ?? null, stay_date: x.stayDate,
    stay_month: x.stayMonth, checkin_date: x.checkinDate ?? null, checkout_date: x.checkoutDate ?? null,
    booked_at: x.bookedAt ?? null, room_type_raw: x.roomTypeRaw ?? null, room_type_normalized: x.roomTypeNormalized ?? null,
    budget_room_type: x.budgetRoomType ?? null, room_no: x.roomNo, nights: x.nights ?? null,
    stay_night_index: x.stayNightIndex ?? null, sold_room_nights: x.soldRoomNights, guest_count: x.guestCount ?? null,
    adult_count: x.adultCount ?? null, child_count: x.childCount ?? null, gross_amount: x.grossAmount ?? null,
    tax_amount: x.taxAmount ?? null, net_amount: x.netAmount ?? null, fee_adjusted_gross_amount: x.feeAdjustedGrossAmount ?? null,
    fee_adjusted_tax_amount: x.feeAdjustedTaxAmount ?? null, fee_adjusted_net_amount: x.feeAdjustedNetAmount ?? null,
    fee_adjustment_rule_id: x.feeAdjustmentRuleId ?? null, country_raw: x.countryRaw ?? null,
    country_normalized: x.countryNormalized ?? null, country_major: x.countryMajor ?? null,
    country_middle: x.countryMiddle ?? null, is_stay_night: x.isStayNight, lead_time_days: x.leadTimeDays ?? null,
    is_valid_lead_time: x.isValidLeadTime, source_updated_at: x.sourceUpdatedAt ?? null,
  };
}

async function buildContext(): Promise<{ ctx: NormalizeContext; nameToId: Map<string, string>; aquaSplit: Map<string, string> }> {
  const fac = await c.query("select id, display_name from app.facilities");
  const sf = await c.query("select source_facility_name, facility_id from app.source_facilities where source_system=$1", [SOURCE]);
  const nameToId = new Map<string, string>();
  const idToName = new Map<string, string>();
  for (const r of fac.rows) { nameToId.set(r.display_name, r.id); idToName.set(r.id, r.display_name); }
  for (const r of sf.rows) nameToId.set(r.source_facility_name, r.facility_id);
  const split = await c.query(
    "select rtm.room_type_raw, f.display_name from app.room_type_mappings rtm join app.facilities f on f.id=rtm.override_facility_id where rtm.source_system=$1 and rtm.override_facility_id is not null", [SOURCE]);
  const aquaSplit = new Map<string, string>();
  for (const r of split.rows) aquaSplit.set(r.room_type_raw, r.display_name);
  const ch = await c.query("select channel_raw, channel_normalized from app.channel_mappings where source_system=$1", [SOURCE]);
  const chMap = new Map<string, string>();
  for (const r of ch.rows) chMap.set(r.channel_raw, r.channel_normalized);
  const ct = await c.query("select country_raw, country_normalized, country_major, country_middle from app.country_mappings");
  const ctMap = new Map<string, { countryNormalized: string; countryMajor: string; countryMiddle: string }>();
  for (const r of ct.rows) ctMap.set(r.country_raw, { countryNormalized: r.country_normalized, countryMajor: r.country_major, countryMiddle: r.country_middle });
  const fr = await c.query(
    "select id, rule_code, source_system, channel_normalized, valid_from::text vf, valid_to::text vt, gross_divisor::float8 gd, tax_rate::float8 tr, tax_rounding from app.fee_adjustment_rules where source_system is null or source_system=$1", [SOURCE]);
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
  return { ctx, nameToId, aquaSplit };
}

async function main() {
  await c.connect();
  const { ctx, nameToId, aquaSplit } = await buildContext();

  let canon: CanonicalStayNight[];
  if (SOURCE === "minpakuin") {
    const parsed = parseMinpakuinCsv(decodeUtf8(new Uint8Array(readFileSync(FILE))), "load");
    for (const row of parsed.rows) {
      const cleaned = cleanRoomType(row.payload[MINPAKU_COLUMNS.roomType] ?? "");
      row.payload[MINPAKU_COLUMNS.roomType] = cleaned;
      const base = row.payload[MINPAKU_COLUMNS.facilityName] ?? "";
      if (base === "アクアパレス北谷" && aquaSplit.has(cleaned)) row.payload[MINPAKU_COLUMNS.facilityName] = aquaSplit.get(cleaned)!;
    }
    canon = buildMinpaku(parsed, ctx);
  } else {
    if (!NEPPAN_FACILITY || !nameToId.has(NEPPAN_FACILITY)) { console.error(`ねっぱん施設名を source_facilities で解決できません: ${NEPPAN_FACILITY}`); process.exit(1); }
    const facId = nameToId.get(NEPPAN_FACILITY)!;
    const fixedCtx: NormalizeContext = { ...ctx, resolveFacilityId: () => facId };
    canon = buildNeppan(parseNeppanCsv(decodeShiftJis(new Uint8Array(readFileSync(FILE))), "load"), fixedCtx);
  }

  const dropped = canon.filter((x) => !x.facilityId).length;
  canon = canon.filter((x) => x.facilityId);
  console.log(`canonical rows: ${canon.length}${dropped ? ` (facility未解決で除外: ${dropped})` : ""}`);

  await c.query("delete from app.reservation_stay_nights where source_system=$1", [SOURCE]);
  const BATCH = 5000;
  let done = 0;
  const insertSql = `insert into app.reservation_stay_nights (${COLS.join(",")}) select ${COLS.join(",")} from jsonb_to_recordset($1::jsonb) as x(${COLDEF})`;
  for (let i = 0; i < canon.length; i += BATCH) {
    const batch = canon.slice(i, i + BATCH).map(toRow);
    await c.query(insertSql, [JSON.stringify(batch)]);
    done += batch.length;
    if (done % 50000 < BATCH || done === canon.length) console.log(`  inserted ${done}/${canon.length}`);
  }

  const n = await c.query("select count(*)::int n from app.reservation_stay_nights where source_system=$1", [SOURCE]);
  console.log(`DB canonical (${SOURCE}): ${n.rows[0].n}`);
  await c.end();
}
main().catch(async (e) => { console.log("ERROR:", (e as Error).message); try { await c.end(); } catch { /* noop */ } process.exit(1); });
