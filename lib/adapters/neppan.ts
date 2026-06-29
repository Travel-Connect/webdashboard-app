import type { CanonicalStayNight } from "./canonical-schema";
import type {
  ImportAdapter,
  NormalizeContext,
  ParsedSourceRows,
  ValidationIssue,
  ValidationResult,
} from "./types";
import {
  addDays,
  dayDiff,
  isBlank,
  isNumericLike,
  jstMidnightIso,
  monthStart,
  parseCsv,
  parseDate,
  reverseTax,
  toNumOr0,
  toRecords,
} from "./shared";

/**
 * ねっぱん adapter（M14）。format (A) 泊明細CSV（44列, cp932, 1予約×1泊に分解済）専用。
 * 計画: docs/neppan-adapter-plan.md / 検証済ロジック: docs/neppan-csv-revenue-rooms-logic.md。
 *
 * 主ルール:
 *   - 列名（日本語完全一致）でマッピング。PII列は canonical に出さない（列名 deny-list）。
 *   - stay_date = チェックイン日 + (泊目 - 1日)
 *   - reservation_key = 予約ID + "|" + 予約番号
 *   - 売上(gross) = 大人合計額 + 子供合計額 + 幼児合計額 + その他合計額（4要素・D2確定）
 *   - 税込総額なので税率10%で逆算: tax = floor(gross*10/110), net = gross - tax
 *   - sold_room_nights = 室数。is_cancelled = 予約区分=="キャンセル"（"変更"は集計対象）
 *   - 同一 current_record_key の料金内訳行を集約: 売上=sum / 室数・人数=max
 *   - country は列が無いため "不明"。手数料補正なし（neppan は gross_divisor=1）。
 */

const SOURCE = "neppan" as const;

export const NEPPAN_COLUMNS = {
  reservationId: "予約ID",
  reservationKind: "予約区分",
  reservationNo: "予約番号",
  nightIndex: "泊目",
  checkinDate: "チェックイン日",
  checkoutDate: "チェックアウト日",
  appliedAt: "申込日",
  nights: "泊数",
  channel: "予約サイト名称",
  roomType: "部屋タイプ名称",
  rooms: "室数",
  adultCount: "大人人数計",
  childCount: "子供人数計",
  infantCount: "幼児人数計",
  totalAmount: "料金合計額",
  adultAmount: "大人合計額",
  childAmount: "子供合計額",
  infantAmount: "幼児合計額",
  otherAmount: "その他合計額",
  updatedAt: "更新日",
} as const;

/** canonical へ載せない個人情報列（列名 deny-list。位置レンジ依存にしない） */
export const PII_COLUMNS: ReadonlySet<string> = new Set([
  "宿泊者氏名",
  "宿泊者氏名カタカナ",
  "電話番号",
  "郵便番号",
  "住所1",
  "メールアドレス",
  "予約者氏名",
  "予約者氏名カタカナ",
  "会員番号",
  "法人情報",
]);

/** detect/必須列の署名（旧ETL REQUIRED_COLUMNS 相当） */
export const REQUIRED_COLUMNS: string[] = [
  NEPPAN_COLUMNS.reservationId,
  NEPPAN_COLUMNS.reservationKind,
  NEPPAN_COLUMNS.reservationNo,
  NEPPAN_COLUMNS.nightIndex,
  NEPPAN_COLUMNS.checkinDate,
  NEPPAN_COLUMNS.appliedAt,
  NEPPAN_COLUMNS.channel,
  NEPPAN_COLUMNS.rooms,
  NEPPAN_COLUMNS.adultAmount,
  NEPPAN_COLUMNS.updatedAt,
];

const CANCELLED = "キャンセル";

export function detectHeader(header: string[]): boolean {
  const set = new Set(header.map((h) => h.trim()));
  // format (B) 20列 予約一覧 は 泊目/大人合計額 を欠く → false
  return REQUIRED_COLUMNS.every((c) => set.has(c));
}

