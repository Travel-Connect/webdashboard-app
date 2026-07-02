"use client";

/* ============================================================
   chrome.tsx — レイアウト編集の外装（起動ボタン / 編集ヘッダー / 固定ツールバー /
   デフォルト確認 / 保存トースト / 読込スケルトン）。
   「表示設定（管理者・施設×KPI）」とは別。全ユーザーが自分の配置を編集できる。
   claude.ai/design app/widget-layout.jsx 移植。
   ============================================================ */

import { Icon } from "@/components/ui/icon";
import { Btn, Segmented } from "@/components/ui/primitives";
import { tdwDefaultRows, tdwSpan, type WidgetId } from "@/lib/dashboard/widget-layout";

export type EditMode = "list" | "grid";

/* 起動ボタン: 「表示設定」と役割が違うことが伝わる文言＝レイアウト編集 */
export function WidgetLayoutEditButton({ onClick }: { onClick: () => void }) {
  return (
    <Btn variant="default" size="sm" icon="LayoutGrid" onClick={onClick} style={{ borderStyle: "solid" }}>
      レイアウト編集
    </Btn>
  );
}

/* 編集方法トグル（Mode B 行リスト / Mode A 直接グリッド） */
export function WidgetEditModeToggle({
  mode,
  onChange,
  size = "sm",
}: {
  mode: EditMode;
  onChange: (m: EditMode) => void;
  size?: "sm" | "md";
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-3)" }}>編集方法</span>
      <Segmented<EditMode>
        size={size}
        value={mode}
        onChange={onChange}
        options={[
          { value: "list", label: "行リスト" },
          { value: "grid", label: "グリッド" },
        ]}
      />
    </div>
  );
}

/* デスクトップ編集ヘッダー（個人設定である旨・管理者設定との違い・編集方法） */
export function WidgetEditorHeader({
  userLabel,
  mode,
  setMode,
}: {
  userLabel: string;
  mode: EditMode;
  setMode: (m: EditMode) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 40,
              height: 40,
              borderRadius: "var(--r-md)",
              background: "var(--primary-weak)",
              color: "var(--primary-ink)",
              flexShrink: 0,
            }}
          >
            <Icon name="LayoutGrid" size={21} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>レイアウト編集</h2>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-2)" }}>
              6マスの行ごとに配置。ドラッグ・キーボード（矢印）・移動メニューで並び替えできます。カードのマス数は変わりません。
            </p>
          </div>
        </div>
        <WidgetEditModeToggle mode={mode} onChange={setMode} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 14,
          padding: "9px 13px",
          borderRadius: "var(--r-md)",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          fontSize: 12.5,
          color: "var(--text-2)",
          flexWrap: "wrap",
        }}
      >
        <Icon name="UserCog" size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        <span>
          この配置は<strong style={{ color: "var(--text)" }}> {userLabel} 個人 </strong>
          のトップ画面設定として保存され、すべての施設ダッシュボードに適用されます。
        </span>
        <span style={{ color: "var(--text-3)" }}>管理者の「表示設定（施設×KPIの前年/予算表示）」とは別の設定です。</span>
      </div>
    </div>
  );
}

/* 編集モードの固定操作バー（保存 / キャンセル / デフォルトに戻す / 未保存バッジ / 保存失敗） */
export function WidgetEditToolbar({
  dirty,
  saving,
  saveError,
  onSave,
  onCancel,
  onReset,
}: {
  dirty: boolean;
  saving: boolean;
  saveError: boolean;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="レイアウト編集の操作"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 20,
        transform: "translateX(-50%)",
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: "calc(100vw - 32px)",
        width: "max-content",
      }}
    >
      {saveError && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            color: "var(--danger)",
            background: "var(--surface)",
            border: "1px solid var(--danger)",
            padding: "9px 13px",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <Icon name="TriangleAlert" size={15} />
          保存に失敗しました。並び替え内容は保持しています。もう一度お試しください。
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 999,
          boxShadow: "var(--shadow-pop)",
          padding: "8px 10px 8px 16px",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text)",
            whiteSpace: "nowrap",
          }}
        >
          <Icon name="LayoutGrid" size={16} style={{ color: "var(--primary)" }} />
          レイアウト編集中
          {dirty ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--warning)",
                background: "var(--warning-weak)",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              <Icon name="CircleDot" size={11} />
              未保存の変更
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>保存済み</span>
          )}
        </span>
        <span style={{ width: 1, height: 22, background: "var(--border)" }} />
        <Btn size="sm" variant="ghost" icon="RotateCcw" onClick={onReset}>
          デフォルトに戻す
        </Btn>
        <Btn size="sm" variant="default" onClick={onCancel}>
          キャンセル
        </Btn>
        <Btn
          size="sm"
          variant="primary"
          icon={saving ? "Loader" : "Check"}
          disabled={saving}
          onClick={onSave}
          style={dirty && !saving ? { boxShadow: "0 0 0 3px var(--primary-weak)" } : undefined}
        >
          {saving ? "保存中…" : "保存"}
        </Btn>
      </div>
    </div>
  );
}

/* デフォルトに戻す 確認ダイアログ */
export function WidgetLayoutResetDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 130 }}>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(23,32,51,.45)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="デフォルトに戻す"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(420px, 92vw)",
          background: "var(--surface)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-pop)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", gap: 13 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 40,
              height: 40,
              borderRadius: "var(--r-md)",
              background: "var(--surface-3)",
              color: "var(--text-2)",
              flexShrink: 0,
            }}
          >
            <Icon name="RotateCcw" size={20} />
          </span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>デフォルトの配置に戻しますか？</h3>
            <p style={{ margin: "7px 0 0", fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
              すべてのウィジェットを初期レイアウト（5行）に戻します。
              <br />
              この変更は<strong>「保存」するまで確定されません</strong>。
            </p>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <Btn size="sm" variant="default" onClick={onCancel}>
            やめる
          </Btn>
          <Btn size="sm" variant="primary" icon="RotateCcw" onClick={onConfirm}>
            デフォルトに戻す
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* 保存トースト */
export interface LayoutToast {
  type: "success" | "error";
  msg: string;
}
export function WidgetLayoutSaveToast({ toast }: { toast: LayoutToast | null }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div
      className="tdw-toast"
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 92,
        transform: "translateX(-50%)",
        zIndex: 200,
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "11px 16px",
        borderRadius: 999,
        background: ok ? "var(--text)" : "var(--danger)",
        color: "#fff",
        fontSize: 13.5,
        fontWeight: 600,
        boxShadow: "var(--shadow-pop)",
        animation: "tdwToastIn .2s ease both",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <Icon name={ok ? "CircleCheckBig" : "TriangleAlert"} size={17} />
      {toast.msg}
    </div>
  );
}

/* 読込中の編集キャンバス skeleton（行フレーム＋チップ） */
export function WidgetEditorSkeleton() {
  const rows = tdwDefaultRows();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((rowIds, ri) => (
        <div key={ri} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
          <div style={{ height: 37, background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 10, padding: 12 }}>
            {rowIds.map((id: WidgetId) => (
              <div key={id} className="skel" style={{ gridColumn: `span ${tdwSpan(id)}`, height: 60, borderRadius: "var(--r-md)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
