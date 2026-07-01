"use client";

/* ============================================================
   facility-nav.tsx — 施設別モードの右レール「施設ナビ」。
   screens-top.jsx FacilityScrollNav 準拠: エリア別グルーピング＋
   スクロール追従（表示中の施設セクションをハイライト）＋クリックで該当施設へスクロール。
   セクション側は id="facility-<id>" を付与しておく（page 側）。
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";

export interface FacilityNavItem {
  id: string;
  name: string;
  area: string;
}

export function FacilityNav({ facilities }: { facilities: FacilityNavItem[] }) {
  const [active, setActive] = useState<string | null>(facilities[0]?.id ?? null);

  // エリア別グルーピング（display_order 昇順で並んでいる前提。初出順を維持）。
  const groups = useMemo(() => {
    const order: string[] = [];
    const byArea = new Map<string, FacilityNavItem[]>();
    for (const f of facilities) {
      const key = f.area || "その他";
      if (!byArea.has(key)) { byArea.set(key, []); order.push(key); }
      byArea.get(key)!.push(f);
    }
    return order.map((area) => ({ area, items: byArea.get(area)! }));
  }, [facilities]);

  // スクロール追従（表示中セクションを active に）。
  useEffect(() => {
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.facId;
          if (id) visible.set(id, e.isIntersecting);
        }
        const first = facilities.find((f) => visible.get(f.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-120px 0px -62% 0px", threshold: 0 },
    );
    for (const f of facilities) {
      const el = document.getElementById(`facility-${f.id}`);
      if (el) {
        el.dataset.facId = f.id;
        io.observe(el);
      }
    }
    return () => io.disconnect();
  }, [facilities]);

  const go = (id: string) => {
    document.getElementById(`facility-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  return (
    <aside
      style={{
        position: "sticky",
        top: 120,
        alignSelf: "flex-start",
        width: 214,
        flexShrink: 0,
        maxHeight: "calc(100dvh - 140px)",
        overflowY: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700 }}>
          <Icon name="Building2" size={15} style={{ color: "var(--text-2)" }} />
          施設ナビ
        </span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{facilities.length}施設</span>
      </div>

      <div style={{ padding: "8px 8px 10px" }}>
        {groups.map((g) => (
          <div key={g.area} style={{ marginBottom: 6 }}>
            <div
              style={{
                padding: "6px 8px 4px",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".04em",
                color: "var(--text-3)",
              }}
            >
              {g.area} · {g.items.length}
            </div>
            {g.items.map((f) => {
              const on = active === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => go(f.id)}
                  title={f.name}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                    padding: "7px 9px",
                    marginBottom: 2,
                    border: "none",
                    borderRadius: "var(--r-md)",
                    cursor: "pointer",
                    textAlign: "left",
                    background: on ? "var(--primary-weak)" : "transparent",
                    color: on ? "var(--primary-ink)" : "var(--text-2)",
                    fontSize: 12.5,
                    fontWeight: on ? 700 : 500,
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "var(--surface-3)"; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
                >
                  <span
                    style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {f.name}
                  </span>
                  {on && <Icon name="ChevronRight" size={14} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
