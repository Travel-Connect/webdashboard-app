"use client";

/* ============================================================
   app/dashboard/page.tsx — 総合ダッシュボード (TOP / overview).
   新 Claude Design 準拠。施設マルチセレクト + 表示モード(施設別/合算)。
   グローバル期間フィルタ(year/month/period/taxMode)は useFilters から、
   施設SET は画面ローカル state（URLには持たせない）で管理する。
   データは useOverview(/api/dashboard/overview) を消費するだけ。

   ＋ レイアウト編集（ウィジェット並び替え・個人ごと・localStorage 永続化）:
   ヘッダーの「レイアウト編集」から Row-aware エディタに入り、保存レイアウトが
   各施設ボードの並び順に反映される。詳細は lib/dashboard/widget-layout.ts。
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Icon } from "@/components/ui/icon";
import { Badge, Btn, EmptyState, LoadingSkeleton, Segmented, Spinner } from "@/components/ui/primitives";
import { useFilters } from "@/lib/dashboard/use-filters";
import { useOverview } from "@/lib/dashboard/use-overview";
import { FacilityPanel } from "@/components/screens/dashboard/facility-panel";
import { FacilityBoard } from "@/components/screens/dashboard/facility-board";
import { FacilityNav } from "@/components/screens/dashboard/facility-nav";
import {
  useUserWidgetLayout,
  useRowLayoutDraft,
  tdwLayoutsEqual,
} from "@/lib/dashboard/widget-layout";
import {
  WidgetLayoutEditButton,
  WidgetEditorHeader,
  WidgetEditToolbar,
  WidgetLayoutResetDialog,
  WidgetLayoutSaveToast,
  WidgetEditorSkeleton,
  RowAwareWidgetEditor,
  MobileWidgetLayoutEditor,
  TdwStyles,
  useIsMobile,
  type EditMode,
  type LayoutToast,
} from "@/components/screens/dashboard/widget-layout";
import type { FacilityOption } from "@/app/api/facilities/route";

const facFetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<FacilityOption[]>);

type Mode = "perFacility" | "total";

const USER_ID = "local";
const USER_LABEL = "あなた";

export default function DashboardOverviewPage() {
  const { filters } = useFilters();
  const { data: facilities } = useSWR<FacilityOption[]>("/api/facilities", facFetcher, {
    revalidateOnFocus: false,
  });

  // 施設SET（画面ローカル）。null = 未操作（既定としてグループ全施設を選択扱い）。
  const [facilityIds, setFacilityIds] = useState<string[] | null>(null);
  const allIds = useMemo(() => (facilities ?? []).map((f) => f.id), [facilities]);
  const selectedIds = facilityIds ?? allIds;

  const [mode, setMode] = useState<Mode>("perFacility");

  const overviewFilters = useMemo(
    () => ({ year: filters.year, month: filters.month, period: filters.period, taxMode: filters.taxMode }),
    [filters.year, filters.month, filters.period, filters.taxMode],
  );
  const { data, error, isLoading, isValidating, mutate } = useOverview(overviewFilters, selectedIds);

  const taxLabel = filters.taxMode === "gross" ? "税込" : "税抜";
  const periodLabel =
    filters.period === "yearly" ? `${filters.year}年（通年）` : `${filters.year}年${filters.month ?? ""}月`;

  const noneSelected = facilityIds !== null && facilityIds.length === 0;

  // ============================================================
  // レイアウト編集（ユーザー個別ウィジェットレイアウト・全員が自分の配置を編集可）
  // ============================================================
  const isMobile = useIsMobile();
  const { status: layoutStatus, saved: savedLayout, save: saveLayout } = useUserWidgetLayout(USER_ID);

  const [editMode, setEditMode] = useState(false);
  const [editUi, setEditUi] = useState<EditMode>("list"); // Mode B(行リスト) 主 / Mode A(グリッド) 補助
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState<LayoutToast | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [live, setLive] = useState("");
  const liveNonce = useRef(0);
  const announce = useCallback((msg: string) => {
    liveNonce.current++;
    // 同一メッセージでも aria-live が再読み上げするよう交互に ZWSP を付与
    setLive(msg + (liveNonce.current % 2 ? "​" : ""));
  }, []);

  const { items: draft, rows: draftRows, hidden: draftHidden, setFromItems, ops } = useRowLayoutDraft(savedLayout, announce);
  const dirty = !tdwLayoutsEqual(draft, savedLayout);

  // 編集中に savedLayout が変わったら（読込完了・保存確定）draft を同期
  useEffect(() => {
    if (editMode) setFromItems(savedLayout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLayout]);

  // toast 自動消去
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.type === "success" ? 2600 : 4200);
    return () => clearTimeout(t);
  }, [toast]);

  // 未保存離脱ガード（ブラウザ離脱 + アプリ内 SPA 遷移）
  // screens-top.jsx の window.__tdwConfirmLeave 相当。App Router では <Link>=<a> の
  // クリックを capture フェーズで捕捉し、確定前に確認する。
  useEffect(() => {
    const block = editMode && dirty;
    const confirmLeave = () =>
      window.confirm("未保存の変更があります。このページを離れると並び替えは保存されません。移動しますか？");
    const w = window as unknown as { __tdwConfirmLeave: (() => boolean) | null };
    w.__tdwConfirmLeave = block ? confirmLeave : null;

    const onBefore = (e: BeforeUnloadEvent) => {
      if (block) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!block) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target && a.target !== "" && a.target !== "_self") return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let dest: URL;
      try {
        dest = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (dest.origin !== window.location.origin) return; // 外部リンクは beforeunload が担当
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return;
      if (!confirmLeave()) {
        e.preventDefault();
        e.stopPropagation();
        (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      }
    };

    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBefore);
      document.removeEventListener("click", onClickCapture, true);
      w.__tdwConfirmLeave = null;
    };
  }, [editMode, dirty]);

  const enterEdit = () => {
    setFromItems(savedLayout);
    setSaveError(false);
    setEditUi("list");
    setEditMode(true);
    announce("レイアウト編集モードを開始しました。6マスの行ごとに、ドラッグ・キーボード・移動メニューで並び替えできます。");
  };
  const doSave = () => {
    setSaving(true);
    setSaveError(false);
    announce("レイアウトを保存しています。");
    saveLayout(draft)
      .then(() => {
        setSaving(false);
        setEditMode(false);
        setToast({ type: "success", msg: "レイアウトを保存しました" });
        announce("レイアウトを保存しました。編集モードを終了しました。");
      })
      .catch(() => {
        setSaving(false);
        setSaveError(true);
        setToast({ type: "error", msg: "保存に失敗しました。もう一度お試しください" });
        announce("保存に失敗しました。並び替え内容は保持しています。");
      });
  };
  const doCancel = () => {
    if (dirty && !window.confirm("未保存の変更があります。編集を破棄してよろしいですか？")) return;
    setFromItems(savedLayout);
    setEditMode(false);
    setSaveError(false);
    announce("編集をキャンセルしました。");
  };
  const confirmReset = () => {
    ops.resetDefault();
    setResetOpen(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <TdwStyles />

      {editMode && !isMobile ? (
        /* ---------- レイアウト編集キャンバス（デスクトップ） ----------
           entrance は opacity のみの .tdw-anim-fade を使う。共有の .fade-in は
           translateY を伴い、animation fill-mode: both で終了後も transform（恒等
           行列）が残るため、子孫の position:fixed（ドラッグ clone/caret・移動
           メニュー・固定ツールバー）の containing block を作ってしまい、カーソルと
           ずれる。opacity アニメは containing block を作らない。 */
        <div className="tdw-anim-fade" style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 112 }}>
          <WidgetEditorHeader userLabel={USER_LABEL} mode={editUi} setMode={setEditUi} />
          {layoutStatus === "loading" ? (
            <WidgetEditorSkeleton />
          ) : (
            <RowAwareWidgetEditor rows={draftRows} hidden={draftHidden} ops={ops} announce={announce} mode={editUi} />
          )}
          <WidgetEditToolbar
            dirty={dirty}
            saving={saving}
            saveError={saveError}
            onSave={doSave}
            onCancel={doCancel}
            onReset={() => setResetOpen(true)}
          />
        </div>
      ) : (
        <>
          {/* header */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.01em" }}>ダッシュボード</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-2)" }}>
                施設を選んで、施設ごと または 全施設合算で主要 KPI を確認できます。
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {isValidating && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}>
                  <Spinner size={14} />
                  更新中
                </span>
              )}
              {layoutStatus === "loading" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}>
                  <Icon name="Loader" size={13} />
                  レイアウト読込中…
                </span>
              )}
              <WidgetLayoutEditButton onClick={enterEdit} />
              <Segmented<Mode>
                value={mode}
                onChange={setMode}
                options={[
                  { value: "perFacility", label: "施設別" },
                  { value: "total", label: "全施設合算" },
                ]}
              />
            </div>
          </div>

          {/* 施設マルチセレクト */}
          <FacilityPanel value={selectedIds} onChange={setFacilityIds} />

          {/* 概要バッジ行 */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", color: "var(--text-2)", fontSize: 12.5 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
              <Icon name={mode === "total" ? "LayoutGrid" : "Building2"} size={16} style={{ color: "var(--text-2)" }} />
              {mode === "total" ? "全施設合算で表示" : "施設ごとに表示"}
            </span>
            <span style={{ color: "var(--text-3)" }}>·</span>
            <span>{periodLabel}</span>
            <Badge tone="neutral">{filters.period === "yearly" ? "年間" : "月間"}</Badge>
            <Badge tone="neutral">{taxLabel}</Badge>
          </div>

          {/* content */}
          {noneSelected ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 14px",
                borderRadius: "var(--r-md)",
                background: "var(--primary-weak)",
                border: "1px solid var(--border)",
                color: "var(--primary-ink)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Icon name="Building2" size={16} />
              上の「施設」一覧から 1つ以上の施設を選んでください。
            </div>
          ) : error ? (
            <EmptyState
              icon="TriangleAlert"
              title="データの取得に失敗しました"
              body="時間をおいて再読み込みしてください。"
              action={
                <Btn variant="default" icon="RotateCw" onClick={() => mutate()}>
                  再読み込み
                </Btn>
              }
            />
          ) : !data && isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <LoadingSkeleton rows={2} height={40} />
              <div className="tdw-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="tdw-2">
                    <div
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r-lg)",
                        boxShadow: "var(--shadow-card)",
                        padding: 16,
                      }}
                    >
                      <LoadingSkeleton rows={4} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !data ? null : data.perFacility.length === 0 ? (
            <EmptyState icon="Inbox" title="表示できるデータがありません" body="選択施設・期間に実績がありません。" />
          ) : mode === "total" ? (
            <FacilityBoard
              facility={null}
              totals={data.totals}
              heat={data.heatmap}
              nationalities={data.nationalities}
              domesticOverseas={data.domesticOverseas}
              channels={data.channels}
              stayNights={data.stayNights}
              budget={data.budget}
              period={filters.period}
              year={filters.year}
              month={filters.month}
              taxLabel={taxLabel}
              title="全施設合算"
              subtitle={`${data.scope.facilityCount}施設`}
              layout={savedLayout}
              isMobile={isMobile}
            />
          ) : (
            <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 30 }}>
                {data.perFacility.map((f, idx) => (
                  <div key={f.facilityId} id={`facility-${f.facilityId}`} style={{ scrollMarginTop: 120 }}>
                    <FacilityBoard
                      facility={f}
                      heat={data.heatmap}
                      nationalities={data.nationalities}
                      domesticOverseas={data.domesticOverseas}
                      channels={data.channels}
                      stayNights={data.stayNights}
                      budget={data.budget}
                      period={filters.period}
                      year={filters.year}
                      month={filters.month}
                      taxLabel={taxLabel}
                      index={idx}
                      layout={savedLayout}
                      isMobile={isMobile}
                    />
                  </div>
                ))}
              </div>
              {data.perFacility.length >= 2 && (
                <FacilityNav
                  facilities={data.perFacility.map((f) => ({ id: f.facilityId, name: f.name, area: f.area }))}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* モバイル: bottom sheet 編集（ダッシュボードの上に重ねる） */}
      {editMode && isMobile && (
        <MobileWidgetLayoutEditor
          items={draft}
          onChangeItems={setFromItems}
          canHideFn={(id) => ops.canHide(id)}
          announce={announce}
          dirty={dirty}
          saving={saving}
          saveError={saveError}
          onSave={doSave}
          onCancel={doCancel}
          onReset={() => setResetOpen(true)}
          userLabel={USER_LABEL}
        />
      )}

      <WidgetLayoutResetDialog open={resetOpen} onConfirm={confirmReset} onCancel={() => setResetOpen(false)} />
      <WidgetLayoutSaveToast toast={toast} />
      <div
        aria-live="polite"
        role="status"
        style={{ position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}
      >
        {live}
      </div>
    </div>
  );
}
