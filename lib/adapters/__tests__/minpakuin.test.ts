import { describe, it, expect } from "vitest";
import {
  buildCanonicalRows,
  detectHeader,
  parseMinpakuinCsv,
  validateMinpakuin,
  MINPAKU_COLUMNS,
} from "@/lib/adapters/minpakuin";
import { canonicalStayNightSchema } from "@/lib/adapters/canonical-schema";
import type { NormalizeContext, FeeAdjustmentRule } from "@/lib/adapters/types";

const FAC = "11111111-1111-4111-8111-111111111111";

const FEE_RULES: FeeAdjustmentRule[] = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ruleCode: "agoda_202601", channelNormalized: "Agoda", validFrom: "2026-01-01", grossDivisor: 0.88, taxRate: 0.1, taxRounding: "floor" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ruleCode: "tripcom_202602", channelNormalized: "Trip.com", validFrom: "2026-02-01", grossDivisor: 0.85, taxRate: 0.1, taxRounding: "floor" },
];

/** テスト用 NormalizeContext（実在しない施設名は null=UNKNOWN_FACILITY） */
function ctx(overrides: Partial<NormalizeContext> = {}): NormalizeContext {
  return {
    resolveFacilityId: ({ sourceFacilityName }) =>
      sourceFacilityName && sourceFacilityName !== "未登録施設" ? FAC : null,
    resolveRoomType: ({ roomTypeRaw }) =>
      roomTypeRaw ? { roomTypeNormalized: roomTypeRaw, budgetRoomType: "STD" } : null,
    resolveChannel: ({ channelRaw }) => {
      if (!channelRaw) return null;
      if (/agoda/i.test(channelRaw)) return { channelNormalized: "Agoda" };
      if (/trip\.?com/i.test(channelRaw)) return { channelNormalized: "Trip.com" };
      return { channelNormalized: channelRaw };
    },
    resolveCountry: ({ countryRaw }) =>
      countryRaw ? { countryNormalized: countryRaw, countryMajor: countryRaw === "日本" ? "国内" : "海外", countryMiddle: countryRaw } : null,
    feeRules: FEE_RULES,
    ...overrides,
  };
}

const HEADER = [
  MINPAKU_COLUMNS.facilityName, MINPAKU_COLUMNS.checkinCode, MINPAKU_COLUMNS.otaReservationNo,
  MINPAKU_COLUMNS.stayDate, MINPAKU_COLUMNS.roomType, MINPAKU_COLUMNS.guestCount,
  MINPAKU_COLUMNS.checkoutDate, MINPAKU_COLUMNS.nights, MINPAKU_COLUMNS.bookedAt,
  MINPAKU_COLUMNS.channel, MINPAKU_COLUMNS.tax, MINPAKU_COLUMNS.gross,
  MINPAKU_COLUMNS.status, MINPAKU_COLUMNS.country,
];

type Row = Partial<Record<string, string>>;
function csv(rows: Row[]): string {
  const head = HEADER.join(",");
  const body = rows.map((r) => HEADER.map((h) => r[h] ?? "").join(",")).join("\n");
  return `${head}\n${body}\n`;
}
function build(rows: Row[], c = ctx()) {
  return buildCanonicalRows(parseMinpakuinCsv(csv(rows), "raw-1"), c);
}
const C = MINPAKU_COLUMNS;

describe("detectHeader", () => {
  it("base.csv ヘッダを検出する", () => expect(detectHeader(HEADER)).toBe(true));
  it("必須列欠落は false", () => expect(detectHeader(["施設名", "部屋利用日"])).toBe(false));
});

