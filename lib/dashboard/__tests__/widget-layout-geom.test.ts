import { describe, it, expect } from "vitest";
import { tdwColGeom } from "@/lib/dashboard/widget-layout";

/* ============================================================
   tdwColGeom — 列ジオメトリの回帰テスト。
   ドラッグ caret / drop 当たり判定が「実タイル」に一致することを保証する。
   バグ再現: grid コンテナに padding があるのに border-box 幅で列を割ると
   caret が実タイルから右へずれる（Mode B の 12px padding）。
   ============================================================ */

describe("tdwColGeom（列ジオメトリ・padding 対応）", () => {
  // Mode B: 行グリッド padding 12 / gap 10 / 6列。ライブ計測値と一致。
  //   contentWidth = 758 - 24 = 734 → colW = (734 - 5*10)/6 = 114
  const modeB = tdwColGeom(
    { left: 100, top: 50, width: 758, height: 84, paddingLeft: 12, paddingRight: 12, paddingTop: 12, paddingBottom: 12 },
    10,
  );

  it("padding を差し引いて列幅を求める", () => {
    expect(modeB.colW).toBeCloseTo(114, 6);
  });

  it("colX(1) は border-box 左端ではなく内容ボックス左端（=left+paddingLeft）", () => {
    // バグ版は 100（border-box 左端）。修正版は 112。
    expect(modeB.colX(1)).toBeCloseTo(112, 6);
    expect(modeB.colX(1)).not.toBeCloseTo(100, 6);
  });

  it("colX / spanW が実タイル（3枚の span2）の左端に一致する", () => {
    // span2 タイル幅 = 2*114 + 10 = 238。左詰めで colStart 1,3,5 に並ぶ。
    const cell0 = 112;
    const cell1 = cell0 + 238 + 10; // 360
    const cell2 = cell1 + 238 + 10; // 608
    expect(modeB.colX(1)).toBeCloseTo(cell0, 6);
    expect(modeB.colX(3)).toBeCloseTo(cell1, 6);
    expect(modeB.colX(5)).toBeCloseTo(cell2, 6);
    expect(modeB.spanW(2)).toBeCloseTo(238, 6);
    expect(modeB.spanW(3)).toBeCloseTo(362, 6); // 3*114 + 2*10
  });

  it("caret 右端＋gap が次の colStart に一致する（連続配置の不変条件）", () => {
    // colX(c+span) - colX(c) === spanW(span) + gap
    expect(modeB.colX(3) - modeB.colX(1)).toBeCloseTo(modeB.spanW(2) + 10, 6);
    expect(modeB.colX(5) - modeB.colX(3)).toBeCloseTo(modeB.spanW(2) + 10, 6);
  });

  it("縦方向も padding を差し引く（contentTop / contentHeight）", () => {
    expect(modeB.contentTop).toBeCloseTo(62, 6); // 50 + 12
    expect(modeB.contentHeight).toBeCloseTo(60, 6); // 84 - 24
  });

  // Mode A: padding 0 / gap 14 → padding 対応でも従来通り（回帰しない）。
  it("padding=0（Mode A）では border-box 基準と一致し回帰しない", () => {
    const modeA = tdwColGeom({ left: 0, top: 0, width: 734, height: 118 }, 14);
    expect(modeA.colX(1)).toBeCloseTo(0, 6);
    expect(modeA.contentTop).toBeCloseTo(0, 6);
    expect(modeA.contentHeight).toBeCloseTo(118, 6);
    expect(modeA.colW).toBeCloseTo((734 - 5 * 14) / 6, 6);
  });

  it("cols を変えても gap の本数は (cols-1)", () => {
    const g = tdwColGeom({ left: 0, top: 0, width: 300, height: 40 }, 10, 3);
    // colW = (300 - 2*10)/3 = 93.333...
    expect(g.colW).toBeCloseTo((300 - 20) / 3, 6);
    expect(g.spanW(3)).toBeCloseTo(300, 6); // 全幅 = 3*colW + 2*gap
  });
});
