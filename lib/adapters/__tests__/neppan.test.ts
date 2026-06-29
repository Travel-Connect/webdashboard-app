import { describe, it, expect } from "vitest";
import {
  buildCanonicalRows,
  detectHeader,
  parseNeppanCsv,
  validateNeppan,
  PII_COLUMNS,
} from "@/lib/adapters/neppan";
import { decodeShiftJis } from "@/lib/adapters/shared";
import { canonicalStayNightSchema } from "@/lib/adapters/canonical-schema";
import type { NormalizeContext } from "@/lib/adapters/types";

const FAC = "22222222-2222-4222-8222-222222222222";

function ctx(overrides: Partial<NormalizeContext> = {}): NormalizeContext {
  return {
    resolveFacilityId: () => FAC, // neppan は施設名=ファイル名（取込時注入）。テストは固定
    resolveRoomType: ({ roomTypeRaw }) =>
      roomTypeRaw ? { roomTypeNormalized: roomTypeRaw, budgetRoomType: roomTypeRaw } : null,
    resolveChannel: ({ channelRaw }) => (channelRaw ? { channelNormalized: channelRaw } : null),
    resolveCountry: () => null,
    feeRules: [],
    ...overrides,
  };
}

/** 実ファイルの 44 列ヘッダ（cp932 で確認済） */
const HEADER = [
  "予約ID", "予約区分", "予約番号", "泊目", "チェックイン日", "チェックアウト日", "申込日", "泊数",
  "予約サイト名称", "部屋タイプ名称", "商品プラン名称", "室数", "宿泊者氏名", "宿泊者氏名カタカナ",
  "電話番号", "郵便番号", "住所1", "メールアドレス", "大人人数計", "子供人数計", "幼児人数計",
  "備考1", "備考2", "メモ", "食事", "料金合計額", "ポイント額", "ポイント割引額", "決済方法",
  "予約者氏名", "予約者氏名カタカナ", "会員番号", "法人情報", "大人単価", "子供単価", "幼児単価",
  "大人合計額", "子供合計額", "幼児合計額", "その他明細", "その他合計額", "商品プランコード",
  "チェックイン時刻", "更新日",
];

type Row = Record<string, string>;
function csv(rows: Row[]): string {
  const body = rows.map((r) => HEADER.map((h) => (r[h] ?? "").replace(/,/g, "")).join(",")).join("\n");
  return `${HEADER.join(",")}\n${body}\n`;
}
function build(rows: Row[], c = ctx()) {
  return buildCanonicalRows(parseNeppanCsv(csv(rows), "raw-n"), c);
}

describe("detectHeader", () => {
  it("44列ヘッダを検出", () => expect(detectHeader(HEADER)).toBe(true));
  it("泊目/大人合計額 欠落（format B 相当）は false", () =>
    expect(detectHeader(["予約ID", "予約区分", "チェックイン日"])).toBe(false));
});

describe("decodeShiftJis", () => {
  it("cp932 バイト列をデコードできる", () => {
    // 予=0x975C, 約=0x96F1
    expect(decodeShiftJis(new Uint8Array([0x97, 0x5c, 0x96, 0xf1]))).toBe("予約");
  });
});

