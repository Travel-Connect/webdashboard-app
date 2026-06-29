-- ============================================================================
-- 20260624140000_staynights_weighted.sql
-- 泊数分布の ADR / 同伴係数 を Excel 泊数分布(NEW) の SUMPRODUCT 式に一致させるため、
-- 「予約単位セル丸め値の加重和」を保持する列を追加。
--   adr_weighted_num  = Σ_泊数セル( round(宿泊費/室泊) × 室泊 )    （税込ベース。税抜は /1.1）
--   comp_weighted_num = Σ_泊数セル( round(人数/予約,2) × 予約件数 )
-- 投入は scripts/db/refresh-marts2.ts（lib/mart/aggregate.ts の aggregateStayNights）。
-- ============================================================================

alter table mart.stay_nights_distribution add column if not exists adr_weighted_num  numeric not null default 0;
alter table mart.stay_nights_distribution add column if not exists comp_weighted_num numeric not null default 0;
