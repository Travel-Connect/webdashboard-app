/* ============================================================
   app/dashboard/loading.tsx — App Router のルートセグメント loading。
   /dashboard 配下のページ遷移中に自動表示される画面骨格スケルトン。
   サイドバー切替（ルート遷移）時の無反応を解消するための共通フォールバック。
   ============================================================ */

import { Panel, LoadingSkeleton } from "@/components/ui/primitives";

export default function DashboardLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* title row skeleton */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="skel" style={{ height: 22, width: 180, borderRadius: 6 }} />
          <div className="skel" style={{ height: 14, width: 260, borderRadius: 6 }} />
        </div>
        <div className="skel" style={{ height: 32, width: 120, borderRadius: 6 }} />
      </div>

      {/* KPI strip skeleton */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              boxShadow: "var(--shadow-card)",
              padding: 16,
            }}
          >
            <LoadingSkeleton rows={2} />
          </div>
        ))}
      </div>

      {/* body skeleton */}
      <Panel title="読み込み中…">
        <LoadingSkeleton rows={8} />
      </Panel>
    </div>
  );
}
