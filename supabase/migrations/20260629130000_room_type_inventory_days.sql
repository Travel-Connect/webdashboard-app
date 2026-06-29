-- ============================================================================
-- 20260629130000_room_type_inventory_days.sql
-- 部屋タイプ別 日次 販売可能室数マスタ（稼働率の日次分母）。
--   稼働率(月) = Σ_days(販売室数) ÷ Σ_days(sellable_rooms)
--   → 日々の客室数変動（休館・部分稼働・メンテ等）をそのまま反映できる。
--   grain = (facility_id, room_type_normalized, date)。
--   月次の概算しか無い場合は app.room_type_inventory(客室数×日数) にフォールバック。
-- ============================================================================

create table if not exists app.room_type_inventory_days (
  facility_id          uuid not null references app.facilities(id) on delete cascade,
  room_type_normalized text not null,
  date                 date not null,
  sellable_rooms       integer not null check (sellable_rooms >= 0),
  updated_at           timestamptz not null default now(),
  primary key (facility_id, room_type_normalized, date)
);

comment on table app.room_type_inventory_days is
  '部屋タイプ別の日次 販売可能室数（稼働率の日次分母）。grain=施設×部屋タイプ(normalized)×日。';

create index if not exists rti_days_fac_date_idx on app.room_type_inventory_days (facility_id, date);

-- RLS（施設スコープ select）。room_type_inventory と同じ扱い。
grant select on app.room_type_inventory_days to authenticated;
alter table app.room_type_inventory_days enable row level security;
drop policy if exists "facility scoped select" on app.room_type_inventory_days;
create policy "facility scoped select" on app.room_type_inventory_days
  for select to authenticated using (app.can_access_facility(facility_id));
