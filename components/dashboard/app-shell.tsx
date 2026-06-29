"use client";

/* ============================================================
   app-shell.tsx — sidebar + sticky topbar + filter bar wrapper.
   Ported from docs/.../appshell.jsx (AppShell).
   ============================================================ */

import { type ReactNode, Suspense, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Sidebar, NAV } from "./sidebar";
import { FilterBar } from "./filter-bar";
import { UserMenu } from "./user-menu";

function currentTitle(pathname: string): string {
  for (const g of NAV) {
    const hit = g.items.find((it) =>
      it.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(it.href),
    );
    if (hit) return hit.label;
  }
  return "ダッシュボード";
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const title = currentTitle(pathname);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <Sidebar collapsed={collapsed} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* header */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            height: "var(--header-h)",
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 16px",
          }}
        >
          <button
            onClick={() => setCollapsed((c) => !c)}
            title="ナビを折りたたむ"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              borderRadius: "var(--r-md)",
              width: 32,
              height: 32,
              display: "grid",
              placeItems: "center",
              color: "var(--text-2)",
            }}
          >
            <Icon name={collapsed ? "PanelLeftOpen" : "PanelLeftClose"} size={17} />
          </button>
          <h1
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </h1>
          <div style={{ flex: 1 }} />
          <UserMenu />
        </header>

        {/* filter bar (needs searchParams -> Suspense) */}
        <div style={{ position: "sticky", top: "var(--header-h)", zIndex: 39 }}>
          <Suspense
            fallback={
              <div
                style={{
                  height: "var(--filterbar-h)",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
            }
          >
            <FilterBar />
          </Suspense>
        </div>

        {/* content — pages read filters via useSearchParams(), so the
            page subtree must sit under a Suspense boundary to allow
            static prerender without the CSR bailout build error. */}
        <main
          style={{
            flex: 1,
            padding: "20px 18px",
            width: "100%",
            margin: "0 auto",
          }}
        >
          <Suspense fallback={null}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
