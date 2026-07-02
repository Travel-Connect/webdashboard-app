"use client";

/* ============================================================
   widget-layout.ts — Row-aware Widget Layout（モデル層）
   ------------------------------------------------------------
   TOP ダッシュボードを「横6マス／行単位」のスロットグリッドとして扱う。
   自由ドラッグで自動的に詰め替えるのではなく、6マスの行ごとに配置可能
   スロットを見せる Row-aware Widget Layout の土台。

   ・span（2 or 3）は system 定義。ユーザーは並び順と配置行だけを編集。
   ・行内は必ず左詰め（colStart は span から再計算）。
   ・意図的な余白（行末の空きスロット・空き行）は保持する（自動穴埋めしない）。
   ・DOM順（order）＝保存後の表示順。dense自動穴埋めはしない。
   ・保存単位: userId × dashboardId × breakpoint(desktop)。localStorage 永続化。

   claude.ai/design プロジェクト app/widget-layout-model.jsx の TypeScript 移植。

   ★スコープ（意図的な差異・2026-07-01 ユーザー決定）:
   本ポートは 12 ウィジェット（KPI 6 + モジュール 6 / 初期5行）を対象とする。
   セッション中にデザイン側へ後から追加された 13 個目 quarterlySalesSummary
   （四半期別売上・フル幅6マス BI カード＋データ層）は、参照スクリーンショット
   （12ウィジェット/5行）準拠のため意図的に対象外。並べ替え機能自体は完全再現。
   ============================================================ */

import * as React from "react";
import type { IconName } from "@/components/ui/icon";

export const TDW_COLS = 6;
export const TDW_TILE_H = 128;

export type WidgetId =
  | "revenue"
  | "soldRoomNights"
  | "adr"
  | "avgGuests"
  | "avgNights"
  | "cancelRate"
  | "calendar"
  | "nationalityTopTen"
  | "budgetAchievement"
  | "domesticInternationalRatio"
  | "channelShare"
  | "stayNightsDistribution";

export type WidgetGlyph = "num" | "cal" | "rank" | "bars" | "gauge" | "donut";

export interface WidgetMeta {
  label: string;
  span: 2 | 3;
  icon: IconName;
  group: string;
  required?: boolean;
  systemHideable?: boolean;
  glyph: WidgetGlyph;
}

/* ---------- ウィジェット定義（system 定義：span はユーザー変更不可） ----------
   span: 2 = small / 3 = medium。calendar・国籍別・経路別・泊数別が medium(3)。 */
export const TDW_WIDGETS: Record<WidgetId, WidgetMeta> = {
  revenue: { label: "売上", span: 2, icon: "Banknote", group: "KPIカード", required: true, glyph: "num" },
  soldRoomNights: { label: "販売室数", span: 2, icon: "BedDouble", group: "KPIカード", required: true, glyph: "num" },
  adr: { label: "ADR", span: 2, icon: "Tag", group: "KPIカード", required: true, glyph: "num" },
  avgGuests: { label: "同伴平均数", span: 2, icon: "Users", group: "KPIカード", glyph: "num" },
  avgNights: { label: "平均泊数", span: 2, icon: "MoonStar", group: "KPIカード", glyph: "num" },
  cancelRate: { label: "キャンセル率", span: 2, icon: "CalendarX2", group: "KPIカード", glyph: "num" },
  calendar: { label: "カレンダービュー", span: 3, icon: "CalendarDays", group: "モジュール", glyph: "cal" },
  nationalityTopTen: { label: "国籍別分析", span: 3, icon: "Globe", group: "モジュール", glyph: "rank" },
  budgetAchievement: { label: "予算達成率", span: 2, icon: "Target", group: "モジュール", glyph: "gauge", systemHideable: true },
  domesticInternationalRatio: { label: "国内・海外比率", span: 2, icon: "ChartPie", group: "モジュール", glyph: "donut" },
  channelShare: { label: "経路別分析", span: 3, icon: "Route", group: "モジュール", glyph: "bars" },
  stayNightsDistribution: { label: "泊数別分析", span: 3, icon: "Moon", group: "モジュール", glyph: "donut" },
};