describe("normalize: 基本ルール", () => {
  it("通常チャネル: gross/tax/net と sold_room_nights=1", () => {
    const [row] = build([{ [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "OTA1", [C.stayDate]: "2026/06/15", [C.checkoutDate]: "2026/06/17", [C.roomType]: "スタンダード", [C.guestCount]: "2", [C.channel]: "楽天", [C.gross]: "11000", [C.tax]: "1000", [C.status]: "予約確定", [C.country]: "日本", [C.bookedAt]: "2026/05/16" }]);
    expect(row.soldRoomNights).toBe(1);
    expect(row.grossAmount).toBe(11000);
    expect(row.taxAmount).toBe(1000);
    expect(row.netAmount).toBe(10000); // 宿泊費 - 消費税
    expect(row.feeAdjustedGrossAmount).toBe(11000); // 補正なし
    expect(row.feeAdjustedTaxAmount).toBe(1000);
    expect(row.feeAdjustedNetAmount).toBe(10000);
    expect(row.isCancelled).toBe(false);
    expect(row.isStayNight).toBe(true);
    expect(row.stayMonth).toBe("2026-06-01");
    expect(row.leadTimeDays).toBe(30);
    expect(row.isValidLeadTime).toBe(true);
  });

  it("税抜は raw 消費税を使う（floor 再計算しない）", () => {
    const [row] = build([{ [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "OTA2", [C.stayDate]: "2026/06/15", [C.checkoutDate]: "2026/06/16", [C.roomType]: "A", [C.channel]: "じゃらん", [C.gross]: "10800", [C.tax]: "800", [C.status]: "予約確定" }]);
    expect(row.netAmount).toBe(10000); // 10800 - 800（floor(10800*10/110)=981 ではない）
    expect(row.taxAmount).toBe(800);
    expect(row.feeAdjustedTaxAmount).toBe(800);
  });

  it("is_stay_night: 部屋利用日 == チェックアウト日 は false", () => {
    const [row] = build([{ [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "OTA3", [C.stayDate]: "2026/06/17", [C.checkoutDate]: "2026/06/17", [C.roomType]: "A", [C.channel]: "楽天", [C.gross]: "0", [C.tax]: "0", [C.status]: "予約確定" }]);
    expect(row.isStayNight).toBe(false);
  });

  it("is_cancelled: ステータス == キャンセル済み", () => {
    const [row] = build([{ [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "OTA4", [C.stayDate]: "2026/06/15", [C.checkoutDate]: "2026/06/16", [C.roomType]: "A", [C.channel]: "楽天", [C.gross]: "11000", [C.tax]: "1000", [C.status]: "キャンセル済み" }]);
    expect(row.isCancelled).toBe(true);
  });

  it("reservation_key: OTA予約番号 が空ならチェックインコード", () => {
    const [row] = build([{ [C.facilityName]: "アクアパレス北谷", [C.checkinCode]: "CHK99", [C.otaReservationNo]: "", [C.stayDate]: "2026/06/15", [C.checkoutDate]: "2026/06/16", [C.roomType]: "A", [C.channel]: "電話", [C.gross]: "5000", [C.tax]: "454", [C.status]: "予約確定" }]);
    expect(row.reservationKey).toBe("CHK99");
    expect(row.currentRecordKey).toContain("CHK99");
  });

  it("集約: 同一(予約,利用日,部屋タイプ)の複数室は SUM", () => {
    const rows = build([
      { [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "OTA5", [C.stayDate]: "2026/06/15", [C.checkoutDate]: "2026/06/16", [C.roomType]: "A", [C.guestCount]: "2", [C.channel]: "楽天", [C.gross]: "11000", [C.tax]: "1000", [C.status]: "予約確定" },
      { [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "OTA5", [C.stayDate]: "2026/06/15", [C.checkoutDate]: "2026/06/16", [C.roomType]: "A", [C.guestCount]: "2", [C.channel]: "楽天", [C.gross]: "11000", [C.tax]: "1000", [C.status]: "予約確定" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].soldRoomNights).toBe(2);
    expect(rows[0].grossAmount).toBe(22000);
    expect(rows[0].guestCount).toBe(4);
  });
});

describe("normalize: 手数料補正（ASSUMPTION:FEE_TAX_SPLIT — create_report.py で要確認）", () => {
  it("Agoda 2026-01-01 以降は /0.88", () => {
    const [row] = build([{ [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "AG1", [C.stayDate]: "2026/06/15", [C.checkoutDate]: "2026/06/16", [C.roomType]: "A", [C.channel]: "[海外]Agoda", [C.gross]: "8800", [C.tax]: "800", [C.status]: "予約確定" }]);
    expect(row.grossAmount).toBe(8800); // 補正前は raw
    expect(row.feeAdjustedGrossAmount).toBe(10000); // round(8800/0.88)
    expect(row.feeAdjustedTaxAmount).toBe(909); // round(800/0.88)
    expect(row.feeAdjustedNetAmount).toBe(9091);
    expect(row.feeAdjustmentRuleId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("Agoda でも 2026-01-01 より前は補正なし", () => {
    const [row] = build([{ [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "AG2", [C.stayDate]: "2025/12/31", [C.checkoutDate]: "2026/01/01", [C.roomType]: "A", [C.channel]: "Agoda", [C.gross]: "8800", [C.tax]: "800", [C.status]: "予約確定" }]);
    expect(row.feeAdjustedGrossAmount).toBe(8800);
    expect(row.feeAdjustmentRuleId).toBeNull();
  });

  it("Trip.com 2026-02-01 以降は /0.85", () => {
    const [row] = build([{ [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "TC1", [C.stayDate]: "2026/03/01", [C.checkoutDate]: "2026/03/02", [C.roomType]: "A", [C.channel]: "Trip.com", [C.gross]: "8500", [C.tax]: "772", [C.status]: "予約確定" }]);
    expect(row.feeAdjustedGrossAmount).toBe(10000); // round(8500/0.85)
    expect(row.feeAdjustmentRuleId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
});

describe("canonical schema 適合", () => {
  it("生成した全行が canonicalStayNightSchema を満たす", () => {
    const rows = build([
      { [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "S1", [C.stayDate]: "2026/06/15", [C.checkoutDate]: "2026/06/16", [C.roomType]: "A", [C.channel]: "Agoda", [C.gross]: "8800", [C.tax]: "800", [C.status]: "予約確定", [C.country]: "日本", [C.bookedAt]: "2026/05/01" },
    ]);
    for (const r of rows) expect(canonicalStayNightSchema.safeParse(r).success).toBe(true);
  });
});

describe("validate", () => {
  it("未登録施設は UNKNOWN_FACILITY(error)・commit 不可", () => {
    const parsed = parseMinpakuinCsv(csv([{ [C.facilityName]: "未登録施設", [C.otaReservationNo]: "X1", [C.stayDate]: "2026/06/15", [C.roomType]: "A", [C.gross]: "1000", [C.tax]: "90", [C.status]: "予約確定" }]), "raw-1");
    const res = validateMinpakuin(parsed, ctx());
    expect(res.canCommit).toBe(false);
    expect(res.errors.some((e) => e.code === "UNKNOWN_FACILITY")).toBe(true);
  });

  it("日付不正は MISSING_REQUIRED_DATE、非数値金額は INVALID_AMOUNT", () => {
    const parsed = parseMinpakuinCsv(csv([{ [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "X2", [C.stayDate]: "不明", [C.roomType]: "A", [C.gross]: "abc", [C.tax]: "0", [C.status]: "予約確定" }]), "raw-1");
    const res = validateMinpakuin(parsed, ctx());
    expect(res.errors.some((e) => e.code === "MISSING_REQUIRED_DATE")).toBe(true);
    expect(res.errors.some((e) => e.code === "INVALID_AMOUNT")).toBe(true);
    expect(res.canCommit).toBe(false);
  });

  it("正常行は commit 可", () => {
    const parsed = parseMinpakuinCsv(csv([{ [C.facilityName]: "アクアパレス北谷", [C.otaReservationNo]: "X3", [C.stayDate]: "2026/06/15", [C.roomType]: "A", [C.channel]: "楽天", [C.gross]: "11000", [C.tax]: "1000", [C.status]: "予約確定", [C.country]: "日本", [C.bookedAt]: "2026/06/01" }]), "raw-1");
    const res = validateMinpakuin(parsed, ctx());
    expect(res.canCommit).toBe(true);
    expect(res.errors).toHaveLength(0);
  });
});
