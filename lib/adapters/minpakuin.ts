import type { CanonicalStayNight } from "./canonical-schema";
import type {
  ImportAdapter,
  NormalizeContext,
  ParsedSourceRows,
  ValidationIssue,
  ValidationResult,
} from "./types";
import {
  applyFeeAdjustment,
  dayDiff,
  isBlank,
  isNumericLike,
  jstMidnightIso,
  monthStart,
  parseCsv,
  parseDate,
  pickFeeRule,
  toNumOr0,
  toRecords,
} from "./shared";

/**
 * minpakuIN adapter（M13）。
 * base.csv（UTF-8 BOM, 1行=1部屋利用日）を canonical へ変換する。
 *
 * 集計ルール（要件§2.2 / 詳細設計§5.3）:
 *   - sold_room_nights = 1（室数は行数。同一キー衝突は SUM で室数化）
 *   - is_stay_night    = 部屋利用日 != チェックアウト日（チェックアウト行を除外）
 *   - is_cancelled     = ステータス == "キャンセル済み"
 *   - reservation_key  = OTA予約番号、空なら チェックインコード
 *   - 税抜(net)        = 宿泊費 - 消費税（raw 消費税を使用、再計算しない）
 *   - 手数料補正        = Agoda(2026-01-01〜)/0.88, Trip.com(2026-02-01〜)/0.85
 */

const SOURCE = "minpakuin" as const;

/** base.csv の主な列（要件§5.1） */
export const MINPAKU_COLUMNS = {
  facilityName: "施設名",
  checkinCode: "チェックインコード",
  otaReservationNo: "OTA予約番号",
  stayDate: "部屋利用日",
  roomType: "部屋タイプ",
  guestCount: "合計人数",
  checkoutDate: "チェックアウト日",
  nights: "泊数",
  bookedAt: "予約受付日",
  channel: "予約経路",
  tax: "消費税",
  gross: "宿泊費",
  status: "ステータス",
  country: "国",
} as const;

export const REQUIRED_COLUMNS: string[] = [
  MINPAKU_COLUMNS.facilityName,
  MINPAKU_COLUMNS.stayDate,
  MINPAKU_COLUMNS.roomType,
  MINPAKU_COLUMNS.gross,
  MINPAKU_COLUMNS.status,
];

/** ヘッダ署名で minpakuIN 形式を判定 */
export function detectHeader(header: string[]): boolean {
  const set = new Set(header.map((h) => h.trim()));
  return REQUIRED_COLUMNS.every((c) => set.has(c));
}

const CANCELLED_STATUS = "キャンセル済み";

/** UTF-8(BOM可) テキスト → ParsedSourceRows */
export function parseMinpakuinCsv(text: string, rawFileId: string): ParsedSourceRows {
  const { records } = toRecords(parseCsv(text));
  return {
    sourceSystem: SOURCE,
    rawFileId,
    rows: records.map((r) => ({ rawRowNumber: r.rawRowNumber, payload: r.payload })),
  };
}

interface Intermediate {
  key: string;
  facilityId: string;
  reservationKey: string;
  checkinCode: string | null;
  otaReservationNo: string | null;
  status: string;
  isCancelled: boolean;
  channelRaw: string;
  stayDate: string;
  stayMonth: string;
  checkoutDate: string | null;
  bookedYmd: string | null;
  roomTypeRaw: string;
  nights: number | null;
  countryRaw: string;
  // 加算対象
  rawGross: number;
  rawTax: number;
  guestCount: number;
  soldRoomNights: number;
  rawRowNumbers: number[];
}

