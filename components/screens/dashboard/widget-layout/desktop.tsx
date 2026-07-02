"use client";

/* ============================================================
   desktop.tsx — デスクトップ編集（Mode A / Mode B）
   Mode B（行リスト・主UI）: 6マスの行を明示し、行ヘッダー・空きスロット・
     移動メニュー・上下ボタン中心の安定した並び替え。
   Mode A（直接グリッド・補助）: 実ダッシュボードに近い 6スロットグリッド。
   共通のドラッグエンジン（useSlotDrag）とドロップ候補（tdwValidDropPoints）を使用。
   claude.ai/design app/widget-layout-desktop.jsx 移植。
   ============================================================ */

import * as React from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  TDW_COLS,
  TDW_WIDGETS,
  tdwSpan,
  rowUsed,
  tdwFindWidget,
  tdwValidDropPoints,
  tdwApplyDrop,
  tdwColGeom,
  useTdwFlip,
  type WidgetId,
  type DropPoint,
  type RowLayoutOps,
} from "@/lib/dashboard/widget-layout";
import { TdwGlyph, TdwSpanBadge } from "./glyph";
import type { EditMode } from "./chrome";

const TDWB_GAP = 10; // Mode B 行内グリッドの gap
const TDWA_GAP = 14; // Mode A 行内グリッドの gap
const TDWA_TILE_H = 118;

type Announce = (msg: string) => void;
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface DragPoint {
  pt: DropPoint;
  rect: Rect;
}
interface DragState {
  id: WidgetId;
  span: number;
  x: number;
  y: number;
  offX: number;
  offY: number;
  w: number;
  h: number;
  point: DragPoint | null;
}
type RowRefs = React.MutableRefObject<Map<number, HTMLDivElement>>;
interface MenuState {
  id: WidgetId;
  rect: DOMRect;
}
interface DragApi {
  start: (e: React.PointerEvent, id: WidgetId) => void;
  onHandleKey: (e: React.KeyboardEvent, id: WidgetId) => void;
  rowRefs: RowRefs;
}

/* ---------- ジオメトリ: 行グリッド要素から列座標を得る（padding を差し引く） ----------
   getBoundingClientRect は border-box を返すため、grid の左右 padding を
   computed style から取り除いてから列幅を割り出す。純粋計算は lib の
   tdwColGeom に委譲（単体テスト可能）。 */
function tdwRowGeom(rowEl: HTMLElement, gap: number) {
  const rect = rowEl.getBoundingClientRect();
  const cs = typeof window !== "undefined" ? window.getComputedStyle(rowEl) : null;
  const num = (v: string | null | undefined) => (v ? parseFloat(v) || 0 : 0);
  return tdwColGeom(
    {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      paddingLeft: num(cs?.paddingLeft),
      paddingRight: num(cs?.paddingRight),
      paddingTop: num(cs?.paddingTop),
      paddingBottom: num(cs?.paddingBottom),
    },
    gap,
  );
}
function tdwRectDist(px: number, py: number, r: Rect) {
  const dx = px < r.left ? r.left - px : px > r.left + r.width ? px - (r.left + r.width) : 0;
  const dy = py < r.top ? r.top - py : py > r.top + r.height ? py - (r.top + r.height) : 0;
  return Math.hypot(dx, dy);
}

/* ============================================================
   useSlotDrag — Mode A / Mode B 共通のポインタドラッグ
   ============================================================ */
