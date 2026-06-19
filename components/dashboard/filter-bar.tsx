"use client";

/* ============================================================
   filter-bar.tsx — global dashboard filter controls.
   Reads/writes via useFilters(); facility list from /api/facilities.
   Ported from docs/.../shell.jsx + appshell.jsx (HeaderFilterBar).
   ============================================================ */

import useSWR from "swr";
import type { CompareWith, Period, TaxMode } from "@/lib/api/types";
import { useFilters } from "@/lib/dashboard/use-filters";
import type { FacilityOption } from "@/app/api/facilities/route";
import { Segmented } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Dropdown, FilterButton, MenuItem } from "./dropdown";

const facFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<FacilityOption[]>);

/* ---------- Facility selector (consumes /api/facilities) ---------- */
export function FacilitySelector() {
  const { filters, setFilters } = useFilters();
  const { data: facilities } = useSWR<FacilityOption[]>("/api/facilities", facFetcher, {
    revalidateOnFocus: false,
  });

  const current =
    filters.facilityId === "all"
      ? "全施設"
      : facilities?.find((f) => f.id === filters.facilityId)?.displayName ?? "施設を選択";

  const byArea = new Map<string, FacilityOption[]>();
  (facilities ?? []).forEach((f) => {
    const k = f.areaName || "その他";
    if (!byArea.has(k)) byArea.set(k, []);
    byArea.get(k)!.push(f);
  });

  return (
    <Dropdown
      width={280}
      trigger={(open, t) => (
        <FilterButton icon="Building2" value={current} open={open} onClick={t} />
      )}
    >
      {(close) => (
        <div style={{ maxHeight: 380, overflowY: "auto", padding: 6 }}>
          <MenuItem
            active={filters.facilityId === "all"}
            icon="LayoutGrid"
            onClick={() => {
              setFilters({ facilityId: "all" });
              close();
            }}
          >
            全施設
          </MenuItem>
          {[...byArea.entries()].map(([area, list]) => (
            <div key={area}>
              <div
                style={{
                  padding: "8px 12px 4px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-3)",
                  letterSpacing: ".04em",
                }}
              >
                {area}
              </div>
              {list.map((f) => (
                <MenuItem
                  key={f.id}
                  active={filters.facilityId === f.id}
                  onClick={() => {
                    setFilters({ facilityId: f.id });
                    close();
                  }}
                >
                  {f.displayName}
                </MenuItem>
              ))}
            </div>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

/* ---------- Year / month selector ---------- */
const MONTHS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];
export function PeriodSelector() {
  const { filters, setFilters } = useFilters();
  const label =
    filters.period === "monthly" && filters.month
      ? `${filters.year}年${filters.month}月`
      : `${filters.year}年`;
  return (
    <Dropdown
      width={240}
      trigger={(open, t) => (
        <FilterButton icon="Calendar" value={label} open={open} onClick={t} />
      )}
    >
      {(close) => (
        <div style={{ padding: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <button
              onClick={() => setFilters({ year: filters.year - 1 })}
              style={navBtn}
            >
              <Icon name="ChevronLeft" size={15} />
            </button>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{filters.year}年</span>
            <button
              onClick={() => setFilters({ year: filters.year + 1 })}
              style={navBtn}
            >
              <Icon name="ChevronRight" size={15} />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {MONTHS.map((m, i) => {
              const active = filters.month === i + 1;
              return (
                <button
                  key={m}
                  onClick={() => {
                    setFilters({ month: i + 1, period: "monthly" });
                    close();
                  }}
                  style={{
                    padding: "8px 0",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "1px solid " + (active ? "var(--primary)" : "var(--border)"),
                    background: active ? "var(--primary)" : "var(--surface)",
                    color: active ? "#fff" : "var(--text)",
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
const navBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  borderRadius: 6,
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
};

/* ---------- Period (monthly/yearly) toggle ---------- */
export function PeriodToggle() {
  const { filters, setFilters } = useFilters();
  return (
    <Segmented<Period>
      size="sm"
      value={filters.period}
      onChange={(v) =>
        setFilters({
          period: v,
          // monthly requires a month; default to current/first month
          month: v === "monthly" ? filters.month ?? 1 : filters.month,
        })
      }
      options={[
        { value: "monthly", label: "月間" },
        { value: "yearly", label: "年間" },
      ]}
    />
  );
}

/* ---------- Tax toggle ---------- */
export function TaxToggle() {
  const { filters, setFilters } = useFilters();
  return (
    <Segmented<TaxMode>
      size="sm"
      value={filters.taxMode}
      onChange={(v) => setFilters({ taxMode: v })}
      options={[
        { value: "gross", label: "税込" },
        { value: "net", label: "税抜" },
      ]}
    />
  );
}

/* ---------- Comparison selector ---------- */
const COMPARISONS: { id: CompareWith | "none"; label: string; icon: import("@/components/ui/icon").IconName }[] = [
  { id: "none", label: "なし", icon: "Minus" },
  { id: "previous_year", label: "前年実績", icon: "CalendarClock" },
  { id: "budget", label: "予算", icon: "Target" },
  { id: "previous_snapshot", label: "前回取込", icon: "History" },
];
export function ComparisonSelector() {
  const { filters, setFilters } = useFilters();
  const cur = COMPARISONS.find((c) => c.id === (filters.compareWith ?? "none")) ?? COMPARISONS[0];
  return (
    <Dropdown
      width={224}
      trigger={(open, t) => (
        <FilterButton label="比較:" value={cur.label} open={open} onClick={t} />
      )}
    >
      {(close) => (
        <div style={{ padding: 6 }}>
          {COMPARISONS.map((c) => (
            <MenuItem
              key={c.id}
              active={(filters.compareWith ?? "none") === c.id}
              icon={c.icon}
              onClick={() => {
                setFilters({ compareWith: c.id === "none" ? undefined : (c.id as CompareWith) });
                close();
              }}
            >
              {c.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

/* ---------- The full filter bar (used in the shell) ---------- */
export function FilterBar() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 18px",
        height: "var(--filterbar-h)",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        flexWrap: "nowrap",
        overflowX: "auto",
      }}
    >
      <FacilitySelector />
      <PeriodSelector />
      <PeriodToggle />
      <span style={{ width: 1, height: 22, background: "var(--border)", flexShrink: 0 }} />
      <TaxToggle />
      <ComparisonSelector />
      <div style={{ flex: 1 }} />
    </div>
  );
}