function toIntermediate(
  payload: Record<string, string>,
  rawRowNumber: number,
  ctx: NormalizeContext,
): Intermediate | null {
  const C = MINPAKU_COLUMNS;
  const facilityName = payload[C.facilityName] ?? "";
  const facilityId = ctx.resolveFacilityId({
    sourceSystem: SOURCE,
    sourceFacilityCode: facilityName,
    sourceFacilityName: facilityName,
  });
  const stayDate = parseDate(payload[C.stayDate]);
  if (!facilityId || !stayDate) return null; // validate 側で error として報告

  const ota = (payload[C.otaReservationNo] ?? "").trim();
  const checkin = (payload[C.checkinCode] ?? "").trim();
  const reservationKey = ota || checkin;
  if (!reservationKey) return null;

  const roomTypeRaw = payload[C.roomType] ?? "";
  const checkoutDate = parseDate(payload[C.checkoutDate]);
  const status = payload[C.status] ?? "";
  const bookedYmd = parseDate(payload[C.bookedAt]);

  return {
    key: [SOURCE, facilityId, reservationKey, stayDate, roomTypeRaw, "", ""].join("|"),
    facilityId,
    reservationKey,
    checkinCode: checkin || null,
    otaReservationNo: ota || null,
    status,
    isCancelled: status === CANCELLED_STATUS,
    channelRaw: payload[C.channel] ?? "",
    stayDate,
    stayMonth: monthStart(stayDate),
    checkoutDate,
    bookedYmd,
    roomTypeRaw,
    nights: isBlank(payload[C.nights]) ? null : Math.trunc(toNumOr0(payload[C.nights])),
    countryRaw: payload[C.country] ?? "",
    rawGross: toNumOr0(payload[C.gross]),
    rawTax: toNumOr0(payload[C.tax]),
    guestCount: Math.trunc(toNumOr0(payload[C.guestCount])),
    soldRoomNights: 1,
    rawRowNumbers: [rawRowNumber],
  };
}

/** ParsedSourceRows → canonical（同一キーは SUM 集約 = 室数/金額の積み上げ） */
export function buildCanonicalRows(
  parsed: ParsedSourceRows,
  ctx: NormalizeContext,
): CanonicalStayNight[] {
  const groups = new Map<string, Intermediate>();
  for (const row of parsed.rows) {
    const im = toIntermediate(row.payload, row.rawRowNumber, ctx);
    if (!im) continue;
    const existing = groups.get(im.key);
    if (!existing) {
      groups.set(im.key, im);
    } else {
      existing.rawGross += im.rawGross;
      existing.rawTax += im.rawTax;
      existing.guestCount += im.guestCount;
      existing.soldRoomNights += im.soldRoomNights;
      existing.rawRowNumbers.push(...im.rawRowNumbers);
    }
  }

  const out: CanonicalStayNight[] = [];
  for (const im of groups.values()) {
    const channel = ctx.resolveChannel({ sourceSystem: SOURCE, channelRaw: im.channelRaw });
    const channelNormalized = channel?.channelNormalized ?? (im.channelRaw || null);
    const rule = pickFeeRule(ctx.feeRules, {
      sourceSystem: SOURCE,
      channelNormalized,
      stayDate: im.stayDate,
    });
    const fee = applyFeeAdjustment(im.rawGross, im.rawTax, rule);
    const netAmount = im.rawGross - im.rawTax;

    const roomType = ctx.resolveRoomType({
      sourceSystem: SOURCE,
      facilityId: im.facilityId,
      roomTypeRaw: im.roomTypeRaw,
    });
    const country = ctx.resolveCountry({ countryRaw: im.countryRaw });

    const leadTimeDays = im.bookedYmd ? dayDiff(im.stayDate, im.bookedYmd) : null;
    const isValidLeadTime = leadTimeDays !== null && leadTimeDays >= 0;

    out.push({
      sourceSystem: SOURCE,
      currentRecordKey: im.key,
      facilityId: im.facilityId,
      reservationKey: im.reservationKey,
      checkinCode: im.checkinCode,
      otaReservationNo: im.otaReservationNo,
      status: im.status,
      isCancelled: im.isCancelled,
      channel: im.channelRaw || null,
      stayDate: im.stayDate,
      stayMonth: im.stayMonth,
      checkinDate: null,
      checkoutDate: im.checkoutDate,
      bookedAt: im.bookedYmd ? jstMidnightIso(im.bookedYmd) : null,
      roomTypeRaw: im.roomTypeRaw,
      roomTypeNormalized: roomType?.roomTypeNormalized ?? null,
      budgetRoomType: roomType?.budgetRoomType ?? null,
      roomNo: "",
      nights: im.nights,
      stayNightIndex: null,
      soldRoomNights: im.soldRoomNights,
      guestCount: im.guestCount,
      adultCount: null,
      childCount: null,
      grossAmount: im.rawGross,
      taxAmount: im.rawTax,
      netAmount,
      feeAdjustedGrossAmount: fee.grossAmount,
      feeAdjustedTaxAmount: fee.taxAmount,
      feeAdjustedNetAmount: fee.netAmount,
      feeAdjustmentRuleId: fee.ruleId,
      countryRaw: im.countryRaw || null,
      countryNormalized: country?.countryNormalized ?? (im.countryRaw || "不明"),
      countryMajor: country?.countryMajor ?? "不明",
      countryMiddle: country?.countryMiddle ?? "不明",
      isStayNight: im.checkoutDate ? im.stayDate !== im.checkoutDate : true,
      leadTimeDays,
      isValidLeadTime,
      sourceUpdatedAt: null,
    });
  }
  return out;
}

