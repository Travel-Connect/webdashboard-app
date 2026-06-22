import type { CanonicalStayNight } from "../adapters/canonical-schema";
import { dayDiff } from "../adapters/shared";

/**
 * 予約単位・累積系の mart 集計（canonical → mart 行）。
 * scripts/verify/minpakuin-parity.ts で Excel と ±0 検証済みのロジックを昇格したもの。
 *   - 国籍別: 室数/人数/金額 ＋ 予約指標(予約件数/連泊/リードタイム)
 *   - 泊数分布: 予約単位(施設×OTA予約番号×部屋タイプ)→ チェックイン月×泊数バケット
 *   - ブッキングカーブ: リードタイム累積(>=閾値)・キャンセル含む/除外
 */

const UNK = "不明";
const isStay = (c: CanonicalStayNight) => c.isStayNight && !c.isCancelled;
const isAmt = (c: CanonicalStayNight) => (c.feeAdjustedGrossAmount ?? 0) !== 0 && !c.isCancelled;

// ============ 1. 国籍別 ============
export interface CountryMartRow {
  facilityId: string;
  stayMonth: string;
  countryMajor: string;
  countryMiddle: string;
  countryNormalized: string;
  soldRoomNights: number;
  guestCount: number;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  reservationCount: number;
  multiNightReservationCount: number;
  leadTimeTotal: number;
  leadTimeCount: number;
}

// (facility, country) -> {major, middle}。国分類リスト由来。miss は null（→ 大分類/中分類=不明）。
// create_report は (施設名|国) で引くため、分割施設(結の家/ANNEX)や未登録の国は 不明 に落ちる。国名は残す。
export type CountryClassifier = (facilityId: string, country: string) => { major: string; middle: string } | null;

function countryKey(c: CanonicalStayNight, classify: CountryClassifier) {
  const kuni = (c.countryRaw ?? "").trim() || UNK;
  const cl = kuni === UNK ? null : classify(c.facilityId, kuni);
  const major = cl ? cl.major : UNK;
  const middle = cl ? cl.middle : UNK;
  return { kuni, major, middle, k: `${c.facilityId}|${major}|${middle}|${kuni}|${c.stayMonth}` };
}

export function aggregateCountry(canon: CanonicalStayNight[], classify: CountryClassifier): CountryMartRow[] {
  const map = new Map<string, CountryMartRow>();
  const ensure = (c: CanonicalStayNight, kk: ReturnType<typeof countryKey>): CountryMartRow => {
    let r = map.get(kk.k);
    if (!r) {
      r = {
        facilityId: c.facilityId, stayMonth: c.stayMonth, countryMajor: kk.major, countryMiddle: kk.middle,
        countryNormalized: kk.kuni, soldRoomNights: 0, guestCount: 0, grossAmount: 0, taxAmount: 0, netAmount: 0,
        reservationCount: 0, multiNightReservationCount: 0, leadTimeTotal: 0, leadTimeCount: 0,
      };
      map.set(kk.k, r);
    }
    return r;
  };
  // 室数・人数（is_stay_night）/ 金額（gross<>0）
  for (const c of canon) {
    const kk = countryKey(c, classify);
    if (isStay(c)) { const r = ensure(c, kk); r.soldRoomNights += c.soldRoomNights; r.guestCount += c.guestCount ?? 0; }
    if (isAmt(c)) { const r = ensure(c, kk); r.grossAmount += c.feeAdjustedGrossAmount ?? 0; r.taxAmount += c.feeAdjustedTaxAmount ?? 0; r.netAmount += c.feeAdjustedNetAmount ?? 0; }
  }
  // 予約指標（予約単位: 施設×予約キー×部屋タイプ → 月×国で集計）
  interface Rv { checkin: string; booked: string | null; multiNight: number }
  const resv = new Map<string, Rv>();
  interface Mo { facilityId: string; gkey: string; major: string; middle: string; kuni: string; month: string }
  const monthly = new Map<string, Mo>();
  for (const c of canon) {
    if (c.isCancelled || !c.isStayNight) continue;
    if ((c.nights ?? 0) <= 0) continue;
    const gkey = `${c.facilityId}|${c.reservationKey}|${c.roomTypeRaw ?? ""}`;
    const r = resv.get(gkey);
    if (!r) resv.set(gkey, { checkin: c.stayDate, booked: c.bookedAt ?? null, multiNight: (c.nights ?? 0) >= 2 ? 1 : 0 });
    else {
      if (c.stayDate < r.checkin) r.checkin = c.stayDate;
      if (c.bookedAt && (!r.booked || c.bookedAt < r.booked)) r.booked = c.bookedAt;
    }
    const kk = countryKey(c, classify);
    const mkey = `${gkey}|${kk.kuni}|${c.stayMonth}`;
    if (!monthly.has(mkey)) monthly.set(mkey, { facilityId: c.facilityId, gkey, major: kk.major, middle: kk.middle, kuni: kk.kuni, month: c.stayMonth });
  }
  for (const m of monthly.values()) {
    const r = resv.get(m.gkey)!;
    const lead = r.booked ? dayDiff(r.checkin, r.booked.slice(0, 10)) : null;
    const k = `${m.facilityId}|${m.major}|${m.middle}|${m.kuni}|${m.month}`;
    const row = map.get(k);
    if (!row) continue; // stay 行が作成済みのはず
    row.reservationCount += 1;
    row.multiNightReservationCount += r.multiNight;
    if (lead != null && lead >= 0) { row.leadTimeCount += 1; row.leadTimeTotal += lead; }
  }
  return [...map.values()];
}

