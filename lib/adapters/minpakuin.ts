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
  roomNo: "部屋番号",
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
  roomNo: string;
  nights: number | null;
  countryRaw: string;
  feeRuleId: string | null;
  // 加算対象（手数料補正は create_report.py と同じく「行ごとに補正→合算」）
  rawGross: number;
  rawTax: number;
  feeGross: number;
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
  const roomNo = (payload[C.roomNo] ?? "").trim();
  const checkoutDate = parseDate(payload[C.checkoutDate]);
  const status = payload[C.status] ?? "";
  const isCancelled = status === CANCELLED_STATUS;
  const bookedYmd = parseDate(payload[C.bookedAt]);

  // 手数料補正は「行ごとに round(宿泊費/divisor)」（create_report.py:202,210 と同粒度）。
  const channelRaw = payload[C.channel] ?? "";
  const channel = ctx.resolveChannel({ sourceSystem: SOURCE, channelRaw });
  const channelNormalized = channel?.channelNormalized ?? (channelRaw || null);
  const rule = pickFeeRule(ctx.feeRules, { sourceSystem: SOURCE, channelNormalized, stayDate });
  const rawGross = toNumOr0(payload[C.gross]);
  const rawTax = toNumOr0(payload[C.tax]);
  const fee = applyFeeAdjustment(rawGross, rawTax, rule);

  return {
    // checkoutDate と キャンセルフラグ を key に含める: base.csv は同一(予約,利用日,部屋,タイプ)に
    // 親子判別=0 のチェックアウト日行や キャンセル済みの重複行 を別行で持つため、これらを分離して
    // 集約しないと create_report.py の行単位カウント（status/親子判別でのフィルタ）と一致しない。
    key: [SOURCE, facilityId, reservationKey, stayDate, roomTypeRaw, roomNo, checkoutDate ?? "", isCancelled ? "C" : ""].join("|"),
    facilityId,
    reservationKey,
    checkinCode: checkin || null,
    otaReservationNo: ota || null,
    status,
    isCancelled,
    channelRaw,
    stayDate,
    stayMonth: monthStart(stayDate),
    checkoutDate,
    bookedYmd,
    roomTypeRaw,
    roomNo,
    nights: isBlank(payload[C.nights]) ? null : Math.trunc(toNumOr0(payload[C.nights])),
    countryRaw: payload[C.country] ?? "",
    feeRuleId: fee.ruleId,
    rawGross,
    rawTax,
    feeGross: fee.grossAmount,
    guestCount: Math.trunc(toNumOr0(payload[C.guestCount])),
    soldRoomNights: 1,
    rawRowNumbers: [rawRowNumber],
  };
}

/**
 * ParsedSourceRows → canonical。minpakuIN は 1行=1室泊（sold_room_nights=1）。
 * 集約せず1行ずつ canonical 化し、予約受付日・合計人数など「行ごとの属性」を保持する。
 * base.csv は同一(予約・利用日・部屋)に親子判別=0行/キャンセル重複行/受付日違いの
 * 修正行などを別行で持ち、create_report.py はそれらを行単位で集計するため、集約すると
 * 予約受付日(ブッキングカーブ)や合計人数(泊数分布)が一致しない。完全重複行は連番(seq)で区別。
 * 室数は SUM(sold_room_nights)=行数 で求まる（COUNT(*) と一致）。
 */
export function buildCanonicalRows(
  parsed: ParsedSourceRows,
  ctx: NormalizeContext,
): CanonicalStayNight[] {
  const seq = new Map<string, number>();
  const out: CanonicalStayNight[] = [];
  for (const row of parsed.rows) {
    const im = toIntermediate(row.payload, row.rawRowNumber, ctx);
    if (!im) continue;
    const n = seq.get(im.key) ?? 0;
    seq.set(im.key, n + 1);
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
      currentRecordKey: `${im.key}|${n}`,
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
      roomNo: im.roomNo,
      nights: im.nights,
      stayNightIndex: null,
      soldRoomNights: im.soldRoomNights,
      guestCount: im.guestCount,
      adultCount: null,
      childCount: null,
      grossAmount: im.rawGross,
      taxAmount: im.rawTax,
      netAmount,
      feeAdjustedGrossAmount: im.feeGross,
      feeAdjustedTaxAmount: im.rawTax,
      feeAdjustedNetAmount: im.feeGross - im.rawTax,
      feeAdjustmentRuleId: im.feeRuleId,
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