/** cp932 デコード済みテキスト → ParsedSourceRows（payload は PII を含む staging 値） */
export function parseNeppanCsv(text: string, rawFileId: string): ParsedSourceRows {
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
  reservationNo: string | null;
  status: string;
  isCancelled: boolean;
  channelRaw: string;
  stayDate: string;
  stayMonth: string;
  checkinDate: string | null;
  checkoutDate: string | null;
  bookedYmd: string | null;
  roomTypeRaw: string;
  nights: number | null;
  stayNightIndex: number;
  updatedAt: string | null;
  reservationTotal: number; // 料金合計額（検算用・繰り返し値なので first）
  // 集約対象
  gross: number; // sum（内訳行を足し上げる）
  soldRoomNights: number; // max
  guestCount: number; // max
  adultCount: number; // max
  childCount: number; // max
  rawRowNumbers: number[];
}

function toIntermediate(
  payload: Record<string, string>,
  rawRowNumber: number,
  ctx: NormalizeContext,
): Intermediate | null {
  const C = NEPPAN_COLUMNS;
  const facilityId = ctx.resolveFacilityId({
    sourceSystem: SOURCE,
    sourceFacilityCode: payload.__sourceFacilityCode,
    sourceFacilityName: payload.__sourceFacilityName,
  });
  const checkin = parseDate(payload[C.checkinDate]);
  const idx = isBlank(payload[C.nightIndex]) ? NaN : Math.trunc(toNumOr0(payload[C.nightIndex]));
  if (!facilityId || !checkin || !Number.isFinite(idx) || idx < 1) return null;

  const reservationId = (payload[C.reservationId] ?? "").trim();
  const reservationNo = (payload[C.reservationNo] ?? "").trim();
  const reservationKey = `${reservationId}|${reservationNo}`;
  const stayDate = addDays(checkin, idx - 1);
  const roomTypeRaw = payload[C.roomType] ?? "";
  const status = payload[C.reservationKind] ?? "";
  const gross =
    toNumOr0(payload[C.adultAmount]) +
    toNumOr0(payload[C.childAmount]) +
    toNumOr0(payload[C.infantAmount]) +
    toNumOr0(payload[C.otherAmount]);

  return {
    key: [SOURCE, facilityId, reservationKey, stayDate, roomTypeRaw, "", String(idx)].join("|"),
    facilityId,
    reservationKey,
    reservationNo: reservationNo || null,
    status,
    isCancelled: status === CANCELLED,
    channelRaw: payload[C.channel] ?? "",
    stayDate,
    stayMonth: monthStart(stayDate),
    checkinDate: checkin,
    checkoutDate: parseDate(payload[C.checkoutDate]),
    bookedYmd: parseDate(payload[C.appliedAt]),
    roomTypeRaw,
    nights: isBlank(payload[C.nights]) ? null : Math.trunc(toNumOr0(payload[C.nights])),
    stayNightIndex: idx,
    updatedAt: parseDate(payload[C.updatedAt]),
    reservationTotal: toNumOr0(payload[C.totalAmount]),
    gross,
    soldRoomNights: toNumOr0(payload[C.rooms]),
    guestCount:
      Math.trunc(toNumOr0(payload[C.adultCount])) +
      Math.trunc(toNumOr0(payload[C.childCount])) +
      Math.trunc(toNumOr0(payload[C.infantCount])),
    adultCount: Math.trunc(toNumOr0(payload[C.adultCount])),
    childCount: Math.trunc(toNumOr0(payload[C.childCount])),
    rawRowNumbers: [rawRowNumber],
  };
}

