import { z } from "zod";

/**
 * 共通データテンプレート（canonical）の Zod スキーマ。
 * これを単一の真実源とし、型は `z.infer` で導出する。
 * カラムは app.reservation_stay_nights（詳細設計書 §3.4）に対応する。
 */

export const sourceSystemSchema = z.enum(["minpakuin", "neppan", "temairazu"]);
export type SourceSystem = z.infer<typeof sourceSystemSchema>;

/** YYYY-MM-DD（日付は JST 暦日、月は月初日で表現） */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式である必要があります");

/** YYYY-MM-01（月初日） */
const monthString = z
  .string()
  .regex(/^\d{4}-\d{2}-01$/, "月は YYYY-MM-01（月初日）である必要があります");

export const canonicalStayNightSchema = z.object({
  // ソース識別
  sourceSystem: sourceSystemSchema,
  currentRecordKey: z.string().min(1),
  ingestBatchId: z.uuid().nullish(),

  // 施設・予約
  facilityId: z.uuid(),
  reservationKey: z.string().min(1),
  checkinCode: z.string().nullish(),
  otaReservationNo: z.string().nullish(),
  status: z.string().nullish(),
  isCancelled: z.boolean(),
  channel: z.string().nullish(),

  // 日付
  stayDate: dateString,
  stayMonth: monthString,
  checkinDate: dateString.nullish(),
  checkoutDate: dateString.nullish(),
  bookedAt: z.iso.datetime({ offset: true }).nullish(),

  // 部屋
  roomTypeRaw: z.string().nullish(),
  roomTypeNormalized: z.string().nullish(),
  budgetRoomType: z.string().nullish(),
  roomNo: z.string().default(""),

  // 泊数・室数
  nights: z.number().int().nullish(),
  stayNightIndex: z.number().int().nullish(),
  soldRoomNights: z.number().nonnegative(),

  // 人数
  guestCount: z.number().int().nullish(),
  adultCount: z.number().int().nullish(),
  childCount: z.number().int().nullish(),

  // 金額（補正前）
  grossAmount: z.number().nullish(),
  taxAmount: z.number().nullish(),
  netAmount: z.number().nullish(),

  // 金額（手数料補正後。集計・表示はこちらを参照）
  feeAdjustedGrossAmount: z.number().nullish(),
  feeAdjustedTaxAmount: z.number().nullish(),
  feeAdjustedNetAmount: z.number().nullish(),
  feeAdjustmentRuleId: z.uuid().nullish(),

  // 国籍
  countryRaw: z.string().nullish(),
  countryNormalized: z.string().nullish(),
  countryMajor: z.string().nullish(),
  countryMiddle: z.string().nullish(),

  // 集計制御
  isStayNight: z.boolean(),
  leadTimeDays: z.number().int().nullish(),
  isValidLeadTime: z.boolean(),

  sourceUpdatedAt: z.iso.datetime({ offset: true }).nullish(),
});

export type CanonicalStayNight = z.infer<typeof canonicalStayNightSchema>;

/** 手数料補正・税計算ルール（app.fee_adjustment_rules に対応） */
export const feeAdjustmentRuleSchema = z.object({
  id: z.uuid().nullish(),
  ruleCode: z.string().min(1),
  sourceSystem: sourceSystemSchema.nullish(),
  channelNormalized: z.string().nullish(),
  validFrom: dateString,
  validTo: dateString.nullish(),
  grossDivisor: z.number().positive(),
  taxRate: z.number().min(0).max(1),
  taxRounding: z.enum(["floor", "round", "ceil"]),
});

export type FeeAdjustmentRule = z.infer<typeof feeAdjustmentRuleSchema>;
