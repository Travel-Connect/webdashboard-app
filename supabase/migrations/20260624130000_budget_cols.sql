-- ============================================================================
-- 20260624130000_budget_cols.sql
-- 予算の税抜売上・宿泊人数を保持（税込/税抜切替・人数/同伴係数の表示用）。
-- 既存 budget_amount は税込のまま。投入は scripts/db/load-budget.ts。
-- ============================================================================

alter table app.budgets add column if not exists budget_net_amount  numeric not null default 0;  -- 売上予算(税抜)
alter table app.budgets add column if not exists budget_guest_count integer not null default 0;  -- 宿泊人数予算