function useSlotDrag({
  rows,
  gap,
  rowRefs,
  containerRef,
  onDrop,
  announce,
}: {
  rows: WidgetId[][];
  gap: number;
  rowRefs: RowRefs;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onDrop: (id: WidgetId, point: DropPoint, next: WidgetId[][]) => void;
  announce: Announce;
  cloneKind: EditMode;
}) {
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const rowsRef = React.useRef(rows);
  // 進行中ドラッグの後始末（listeners/rAF/pointer capture/body class）を保持。
  // ドラッグ中にアンマウント（例: 768px 未満へリサイズで isMobile が true になり
  // エディタが外れる）しても確実に解放するための安全網。drop はコミットしない。
  const teardownRef = React.useRef<(() => void) | null>(null);
  // 「最新値ミラー」ref — レンダー中ではなくコミット後に同期（pointermove/up ハンドラが参照）
  React.useEffect(() => {
    dragRef.current = drag;
    rowsRef.current = rows;
  });
  // アンマウント時: 進行中ドラッグがあれば副作用のみ解放（setState/onDrop はしない）
  React.useEffect(() => () => teardownRef.current?.(), []);

  const newRowY = (at: number) => {
    const n = rowsRef.current.length;
    const g = gap;
    if (n === 0) {
      const c = containerRef.current?.getBoundingClientRect();
      return c ? c.top : 0;
    }
    if (at <= 0) {
      const el = rowRefs.current.get(0);
      return el ? el.getBoundingClientRect().top - g / 2 : 0;
    }
    if (at >= n) {
      const el = rowRefs.current.get(n - 1);
      return el ? el.getBoundingClientRect().bottom + g / 2 : 0;
    }
    const a = rowRefs.current.get(at - 1);
    const b = rowRefs.current.get(at);
    if (a && b) return (a.getBoundingClientRect().bottom + b.getBoundingClientRect().top) / 2;
    return 0;
  };

  const pickPoint = (px: number, py: number, id: WidgetId): DragPoint | null => {
    const pts = tdwValidDropPoints(rowsRef.current, id);
    const crect = containerRef.current?.getBoundingClientRect();
    if (!crect) return null;
    let best: DragPoint | null = null;
    let bestD = Infinity;
    for (const pt of pts) {
      let rect: Rect;
      if (pt.type === "in") {
        const el = rowRefs.current.get(pt.row);
        if (!el) continue;
        const g = tdwRowGeom(el, gap);
        rect = { left: g.colX(pt.colStart), top: g.contentTop, width: g.spanW(pt.span), height: g.contentHeight };
      } else {
        const y = newRowY(pt.at);
        rect = { left: crect.left, top: y - 5, width: crect.width, height: 10 };
      }
      const bias = pt.type === "in" ? 0 : 10;
      const d = tdwRectDist(px, py, rect) + bias;
      if (d < bestD) {
        bestD = d;
        best = { pt, rect };
      }
    }
    return best;
  };

  const start = (e: React.PointerEvent, id: WidgetId) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    // ポインタキャプチャ: 速い移動で handle を外れても pointermove/up を取りこぼさず、
    // ドラッグ中のテキスト選択・スタック（up が来ないまま固まる）を防ぐ。
    const handle = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    try {
      handle.setPointerCapture?.(pointerId);
    } catch {
      /* noop */
    }
    const chip = containerRef.current && containerRef.current.querySelector('[data-widget="' + id + '"]');
    const r = chip ? chip.getBoundingClientRect() : { left: e.clientX - 20, top: e.clientY - 20, width: 220, height: 100 };
    document.body.classList.add("tdw-dragging");
    const first = pickPoint(e.clientX, e.clientY, id);
    setDrag({ id, span: tdwSpan(id), x: e.clientX, y: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, w: r.width, h: r.height, point: first });
    if (announce) announce(`${TDW_WIDGETS[id].label}をつかみました。ドラッグして配置可能なスロットへ移動できます。`);

    // 端に近づいたら自動スクロール（行数が多い＝縦に長い編集画面で、画面外の
    // 行や非表示トレイへ届くようにする）。ポインタが端で静止しても継続する。
    let lastX = e.clientX;
    let lastY = e.clientY;
    let rafId = 0;
    const EDGE = 72; // 端とみなす距離(px)
    const MAX_SPEED = 20; // 1フレームの最大スクロール量(px)
    const autoScrollTick = () => {
      rafId = 0;
      const vh = window.innerHeight;
      let dy = 0;
      if (lastY < EDGE) dy = -Math.ceil(((EDGE - lastY) / EDGE) * MAX_SPEED);
      else if (lastY > vh - EDGE) dy = Math.ceil(((lastY - (vh - EDGE)) / EDGE) * MAX_SPEED);
      if (dy === 0) return;
      const before = window.scrollY;
      window.scrollBy(0, dy);
      if (window.scrollY === before) return; // スクロール端に到達 → ループ停止（60fps 空回し防止）
      const best = pickPoint(lastX, lastY, id);
      setDrag((d) => (d ? { ...d, point: best } : d));
      rafId = requestAnimationFrame(autoScrollTick);
    };
    const maybeAutoScroll = () => {
      const vh = window.innerHeight;
      if ((lastY < EDGE || lastY > vh - EDGE) && !rafId) rafId = requestAnimationFrame(autoScrollTick);
    };

    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      const best = pickPoint(ev.clientX, ev.clientY, id);
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY, point: best } : d));
      maybeAutoScroll();
    };
    // 副作用のみ解放（drop はコミットしない）。up() とアンマウント安全網の両方から呼ぶ。
    const teardown = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      try {
        handle.releasePointerCapture?.(pointerId);
      } catch {
        /* noop */
      }
      document.body.classList.remove("tdw-dragging");
      teardownRef.current = null;
    };
    const up = (ev?: Event) => {
      const cancelled = ev?.type === "pointercancel";
      teardown();
      const d = dragRef.current;
      setDrag(null);
      if (cancelled) {
        // ジェスチャ中断（touch のパームリジェクト・OS がジェスチャを奪取・
        // handle 消滅 等）は配置を確定せずスナップバックする。
        if (announce) announce("移動をキャンセルしました。");
        return;
      }
      if (d && d.point) {
        const before = JSON.stringify(rowsRef.current);
        const next = tdwApplyDrop(rowsRef.current, id, d.point.pt);
        if (JSON.stringify(next) !== before) onDrop(id, d.point.pt, next);
        else if (announce) announce("配置は変わりませんでした。");
      } else if (announce) announce("配置可能なスロットがありません。移動をキャンセルしました。");
    };
    teardownRef.current = teardown;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return { drag, start };
}

