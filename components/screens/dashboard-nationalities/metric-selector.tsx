"use client";

/* ============================================================
   metric-selector.tsx — violet metric tabs + "すべて表示" toggle,
   with the prototype's Ctrl/⌘+click multi-select (useMultiMetric).
   ============================================================ */

import { useCallback, useState, type MouseEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { NAT_METRICS, NAT_VIO, type NatMetricId } from "./metrics";

const ALL_IDS = NAT_METRICS.map((m) => m.id);

export interface UseMultiMetricResult {
  sel: NatMetricId[];
  allOn: boolean;
  isOn: (id: NatMetricId) => boolean;
  pick: (id: NatMetricId, e: MouseEvent) => void;
  setAll: () => void;
}

/** Port of useMultiMetric (docs/.../ui.jsx): single-select by default,
 *  Ctrl/⌘+click toggles into multi-select. */
export function useMultiMetric(defaultIds: NatMetricId[]): UseMultiMetricResult {
  const [sel, setSel] = useState<NatMetricId[]>(defaultIds);
  const allOn = sel.length === ALL_IDS.length;

  const isOn = useCallback((id: NatMetricId) => sel.includes(id), [sel]);

  const pick = useCallback((id: NatMetricId, e: MouseEvent) => {
    const additive = e.ctrlKey || e.metaKey;
    setSel((cur) => {
      if (!additive) return [id];
      const has = cur.includes(id);
      if (has) {
        const next = cur.filter((x) => x !== id);
        return next.length ? next : [id]; // never empty
      }
      // keep metric catalogue order
      return ALL_IDS.filter((x) => cur.includes(x) || x === id);
    });
  }, []);

  const setAll = useCallback(() => {
    setSel((cur) => (cur.length === ALL_IDS.length ? ["rev"] : [...ALL_IDS]));
  }, []);

  return { sel, allOn, isOn, pick, setAll };
}

export interface MetricSelectorProps {
  state: UseMultiMetricResult;
}

export function MetricSelector({ state }: MetricSelectorProps) {
  const { allOn, isOn, pick, setAll } = state;
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        flexShrink: 0,
        alignItems: "center",
      }}
    >
      {NAT_METRICS.map((m) => {
        const on = isOn(m.id);
        return (
          <button
            key={m.id}
            onClick={(e) => pick(m.id, e)}
            title="Ctrl/⌘+クリックで複数選択"
            style={{
              height: 30,
              padding: "0 14px",
              borderRadius: "var(--r-md)",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
              border: "1px solid " + (on ? `rgba(${NAT_VIO},0.5)` : "var(--border)"),
              background: on ? `rgba(${NAT_VIO},0.1)` : "var(--surface)",
              color: on ? "var(--primary-ink)" : "var(--text-2)",
            }}
          >
            {m.label}
          </button>
        );
      })}
      <span
        style={{
          width: 1,
          height: 20,
          background: "var(--border-strong)",
          margin: "0 4px",
        }}
      />
      <button
        onClick={setAll}
        style={{
          height: 30,
          padding: "0 16px",
          borderRadius: "var(--r-md)",
          cursor: "pointer",
          fontSize: 12.5,
          fontWeight: 700,
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "1px solid " + (allOn ? "var(--primary)" : `rgba(${NAT_VIO},0.4)`),
          background: allOn ? "var(--primary)" : "var(--surface)",
          color: allOn ? "#fff" : "var(--primary-ink)",
        }}
      >
        <Icon name="Rows3" size={14} />
        すべて表示
      </button>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          marginLeft: 4,
          whiteSpace: "nowrap",
        }}
      >
        Ctrl/⌘+クリックで複数選択
      </span>
    </div>
  );
}

export { ALL_IDS };
