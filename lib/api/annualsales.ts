import type { Pool } from "pg";
import type {
  AnnualCell,
  AnnualMatrix,
  AnnualMonthRow,
  AnnualSalesResponse,
  AnnualSalesRow,
  AnnualSalesSummary,
  DashboardFilters,
} from "./types";

/* ============================================================
   全施設年間売上 — 既存Excel忠実再現。
   matrix: 12ヶ月(行) × 施設(列) クロスタブ。列は display_order を持つ
   現行レポート施設の固定セット（売上が無くても 0 で常時表示）。
   actual = mart.daily_facility_metrics / budget = app.budgets（共に施設×月）。
   ============================================================ */

interface Acc {
  actual: number;
  budgetSum: number;
  budgetN: number;
}
const newAcc = (): Acc => ({ actual: 0, budgetSum: 0, budgetN: 0 });
function accAdd(acc: Acc, actual: number, budget: number | null): void {
  acc.actual += actual;
  if (budget != null) {
    acc.budgetSum += budget;
    acc.budgetN += 1;
  }
}
const accCell = (acc: Acc): AnnualCell => ({
  actual: acc.actual,
  budget: acc.budgetN > 0 ? acc.budgetSum : null,
});

async function annualMatrix(pool: Pool, f: DashboardFilters): Promise<AnnualMatrix> {
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const y = f.year;

  // 列 = 現行レポート施設（display_order 昇順・エリアグループ）
  const fac = await pool.query<{ id: string; display_name: string; area: string }>(
    `select id, display_name, coalesce(area_name,'') area
       from app.facilities where display_order is not null
      order by display_order, display_name`,
  );
  const facilities = fac.rows.map((r) => ({ id: r.id, name: r.display_name, area: r.area }));
  const facIds = new Set(facilities.map((x) => x.id));

  // actual: 施設×月
  const act = await pool.query<{ facility_id: string; mon: number; actual: number }>(
    `select facility_id, extract(month from stay_date)::int mon, coalesce(sum(${revCol}),0)::float8 actual
       from mart.daily_facility_metrics
      where stay_date between $1 and $2
      group by facility_id, mon`,
    [`${y}-01-01`, `${y}-12-31`],
  );
  // budget: 施設×月（app.budgets.month は月初日・budget_amount は税込）
  const bud = await pool.query<{ facility_id: string; mon: number; budget: number }>(
    `select facility_id, extract(month from month)::int mon, coalesce(sum(budget_amount),0)::float8 budget
       from app.budgets
      where month between $1 and $2
      group by facility_id, mon`,
    [`${y}-01-01`, `${y}-12-01`],
  );

  const actMap = new Map<string, number>();
  for (const r of act.rows) if (facIds.has(r.facility_id)) actMap.set(`${r.facility_id}|${r.mon}`, Number(r.actual));
  const budMap = new Map<string, number>();
  for (const r of bud.rows) if (facIds.has(r.facility_id)) budMap.set(`${r.facility_id}|${r.mon}`, Number(r.budget));

  const facilityAcc = new Map<string, Acc>();
  for (const fc of facilities) facilityAcc.set(fc.id, newAcc());
  const grandAcc = newAcc();

  const rows: AnnualMonthRow[] = [];
  for (let mon = 1; mon <= 12; mon++) {
    const cells: Record<string, AnnualCell> = {};
    const monthAcc = newAcc();
    for (const fc of facilities) {
      const a = actMap.get(`${fc.id}|${mon}`) ?? 0;
      const b = budMap.get(`${fc.id}|${mon}`) ?? null;
      cells[fc.id] = { actual: a, budget: b };
      accAdd(monthAcc, a, b);
      accAdd(facilityAcc.get(fc.id)!, a, b);
      accAdd(grandAcc, a, b);
    }
    rows.push({ month: mon, cells, total: accCell(monthAcc) });
  }

  const facilityTotals: Record<string, AnnualCell> = {};
  for (const fc of facilities) facilityTotals[fc.id] = accCell(facilityAcc.get(fc.id)!);

  return { year: y, facilities, rows, facilityTotals, grand: accCell(grandAcc) };
}

// GET /api/dashboard/annual-sales — 全施設年間売上（前年比・予算達成率）
export async function buildAnnualSales(pool: Pool, f: DashboardFilters): Promise<AnnualSalesResponse> {
  const revCol = f.taxMode === "net" ? "net_amount" : "gross_amount";
  const y = f.year;

  // flat rows + summary（契約維持。前年比/予算達成率は施設単位）
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

  const matrix = await annualMatrix(pool, f);
  return { filters: f, summary, rows, matrix, generatedAt: new Date().toISOString() };
}
