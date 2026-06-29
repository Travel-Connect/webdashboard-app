/**
 * 予約単位・累積系の mart を DB canonical から再構築:
 *   mart.monthly_country_metrics / stay_nights_distribution / booking_curve_monthly
 * lib/mart/aggregate.ts（Excel ±0 検証済み）を使用。国分類は 国分類リスト.xlsx を
 * (facility_id|国) で引く（create_report と一致）。
 *   NODE_OPTIONS=--max-old-space-size=8192 npx tsx scripts/db/refresh-marts2.ts
 */
import { Client } from "pg";
import * as XLSX from "xlsx";
import { loadEnv, isConfigured } from "./load-env";
import type { CanonicalStayNight } from "../../lib/adapters/canonical-schema";
import { aggregateBookingCurve, aggregateBookingCurveLead, aggregateCountry, aggregateStayNights, type BookingCurveLeadRow, type BookingCurveMartRow, type CountryMartRow, type StayNightsMartRow } from "../../lib/mart/aggregate";

loadEnv();
if (!isConfigured("SUPABASE_DB_URL")) { console.error("SUPABASE_DB_URL 未設定"); process.exit(1); }
const CLASSIFY = process.argv[2] ??
  "C:\\Users\\tckam\\OneDrive - トラベルコネクト\\005.レポート\\コルディオグループ\\全施設レポート\\コルディオグループレポートNEW\\minpakuIN-download\\国分類リスト.xlsx";
const RENAME: Record<string, string> = { "琉心 恩納": "琉心 プライベートプール 恩納" };

const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

async function readCanonical(): Promise<CanonicalStayNight[]> {
  // booked_at は JST 日付に（adapter が保持した現地日付＝lead 計算の基準）
  const q = await c.query(`
    select facility_id, stay_date::text sd, stay_month::text sm, is_stay_night, is_cancelled,
      sold_room_nights::float8 srn, guest_count, fee_adjusted_gross_amount::float8 fg,
      fee_adjusted_tax_amount::float8 ft, fee_adjusted_net_amount::float8 fn, nights,
      reservation_key, room_type_raw, ota_reservation_no,
      to_char(booked_at at time zone 'Asia/Tokyo','YYYY-MM-DD') booked_date,
      lead_time_days, country_raw
    from app.reservation_stay_nights`);
  return q.rows.map((r) => ({
    facilityId: r.facility_id, stayDate: r.sd, stayMonth: r.sm, isStayNight: r.is_stay_night, isCancelled: r.is_cancelled,
    soldRoomNights: Number(r.srn), guestCount: r.guest_count, feeAdjustedGrossAmount: r.fg == null ? null : Number(r.fg),
    feeAdjustedTaxAmount: r.ft == null ? null : Number(r.ft), feeAdjustedNetAmount: r.fn == null ? null : Number(r.fn),
    nights: r.nights, reservationKey: r.reservation_key, roomTypeRaw: r.room_type_raw, otaReservationNo: r.ota_reservation_no,
    bookedAt: r.booked_date, leadTimeDays: r.lead_time_days, countryRaw: r.country_raw,
  })) as unknown as CanonicalStayNight[];
}

async function buildClassifier() {
  const fac = await c.query("select id, display_name from app.facilities");
  const sf = await c.query("select source_facility_name, facility_id from app.source_facilities where source_system='minpakuin'");
  const nameToId = new Map<string, string>();
  for (const r of fac.rows) nameToId.set(r.display_name, r.id);
  for (const r of sf.rows) nameToId.set(r.source_facility_name, r.facility_id);
  const wb = XLSX.readFile(CLASSIFY);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  const h = (rows[0] as string[]).map((s) => String(s).trim());
  const hi = (n: string) => h.indexOf(n);
  const clMap = new Map<string, { major: string; middle: string }>();
  let mapped = 0;
  for (const r of rows.slice(1)) {
    const fnRaw = String(r[hi("施設名")] ?? "").trim();
    const kuni = String(r[hi("国")] ?? "").trim();
    if (!fnRaw || !kuni) continue;
    const id = nameToId.get(fnRaw) ?? nameToId.get(RENAME[fnRaw] ?? "");
    if (!id) continue;
    clMap.set(`${id}|${kuni}`, { major: String(r[hi("大分類")] ?? "").trim() || "不明", middle: String(r[hi("中分類")] ?? "").trim() || "不明" });
    mapped++;
  }
  console.log(`国分類: ${mapped} (施設×国) 行マップ`);
  return (facilityId: string, country: string) => clMap.get(`${facilityId}|${country}`) ?? null;
}

