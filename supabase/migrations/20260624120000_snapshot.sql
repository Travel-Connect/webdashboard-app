-- ============================================================================
-- 20260624120000_snapshot.sql
-- 指定日取込（as-of）比較用の日次スナップショットマート。
-- 各取込日(base.csv ファイル名の日付)時点の daily_facility_metrics を保持する。
-- 列構成は mart.daily_facility_metrics に snapshot_date を足しただけ。
-- 取込は scripts/db/load-snapshots.ts（ローカル実行・検証済み FILTER で集計）。
-- ============================================================================

create table if not exists mart.daily_facility_metrics_snapshot (
  snapshot_date    date    not null,         -- 取込日（base.csv 作成日 = JST）
  facility_id      uuid    not null references app.facilities(id) on delete cascade,
  stay_date        date    not null,
  sold_room_nights numeric not null default 0,
  guest_count      integer not null default 0,
  gross_amount     numeric not null default 0,  -- sum(fee_adjusted_gross_amount)
  tax_amount       numeric not null default 0,  -- sum(fee_adjusted_tax_amount)
  net_amount       numeric not null default 0,  -- sum(fee_adjusted_net_amount)
  primary key (snapshot_date, facility_id, stay_date)
);

create index if not exists daily_facility_metrics_snapshot_date_idx
  on mart.daily_facility_metrics_snapshot (snapshot_date);

-- RLS: 他 mart と同様 facility scoped select（認証ステップで有効化される）
alter table mart.daily_facility_metrics_snapshot enable row level security;
drop policy if exists "facility scoped select" on mart.daily_facility_metrics_snapshot;
create policy "facility scoped select" on mart.daily_facility_metrics_snapshot
  for select to authenticated using (app.can_access_facility(facility_id));