// ============ 2. 泊数分布 ============
export type NightsBucket = "1" | "2" | "3_4" | "5_6" | "7_plus";
export function nightsBucket(n: number): NightsBucket {
  if (n <= 1) return "1";
  if (n === 2) return "2";
  if (n <= 4) return "3_4";
  if (n <= 6) return "5_6";
  return "7_plus";
}
export interface StayNightsMartRow {
  facilityId: string;
  checkinMonth: string;
  roomTypeNormalized: string;
  nightsBucket: NightsBucket;
  reservationCount: number;
  soldRoomNights: number;
  guestCount: number;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
}

interface Resv {
  facilityId: string; roomType: string; checkin: string; nights: number;
  gross: number; tax: number; net: number; guestsFirst: number; roomNights: number;
}

/** 予約単位に畳んだ中間（exact nights）。検証/バケット両方に使う。 */
export function stayNightReservations(canon: CanonicalStayNight[]): Resv[] {
  const res = new Map<string, Resv>();
  for (const c of canon) {
    if (!c.isStayNight || c.isCancelled) continue;
    const n = c.nights ?? 0;
    if (n <= 0) continue;
    if (!c.otaReservationNo || !c.roomTypeRaw) continue; // groupby(dropna): 空OTA/部屋タイプは脱落
    const k = `${c.facilityId}|${c.otaReservationNo}|${c.roomTypeRaw}`;
    const cur = res.get(k);
    if (!cur) {
      res.set(k, {
        facilityId: c.facilityId, roomType: c.roomTypeRaw, checkin: c.stayDate, nights: n,
        gross: c.feeAdjustedGrossAmount ?? 0, tax: c.feeAdjustedTaxAmount ?? 0, net: c.feeAdjustedNetAmount ?? 0,
        guestsFirst: c.guestCount ?? 0, roomNights: c.soldRoomNights,
      });
    } else {
      cur.gross += c.feeAdjustedGrossAmount ?? 0;
      cur.tax += c.feeAdjustedTaxAmount ?? 0;
      cur.net += c.feeAdjustedNetAmount ?? 0;
      cur.roomNights += c.soldRoomNights;
      if (c.stayDate < cur.checkin) cur.checkin = c.stayDate; // チェックイン月=最小利用日。guestsFirst は最初の行のまま
    }
  }
  return [...res.values()];
}

export function aggregateStayNights(canon: CanonicalStayNight[]): StayNightsMartRow[] {
  const map = new Map<string, StayNightsMartRow>();
  for (const r of stayNightReservations(canon)) {
    const month = `${r.checkin.slice(0, 7)}-01`;
    const b = nightsBucket(r.nights);
    const mk = `${r.facilityId}|${month}|${r.roomType}|${b}`;
    let row = map.get(mk);
    if (!row) {
      row = { facilityId: r.facilityId, checkinMonth: month, roomTypeNormalized: r.roomType, nightsBucket: b, reservationCount: 0, soldRoomNights: 0, guestCount: 0, grossAmount: 0, taxAmount: 0, netAmount: 0 };
      map.set(mk, row);
    }
    row.reservationCount += 1;
    row.soldRoomNights += r.roomNights;
    row.guestCount += r.guestsFirst;
    row.grossAmount += r.gross;
    row.taxAmount += r.tax;
    row.netAmount += r.net;
  }
  return [...map.values()];
}