export const TDW_DEFAULT_ORDER: WidgetId[] = [
  "revenue", "soldRoomNights", "adr", "avgGuests", "avgNights", "cancelRate",
  "calendar", "nationalityTopTen", "budgetAchievement", "domesticInternationalRatio", "channelShare", "stayNightsDistribution",
];
export const TDW_REQUIRED = TDW_DEFAULT_ORDER.filter((id) => TDW_WIDGETS[id].required);
export const tdwSpan = (id: WidgetId): number => (TDW_WIDGETS[id] ? TDW_WIDGETS[id].span : 2);
export const tdwMeta = (id: WidgetId): WidgetMeta => TDW_WIDGETS[id];
const isWidgetId = (id: unknown): id is WidgetId => typeof id === "string" && id in TDW_WIDGETS;

export interface WidgetLayoutItem {
  widgetId: WidgetId;
  row: number;
  colStart: number;
  span: number;
  order: number;
  isVisible: boolean;
}

export interface RowsModel {
  rows: WidgetId[][];
  hidden: WidgetId[];
}

export type DropPoint =
  | { type: "new"; at: number; colStart: number; span: number }
  | { type: "in"; row: number; pos: number; colStart: number; span: number; sameRow?: boolean };

/* ============================================================
   行モデル: rows = WidgetId[][]（各行は左詰め・span合計<=6）＋ hidden = WidgetId[]
   ・空き行（[]）は保持（意図的な余白）。末尾の空き行だけは正規化で除去。
   ・rowUsed/rowFree はマス単位。
   ============================================================ */
export function rowUsed(rowIds: WidgetId[]): number {
  return (rowIds || []).reduce((a, id) => a + tdwSpan(id), 0);
}
export function rowFree(rowIds: WidgetId[]): number {
  return TDW_COLS - rowUsed(rowIds);
}

/* デフォルト配置（仕様準拠）: Row4 は 予算達成率2 / 国内海外2 ＋ 空き2（自然な行末余白） */
export function tdwDefaultRows(): WidgetId[][] {
  return [
    ["revenue", "soldRoomNights", "adr"],
    ["avgGuests", "avgNights", "cancelRate"],
    ["calendar", "nationalityTopTen"],
    ["budgetAchievement", "domesticInternationalRatio"],
    ["channelShare", "stayNightsDistribution"],
  ];
}