/* ---------- 移動メニューの1項目（module 定義：render 中に生成しない） ---------- */
function MoveMenuItem({
  icon,
  label,
  disabled,
  onClick,
  onClose,
  danger,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onClick();
          onClose();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        textAlign: "left",
        padding: "8px 11px",
        border: "none",
        background: "transparent",
        borderRadius: "var(--r-sm)",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "var(--text-3)" : danger ? "var(--danger)" : "var(--text)",
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "var(--surface-3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon name={icon} size={15} style={{ color: disabled ? "var(--text-3)" : danger ? "var(--danger)" : "var(--text-2)", flexShrink: 0 }} />
      {label}
    </button>
  );
}

/* ---------- 移動メニュー（前/次/上の行/下の行/別の行/新しい行/非表示） ---------- */
function WidgetMoveMenu({
  id,
  rows,
  ops,
  canHide,
  onClose,
  anchorRect,
}: {
  id: WidgetId;
  rows: WidgetId[][];
  ops: RowLayoutOps;
  canHide: (id: WidgetId) => boolean;
  onClose: () => void;
  anchorRect: DOMRect;
}) {
  const loc = tdwFindWidget(rows, id);
  const span = tdwSpan(id);
  const rowIdx = loc ? loc.row : -1;
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 340);
  const left = Math.min(anchorRect.left, window.innerWidth - 232);
  const canRow = (ri: number) => ri !== rowIdx && TDW_COLS - rowUsed((rows[ri] || []).filter((x) => x !== id)) >= span;
  const canUp = rowIdx === 0 || (rowIdx > 0 && TDW_COLS - rowUsed((rows[rowIdx - 1] || []).filter((x) => x !== id)) >= span);
  const canDown = rowIdx >= 0 && (rowIdx === rows.length - 1 || TDW_COLS - rowUsed((rows[rowIdx + 1] || []).filter((x) => x !== id)) >= span);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${TDW_WIDGETS[id].label}の移動`}
      style={{
        position: "fixed",
        top,
        left,
        width: 224,
        zIndex: 3200,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-pop)",
        padding: 6,
        maxHeight: 330,
        overflowY: "auto",
      }}
    >
      <div style={{ padding: "4px 8px 6px", fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", letterSpacing: ".04em" }}>
        移動 ・ {TDW_WIDGETS[id].label}（{span}マス）
      </div>
      <MoveMenuItem icon="ArrowLeft" label="前へ（行内）" disabled={!loc || loc.pos === 0} onClose={onClose} onClick={() => ops.nudge(id, "prev")} />
      <MoveMenuItem icon="ArrowRight" label="次へ（行内）" disabled={!loc || loc.pos === (rows[rowIdx] || []).length - 1} onClose={onClose} onClick={() => ops.nudge(id, "next")} />
      <MoveMenuItem icon="ArrowUp" label={rowIdx === 0 ? "上に新しい行を作って移動" : "上の行へ"} disabled={!canUp} onClose={onClose} onClick={() => ops.nudge(id, "rowUp")} />
      <MoveMenuItem icon="ArrowDown" label={rowIdx === rows.length - 1 ? "下に新しい行を作って移動" : "下の行へ"} disabled={!canDown} onClose={onClose} onClick={() => ops.nudge(id, "rowDown")} />
      <div style={{ height: 1, background: "var(--border)", margin: "5px 4px" }} />
      <div style={{ padding: "4px 8px 3px", fontSize: 10.5, fontWeight: 700, color: "var(--text-3)" }}>別の行へ移動</div>
      {rows.map((r, ri) => (
        <MoveMenuItem
          key={ri}
          icon={ri === rowIdx ? "Check" : "CornerDownRight"}
          label={`Row ${ri + 1} へ（空き ${TDW_COLS - rowUsed(r.filter((x) => x !== id))}）`}
          disabled={!canRow(ri)}
          onClose={onClose}
          onClick={() => ops.moveToRow(id, ri)}
        />
      ))}
      <MoveMenuItem icon="Plus" label="新しい行へ" onClose={onClose} onClick={() => ops.moveToRow(id, "new")} />
      <div style={{ height: 1, background: "var(--border)", margin: "5px 4px" }} />
      <MoveMenuItem icon="EyeOff" label="非表示にする" danger disabled={!canHide(id)} onClose={onClose} onClick={() => ops.hide(id)} />
    </div>
  );
}

/* ============================================================
   Mode B — WidgetRowListEditor（行リスト・主UI）
   ============================================================ */
export function TdwRowCapacity({ used }: { used: number }) {
  const dots: boolean[] = [];
  for (let i = 0; i < TDW_COLS; i++) dots.push(i < used);
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }} aria-hidden="true">
      {dots.map((on, i) => (
        <i
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 2,
            background: on ? "var(--primary)" : "var(--surface-3)",
            boxShadow: on ? "none" : "inset 0 0 0 1px var(--border)",
          }}
        />
      ))}
    </span>
  );
}

function WidgetRowListChip({
  id,
  ghost,
  onHandleDown,
  onHandleKey,
  onMenu,
  menuOpen,
}: {
  id: WidgetId;
  ghost?: boolean;
  onHandleDown: (e: React.PointerEvent, id: WidgetId) => void;
  onHandleKey: (e: React.KeyboardEvent, id: WidgetId) => void;
  onMenu: (id: WidgetId, rect: DOMRect) => void;
  menuOpen?: boolean;
}) {
  const meta = TDW_WIDGETS[id];
  const btnRef = React.useRef<HTMLButtonElement>(null);
  return (
    <div
      className="tdwb-chip"
      data-widget={id}
      style={{
        gridColumn: `span ${meta.span}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
        height: 60,
        padding: "0 8px 0 6px",
        borderRadius: "var(--r-md)",
        border: "1px solid " + (menuOpen ? "var(--primary)" : "var(--border)"),
        background: ghost ? "var(--surface-2)" : "var(--surface)",
        boxShadow: ghost ? "none" : "var(--shadow-card)",
        opacity: ghost ? 0.5 : 1,
        outline: ghost ? "1.5px dashed var(--border-strong)" : "none",
        outlineOffset: -1,
        transition: "border-color .12s, box-shadow .12s",
      }}
    >
      <button
        type="button"
        className="tdw-handle"
        aria-label={`${meta.label}を並び替え。矢印キーで移動、メニューキーで移動メニュー。`}
        onPointerDown={(e) => onHandleDown(e, id)}
        onKeyDown={(e) => onHandleKey(e, id)}
        style={{
          display: "grid",
          placeItems: "center",
          width: 30,
          height: 44,
          border: "none",
          background: "transparent",
          color: "var(--text-3)",
          flexShrink: 0,
          borderRadius: "var(--r-sm)",
        }}
      >
        <Icon name="GripVertical" size={18} />
      </button>
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 30,
          height: 30,
          borderRadius: "var(--r-md)",
          background: "var(--primary-weak)",
          color: "var(--primary-ink)",
          flexShrink: 0,
        }}
      >
        <Icon name={meta.icon} size={16} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {meta.label}
        </span>
        <span style={{ marginTop: 2, display: "inline-block" }}>
          <TdwSpanBadge span={meta.span} />
        </span>
      </span>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${meta.label}の移動メニュー`}
        onClick={() => btnRef.current && onMenu(id, btnRef.current.getBoundingClientRect())}
        style={{
          display: "grid",
          placeItems: "center",
          width: 30,
          height: 30,
          borderRadius: "var(--r-sm)",
          border: "1px solid " + (menuOpen ? "var(--primary)" : "var(--border)"),
          background: menuOpen ? "var(--primary-weak)" : "var(--surface)",
          color: "var(--text-2)",
          flexShrink: 0,
        }}
      >
        <Icon name="MoveVertical" size={15} />
      </button>
    </div>
  );
}

function WidgetRowListEditor({
  rows,
  ops,
  registerFlip,
  dragApi,
  drag,
  menu,
  setMenu,
}: {
  rows: WidgetId[][];
  ops: RowLayoutOps;
  registerFlip: (id: WidgetId) => (el: HTMLElement | null) => void;
  dragApi: DragApi;
  drag: DragState | null;
  menu: MenuState | null;
  setMenu: (m: MenuState | null) => void;
}) {
  const rowRefs = dragApi.rowRefs;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((rowIds, ri) => {
        const used = rowUsed(rowIds);
        const free = TDW_COLS - used;
        const dragSpan = drag ? drag.span : 0;
        const canAccept = drag ? TDW_COLS - rowUsed(rowIds.filter((x) => x !== drag.id)) >= dragSpan : true;
        const isDisabled = !!drag && !canAccept && !rowIds.includes(drag.id);
        return (
          <section
            key={ri}
            aria-label={`Row ${ri + 1}`}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              background: isDisabled ? "var(--surface-2)" : "var(--surface)",
              overflow: "hidden",
              opacity: isDisabled ? 0.55 : 1,
              transition: "opacity .15s",
            }}
          >
            {/* 行ヘッダー */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                background: "var(--surface-2)",
                flexWrap: "wrap",
              }}
            >
              <span className="tabular" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", letterSpacing: ".02em" }}>
                Row {ri + 1}
              </span>
              <TdwRowCapacity used={used} />
              <span className="tabular" style={{ fontSize: 12, fontWeight: 700, color: free === 0 ? "var(--text-2)" : "var(--primary-ink)" }}>
                {used}/6
              </span>
              {free > 0 ? (
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                  空き {free}マス{free === 1 ? "（配置不可）" : ""}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>満杯</span>
              )}
              {isDisabled && (
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--warning)" }}>
                  <Icon name="Ban" size={12} />
                  空き{dragSpan}マスなし
                </span>
              )}
              {!drag && rowIds.length === 0 && (
                <button
                  type="button"
                  onClick={() => ops.deleteRow(ri)}
                  disabled={rows.length <= 1}
                  style={{
                    marginLeft: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "var(--text-2)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    padding: "3px 8px",
                    cursor: rows.length <= 1 ? "not-allowed" : "pointer",
                    opacity: rows.length <= 1 ? 0.5 : 1,
                  }}
                >
                  <Icon name="Trash2" size={12} />
                  空行を削除
                </button>
              )}
            </div>
            {/* 6スロットの行グリッド */}
            <div
              ref={(el) => {
                if (el) rowRefs.current.set(ri, el);
                else rowRefs.current.delete(ri);
              }}
              style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: TDWB_GAP, padding: 12, alignItems: "stretch" }}
            >
              {rowIds.map((id) => (
                // grid アイテムは「このラッパ」。span は必ずここに置く（内側の chip に
                // 置いても grid アイテムでないため無視され、1マスに潰れる）。
                <div key={id} ref={registerFlip(id)} style={{ gridColumn: `span ${TDW_WIDGETS[id].span}`, minWidth: 0 }}>
                  <WidgetRowListChip
                    id={id}
                    ghost={!!drag && drag.id === id}
                    onHandleDown={dragApi.start}
                    onHandleKey={dragApi.onHandleKey}
                    onMenu={(wid, rect) => setMenu({ id: wid, rect })}
                    menuOpen={!!menu && menu.id === id}
                  />
                </div>
              ))}
              {free > 0 && (
                <div
                  style={{
                    gridColumn: `span ${free}`,
                    display: "grid",
                    placeItems: "center",
                    minHeight: 60,
                    borderRadius: "var(--r-md)",
                    border: "1.5px dashed var(--border-strong)",
                    background: "repeating-linear-gradient(45deg, transparent, transparent 7px, var(--surface-2) 7px, var(--surface-2) 14px)",
                    color: "var(--text-3)",
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  空き {free}マス
                </div>
              )}
            </div>
          </section>
        );
      })}
      {/* 行を追加 */}
      {!drag && (
        <button
          type="button"
          onClick={() => ops.addRow()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            padding: "10px",
            borderRadius: "var(--r-lg)",
            border: "1.5px dashed var(--border-strong)",
            background: "transparent",
            color: "var(--text-2)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--primary)";
            e.currentTarget.style.color = "var(--primary-ink)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-strong)";
            e.currentTarget.style.color = "var(--text-2)";
          }}
        >
          <Icon name="Plus" size={16} />
          行を追加
        </button>
      )}
    </div>
  );
}

/* ============================================================
   Mode A — DirectGridEditor（直接グリッド・補助）
   ============================================================ */
function DirectGridTile({
  id,
  ghost,
  onHandleDown,
  onHandleKey,
  onMenu,
  menuOpen,
}: {
  id: WidgetId;
  ghost?: boolean;
  onHandleDown: (e: React.PointerEvent, id: WidgetId) => void;
  onHandleKey: (e: React.KeyboardEvent, id: WidgetId) => void;
  onMenu: (id: WidgetId, rect: DOMRect) => void;
  menuOpen?: boolean;
}) {
  const meta = TDW_WIDGETS[id];
  const btnRef = React.useRef<HTMLButtonElement>(null);
  return (
    <div
      className="tdwa-tile"
      data-widget={id}
      style={{
        gridColumn: `span ${meta.span}`,
        position: "relative",
        height: TDWA_TILE_H,
        display: "flex",
        flexDirection: "column",
        padding: "9px 11px",
        borderRadius: "var(--r-lg)",
        border: "1px solid " + (menuOpen ? "var(--primary)" : "var(--border)"),
        background: ghost ? "var(--surface-2)" : "var(--surface)",
        boxShadow: ghost ? "none" : "var(--shadow-card)",
        opacity: ghost ? 0.45 : 1,
        outline: ghost ? "1.5px dashed var(--border-strong)" : "none",
        outlineOffset: -2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <button
          type="button"
          className="tdw-handle"
          aria-label={`${meta.label}を並び替え。矢印キーで移動。`}
          onPointerDown={(e) => onHandleDown(e, id)}
          onKeyDown={(e) => onHandleKey(e, id)}
          style={{ display: "grid", placeItems: "center", width: 24, height: 26, border: "none", background: "transparent", color: "var(--text-3)", flexShrink: 0 }}
        >
          <Icon name="GripVertical" size={16} />
        </button>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 25,
            height: 25,
            borderRadius: "var(--r-md)",
            background: "var(--primary-weak)",
            color: "var(--primary-ink)",
            flexShrink: 0,
          }}
        >
          <Icon name={meta.icon} size={14} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {meta.label}
        </span>
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`${meta.label}の移動メニュー`}
          onClick={() => btnRef.current && onMenu(id, btnRef.current.getBoundingClientRect())}
          style={{
            display: "grid",
            placeItems: "center",
            width: 26,
            height: 26,
            borderRadius: "var(--r-sm)",
            border: "1px solid " + (menuOpen ? "var(--primary)" : "transparent"),
            background: menuOpen ? "var(--primary-weak)" : "transparent",
            color: "var(--text-3)",
            flexShrink: 0,
          }}
        >
          <Icon name="MoveVertical" size={14} />
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "4px 2px 0" }}>
        <div style={{ width: "100%" }}>
          <TdwGlyph kind={meta.glyph} />
        </div>
      </div>
      <div>
        <TdwSpanBadge span={meta.span} />
      </div>
    </div>
  );
}

function DirectGridEditor({
  rows,
  ops,
  registerFlip,
  dragApi,
  drag,
  menu,
  setMenu,
}: {
  rows: WidgetId[][];
  ops: RowLayoutOps;
  registerFlip: (id: WidgetId) => (el: HTMLElement | null) => void;
  dragApi: DragApi;
  drag: DragState | null;
  menu: MenuState | null;
  setMenu: (m: MenuState | null) => void;
}) {
  const rowRefs = dragApi.rowRefs;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: TDWA_GAP }}>
      {rows.map((rowIds, ri) => {
        const used = rowUsed(rowIds);
        const canAccept = drag ? TDW_COLS - rowUsed(rowIds.filter((x) => x !== drag.id)) >= drag.span : true;
        const isDisabled = !!drag && !canAccept && !rowIds.includes(drag.id);
        return (
          <div key={ri} style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, paddingLeft: 2 }}>
              <span className="tabular" style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-2)" }}>
                Row {ri + 1}
              </span>
              <span className="tabular" style={{ fontSize: 11, fontWeight: 700, color: used >= TDW_COLS ? "var(--text-3)" : "var(--primary-ink)" }}>
                {used}/6
              </span>
              {isDisabled && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, color: "var(--warning)" }}>
                  <Icon name="Ban" size={11} />
                  空き{drag!.span}マスなし
                </span>
              )}
            </div>
            {/* 背景スロット（6マス） */}
            <div
              ref={(el) => {
                if (el) rowRefs.current.set(ri, el);
                else rowRefs.current.delete(ri);
              }}
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "repeat(6, minmax(0,1fr))",
                gap: TDWA_GAP,
                alignItems: "stretch",
                opacity: isDisabled ? 0.5 : 1,
                transition: "opacity .15s",
              }}
            >
              <div
                aria-hidden="true"
                style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: TDWA_GAP, pointerEvents: "none" }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ borderRadius: "var(--r-md)", border: "1.5px dashed var(--border)", background: i >= used ? "var(--surface-2)" : "transparent" }} />
                ))}
              </div>
              {rowIds.map((id) => (
                <div key={id} ref={registerFlip(id)} style={{ gridColumn: `span ${TDW_WIDGETS[id].span}`, position: "relative", zIndex: 1 }}>
                  <DirectGridTile
                    id={id}
                    ghost={!!drag && drag.id === id}
                    onHandleDown={dragApi.start}
                    onHandleKey={dragApi.onHandleKey}
                    onMenu={(wid, rect) => setMenu({ id: wid, rect })}
                    menuOpen={!!menu && menu.id === id}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!drag && (
        <button
          type="button"
          onClick={() => ops.addRow()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            padding: "9px",
            borderRadius: "var(--r-lg)",
            border: "1.5px dashed var(--border-strong)",
            background: "transparent",
            color: "var(--text-2)",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <Icon name="Plus" size={15} />
          行を追加
        </button>
      )}
    </div>
  );
}

/* ---------- 非表示トレイ ---------- */
export function TdwHiddenTray({ hidden, onRestore }: { hidden: WidgetId[]; onRestore: (id: WidgetId) => void }) {
  return (
    <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon name="EyeOff" size={15} style={{ color: "var(--text-3)" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>非表示のウィジェット</span>
        <span className="tabular" style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 600 }}>
          {hidden.length}
        </span>
      </div>
      {hidden.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)" }}>すべてのウィジェットが表示されています。カードの移動メニューから非表示にできます。</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {hidden.map((id) => {
            const meta = TDW_WIDGETS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onRestore(id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 11px 7px 9px",
                  borderRadius: 999,
                  border: "1px dashed var(--border-strong)",
                  background: "var(--surface-2)",
                  color: "var(--text-2)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: "var(--r-sm)", background: "var(--surface-3)", color: "var(--text-2)" }}>
                  <Icon name={meta.icon} size={13} />
                </span>
                {meta.label}
                <TdwSpanBadge span={meta.span} />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--primary)", fontWeight: 700 }}>
                  <Icon name="Plus" size={13} />
                  表示
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- ドラッグ中のオーバーレイ（drop preview + floating clone） ---------- */
function TdwDragOverlay({ drag, mode }: { drag: DragState | null; mode: EditMode }) {
  if (!drag) return null;
  const meta = TDW_WIDGETS[drag.id];
  const pr = drag.point && drag.point.rect;
  const isNew = !!(drag.point && drag.point.pt.type === "new");
  return (
    <>
      {pr && (
        <div
          className="tdw-caret"
          aria-hidden="true"
          style={{
            position: "fixed",
            left: pr.left,
            top: isNew ? pr.top - 3 : pr.top,
            width: pr.width,
            height: isNew ? 8 : pr.height,
            borderRadius: isNew ? 999 : "var(--r-lg)",
            zIndex: 3500,
            pointerEvents: "none",
            border: isNew ? "none" : "2px solid var(--primary)",
            background: isNew ? "var(--primary)" : "var(--primary-weak)",
            boxShadow: isNew ? "0 0 0 3px var(--primary-weak)" : "none",
            opacity: 0.96,
            transition: "left .09s ease, top .09s ease, width .09s ease",
            display: isNew ? "block" : "grid",
            placeItems: "center",
          }}
        >
          {!isNew && (
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--primary-ink)", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="CornerDownLeft" size={13} />
              ここに配置
            </span>
          )}
        </div>
      )}
      {/* floating clone */}
      <div
        className="tdw-clone"
        style={{
          left: drag.x - drag.offX,
          top: drag.y - drag.offY,
          width: drag.w,
          height: mode === "grid" ? TDWA_TILE_H : 60,
          transform: "scale(1.02)",
          display: "flex",
          flexDirection: "column",
          padding: mode === "grid" ? "9px 11px" : "0 10px",
          justifyContent: mode === "grid" ? "flex-start" : "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "grid", placeItems: "center", width: 26, height: 26, color: "var(--primary-ink)" }}>
            <Icon name="GripVertical" size={16} />
          </span>
          <span style={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: "var(--r-md)", background: "var(--primary-weak)", color: "var(--primary-ink)" }}>
            <Icon name={meta.icon} size={15} />
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{meta.label}</span>
          <span style={{ marginLeft: "auto" }}>
            <TdwSpanBadge span={meta.span} tone="on" />
          </span>
        </div>
        {mode === "grid" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "4px 2px 0" }}>
            <div style={{ width: "100%" }}>
              <TdwGlyph kind={meta.glyph} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   RowAwareWidgetEditor — Mode A / Mode B を束ねる編集キャンバス
   ============================================================ */
export function RowAwareWidgetEditor({
  rows,
  hidden,
  ops,
  announce,
  mode,
}: {
  rows: WidgetId[][];
  hidden: WidgetId[];
  ops: RowLayoutOps;
  announce: Announce;
  mode: EditMode;
}) {
  const registerFlip = useTdwFlip(true);
  const rowRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const gap = mode === "grid" ? TDWA_GAP : TDWB_GAP;

  const onDrop = React.useCallback(
    (id: WidgetId, point: DropPoint, next: WidgetId[][]) => {
      ops.moveTo(id, point);
      const loc = tdwFindWidget(next, id);
      if (loc) announce(`${TDW_WIDGETS[id].label}を Row ${loc.row + 1} の${loc.pos + 1}番目に配置しました。`);
    },
    [ops, announce],
  );

  const { drag, start } = useSlotDrag({ rows, gap, rowRefs, containerRef, onDrop, announce, cloneKind: mode });

  const onHandleKey = React.useCallback(
    (e: React.KeyboardEvent, id: WidgetId) => {
      let dir: "prev" | "next" | "rowUp" | "rowDown" | null = null;
      if (e.key === "ArrowLeft") dir = "prev";
      else if (e.key === "ArrowRight") dir = "next";
      else if (e.key === "ArrowUp") dir = "rowUp";
      else if (e.key === "ArrowDown") dir = "rowDown";
      else if (e.key === "Enter" || e.key === " " || e.key === "ContextMenu") {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setMenu({ id, rect });
        return;
      } else return;
      e.preventDefault();
      ops.nudge(id, dir);
      requestAnimationFrame(() => {
        const host = containerRef.current;
        const el = host && host.querySelector(`[data-widget="${id}"] .tdw-handle`);
        if (el) (el as HTMLElement).focus();
      });
    },
    [ops],
  );

  const dragApi: DragApi = { start, onHandleKey, rowRefs };

  return (
    <div ref={containerRef} className="tdw-editcanvas" style={{ position: "relative" }}>
      {mode === "grid" ? (
        <DirectGridEditor rows={rows} ops={ops} registerFlip={registerFlip} dragApi={dragApi} drag={drag} menu={menu} setMenu={setMenu} />
      ) : (
        <WidgetRowListEditor rows={rows} ops={ops} registerFlip={registerFlip} dragApi={dragApi} drag={drag} menu={menu} setMenu={setMenu} />
      )}
      <TdwHiddenTray hidden={hidden} onRestore={ops.show} />
      {menu && <WidgetMoveMenu id={menu.id} rows={rows} ops={ops} canHide={(wid) => ops.canHide(wid)} anchorRect={menu.rect} onClose={closeMenu} />}
      <TdwDragOverlay drag={drag} mode={mode} />
    </div>
  );
}