describe("normalize: 基本ルール", () => {
  it("4要素 gross・税逆算・室数・人数・滞在日(泊目1)", () => {
    const [r] = build([
      { 予約ID: "84", 予約区分: "予約", 予約番号: "3092552689_01", 泊目: "1", チェックイン日: "2026/06/15",
        チェックアウト日: "2026/06/16", 申込日: "2026/05/16", 泊数: "1", 予約サイト名称: "Booking.com",
        部屋タイプ名称: "コテージ一棟貸し", 室数: "1", 大人人数計: "4", 子供人数計: "0", 幼児人数計: "0",
        料金合計額: "9981", 大人合計額: "9981", 子供合計額: "0", 幼児合計額: "0", その他合計額: "0", 更新日: "2026/05/16" },
    ]);
    expect(r.grossAmount).toBe(9981);
    expect(r.taxAmount).toBe(907); // floor(9981*10/110)
    expect(r.netAmount).toBe(9074);
    expect(r.feeAdjustedGrossAmount).toBe(9981); // 補正なし
    expect(r.soldRoomNights).toBe(1);
    expect(r.guestCount).toBe(4);
    expect(r.stayDate).toBe("2026-06-15");
    expect(r.stayMonth).toBe("2026-06-01");
    expect(r.reservationKey).toBe("84|3092552689_01");
    expect(r.isStayNight).toBe(true);
    expect(r.countryNormalized).toBe("不明");
    expect(r.leadTimeDays).toBe(30);
  });

  it("その他合計額を gross に含める（4要素）", () => {
    const [r] = build([
      { 予約ID: "1", 予約番号: "A", 泊目: "1", チェックイン日: "2026/06/15", 予約区分: "予約", 室数: "1",
        大人合計額: "3000", 子供合計額: "2000", 幼児合計額: "1000", その他合計額: "500", 料金合計額: "6500" },
    ]);
    expect(r.grossAmount).toBe(6500);
  });

  it("stay_date = チェックイン日 + (泊目-1)", () => {
    const [r] = build([
      { 予約ID: "1", 予約番号: "A", 泊目: "3", チェックイン日: "2026/01/01", 予約区分: "予約", 室数: "1", 大人合計額: "1000" },
    ]);
    expect(r.stayDate).toBe("2026-01-03");
  });

  it("is_cancelled: 予約区分==キャンセル のみ（変更は対象）", () => {
    const rows = build([
      { 予約ID: "1", 予約番号: "A", 泊目: "1", チェックイン日: "2026/06/15", 予約区分: "キャンセル", 室数: "1", 大人合計額: "1000" },
      { 予約ID: "2", 予約番号: "B", 泊目: "1", チェックイン日: "2026/06/15", 予約区分: "変更", 室数: "1", 大人合計額: "1000" },
    ]);
    const cancel = rows.find((r) => r.reservationKey === "1|A")!;
    const change = rows.find((r) => r.reservationKey === "2|B")!;
    expect(cancel.isCancelled).toBe(true);
    expect(change.isCancelled).toBe(false);
  });

  it("料金内訳行の集約: gross=sum / 室数・人数=max", () => {
    const rows = build([
      { 予約ID: "1", 予約番号: "A", 泊目: "1", チェックイン日: "2026/06/15", 予約区分: "予約", 部屋タイプ名称: "X",
        室数: "1", 大人人数計: "2", 大人合計額: "3000", 料金合計額: "5000" },
      { 予約ID: "1", 予約番号: "A", 泊目: "1", チェックイン日: "2026/06/15", 予約区分: "予約", 部屋タイプ名称: "X",
        室数: "1", 大人人数計: "2", 子供合計額: "2000", 料金合計額: "5000" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].grossAmount).toBe(5000); // 3000 + 2000
    expect(rows[0].soldRoomNights).toBe(1); // max（重複排除）
    expect(rows[0].guestCount).toBe(2); // max
  });

  it("室数>1 は物理展開せず sold_room_nights に保持", () => {
    const [r] = build([
      { 予約ID: "1", 予約番号: "A", 泊目: "1", チェックイン日: "2026/06/15", 予約区分: "予約", 室数: "3", 大人合計額: "9000" },
    ]);
    expect(r.soldRoomNights).toBe(3);
  });

  it("生成行は canonicalStayNightSchema を満たす", () => {
    const rows = build([
      { 予約ID: "1", 予約番号: "A", 泊目: "1", チェックイン日: "2026/06/15", チェックアウト日: "2026/06/16",
        申込日: "2026/05/01", 予約区分: "予約", 部屋タイプ名称: "X", 室数: "1", 大人合計額: "10000", 更新日: "2026/05/01" },
    ]);
    for (const r of rows) expect(canonicalStayNightSchema.safeParse(r).success).toBe(true);
  });
});

describe("PII 非漏洩", () => {
  it("PII列のダミー値が canonical 出力に一切出ない", () => {
    const pii: Row = {
      宿泊者氏名: "DUMMYGUESTNAME", 宿泊者氏名カタカナ: "DUMMYKANA", 電話番号: "09000000000",
      郵便番号: "9000000", 住所1: "DUMMYADDRESS", メールアドレス: "dummy@example.test",
      予約者氏名: "DUMMYBOOKER", 予約者氏名カタカナ: "DUMMYBOOKERKANA", 会員番号: "MEMBER999", 法人情報: "DUMMYCORP",
    };
    const rows = build([
      { ...pii, 予約ID: "1", 予約番号: "A", 泊目: "1", チェックイン日: "2026/06/15", 予約区分: "予約", 室数: "1", 大人合計額: "1000" },
    ]);
    const json = JSON.stringify(rows);
    for (const v of Object.values(pii)) expect(json.includes(v)).toBe(false);
    // deny-list が実列名を網羅していること（取りこぼし防止）
    for (const name of Object.keys(pii)) expect(PII_COLUMNS.has(name)).toBe(true);
  });
});

describe("validate", () => {
  const okRow: Row = { 予約ID: "1", 予約番号: "A", 泊目: "1", チェックイン日: "2026/06/15", 申込日: "2026/05/01",
    予約区分: "予約", 部屋タイプ名称: "X", 予約サイト名称: "Booking.com", 室数: "1", 大人合計額: "1000", 料金合計額: "1000" };

  it("未登録施設は UNKNOWN_FACILITY(error)", () => {
    const res = validateNeppan(parseNeppanCsv(csv([okRow]), "r"), ctx({ resolveFacilityId: () => null }));
    expect(res.canCommit).toBe(false);
    expect(res.errors.some((e) => e.code === "UNKNOWN_FACILITY")).toBe(true);
  });

  it("室数0は INVALID_ROOM_COUNT(error)", () => {
    const res = validateNeppan(parseNeppanCsv(csv([{ ...okRow, 室数: "0" }]), "r"), ctx());
    expect(res.errors.some((e) => e.code === "INVALID_ROOM_COUNT")).toBe(true);
  });

  it("泊別合計と料金合計額の乖離は AMOUNT_TOTAL_MISMATCH(warning)", () => {
    // 3泊予約: 各泊 大人合計額=3580 (per-row和) だが 料金合計額=10740（総額）→ 予約単位 sum=10740 一致なら出ない。
    // ここでは total を意図的にずらす
    const res = validateNeppan(parseNeppanCsv(csv([{ ...okRow, 大人合計額: "1000", 料金合計額: "9999" }]), "r"), ctx());
    expect(res.warnings.some((w) => w.code === "AMOUNT_TOTAL_MISMATCH")).toBe(true);
  });

  it("正常行は commit 可", () => {
    const res = validateNeppan(parseNeppanCsv(csv([okRow]), "r"), ctx());
    expect(res.canCommit).toBe(true);
  });
});