/* 並び順（フラット）を 6マス first-fit で行に詰める（旧v1データ移行 / フォールバック用） */
export function tdwPackOrder(ids: WidgetId[]): WidgetId[][] {
  const rows: WidgetId[][] = [[]];
  let used = 0;
  ids.forEach((id) => {
    if (!TDW_WIDGETS[id]) return;
    const s = tdwSpan(id);
    if (used + s > TDW_COLS) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(id);
    used += s;
  });
  if (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

/* 末尾の空き行だけ除去（間の空き行は保持）。過積載行は安全側で分割。 */
export function tdwCleanRows(rows: WidgetId[][]): WidgetId[][] {
  const out: WidgetId[][] = [];
  (rows || []).forEach((r) => {
    const row = (r || []).filter((id) => TDW_WIDGETS[id]);
    if (rowUsed(row) <= TDW_COLS) {
      out.push(row);
      return;
    }
    tdwPackOrder(row).forEach((rr) => out.push(rr));
  });
  while (out.length > 1 && out[out.length - 1].length === 0) out.pop();
  return out.length ? out : [[]];
}

/* rows + hidden → WidgetLayoutItem[]。colStart は左詰めで再計算。order は行メジャー順に 10 刻み。 */
export function tdwRowsToItems(rows: WidgetId[][], hidden: WidgetId[]): WidgetLayoutItem[] {
  const items: WidgetLayoutItem[] = [];
  let order = 0;
  tdwCleanRows(rows).forEach((rowIds, ri) => {
    let col = 1;
    rowIds.forEach((id) => {
      const span = tdwSpan(id);
      order += 10;
      items.push({ widgetId: id, row: ri + 1, colStart: col, span, order, isVisible: true });
      col += span;
    });
  });
  (hidden || []).forEach((id) => {
    if (!TDW_WIDGETS[id]) return;
    order += 10;
    items.push({ widgetId: id, row: 0, colStart: 1, span: tdwSpan(id), order, isVisible: false });
  });
  return items;
}

/* WidgetLayoutItem[] → { rows, hidden }。可視は row/colStart でグルーピング（間の空き行を保持）。 */
export function tdwItemsToRows(items: WidgetLayoutItem[] | null | undefined): RowsModel {
  const vis = (items || []).filter((it) => it && it.isVisible !== false && TDW_WIDGETS[it.widgetId]);
  const hid = (items || [])
    .filter((it) => it && it.isVisible === false && TDW_WIDGETS[it.widgetId])
    .map((it) => it.widgetId);
  const hasRow = vis.some((it) => Number(it.row) >= 1);
  let rows: WidgetId[][];
  if (hasRow) {
    const maxRow = vis.reduce((m, it) => Math.max(m, Number(it.row) || 0), 0);
    rows = Array.from({ length: maxRow }, () => [] as WidgetId[]);
    vis
      .slice()
      .sort((a, b) => a.row - b.row || (a.colStart || 0) - (b.colStart || 0) || (a.order || 0) - (b.order || 0))
      .forEach((it) => {
        const r = (Number(it.row) || 1) - 1;
        if (rows[r]) rows[r].push(it.widgetId);
      });
  } else {
    rows = tdwPackOrder(
      vis
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((it) => it.widgetId),
    );
  }
  const seen = new Set<WidgetId>();
  rows = rows.map((r) => r.filter((id) => (seen.has(id) ? false : (seen.add(id), true))));
  const hidden = hid.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  return { rows: tdwCleanRows(rows), hidden };
}

/* registry に合わせて正規化：未知除外・重複除去・新規ウィジェットは末尾補完（first-fit）。 */
export function tdwNormalize(items: WidgetLayoutItem[] | null | undefined): WidgetLayoutItem[] {
  const model = tdwItemsToRows(items);
  const rows = model.rows;
  const hidden = model.hidden;
  const present = new Set<WidgetId>();
  rows.forEach((r) => r.forEach((id) => present.add(id)));
  hidden.forEach((id) => present.add(id));
  TDW_DEFAULT_ORDER.forEach((id) => {
    if (present.has(id)) return;
    const s = tdwSpan(id);
    let placed = false;
    for (let i = rows.length - 1; i >= 0 && !placed; i--) {
      if (i === rows.length - 1 && rowFree(rows[i]) >= s) {
        rows[i].push(id);
        placed = true;
      }
      break;
    }
    if (!placed) rows.push([id]);
  });
  return tdwRowsToItems(rows, hidden);
}

export function tdwDefaultLayout(): WidgetLayoutItem[] {
  return tdwRowsToItems(tdwDefaultRows(), []);
}

/* レイアウト等価判定（rows構造 + hidden順で比較） */
export function tdwCanon(items: WidgetLayoutItem[]): string {
  const { rows, hidden } = tdwItemsToRows(items);
  return JSON.stringify({ r: rows, h: hidden });
}
export function tdwLayoutsEqual(a: WidgetLayoutItem[], b: WidgetLayoutItem[]): boolean {
  return tdwCanon(a) === tdwCanon(b);
}

/* ============================================================
   配置可能スロット（drop候補）の算出 — Mode A / Mode B / キーボードで共通
   ============================================================ */
export function tdwFindWidget(rows: WidgetId[][], id: WidgetId): { row: number; pos: number } | null {
  for (let r = 0; r < rows.length; r++) {
    const p = rows[r].indexOf(id);
    if (p >= 0) return { row: r, pos: p };
  }
  return null;
}

export function tdwValidDropPoints(rows: WidgetId[][], id: WidgetId): DropPoint[] {
  const span = tdwSpan(id);
  const src = tdwFindWidget(rows, id);
  const pts: DropPoint[] = [];
  for (let at = 0; at <= rows.length; at++) pts.push({ type: "new", at, colStart: 1, span });
  rows.forEach((rowIds, r) => {
    const base = rowIds.filter((x) => x !== id);
    const free = TDW_COLS - rowUsed(base);
    if (free < span) return;
    let col = 1;
    for (let pos = 0; pos <= base.length; pos++) {
      pts.push({ type: "in", row: r, pos, colStart: col, span, sameRow: !!(src && src.row === r) });
      if (pos < base.length) col += tdwSpan(base[pos]);
    }
  });
  return pts;
}

/* drop候補を rows に適用（id を取り除いてから挿入）。 */
export function tdwApplyDrop(rows: WidgetId[][], id: WidgetId, point: DropPoint): WidgetId[][] {
  const next = rows.map((r) => r.filter((x) => x !== id));
  if (point.type === "new") {
    const at = Math.max(0, Math.min(point.at, next.length));
    next.splice(at, 0, [id]);
  } else {
    const r = point.row;
    if (!next[r]) return rows;
    const pos = Math.max(0, Math.min(point.pos, next[r].length));
    next[r].splice(pos, 0, id);
  }
  return tdwCleanRows(next);
}

/* ============================================================
   列ジオメトリ（ドラッグ caret / drop 当たり判定）— pure・単体テスト可能
   ------------------------------------------------------------
   6マスグリッドの「内容ボックス」（padding を除いた領域）から、各列の
   x座標・span幅を求める。getBoundingClientRect は border-box を返すため、
   grid コンテナに padding があると、padding を差し引かないと caret が
   実タイルからずれる（Mode B の 12px padding が典型）。
   ============================================================ */
export interface TdwBoxMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
}
export interface TdwColGeom {
  colW: number;
  /** 1-indexed の列 col の左端 x（内容ボックス基準）。 */
  colX: (col: number) => number;
  /** span マス分の幅（列幅×span ＋ 内側 gap）。 */
  spanW: (span: number) => number;
  /** 内容ボックスの上端 y（padding-top を差し引く）。 */
  contentTop: number;
  /** 内容ボックスの高さ（上下 padding を差し引く）。 */
  contentHeight: number;
}
export function tdwColGeom(box: TdwBoxMetrics, gap: number, cols: number = TDW_COLS): TdwColGeom {
  const padL = box.paddingLeft ?? 0;
  const padR = box.paddingRight ?? 0;
  const padT = box.paddingTop ?? 0;
  const padB = box.paddingBottom ?? 0;
  const contentLeft = box.left + padL;
  const contentWidth = box.width - padL - padR;
  const colW = (contentWidth - gap * (cols - 1)) / cols;
  return {
    colW,
    colX: (col) => contentLeft + (col - 1) * (colW + gap),
    spanW: (span) => span * colW + (span - 1) * gap,
    contentTop: box.top + padT,
    contentHeight: box.height - padT - padB,
  };
}

/* ============================================================
   永続化（userId × dashboardId × breakpoint）— localStorage
   ============================================================ */
interface StoredLayout {
  userId: string;
  dashboardId: string;
  breakpoint: string;
  version: number;
  items?: WidgetLayoutItem[];
  widgets?: WidgetLayoutItem[];
  updatedAt: string;
}
const TDW_LS_KEY = "stayBI.widgetLayout.v2";
export function tdwLoadAll(): Record<string, StoredLayout> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(TDW_LS_KEY) || "") || {};
  } catch {
    return {};
  }
}
export function tdwSaveAll(map: Record<string, StoredLayout>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TDW_LS_KEY, JSON.stringify(map));
}
export function tdwClearAll(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TDW_LS_KEY);
    localStorage.removeItem("stayBI.widgetLayout.v1");
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent("tdw-reload"));
}