/** §5 validation（minpakuIN は PII を含まないため message に値を出しても可だが、出さない方針を踏襲） */
export function validateMinpakuin(parsed: ParsedSourceRows, ctx: NormalizeContext): ValidationResult {
  const C = MINPAKU_COLUMNS;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  for (const row of parsed.rows) {
    const p = row.payload;
    const n = row.rawRowNumber;

    const facilityName = p[C.facilityName] ?? "";
    const facilityId = ctx.resolveFacilityId({
      sourceSystem: SOURCE,
      sourceFacilityCode: facilityName,
      sourceFacilityName: facilityName,
    });
    if (!facilityId) {
      errors.push({ severity: "error", code: "UNKNOWN_FACILITY", message: "施設マッピングが見つかりません", rawRowNumber: n, field: C.facilityName });
    }
    if (!parseDate(p[C.stayDate])) {
      errors.push({ severity: "error", code: "MISSING_REQUIRED_DATE", message: "部屋利用日が日付として解釈できません", rawRowNumber: n, field: C.stayDate });
    }
    if (!isBlank(p[C.gross]) && !isNumericLike(p[C.gross])) {
      errors.push({ severity: "error", code: "INVALID_AMOUNT", message: "宿泊費が数値化できません", rawRowNumber: n, field: C.gross });
    }
    if (!isBlank(p[C.tax]) && !isNumericLike(p[C.tax])) {
      errors.push({ severity: "error", code: "INVALID_AMOUNT", message: "消費税が数値化できません", rawRowNumber: n, field: C.tax });
    }
    if (facilityId && ctx.resolveRoomType({ sourceSystem: SOURCE, facilityId, roomTypeRaw: p[C.roomType] ?? "" }) === null) {
      warnings.push({ severity: "warning", code: "UNKNOWN_ROOM_TYPE", message: "部屋タイプマッピングが未登録です", rawRowNumber: n, field: C.roomType });
    }
    if (ctx.resolveChannel({ sourceSystem: SOURCE, channelRaw: p[C.channel] ?? "" }) === null) {
      warnings.push({ severity: "warning", code: "UNKNOWN_CHANNEL", message: "予約経路マッピングが未登録です", rawRowNumber: n, field: C.channel });
    }
    if (ctx.resolveCountry({ countryRaw: p[C.country] ?? "" }) === null) {
      warnings.push({ severity: "warning", code: "UNKNOWN_COUNTRY", message: "国籍マッピングが未登録です", rawRowNumber: n, field: C.country });
    }
    const booked = parseDate(p[C.bookedAt]);
    const stay = parseDate(p[C.stayDate]);
    if (!booked || (stay && dayDiff(stay, booked) < 0)) {
      warnings.push({ severity: "warning", code: "LEAD_TIME_INVALID", message: "予約受付日が無いかリードタイムが負です", rawRowNumber: n, field: C.bookedAt });
    }
  }

  return { canCommit: errors.length === 0, errors, warnings };
}

function notWired(): never {
  throw new Error("raw file の読込は import API（M18）で実装します");
}

export const minpakuinAdapter: ImportAdapter = {
  sourceSystem: SOURCE,
  async detect(): Promise<boolean> {
    return notWired();
  },
  async parse(): Promise<ParsedSourceRows> {
    return notWired();
  },
  async validate(rows: ParsedSourceRows, context: NormalizeContext): Promise<ValidationResult> {
    return validateMinpakuin(rows, context);
  },
  async normalize(rows: ParsedSourceRows, context: NormalizeContext): Promise<CanonicalStayNight[]> {
    return buildCanonicalRows(rows, context);
  },
};
