"use client";

/* ============================================================
   mobile.tsx — モバイル: bottom sheet 行リスト編集
   1画面に全ウィジェットを縦リスト表示し、行ごとに区切り、span表示・上へ/下へ
   ボタン・移動メニューで並び替える。配置は order ベース（6マス first-fit 自動整列）。
   claude.ai/design app/widget-layout-mobile.jsx 移植。
   ============================================================ */

import * as React from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { Btn } from "@/components/ui/primitives";
import {
  TDW_COLS,
  TDW_WIDGETS,
  rowUsed,
  tdwItemsToRows,
  tdwPackOrder,
  tdwRowsToItems,
  useTdwFlip,
  type WidgetId,
  type WidgetLayoutItem,
} from "@/lib/dashboard/widget-layout";
import { TdwSpanBadge } from "./glyph";
import { TdwRowCapacity, TdwHiddenTray } from "./desktop";

type Announce = (msg: string) => void;
interface MenuState {
  id: WidgetId;
  rect: DOMRect;
}

function tdwFlatVisible(items: WidgetLayoutItem[]): WidgetId[] {
  const { rows } = tdwItemsToRows(items);
  const f: WidgetId[] = [];
  rows.forEach((r) => r.forEach((id) => f.push(id)));
  return f;
}

/* モバイルメニュー1項目（module 定義：render 中に生成しない） */
function MobileMenuItem({
  icon,
  label,
  onClick,
  onClose,
  disabled,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  onClose: () => void;
  disabled?: boolean;
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
        minHeight: 44,
        padding: "0 12px",
        border: "none",
        background: "transparent",
        fontSize: 14,
        fontWeight: 600,
        color: disabled ? "var(--text-3)" : danger ? "var(--danger)" : "var(--text)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Icon name={icon} size={16} style={{ color: disabled ? "var(--text-3)" : danger ? "var(--danger)" : "var(--text-2)" }} />
      {label}
    </button>
  );
}

function TdwMobileItemMenu({
  onClose,
  anchorRect,
  onTop,
  onBottom,
  onHide,
  canHide,
}: {
  onClose: () => void;
  anchorRect: DOMRect;
  onTop: () => void;
  onBottom: () => void;
  onHide: () => void;
  canHide: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 190);
  const left = Math.min(anchorRect.right - 190, window.innerWidth - 200);
  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: "fixed",
        top,
        left,
        width: 190,
        zIndex: 3300,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-pop)",
        padding: 5,
      }}
    >
      <MobileMenuItem icon="ChevronsUp" label="一番上へ" onClose={onClose} onClick={onTop} />
      <MobileMenuItem icon="ChevronsDown" label="一番下へ" onClose={onClose} onClick={onBottom} />
      <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />
      <MobileMenuItem icon="EyeOff" label="非表示にする" danger disabled={!canHide} onClose={onClose} onClick={onHide} />
    </div>
  );
}

function TdwMobileRow({
  id,
  dragging,
  onUp,
  onDown,
  onMenu,
  onPointerDown,
  registerRef,
  canUp,
  canDown,
}: {
  id: WidgetId;
  dragging?: boolean;
  onUp: (id: WidgetId) => void;
  onDown: (id: WidgetId) => void;
  onMenu: (id: WidgetId, rect: DOMRect) => void;
  onPointerDown: (e: React.PointerEvent, id: WidgetId) => void;
  registerRef: (el: HTMLElement | null) => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const meta = TDW_WIDGETS[id];
  const menuBtn = React.useRef<HTMLButtonElement>(null);
  return (
    <div
      ref={registerRef}
      className="tdw-mrow"
      data-widget={id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 8px 8px 6px",
        borderRadius: "var(--r-md)",
        border: "1px solid " + (dragging ? "var(--primary)" : "var(--border)"),
        background: dragging ? "var(--primary-weak)" : "var(--surface)",
        boxShadow: dragging ? "var(--shadow-pop)" : "none",
        marginBottom: 7,
        touchAction: "pan-y",
      }}
    >
      <button
        type="button"
        className="tdw-handle"
        onPointerDown={(e) => onPointerDown(e, id)}
        aria-label={`${meta.label}をドラッグで並び替え`}
        style={{ display: "grid", placeItems: "center", width: 32, height: 44, border: "none", background: "transparent", color: "var(--text-3)", flexShrink: 0 }}
      >
        <Icon name="GripVertical" size={19} />
      </button>
      <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: "var(--r-md)", background: "var(--primary-weak)", color: "var(--primary-ink)", flexShrink: 0 }}>
        <Icon name={meta.icon} size={17} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta.label}</span>
        <span style={{ marginTop: 2, display: "inline-block" }}>
          <TdwSpanBadge span={meta.span} />
        </span>
      </span>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => onUp(id)}
          disabled={!canUp}
          aria-label={`${meta.label}を上へ`}
          style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)", color: canUp ? "var(--text)" : "var(--text-3)", opacity: canUp ? 1 : 0.4 }}
        >
          <Icon name="ChevronUp" size={19} />
        </button>
        <button
          type="button"
          onClick={() => onDown(id)}
          disabled={!canDown}
          aria-label={`${meta.label}を下へ`}
          style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)", color: canDown ? "var(--text)" : "var(--text-3)", opacity: canDown ? 1 : 0.4 }}
        >
          <Icon name="ChevronDown" size={19} />
        </button>
        <button
          ref={menuBtn}
          type="button"
          onClick={() => menuBtn.current && onMenu(id, menuBtn.current.getBoundingClientRect())}
          aria-label={`${meta.label}のメニュー`}
          style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-2)" }}
        >
          <Icon name="Ellipsis" size={18} />
        </button>
      </div>
    </div>
  );
}