export type LayoutStatus = "loading" | "ready" | "loaderror";
export interface UserWidgetLayout {
  status: LayoutStatus;
  saved: WidgetLayoutItem[];
  save: (items: WidgetLayoutItem[]) => Promise<void>;
}

/* localStorage を外部ストアとして読む（useSyncExternalStore 用・SSR安全）。
   raw 文字列が変わらない限り同一参照を返し、無限ループを避ける。 */
const DEFAULT_SNAPSHOT: WidgetLayoutItem[] = tdwDefaultLayout();
const layoutSnapshotCache = new Map<string, { raw: string; value: WidgetLayoutItem[] }>();
function readLayoutSnapshot(userId: string): WidgetLayoutItem[] {
  let raw = "";
  if (typeof window !== "undefined") {
    try {
      raw = localStorage.getItem(TDW_LS_KEY) || "";
    } catch {
      raw = "";
    }
  }
  const cached = layoutSnapshotCache.get(userId);
  if (cached && cached.raw === raw) return cached.value;
  let value: WidgetLayoutItem[];
  try {
    const all = raw ? (JSON.parse(raw) as Record<string, StoredLayout>) : {};
    const rec = all[userId];
    const stored = rec && (rec.items || rec.widgets);
    value = stored ? tdwNormalize(stored) : DEFAULT_SNAPSHOT;
  } catch {
    value = DEFAULT_SNAPSHOT;
  }
  layoutSnapshotCache.set(userId, { raw, value });
  return value;
}
function subscribeLayout(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("tdw-reload", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("tdw-reload", cb);
    window.removeEventListener("storage", cb);
  };
}

