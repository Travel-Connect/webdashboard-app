/* ============================================================
   app/dashboard/page.tsx — 総合ダッシュボード (overview).

   一時的に「準備中」プレースホルダへ差し替え中。
   元の指標サマリー実装（occupancy + channels + annual-sales 集約）は
   git 履歴に残してあるので、再開時は revert で戻せる。
   他の分析画面（/dashboard/occupancy 等）は通常どおり稼働。
   ============================================================ */

import { Icon } from "@/components/ui/icon";

export const metadata = {
  title: "ダッシュボード（準備中）",
};

export default function DashboardOverviewPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        minHeight: "calc(100vh - var(--header-h) - var(--filterbar-h) - 80px)",
        padding: "40px 18px",
        gap: 18,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: "var(--primary-weak)",
          color: "var(--primary)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Icon name="LayoutDashboard" size={34} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 460 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-.01em",
          }}
        >
          ダッシュボードは準備中です
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--text-2)",
          }}
        >
          総合ダッシュボード（指標サマリー）は現在準備中です。
          左メニューの各分析画面（稼働分析・経路分析・国籍別分析・泊数分布・
          部屋タイプ別分析・全施設年間売上・ブッキングカーブ）はご利用いただけます。
        </p>
      </div>

      <a
        href="/dashboard/occupancy"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginTop: 6,
          padding: "9px 16px",
          borderRadius: "var(--r-md)",
          background: "var(--primary)",
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <Icon name="Percent" size={16} />
        稼働分析を開く
      </a>
    </div>
  );
}
