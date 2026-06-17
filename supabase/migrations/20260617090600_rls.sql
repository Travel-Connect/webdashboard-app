-- ============================================================================
-- 20260617090600_rls.sql
-- 施設別 Row Level Security。詳細設計書 §4 + マスタデータ仕様 §4。
--   - app.profile_facilities に紐づく施設だけ閲覧可能
--   - role='admin' は全施設閲覧可能
--   - ingest.* は deny by default（service role のみが操作）
-- ============================================================================

-- 施設アクセス判定ヘルパー（security definer）-------------------------------
create or replace function app.can_access_facility(target_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.profile_facilities pf
    where pf.profile_id = auth.uid()
      and (
        pf.role = 'admin'
        or pf.facility_id = target_facility_id
      )
  );
$$;

grant execute on function app.can_access_facility(uuid) to authenticated;

-- 認証ロールにスキーマ/テーブルの権限を付与（行制御は RLS が担う）-----------
grant usage on schema app, mart to authenticated;

grant select on
  app.facilities, app.source_facilities, app.profile_facilities,
  app.room_inventory_months, app.budgets,
  app.room_type_mappings, app.channel_mappings, app.country_mappings,
  app.fee_adjustment_rules, app.reservation_stay_nights
  to authenticated;

grant select on all tables in schema mart to authenticated;

-- RLS 有効化 ---------------------------------------------------------------
alter table app.facilities             enable row level security;
alter table app.source_facilities      enable row level security;
alter table app.profile_facilities     enable row level security;
alter table app.room_inventory_months  enable row level security;
alter table app.budgets                enable row level security;
alter table app.room_type_mappings     enable row level security;
alter table app.channel_mappings       enable row level security;
alter table app.country_mappings       enable row level security;
alter table app.fee_adjustment_rules   enable row level security;
alter table app.reservation_stay_nights enable row level security;

alter table mart.daily_facility_metrics    enable row level security;
alter table mart.monthly_channel_metrics   enable row level security;
alter table mart.monthly_room_type_metrics enable row level security;
alter table mart.monthly_country_metrics   enable row level security;
alter table mart.stay_nights_distribution  enable row level security;
alter table mart.booking_curve_monthly     enable row level security;
alter table mart.dashboard_snapshots       enable row level security;

-- ingest.* は RLS 有効＝ポリシー無しで authenticated からは全拒否。
-- 取込処理は service role（RLS バイパス）で実行する。
alter table ingest.raw_files             enable row level security;
alter table ingest.import_batches        enable row level security;
alter table ingest.mapping_profiles      enable row level security;
alter table ingest.staging_rows          enable row level security;
alter table ingest.staging_canonical_rows enable row level security;
alter table ingest.validation_errors     enable row level security;
alter table ingest.import_commits        enable row level security;
alter table ingest.import_locks          enable row level security;

-- ポリシー（施設スコープ select）-------------------------------------------
drop policy if exists "facility scoped select" on app.facilities;
create policy "facility scoped select" on app.facilities
  for select to authenticated using (app.can_access_facility(id));

drop policy if exists "facility scoped select" on app.source_facilities;
create policy "facility scoped select" on app.source_facilities
  for select to authenticated using (app.can_access_facility(facility_id));

drop policy if exists "own grants select" on app.profile_facilities;
create policy "own grants select" on app.profile_facilities
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists "facility scoped select" on app.room_inventory_months;
create policy "facility scoped select" on app.room_inventory_months
  for select to authenticated using (app.can_access_facility(facility_id));

drop policy if exists "facility scoped select" on app.budgets;
create policy "facility scoped select" on app.budgets
  for select to authenticated using (app.can_access_facility(facility_id));

drop policy if exists "facility scoped select" on app.room_type_mappings;
create policy "facility scoped select" on app.room_type_mappings
  for select to authenticated using (app.can_access_facility(facility_id));

-- 施設に紐づかない参照マスタ（非機微）は authenticated 全件参照可
drop policy if exists "authenticated read" on app.channel_mappings;
create policy "authenticated read" on app.channel_mappings
  for select to authenticated using (true);

drop policy if exists "authenticated read" on app.country_mappings;
create policy "authenticated read" on app.country_mappings
  for select to authenticated using (true);

drop policy if exists "authenticated read" on app.fee_adjustment_rules;
create policy "authenticated read" on app.fee_adjustment_rules
  for select to authenticated using (true);

drop policy if exists "facility scoped select" on app.reservation_stay_nights;
create policy "facility scoped select" on app.reservation_stay_nights
  for select to authenticated using (app.can_access_facility(facility_id));

-- mart テーブルの施設スコープ select
drop policy if exists "facility scoped select" on mart.daily_facility_metrics;
create policy "facility scoped select" on mart.daily_facility_metrics
  for select to authenticated using (app.can_access_facility(facility_id));

drop policy if exists "facility scoped select" on mart.monthly_channel_metrics;
create policy "facility scoped select" on mart.monthly_channel_metrics
  for select to authenticated using (app.can_access_facility(facility_id));

drop policy if exists "facility scoped select" on mart.monthly_room_type_metrics;
create policy "facility scoped select" on mart.monthly_room_type_metrics
  for select to authenticated using (app.can_access_facility(facility_id));

drop policy if exists "facility scoped select" on mart.monthly_country_metrics;
create policy "facility scoped select" on mart.monthly_country_metrics
  for select to authenticated using (app.can_access_facility(facility_id));

drop policy if exists "facility scoped select" on mart.stay_nights_distribution;
create policy "facility scoped select" on mart.stay_nights_distribution
  for select to authenticated using (app.can_access_facility(facility_id));

drop policy if exists "facility scoped select" on mart.booking_curve_monthly;
create policy "facility scoped select" on mart.booking_curve_monthly
  for select to authenticated using (app.can_access_facility(facility_id));

drop policy if exists "facility scoped select" on mart.dashboard_snapshots;
create policy "facility scoped select" on mart.dashboard_snapshots
  for select to authenticated using (app.can_access_facility(facility_id));

-- 今後 mart に追加されるテーブルにも authenticated select を既定付与
alter default privileges in schema mart grant select on tables to authenticated;