/* userId のレイアウトを読込/保存（localStorage 永続化）。 */
export function useUserWidgetLayout(userId: string): UserWidgetLayout {
  const saved = React.useSyncExternalStore(
    subscribeLayout,
    () => readLayoutSnapshot(userId),
    () => DEFAULT_SNAPSHOT,
  );

  const save = React.useCallback(
    (items: WidgetLayoutItem[]) =>
      new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          try {
            const all = tdwLoadAll();
            all[userId] = {
              userId,
              dashboardId: "top-dashboard",
              breakpoint: "desktop",
              version: 2,
              items: tdwNormalize(items),
              updatedAt: new Date().toISOString(),
            };
            tdwSaveAll(all);
            layoutSnapshotCache.delete(userId);
            window.dispatchEvent(new CustomEvent("tdw-reload"));
            resolve();
          } catch (e) {
            reject(e as Error);
          }
        }, 640);
      }),
    [userId],
  );

  return { status: "ready", saved, save };
}

/* ============================================================
   useRowLayoutDraft — 編集中の { rows, hidden } を保持し、行対応の操作を提供
   ============================================================ */
export type NudgeDir = "prev" | "next" | "rowUp" | "rowDown";
export interface RowLayoutOps {
  moveTo: (id: WidgetId, point: DropPoint) => WidgetId[][];
  nudge: (id: WidgetId, dir: NudgeDir) => void;
  moveToRow: (id: WidgetId, rowIndex: number | "new") => boolean;
  addRow: (at?: number) => void;
  deleteRow: (rowIndex: number) => void;
  hide: (id: WidgetId) => boolean;
  show: (id: WidgetId) => void;
  resetDefault: () => void;
  canHide: (id: WidgetId, curRows?: WidgetId[][]) => boolean;
}
export interface RowLayoutDraft {
  items: WidgetLayoutItem[];
  rows: WidgetId[][];
  hidden: WidgetId[];
  setFromItems: (next: WidgetLayoutItem[]) => void;
  ops: RowLayoutOps;
}