export function MobileWidgetLayoutEditor({
  items,
  onChangeItems,
  canHideFn,
  announce,
  dirty,
  saving,
  saveError,
  onSave,
  onCancel,
  onReset,
  userLabel,
}: {
  items: WidgetLayoutItem[];
  onChangeItems: (items: WidgetLayoutItem[]) => void;
  canHideFn: (id: WidgetId) => boolean;
  announce: Announce;
  dirty: boolean;
  saving: boolean;
  saveError: boolean;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
  userLabel: string;
}) {
  const flat = tdwFlatVisible(items);
  const hidden = tdwItemsToRows(items).hidden;
  const packed = tdwPackOrder(flat);
  const registerFlip = useTdwFlip(true);
  const rowEls = React.useRef<Map<WidgetId, HTMLElement>>(new Map());
  const setRowEl = (id: WidgetId) => (el: HTMLElement | null) => {
    if (el) rowEls.current.set(id, el);
    else rowEls.current.delete(id);
  };
  const [dragId, setDragId] = React.useState<WidgetId | null>(null);
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const flatRef = React.useRef(flat);
  // 「最新値ミラー」ref — レンダー中ではなくコミット後に同期（pointermove ハンドラが参照）
  React.useEffect(() => {
    flatRef.current = flat;
  });
  const dragRef = React.useRef<{ id: WidgetId } | null>(null);

  const commit = (newFlat: WidgetId[], newHidden?: WidgetId[]) =>
    onChangeItems(tdwRowsToItems(tdwPackOrder(newFlat), newHidden != null ? newHidden : hidden));

  const move = (id: WidgetId, dir: number) => {
    const i = flat.indexOf(id);
    const to = i + dir;
    if (to < 0 || to >= flat.length) return;
    const nf = flat.slice();
    const [x] = nf.splice(i, 1);
    nf.splice(to, 0, x);
    commit(nf);
    announce(`${TDW_WIDGETS[id].label}を${to + 1}番目に移動しました。全${flat.length}件中。`);
  };
  const moveEnd = (id: WidgetId, where: "top" | "bottom") => {
    const nf = flat.filter((x) => x !== id);
    if (where === "top") nf.unshift(id);
    else nf.push(id);
    commit(nf);
    announce(`${TDW_WIDGETS[id].label}を${where === "top" ? "先頭" : "末尾"}へ移動しました。`);
  };
  const hide = (id: WidgetId) => {
    if (!canHideFn(id)) {
      announce("必須KPIをすべて非表示にはできません。");
      return;
    }
    commit(
      flat.filter((x) => x !== id),
      [...hidden, id],
    );
    announce(`${TDW_WIDGETS[id].label} を非表示にしました。`);
  };
  const show = (id: WidgetId) => {
    commit([...flat, id], hidden.filter((h) => h !== id));
    announce(`${TDW_WIDGETS[id].label} を表示に戻しました。`);
  };

  const onPointerDown = (e: React.PointerEvent, id: WidgetId) => {
    e.preventDefault();
    setDragId(id);
    dragRef.current = { id };
    announce(`${TDW_WIDGETS[id].label}をつかみました。上下にドラッグ、または上へ/下へボタンで移動できます。`);
    const onMove = (ev: PointerEvent) => {
      const s = dragRef.current;
      if (!s) return;
      const cur = flatRef.current;
      const ci = cur.indexOf(s.id);
      const upId = cur[ci - 1];
      const downId = cur[ci + 1];
      const upEl = upId && rowEls.current.get(upId);
      const downEl = downId && rowEls.current.get(downId);
      if (upEl) {
        const r = upEl.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) {
          const nf = cur.slice();
          const [x] = nf.splice(ci, 1);
          nf.splice(ci - 1, 0, x);
          commit(nf);
          return;
        }
      }
      if (downEl) {
        const r = downEl.getBoundingClientRect();
        if (ev.clientY > r.top + r.height / 2) {
          const nf = cur.slice();
          const [x] = nf.splice(ci, 1);
          nf.splice(ci + 1, 0, x);
          commit(nf);
          return;
        }
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const s = dragRef.current;
      dragRef.current = null;
      setDragId(null);
      if (s) announce(`${TDW_WIDGETS[s.id].label}を${flatRef.current.indexOf(s.id) + 1}番目に配置しました。`);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 120 }}>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(23,32,51,.45)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="レイアウト編集"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 4, background: "var(--border-strong)", margin: "8px auto 4px", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "6px 16px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="LayoutGrid" size={17} style={{ color: "var(--primary)" }} />
              レイアウト編集
              {dirty && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--warning)", background: "var(--warning-weak)", padding: "2px 7px", borderRadius: 999 }}>未保存</span>
              )}
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--text-3)" }}>上へ/下へボタンで並び替え ・ {userLabel}個人の設定 ・ 行は6マスで自動整列</p>
          </div>
          <button onClick={onCancel} aria-label="閉じる" style={{ border: "none", background: "none", color: "var(--text-2)", flexShrink: 0 }}>
            <Icon name="X" size={22} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "10px 14px 8px", flex: 1 }}>
          {packed.map((rowIds, ri) => {
            const used = rowUsed(rowIds);
            const free = TDW_COLS - used;
            return (
              <div key={ri} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 2px 7px" }}>
                  <span className="tabular" style={{ fontSize: 12, fontWeight: 800, color: "var(--text-2)" }}>
                    Row {ri + 1}
                  </span>
                  <TdwRowCapacity used={used} />
                  <span className="tabular" style={{ fontSize: 11.5, fontWeight: 700, color: free === 0 ? "var(--text-3)" : "var(--primary-ink)" }}>
                    {used}/6
                  </span>
                  {free > 0 && <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>空き{free}</span>}
                </div>
                {rowIds.map((id) => {
                  const g = flat.indexOf(id);
                  return (
                    <TdwMobileRow
                      key={id}
                      id={id}
                      dragging={dragId === id}
                      registerRef={(el) => {
                        registerFlip(id)(el);
                        setRowEl(id)(el);
                      }}
                      canUp={g > 0}
                      canDown={g < flat.length - 1}
                      onUp={(x) => move(x, -1)}
                      onDown={(x) => move(x, 1)}
                      onPointerDown={onPointerDown}
                      onMenu={(x, rect) => setMenu({ id: x, rect })}
                    />
                  );
                })}
              </div>
            );
          })}
          <TdwHiddenTray hidden={hidden} onRestore={show} />
        </div>

        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "10px 16px calc(12px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 8 }}>
          {saveError && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--danger)", background: "var(--danger-weak)", padding: "8px 10px", borderRadius: "var(--r-md)" }}>
              <Icon name="TriangleAlert" size={14} />
              保存に失敗しました。並び替え内容は保持しています。もう一度お試しください。
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Btn size="sm" variant="ghost" icon="RotateCcw" onClick={onReset}>
              デフォルト
            </Btn>
            <span style={{ flex: 1 }} />
            <Btn size="sm" variant="default" onClick={onCancel}>
              キャンセル
            </Btn>
            <Btn size="sm" variant="primary" icon={saving ? "Loader" : "Check"} disabled={saving} onClick={onSave}>
              {saving ? "保存中…" : "保存"}
            </Btn>
          </div>
        </div>
      </div>

      {menu && (
        <TdwMobileItemMenu
          anchorRect={menu.rect}
          onClose={closeMenu}
          canHide={canHideFn(menu.id)}
          onTop={() => moveEnd(menu.id, "top")}
          onBottom={() => moveEnd(menu.id, "bottom")}
          onHide={() => hide(menu.id)}
        />
      )}
    </div>
  );
}