/** ParsedSourceRows → canonical。料金内訳行を current_record_key で集約（gross=sum / 室数・人数=max）。 */
export function buildCanonicalRows(
  parsed: ParsedSourceRows,
  ctx: NormalizeContext,
): CanonicalStayNight[] {
  const groups = new Map<string, Intermediate>();
  for (const row of parsed.rows) {
    const im = toIntermediate(row.payload, row.rawRowNumber, ctx);
    if (!im) continue;
    const cur = groups.get(im.key);
    if (!cur) {
      groups.set(im.key, im);
    } else {
      cur.gross += im.gross;
      cur.soldRoomNights = Math.max(cur.soldRoomNights, im.soldRoomNights);
      cur.guestCount = Math.max(cur.guestCount, im.guestCount);
      cur.adultCount = Math.max(cur.adultCount, im.adultCount);
      cur.childCount = Math.max(cur.childCount, im.childCount);
      cur.rawRowNumbers.push(...im.rawRowNumbers);
    }
  }

  const out: CanonicalStayNight[] = [];
  for (const im of groups.values()) {
    const tax = reverseTax(im.gross, 0.1, "floor"); // floor(gross*10/110)
    const net = im.gross - tax;
    const roomType = ctx.resolveRoomType({
      sourceSystem: SOURCE,
      facilityId: im.facilityId,
      roomTypeRaw: im.roomTypeRaw,
    });
    const leadTimeDays = im.bookedYmd ? dayDiff(im.stayDate, im.bookedYmd) : null;

    out.push({
      sourceSystem: SOURCE,
      currentRecordKey: im.key,
      facilityId: im.facilityId,
      reservationKey: im.reservationKey,
      checkinCode: null,
      otaReservationNo: im.reservationNo,
      status: im.status,
      isCancelled: im.isCancelled,
      channel: im.channelRaw || null,
      stayDate: im.stayDate,
      stayMonth: im.stayMonth,
      checkinDate: im.checkinDate,
      checkoutDate: im.checkoutDate,
      bookedAt: im.bookedYmd ? jstMidnightIso(im.bookedYmd) : null,
      roomTypeRaw: im.roomTypeRaw,
      roomTypeNormalized: roomType?.roomTypeNormalized ?? null,
      budgetRoomType: roomType?.budgetRoomType ?? null,
      roomNo: "",
      nights: im.nights,
      stayNightIndex: im.stayNightIndex,
      soldRoomNights: im.soldRoomNights,
      guestCount: im.guestCount,
      adultCount: im.adultCount,
      childCount: im.childCount,
      // ねっぱんは手数料補正なし → 補正後 = 補正前
      grossAmount: im.gross,
      taxAmount: tax,
      netAmount: net,
      feeAdjustedGrossAmount: im.gross,
      feeAdjustedTaxAmount: tax,
      feeAdjustedNetAmount: net,
      feeAdjustmentRuleId: null,
      countryRaw: null,
      countryNormalized: "不明",
      countryMajor: "不明",
      countryMiddle: "不明",
      isStayNight: true, // format(A) は 1泊1行に分解済
      leadTimeDays,
      isValidLeadTime: leadTimeDays !== null && leadTimeDays >= 0,
      sourceUpdatedAt: im.updatedAt ? jstMidnightIso(im.updatedAt) : null,
    });
  }
  return out;
}