export function useRowLayoutDraft(
  savedItems: WidgetLayoutItem[],
  announce?: (msg: string) => void,
): RowLayoutDraft {
  const [items, setItems] = React.useState<WidgetLayoutItem[]>(savedItems);
  const { rows, hidden } = React.useMemo(() => tdwItemsToRows(items), [items]);

  const commit = React.useCallback(
    (nextRows: WidgetId[][], nextHidden?: WidgetId[]) => {
      setItems(tdwRowsToItems(nextRows, nextHidden != null ? nextHidden : tdwItemsToRows(items).hidden));
    },
    [items],
  );

  const setFromItems = React.useCallback((next: WidgetLayoutItem[]) => setItems(next), []);

  const say = React.useCallback((m: string) => { if (announce) announce(m); }, [announce]);

  const canHide = React.useCallback(
    (id: WidgetId, curRows?: WidgetId[][]) => {
      if (!TDW_WIDGETS[id] || !TDW_WIDGETS[id].required) return true;
      const visReq: WidgetId[] = [];
      (curRows || rows).forEach((r) => r.forEach((x) => { if (TDW_WIDGETS[x].required) visReq.push(x); }));
      return !(visReq.length <= 1 && visReq[0] === id);
    },
    [rows],
  );

  const ops = React.useMemo<RowLayoutOps>(() => {
    const R = () => tdwItemsToRows(items);

    const moveTo = (id: WidgetId, point: DropPoint) => {
      const cur = R();
      const next = tdwApplyDrop(cur.rows, id, point);
      commit(next, cur.hidden);
      return next;
    };

    const nudge = (id: WidgetId, dir: NudgeDir) => {
      const cur = R();
      const loc = tdwFindWidget(cur.rows, id);
      if (!loc) return;
      const { row, pos } = loc;
      const span = tdwSpan(id);
      const meta = TDW_WIDGETS[id];
      if (dir === "prev") {
        if (pos > 0) {
          const nr = cur.rows.map((r) => r.slice());
          const [x] = nr[row].splice(pos, 1);
          nr[row].splice(pos - 1, 0, x);
          commit(nr, cur.hidden);
          say(`${meta.label}を同じ行の前へ移動しました。Row ${row + 1}、${pos}番目。`);
        } else if (row > 0 && TDW_COLS - rowUsed(cur.rows[row - 1]) >= span) {
          moveTo(id, { type: "in", row: row - 1, pos: cur.rows[row - 1].length, colStart: 1, span });
          say(`${meta.label}を Row ${row} の末尾へ移動しました。`);
        } else say(`これ以上前に移動できません。上の行に${span}マスの空きがありません。`);
      } else if (dir === "next") {
        if (pos < cur.rows[row].length - 1) {
          const nr = cur.rows.map((r) => r.slice());
          const [x] = nr[row].splice(pos, 1);
          nr[row].splice(pos + 1, 0, x);
          commit(nr, cur.hidden);
          say(`${meta.label}を同じ行の次へ移動しました。Row ${row + 1}、${pos + 2}番目。`);
        } else if (row < cur.rows.length - 1 && TDW_COLS - rowUsed(cur.rows[row + 1]) >= span) {
          moveTo(id, { type: "in", row: row + 1, pos: 0, colStart: 1, span });
          say(`${meta.label}を Row ${row + 2} の先頭へ移動しました。`);
        } else say(`これ以上後ろに移動できません。下の行に${span}マスの空きがありません。`);
      } else if (dir === "rowUp") {
        if (row > 0 && TDW_COLS - rowUsed(cur.rows[row - 1]) >= span) {
          moveTo(id, { type: "in", row: row - 1, pos: cur.rows[row - 1].length, colStart: 1, span });
          say(`${meta.label}を Row ${row} へ移動しました。`);
        } else if (row === 0) {
          moveTo(id, { type: "new", at: 0, colStart: 1, span });
          say(`${meta.label}を新しい先頭の行へ移動しました。`);
        } else say(`上の行（Row ${row}）に${span}マスの空きがありません。`);
      } else if (dir === "rowDown") {
        if (row < cur.rows.length - 1 && TDW_COLS - rowUsed(cur.rows[row + 1]) >= span) {
          moveTo(id, { type: "in", row: row + 1, pos: cur.rows[row + 1].length, colStart: 1, span });
          say(`${meta.label}を Row ${row + 2} へ移動しました。`);
        } else if (row === cur.rows.length - 1) {
          moveTo(id, { type: "new", at: cur.rows.length, colStart: 1, span });
          say(`${meta.label}を新しい末尾の行へ移動しました。`);
        } else say(`下の行（Row ${row + 2}）に${span}マスの空きがありません。`);
      }
    };

    const moveToRow = (id: WidgetId, rowIndex: number | "new") => {
      const cur = R();
      const span = tdwSpan(id);
      if (rowIndex === "new") {
        moveTo(id, { type: "new", at: cur.rows.length, colStart: 1, span });
        say(`${TDW_WIDGETS[id].label}を新しい行へ移動しました。`);
        return true;
      }
      const base = (cur.rows[rowIndex] || []).filter((x) => x !== id);
      if (TDW_COLS - rowUsed(base) < span) {
        say(`Row ${rowIndex + 1} には${span}マスの空きがありません。`);
        return false;
      }
      moveTo(id, { type: "in", row: rowIndex, pos: base.length, colStart: 1, span });
      say(`${TDW_WIDGETS[id].label}を Row ${rowIndex + 1} へ移動しました。`);
      return true;
    };

    const addRow = (at?: number) => {
      const cur = R();
      const idx = at == null ? cur.rows.length : at;
      const nr = cur.rows.map((r) => r.slice());
      nr.splice(Math.max(0, Math.min(idx, nr.length)), 0, []);
      commit(nr, cur.hidden);
      say(`空の行を追加しました。Row ${Math.min(idx + 1, nr.length)}。`);
    };
    const deleteRow = (rowIndex: number) => {
      const cur = R();
      if (!cur.rows[rowIndex] || cur.rows[rowIndex].length) {
        say("中身のある行は削除できません。");
        return;
      }
      if (cur.rows.length <= 1) {
        say("最後の行は削除できません。");
        return;
      }
      const nr = cur.rows.filter((_, i) => i !== rowIndex);
      commit(nr, cur.hidden);
      say(`Row ${rowIndex + 1}（空行）を削除しました。`);
    };

    const hide = (id: WidgetId) => {
      const cur = R();
      if (!canHide(id, cur.rows)) {
        say("必須KPIをすべて非表示にはできません。");
        return false;
      }
      const nr = cur.rows.map((r) => r.filter((x) => x !== id));
      commit(nr, [...cur.hidden, id]);
      say(`${TDW_WIDGETS[id].label} を非表示にしました。`);
      return true;
    };
    const show = (id: WidgetId) => {
      const cur = R();
      const nr = cur.rows.map((r) => r.slice());
      const span = tdwSpan(id);
      const last = nr.length - 1;
      if (last >= 0 && TDW_COLS - rowUsed(nr[last]) >= span) nr[last].push(id);
      else nr.push([id]);
      commit(nr, cur.hidden.filter((h) => h !== id));
      say(`${TDW_WIDGETS[id].label} を表示に戻しました。`);
    };

    const resetDefault = () => {
      setItems(tdwDefaultLayout());
      say("デフォルトの配置に戻しました。保存するまで確定されません。");
    };

    return { moveTo, nudge, moveToRow, addRow, deleteRow, hide, show, resetDefault, canHide };
  }, [items, commit, say, canHide]);

  return { items, rows, hidden, setFromItems, ops };
}