async function insertBatched(table: string, cols: string[], coldef: string, rows: Record<string, unknown>[]) {
  await c.query(`truncate ${table}`);
  const sql = `insert into ${table} (${cols.join(",")}) select ${cols.join(",")} from jsonb_to_recordset($1::jsonb) as x(${coldef})`;
  for (let i = 0; i < rows.length; i += 5000) await c.query(sql, [JSON.stringify(rows.slice(i, i + 5000))]);
  console.log(`  ${table}: ${rows.length} 行`);
}

async function main() {
  await c.connect();
  const classify = await buildClassifier();
  console.log("canonical 読込中...");
  const canon = await readCanonical();
  console.log(`canonical=${canon.length}`);

  // 国籍別
  const country: CountryMartRow[] = aggregateCountry(canon, classify);
  await insertBatched(
    "mart.monthly_country_metrics",
    ["facility_id", "stay_month", "country_major", "country_middle", "country_normalized", "sold_room_nights", "guest_count", "gross_amount", "tax_amount", "net_amount", "reservation_count", "multi_night_reservation_count", "lead_time_total", "lead_time_count"],
    "facility_id uuid, stay_month date, country_major text, country_middle text, country_normalized text, sold_room_nights numeric, guest_count int, gross_amount numeric, tax_amount numeric, net_amount numeric, reservation_count int, multi_night_reservation_count int, lead_time_total bigint, lead_time_count int",
    country.map((r) => ({ facility_id: r.facilityId, stay_month: r.stayMonth, country_major: r.countryMajor, country_middle: r.countryMiddle, country_normalized: r.countryNormalized, sold_room_nights: r.soldRoomNights, guest_count: r.guestCount, gross_amount: r.grossAmount, tax_amount: r.taxAmount, net_amount: r.netAmount, reservation_count: r.reservationCount, multi_night_reservation_count: r.multiNightReservationCount, lead_time_total: r.leadTimeTotal, lead_time_count: r.leadTimeCount })),
  );

  // 泊数分布（ADR/同伴係数 はセル丸め値の加重和を保持＝Excel SUMPRODUCT 式）
  await c.query(`alter table mart.stay_nights_distribution add column if not exists adr_weighted_num  numeric not null default 0`);
  await c.query(`alter table mart.stay_nights_distribution add column if not exists comp_weighted_num numeric not null default 0`);
  await c.query(`alter table mart.stay_nights_distribution add column if not exists occ_sold_room_nights numeric not null default 0`);
  await c.query(`alter table mart.stay_nights_distribution add column if not exists occ_guest_count integer not null default 0`);
  await c.query(`alter table mart.stay_nights_distribution add column if not exists occ_gross_amount numeric not null default 0`);
  await c.query(`alter table mart.stay_nights_distribution add column if not exists occ_net_amount numeric not null default 0`);
  const sn: StayNightsMartRow[] = aggregateStayNights(canon);
  await insertBatched(
    "mart.stay_nights_distribution",
    ["facility_id", "checkin_month", "room_type_normalized", "nights_bucket", "reservation_count", "sold_room_nights", "guest_count", "gross_amount", "tax_amount", "net_amount", "adr_weighted_num", "comp_weighted_num", "occ_sold_room_nights", "occ_guest_count", "occ_gross_amount", "occ_net_amount"],
    "facility_id uuid, checkin_month date, room_type_normalized text, nights_bucket text, reservation_count int, sold_room_nights numeric, guest_count int, gross_amount numeric, tax_amount numeric, net_amount numeric, adr_weighted_num numeric, comp_weighted_num numeric, occ_sold_room_nights numeric, occ_guest_count int, occ_gross_amount numeric, occ_net_amount numeric",
    sn.map((r) => ({ facility_id: r.facilityId, checkin_month: r.checkinMonth, room_type_normalized: r.roomTypeNormalized, nights_bucket: r.nightsBucket, reservation_count: r.reservationCount, sold_room_nights: r.soldRoomNights, guest_count: r.guestCount, gross_amount: r.grossAmount, tax_amount: r.taxAmount, net_amount: r.netAmount, adr_weighted_num: r.adrWeightedNum, comp_weighted_num: r.compWeightedNum, occ_sold_room_nights: r.occSoldRoomNights, occ_guest_count: r.occGuestCount, occ_gross_amount: r.occGrossAmount, occ_net_amount: r.occNetAmount })),
  );

  // ブッキングカーブ
  const bc: BookingCurveMartRow[] = aggregateBookingCurve(canon);
  await insertBatched(
    "mart.booking_curve_monthly",
    ["facility_id", "stay_month", "cancel_scope", "same_day", "one_day_before", "two_days_before", "three_to_six_days_before", "seven_to_thirteen_days_before", "fourteen_to_twenty_days_before", "twenty_one_to_thirty_days_before", "thirty_one_to_sixty_days_before", "sixty_one_to_ninety_days_before", "ninety_one_to_one_twenty_days_before", "one_twenty_one_to_one_fifty_days_before", "one_fifty_one_plus_days_before"],
    "facility_id uuid, stay_month date, cancel_scope text, same_day numeric, one_day_before numeric, two_days_before numeric, three_to_six_days_before numeric, seven_to_thirteen_days_before numeric, fourteen_to_twenty_days_before numeric, twenty_one_to_thirty_days_before numeric, thirty_one_to_sixty_days_before numeric, sixty_one_to_ninety_days_before numeric, ninety_one_to_one_twenty_days_before numeric, one_twenty_one_to_one_fifty_days_before numeric, one_fifty_one_plus_days_before numeric",
    bc.map((r) => ({ facility_id: r.facilityId, stay_month: r.stayMonth, cancel_scope: r.cancelScope, same_day: r.sameDay, one_day_before: r.oneDayBefore, two_days_before: r.twoDaysBefore, three_to_six_days_before: r.threeToSixDaysBefore, seven_to_thirteen_days_before: r.sevenToThirteenDaysBefore, fourteen_to_twenty_days_before: r.fourteenToTwentyDaysBefore, twenty_one_to_thirty_days_before: r.twentyOneToThirtyDaysBefore, thirty_one_to_sixty_days_before: r.thirtyOneToSixtyDaysBefore, sixty_one_to_ninety_days_before: r.sixtyOneToNinetyDaysBefore, ninety_one_to_one_twenty_days_before: r.ninetyOneToOneTwentyDaysBefore, one_twenty_one_to_one_fifty_days_before: r.oneTwentyOneToOneFiftyDaysBefore, one_fifty_one_plus_days_before: r.oneFiftyOnePlusDaysBefore })),
  );

  // ブッキングカーブ（long: リードタイム別 累積 販売室数＋売上）
  await c.query(`create table if not exists mart.booking_curve_lead_metrics (
    facility_id uuid not null references app.facilities(id) on delete cascade,
    stay_month date not null, cancel_scope text not null, lead_bucket text not null,
    sold_room_nights numeric not null default 0, gross_amount numeric not null default 0, net_amount numeric not null default 0,
    primary key (facility_id, stay_month, cancel_scope, lead_bucket))`);
  const bcl: BookingCurveLeadRow[] = aggregateBookingCurveLead(canon);
  await insertBatched(
    "mart.booking_curve_lead_metrics",
    ["facility_id", "stay_month", "cancel_scope", "lead_bucket", "sold_room_nights", "gross_amount", "net_amount"],
    "facility_id uuid, stay_month date, cancel_scope text, lead_bucket text, sold_room_nights numeric, gross_amount numeric, net_amount numeric",
    bcl.map((r) => ({ facility_id: r.facilityId, stay_month: r.stayMonth, cancel_scope: r.cancelScope, lead_bucket: r.leadBucket, sold_room_nights: r.soldRoomNights, gross_amount: r.grossAmount, net_amount: r.netAmount })),
  );

  // 検証: minpakuin 施設の国籍別グランド総計（mart-parity.ts の ±0 値と一致するはず）
  const v = await c.query(`
    select coalesce(sum(sold_room_nights),0)::bigint rooms, coalesce(sum(gross_amount),0)::bigint gross,
      coalesce(sum(reservation_count),0)::bigint resv, coalesce(sum(lead_time_total),0)::bigint lt
    from mart.monthly_country_metrics m
    where m.facility_id in (select distinct facility_id from app.reservation_stay_nights where source_system='minpakuin')`);
  const r = v.rows[0];
  console.log(`\n検証(minpakuin 国籍別総計): rooms=${r.rooms}(期待207268) gross=${r.gross}(期待5263919716) 予約=${r.resv}(期待98570) LT=${r.lt}(期待4768390)`);
  await c.end();
}
main().catch(async (e) => { console.log("ERROR:", (e as Error).message); try { await c.end(); } catch {} process.exit(1); });