/** validation（取込仕様 §5）。message に PII 値を含めない。 */
export function validateNeppan(parsed: ParsedSourceRows, ctx: NormalizeContext): ValidationResult {
  const C = NEPPAN_COLUMNS;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  // 予約単位の検算用: reservation_key -> { sumGross, total }
  const recon = new Map<string, { sumGross: number; total: number; rows: number[] }>();

  for (const row of parsed.rows) {
    const p = row.payload;
    const n = row.rawRowNumber;

    const facilityId = ctx.resolveFacilityId({
      sourceSystem: SOURCE,
      sourceFacilityCode: p.__sourceFacilityCode,
      sourceFacilityName: p.__sourceFacilityName,
    });
    if (!facilityId) {
      errors.push({ severity: "error", code: "UNKNOWN_FACILITY", message: "施設マッピングが見つかりません", rawRowNumber: n });
    }
    const checkin = parseDate(p[C.checkinDate]);
    const idx = isBlank(p[C.nightIndex]) ? NaN : Math.trunc(toNumOr0(p[C.nightIndex]));
    if (!checkin || !Number.isFinite(idx) || idx < 1) {
      errors.push({ severity: "error", code: "MISSING_REQUIRED_DATE", message: "チェックイン日/泊目から滞在日を作成できません", rawRowNumber: n, field: C.checkinDate });
    }
    for (const col of [C.adultAmount, C.childAmount, C.infantAmount, C.otherAmount]) {
      if (!isBlank(p[col]) && !isNumericLike(p[col])) {
        errors.push({ severity: "error", code: "INVALID_AMOUNT", message: `${col}が数値化できません`, rawRowNumber: n, field: col });
      }
    }
    if (toNumOr0(p[C.rooms]) <= 0) {
      errors.push({ severity: "error", code: "INVALID_ROOM_COUNT", message: "室数が0以下です", rawRowNumber: n, field: C.rooms });
    }
    if (facilityId && ctx.resolveRoomType({ sourceSystem: SOURCE, facilityId, roomTypeRaw: p[C.roomType] ?? "" }) === null) {
      warnings.push({ severity: "warning", code: "UNKNOWN_ROOM_TYPE", message: "部屋タイプマッピングが未登録です", rawRowNumber: n, field: C.roomType });
    }
    if (ctx.resolveChannel({ sourceSystem: SOURCE, channelRaw: p[C.channel] ?? "" }) === null) {
      warnings.push({ severity: "warning", code: "UNKNOWN_CHANNEL", message: "予約サイトマッピングが未登録です", rawRowNumber: n, field: C.channel });
    }
    const booked = parseDate(p[C.appliedAt]);
    if (!booked || (checkin && idx >= 1 && dayDiff(addDays(checkin, idx - 1), booked) < 0)) {
      warnings.push({ severity: "warning", code: "LEAD_TIME_INVALID", message: "申込日が無いかリードタイムが負です", rawRowNumber: n, field: C.appliedAt });
    }

    // 検算（非キャンセルのみ）
    if ((p[C.reservationKind] ?? "") !== CANCELLED) {
      const rk = `${(p[C.reservationId] ?? "").trim()}|${(p[C.reservationNo] ?? "").trim()}`;
      const g = toNumOr0(p[C.adultAmount]) + toNumOr0(p[C.childAmount]) + toNumOr0(p[C.infantAmount]) + toNumOr0(p[C.otherAmount]);
      const e = recon.get(rk) ?? { sumGross: 0, total: toNumOr0(p[C.totalAmount]), rows: [] };
      e.sumGross += g;
      e.rows.push(n);
      recon.set(rk, e);
    }
  }

  for (const e of recon.values()) {
    if (Math.abs(e.sumGross - e.total) > 1) {
      warnings.push({ severity: "warning", code: "AMOUNT_TOTAL_MISMATCH", message: "泊別合計と料金合計額が一致しません", rawRowNumber: e.rows[0] });
    }
  }

  return { canCommit: errors.length === 0, errors, warnings };
}

function notWired(): never {
  throw new Error("raw file の読込（cp932 デコード・サニタイズ）は import API（M18）で実装します");
}

export const neppanAdapter: ImportAdapter = {
  sourceSystem: SOURCE,
  async detect(): Promise<boolean> {
    return notWired();
  },
  async parse(): Promise<ParsedSourceRows> {
    return notWired();
  },
  async validate(rows: ParsedSourceRows, context: NormalizeContext): Promise<ValidationResult> {
    return validateNeppan(rows, context);
  },
  async normalize(rows: ParsedSourceRows, context: NormalizeContext): Promise<CanonicalStayNight[]> {
    return buildCanonicalRows(rows, context);
  },
};