/* ---------- FLIP（ドロップ確定後だけ整列。150–200ms／reduced-motion尊重） ---------- */
export function useTdwFlip(enabled: boolean): (id: WidgetId) => (el: HTMLElement | null) => void {
  const els = React.useRef<Map<WidgetId, HTMLElement>>(new Map());
  const prev = React.useRef<Map<WidgetId, DOMRect>>(new Map());
  React.useLayoutEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<WidgetId, DOMRect>();
    els.current.forEach((el, id) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      next.set(id, r);
      const p = prev.current.get(id);
      if (enabled && p && !reduce) {
        const dx = p.left - r.left;
        const dy = p.top - r.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.style.transition = "none";
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          el.getBoundingClientRect();
          requestAnimationFrame(() => {
            el.style.transition = "transform .18s cubic-bezier(.2,.7,.3,1)";
            el.style.transform = "";
          });
        }
      }
    });
    prev.current = next;
  });
  return (id: WidgetId) => (el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  };
}

/* ============================================================
   共有スタイル（編集モード / 行 / スロット / caret / clone / settle）
   ============================================================ */
export const TDW_CSS = `
  .tdw-handle{cursor:grab;touch-action:none}
  body.tdw-dragging,body.tdw-dragging *{cursor:grabbing !important}
  .tdw-clone{pointer-events:none;position:fixed;z-index:4000;box-shadow:var(--shadow-pop);
    border:1.5px solid var(--primary);border-radius:var(--r-lg);background:var(--surface)}
  @keyframes tdwFade{from{opacity:0}to{opacity:1}}
  @keyframes tdwPop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  @keyframes tdwToastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
  .tdw-anim-fade{animation:tdwFade .16s ease both}
  @media (prefers-reduced-motion: reduce){
    .tdw-anim-fade,.tdw-toast,.tdw-caret{animation:none !important}
    .tdw-settle *{transition:none !important}
  }
`;

export { isWidgetId };
