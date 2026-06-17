import { describe, it, expect } from "vitest";
import {
  canonicalStayNightSchema,
  feeAdjustmentRuleSchema,
  type CanonicalStayNight,
} from "@/lib/adapters/canonical-schema";

/** 最小限の妥当な canonical 行（テスト用ダミー。PII なし） */
function validRow(overrides: Partial<CanonicalStayNight> = {}): unknown {
  return {
    sourceSystem: "minpakuin",
    currentRecordKey: "minpakuin|f|r|2026-06-15|RT|",
    facilityId: "11111111-1111-4111-8111-111111111111",
    reservationKey: "OTA-123",
    isCancelled: false,
    stayDate: "2026-06-15",
    stayMonth: "2026-06-01",
    roomNo: "",
    soldRoomNights: 1,
    isStayNight: true,
    isValidLeadTime: true,
    leadTimeDays: 30,
    bookedAt: "2026-05-16T10:00:00+09:00",
    grossAmount: 11000,
    taxAmount: 1000,
    netAmount: 10000,
    feeAdjustedGrossAmount: 11000,
    feeAdjustedTaxAmount: 1000,
    feeAdjustedNetAmount: 10000,
    ...overrides,
  };
}

describe("canonicalStayNightSchema", () => {
  it("妥当な行を parse できる", () => {
    const result = canonicalStayNightSchema.safeParse(validRow());
    expect(result.success).toBe(true);
  });

  it("roomNo 省略時は既定値 '' になる", () => {
    const row = validRow();
    delete (row as Record<string, unknown>).roomNo;
    const result = canonicalStayNightSchema.safeParse(row);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roomNo).toBe("");
  });

  it("必須項目 stayDate が無いと失敗する", () => {
    const row = validRow();
    delete (row as Record<string, unknown>).stayDate;
    const result = canonicalStayNightSchema.safeParse(row);
    expect(result.success).toBe(false);
  });

  it("stayDate の形式が不正だと失敗する", () => {
    const result = canonicalStayNightSchema.safeParse(validRow({ stayDate: "2026/06/15" }));
    expect(result.success).toBe(false);
  });

  it("stayMonth が月初日でないと失敗する", () => {
    const result = canonicalStayNightSchema.safeParse(validRow({ stayMonth: "2026-06-15" }));
    expect(result.success).toBe(false);
  });

  it("facilityId が uuid でないと失敗する", () => {
    const result = canonicalStayNightSchema.safeParse(validRow({ facilityId: "F001" }));
    expect(result.success).toBe(false);
  });
});

describe("feeAdjustmentRuleSchema", () => {
  it("Agoda 補正ルールを parse できる", () => {
    const result = feeAdjustmentRuleSchema.safeParse({
      ruleCode: "agoda_202601",
      channelNormalized: "Agoda",
      validFrom: "2026-01-01",
      grossDivisor: 0.88,
      taxRate: 0.1,
      taxRounding: "floor",
    });
    expect(result.success).toBe(true);
  });

  it("grossDivisor が 0 以下だと失敗する", () => {
    const result = feeAdjustmentRuleSchema.safeParse({
      ruleCode: "bad",
      validFrom: "2026-01-01",
      grossDivisor: 0,
      taxRate: 0.1,
      taxRounding: "floor",
    });
    expect(result.success).toBe(false);
  });
});