// ============ 3. ブッキングカーブ ============
export type CancelScope = "with_cancelled" | "without_cancelled";
export interface BookingCurveMartRow {
  facilityId: string;
  stayMonth: string;
  cancelScope: CancelScope;
  sameDay: number;
  oneDayBefore: number;
  twoDaysBefore: number;
  threeToSixDaysBefore: number;
  sevenToThirteenDaysBefore: number;
  fourteenToTwentyDaysBefore: number;
  twentyOneToThirtyDaysBefore: number;
  thirtyOneToSixtyDaysBefore: number;
  sixtyOneToNinetyDaysBefore: number;
  ninetyOneToOneTwentyDaysBefore: number;
  oneTwentyOneToOneFiftyDaysBefore: number;
  oneFiftyOnePlusDaysBefore: number;
}
type CurveField = Exclude<keyof BookingCurveMartRow, "facilityId" | "stayMonth" | "cancelScope">;
const CURVE_BUCKETS: [CurveField, number][] = [
  ["sameDay", 0], ["oneDayBefore", 1], ["twoDaysBefore", 2], ["threeToSixDaysBefore", 3],
  ["sevenToThirteenDaysBefore", 7], ["fourteenToTwentyDaysBefore", 14], ["twentyOneToThirtyDaysBefore", 21],
  ["thirtyOneToSixtyDaysBefore", 31], ["sixtyOneToNinetyDaysBefore", 61], ["ninetyOneToOneTwentyDaysBefore", 91],
  ["oneTwentyOneToOneFiftyDaysBefore", 121], ["oneFiftyOnePlusDaysBefore", 151],
];

export function aggregateBookingCurve(canon: CanonicalStayNight[]): BookingCurveMartRow[] {
  const map = new Map<string, BookingCurveMartRow>();
  const scopes: [CancelScope, boolean][] = [["with_cancelled", true], ["without_cancelled", false]];
  for (const [scope, includeCancel] of scopes) {
    for (const c of canon) {
      if (!c.isStayNight) continue;
      if (!includeCancel && c.isCancelled) continue;
      if (c.leadTimeDays == null || c.leadTimeDays < 0) continue;
      const k = `${scope}|${c.facilityId}|${c.stayMonth}`;
      let row = map.get(k);
      if (!row) {
        row = {
          facilityId: c.facilityId, stayMonth: c.stayMonth, cancelScope: scope,
          sameDay: 0, oneDayBefore: 0, twoDaysBefore: 0, threeToSixDaysBefore: 0, sevenToThirteenDaysBefore: 0,
          fourteenToTwentyDaysBefore: 0, twentyOneToThirtyDaysBefore: 0, thirtyOneToSixtyDaysBefore: 0,
          sixtyOneToNinetyDaysBefore: 0, ninetyOneToOneTwentyDaysBefore: 0, oneTwentyOneToOneFiftyDaysBefore: 0,
          oneFiftyOnePlusDaysBefore: 0,
        };
        map.set(k, row);
      }
      for (const [field, th] of CURVE_BUCKETS) {
        if (c.leadTimeDays >= th) row[field] = row[field] + c.soldRoomNights;
      }
    }
  }
  return [...map.values()];
}

// long 形式（リードタイム別 累積 販売室数＋売上）。wide の aggregateBookingCurve と
// 同一の累積ロジック（lead >= 閾値 のバケットに加算）に売上(gross/net)を追加。
export interface BookingCurveLeadRow {
  facilityId: string;
  stayMonth: string;
  cancelScope: CancelScope;
  leadBucket: CurveField; // "sameDay" .. "oneFiftyOnePlusDaysBefore"
  soldRoomNights: number;
  grossAmount: number;
  netAmount: number;
}

export function aggregateBookingCurveLead(canon: CanonicalStayNight[]): BookingCurveLeadRow[] {
  const map = new Map<string, BookingCurveLeadRow>();
  const scopes: [CancelScope, boolean][] = [["with_cancelled", true], ["without_cancelled", false]];
  for (const [scope, includeCancel] of scopes) {
    for (const c of canon) {
      if (!includeCancel && c.isCancelled) continue;
      if (c.leadTimeDays == null || c.leadTimeDays < 0) continue; // 有効リードタイムのみバケット可
      // 室数 = 検証済み ROOMS フィルタ（is_stay_night 行のみ）。
      // 売上 = daily/channel/room_type と同じ AMT 定義（fee_adjusted_gross<>0・not cancelled、
      // is_stay_night では絞らない）に合わせる。net は gross<>0 でゲート（AMT と同一）。
      // ← こうしないと is_stay_night=false の売上行が落ち、稼働分析(売上)と不一致になる。
      const rooms = c.isStayNight ? c.soldRoomNights : 0;
      const grossRaw = c.feeAdjustedGrossAmount ?? 0;
      const net = grossRaw !== 0 ? (c.feeAdjustedNetAmount ?? 0) : 0;
      if (rooms === 0 && grossRaw === 0) continue;
      for (const [field, th] of CURVE_BUCKETS) {
        if (c.leadTimeDays < th) continue;
        const k = `${scope}|${c.facilityId}|${c.stayMonth}|${field}`;
        let row = map.get(k);
        if (!row) {
          row = {
            facilityId: c.facilityId,
            stayMonth: c.stayMonth,
            cancelScope: scope,
            leadBucket: field,
            soldRoomNights: 0,
            grossAmount: 0,
            netAmount: 0,
          };
          map.set(k, row);
        }
        row.soldRoomNights += rooms;
        row.grossAmount += grossRaw;
        row.netAmount += net;
      }
    }
  }
  return [...map.values()];
}
