"use client";

/* ============================================================
   metric-tabs.tsx — 汎用の指標マルチセレクタ（docs/.../ui.jsx useMultiMetric 準拠）。
   単一クリック=単一選択 / Ctrl・⌘+クリック=トグル追加 / すべて表示=全選択⇔先頭。
   国籍別・部屋タイプ別・全施設年間売上 など複数画面で共有。
   ============================================================ */

import { useCallback, useState, type MouseEvent } from "react";
import { Icon } from "@/components/ui/icon";

export interface MetricTabItem<Id extends string> {
  id: Id;
  label: string;
}

export interface MetricTabsState<Id extends string> {
  sel: Id[];
  allOn: boolean;
  isOn: (id: Id) => boolean;
  pick: (id: Id, e: MouseEvent) => void;
  setAll: () => void;
}

export function useMetricTabs<Id extends string>(allIds: Id[], defaultIds: Id[]): MetricTabsState<Id> {
  const [sel, setSel] = useState<Id[]>(defaultIds);
  const allOn = sel.length === allIds.length;
  const isOn = useCallback((id: Id) => sel.includes(id), [sel]);
  const pick = useCallback(
    (id: Id, e: MouseEvent) => {
      const additive = e.ctrlKey || e.metaKey;
      setSel((cur) => {
        if (!additive) return [id];
        if (cur.includes(id)) {
          const next = cur.filter((x) => x !== id);
          return next.length ? next : [id]; // never empty
        }
        return allIds.filter((x) => cur.includes(x) || x === id); // keep catalogue order
      });
    },
    [allIds],
  );
  const setAll = useCallback(
    () => setSel((cur) => (cur.length === allIds.length ? [allIds[0]] : [...allIds])),
    [allIds],
  );
  return { sel, allOn, isOn, pick, setAll };
}

export function MetricTabs<Id extends string>({
  metrics,
  state,
  accent = "37,111,219",
}: {
  metrics: MetricTabItem<Id>[];
  state: MetricTabsState<Id>;
  /** rgb triple for the active-tab accent. */
  accent?: string;
}) {
  const { allOn, isOn, pick, setAll } = state;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0, alignItems: "center" }}>
      {metrics.map((m) => {
        const on = isOn(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={(e) => pick(m.id, e)}
            title="Ctrl/⌘+クリックで複数選択"
            style={{
              height: 32,
              padding: "0 15px",
              borderRadius: "var(--r-md)",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
              border: "1px solid " + (on ? `rgba(${accent},0.5)` : "var(--border)"),
              background: on ? `rgba(${accent},0.1)` : "var(--surface)",
              color: on ? "var(--primary-ink)" : "var(--text-2)",
            }}
          >
            {m.label}
          </button>
        );
      })}
      <span style={{ width: 1, height: 20, background: "var(--border-strong)", margin: "0 4px" }} />
      <button
        type="button"
        onClick={setAll}
        style={{
          height: 32,
          padding: "0 16px",
          borderRadius: "var(--r-md)",
          cursor: "pointer",
          fontSize: 12.5,
          fontWeight: 700,
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "1px solid " + (allOn ? "var(--primary)" : `rgba(${accent},0.4)`),
          background: allOn ? "var(--primary)" : "var(--surface)",
          color: allOn ? "#fff" : "var(--primary-ink)",
        }}
      >
        <Icon name="Rows3" size={14} />
        すべて表示
      </button>
      <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4, whiteSpace: "nowrap" }}>
        Ctrl/⌘+クリックで複数選択
      </span>
    </div>
  );
}
