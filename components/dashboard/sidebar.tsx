"use client";

/* ============================================================
   sidebar.tsx — app sidebar nav. Ported from docs/.../shell.jsx (SidebarNav).
   Links to the 8 dashboard routes; active = current pathname.
   ============================================================ */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}
export interface NavGroup {
  section: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    section: "分析",
    items: [
      { href: "/dashboard", label: "ダッシュボード", icon: "LayoutDashboard" },
      { href: "/dashboard/occupancy", label: "稼働分析", icon: "Percent" },
      { href: "/dashboard/channels", label: "経路分析", icon: "Route" },
      { href: "/dashboard/nationalities", label: "国籍別分析", icon: "Globe" },
      { href: "/dashboard/stay-nights", label: "泊数分布", icon: "MoonStar" },
      { href: "/dashboard/room-types", label: "部屋タイプ別分析", icon: "BedDouble" },
      { href: "/dashboard/annual-sales", label: "全施設年間売上", icon: "Building2" },
      { href: "/dashboard/booking-curve", label: "ブッキングカーブ", icon: "TrendingUp" },
    ],
  },
];

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <aside
      style={{
        width: collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)",
        flexShrink: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        left: 0,
        height: "100vh",
        transition: "width .16s",
      }}
    >
      <div
        style={{
          height: "var(--header-h)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "var(--text)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: "-.03em",
          }}
        >
          島
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap" }}>
              宿泊BI レポート
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", whiteSpace: "nowrap" }}>
              Stay Analytics
            </div>
          </div>
        )}
      </div>
      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
        {NAV.map((g) => (
          <div key={g.section} style={{ marginBottom: 14 }}>
            {!collapsed && (
              <div
                style={{
                  padding: "4px 10px",
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "var(--text-3)",
                  letterSpacing: ".06em",
                }}
              >
                {g.section}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {g.items.map((it) => {
                const active = isActive(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    title={collapsed ? it.label : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: collapsed ? "9px 0" : "9px 10px",
                      justifyContent: collapsed ? "center" : "flex-start",
                      borderRadius: "var(--r-md)",
                      textDecoration: "none",
                      width: "100%",
                      background: active ? "var(--primary-weak)" : "transparent",
                      color: active ? "var(--primary-ink)" : "var(--text)",
                      fontSize: 13.5,
                      fontWeight: active ? 600 : 500,
                      position: "relative",
                    }}
                  >
                    {active && (
                      <i
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 7,
                          bottom: 7,
                          width: 3,
                          borderRadius: 3,
                          background: "var(--primary)",
                        }}
                      />
                    )}
                    <Icon
                      name={it.icon}
                      size={17}
                      style={{ color: active ? "var(--primary)" : "var(--text-2)", flexShrink: 0 }}
                    />
                    {!collapsed && (
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {it.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
