"use client";

/* ============================================================
   facility-panel.tsx — エリア別グルーピングの施設マルチセレクト。
   screens-top.jsx AreaFacilityChips 準拠。
   検索 / 全選択・全解除 / エリア小計（例: 北部 5/6）/ チェック付きチップ。
   value(選択ID配列) と onChange で制御。母集合は /api/facilities。
   ============================================================ */

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Icon } from "@/components/ui/icon";
import type { FacilityOption } from "@/app/api/facilities/route";

const facFetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<FacilityOption[]>);

interface AreaGroup {
  area: string;
  facilities: FacilityOption[];
}

function groupByArea(list: FacilityOption[]): AreaGroup[] {
  const order: string[] = [];
  const map = new Map<string, FacilityOption[]>();
  for (const f of list) {
    const k = f.areaName || "その他";
    if (!map.has(k)) {
      map.set(k, []);
      order.push(k);
    }
    map.get(k)!.push(f);
  }
  return order.map((area) => ({ area, facilities: map.get(area)! }));
}

export interface FacilityPanelProps {
  value: string[];
  onChange: (ids: string[]) => void;
}

export function FacilityPanel({ value, onChange }: FacilityPanelProps) {
  const { data: facilities } = useSWR<FacilityOption[]>("/api/facilities", facFetcher, {
    revalidateOnFocus: false,
  });
  const [q, setQ] = useState("");

  const list = facilities ?? [];
  const sel = useMemo(() => new Set(value), [value]);
  const allIds = useMemo(() => (facilities ?? []).map((f) => f.id), [facilities]);

  const query = q.trim();
  const visible = query ? list.filter((f) => f.displayName.includes(query)) : list;
  const groups = groupByArea(visible);

  const setSel = (next: Set<string>) => onChange(allIds.filter((id) => next.has(id)));
  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  };
  const toggleArea = (areaFacs: FacilityOption[]) => {
    const ids = areaFacs.map((f) => f.id);
    const allOn = ids.every((id) => sel.has(id));
    const n = new Set(sel);
    if (allOn) ids.forEach((id) => n.delete(id));
    else ids.forEach((id) => n.add(id));
    setSel(n);
  };

  const selectedCount = value.filter((id) => allIds.includes(id)).length;

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>
          <Icon name="Building2" size={16} style={{ color: "var(--text-2)" }} />
          施設
          <span className="tabular" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>
            {selectedCount}/{list.length}
          </span>
        </span>
        <span style={{ flex: 1 }} />
        {/* search */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 32,
            padding: "0 10px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            minWidth: 180,
          }}
        >
          <Icon name="Search" size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="施設名で絞り込み"
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              color: "var(--text)",
              width: "100%",
            }}
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="クリア"
              style={{ border: "none", background: "none", padding: 0, color: "var(--text-3)", display: "grid" }}
            >
              <Icon name="X" size={14} />
            </button>
          )}
        </div>
        <button onClick={() => onChange(allIds)} style={miniBtn}>
          全選択
        </button>
        <button onClick={() => onChange([])} style={miniBtn}>
          全解除
        </button>
      </div>

      {/* body */}
      <div style={{ padding: 14, maxHeight: 340, overflowY: "auto" }}>
        {list.length === 0 ? (
          <div style={{ padding: "20px 8px", fontSize: 12.5, color: "var(--text-3)" }}>施設を読み込み中…</div>
        ) : groups.length === 0 ? (
          <div style={{ padding: "20px 8px", fontSize: 12.5, color: "var(--text-3)" }}>
            「{query}」に一致する施設がありません
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {groups.map((g) => {
              const areaSelected = g.facilities.filter((f) => sel.has(f.id)).length;
              const allOn = areaSelected === g.facilities.length;
              return (
                <div key={g.area}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <button
                      onClick={() => toggleArea(g.facilities)}
                      title={allOn ? "エリアを全解除" : "エリアを全選択"}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        border: "none",
                        background: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      <span style={checkBox(allOn, areaSelected > 0 && !allOn)}>
                        {allOn ? (
                          <Icon name="Check" size={12} style={{ color: "#fff" }} />
                        ) : areaSelected > 0 ? (
                          <Icon name="Minus" size={12} style={{ color: "#fff" }} />
                        ) : null}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", letterSpacing: ".03em" }}>
                        {g.area}
                      </span>
                    </button>
                    <span className="tabular" style={{ fontSize: 11.5, color: "var(--text-3)", fontWeight: 600 }}>
                      {areaSelected}/{g.facilities.length}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {g.facilities.map((f) => {
                      const on = sel.has(f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => toggle(f.id)}
                          aria-pressed={on}
                          title={f.displayName}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            height: 32,
                            padding: "0 12px 0 10px",
                            borderRadius: 999,
                            cursor: "pointer",
                            fontSize: 12.5,
                            fontWeight: on ? 700 : 500,
                            border: "1px solid " + (on ? "var(--primary)" : "var(--border)"),
                            background: on ? "var(--primary-weak)" : "var(--surface)",
                            color: on ? "var(--primary-ink)" : "var(--text-2)",
                            maxWidth: 240,
                          }}
                        >
                          <span style={checkBox(on, false)}>
                            {on && <Icon name="Check" size={12} style={{ color: "#fff" }} />}
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.displayName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

const miniBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-2)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

function checkBox(on: boolean, partial: boolean): React.CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: 4,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    border: "1.5px solid " + (on || partial ? "var(--primary)" : "var(--border-strong)"),
    background: on || partial ? "var(--primary)" : "transparent",
  };
}
