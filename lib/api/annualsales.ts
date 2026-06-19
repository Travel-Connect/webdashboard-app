import type { Pool } from "pg";
import type { AnnualSalesResponse, AnnualSalesRow, AnnualSalesSummary, DashboardFilters } from "./types";

// GET /api/dashboard/annual-sales — 全施設年間売上（前年比・予算達成率）
// 予算は税込（売上予算税込）なので 予算達成率は taxMode=gross で正確。
export async function buildAnnualSales(pool: Pool, f: DashboardFilters): Promise<AnnualSalesResponse> {
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const y = f.year;
  const q = await pool.query(
    `with rev as (select facility_id, sum(${revCol})::float8 r from mart.daily_facility_metrics where stay_date between $1 and $2 group by facility_id),
          prev as (select facility_id, sum(${revCol})::float8 r from mart.daily_facility_metrics where stay_date between $3 and $4 group by facility_id),
          bud as (select facility_id, sum(budget_amount)::float8 a from app.budgets where month between $1 and $2 group by facility_id)
     select f.id, f.facility_code, f.display_name, coalesce(f.area_name,'') area_name,
       coalesce(rev.r,0)::float8 revenue, prev.r prev_revenue, bud.a budget
     from app.facilities f
     left join rev on rev.facility_id = f.id
     left join prev on prev.facility_id = f.id
     left join bud on bud.facility_id = f.id
     where rev.r is not null or bud.a is not null
     order by coalesce(rev.r,0) desc`,
    [`${y}-01-01`, `${y}-12-31`, `${y - 1}-01-01`, `${y - 1}-12-31`],
  );
  const rows: AnnualSalesRow[] = q.rows.map((r) => {
    const revenue = Number(r.revenue);
    const row: AnnualSalesRow = {
      facilityId: r.id, facilityCode: r.facility_code, facilityName: r.display_name, areaName: r.area_name, revenue,
    };
    if (r.prev_revenue != null) {
      const prev = Number(r.prev_revenue);
      row.previousYearRevenue = prev;
      row.yoyDiff = revenue - prev;
      row.yoyRate = prev !== 0 ? revenue / prev : null;
    }
    if (r.budget != null) {
      const budget = Number(r.budget);
      row.budgetAmount = budget;
      row.budgetAchievementRate = budget !== 0 ? revenue / budget : null;
    }
    return row;
  });

  const totRev = rows.reduce((s, r) => s + r.revenue, 0);
  const prevRows = rows.filter((r) => r.previousYearRevenue != null);
  const totPrev = prevRows.length ? prevRows.reduce((s, r) => s + (r.previousYearRevenue ?? 0), 0) : null;
  const budRows = rows.filter((r) => r.budgetAmount != null);
  const totBud = budRows.length ? budRows.reduce((s, r) => s + (r.budgetAmount ?? 0), 0) : null;
  const summary: AnnualSalesSummary = {
    totalRevenue: totRev,
    totalPreviousYearRevenue: totPrev,
    yoyRate: totPrev && totPrev !== 0 ? totRev / totPrev : null,
    totalBudget: totBud,
    budgetAchievementRate: totBud && totBud !== 0 ? totRev / totBud : null,
    facilityCount: rows.length,
  };
  return { filters: f, summary, rows, generatedAt: new Date().toISOString() };
}
