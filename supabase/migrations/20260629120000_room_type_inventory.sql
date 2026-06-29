-- ============================================================================
-- 20260629120000_room_type_inventory.sql
-- 部屋タイプ別 客室数マスタ（部屋タイプ別 稼働率の分母）。
--   稼働率 = 販売室数 / (room_count × 対象月の日数)
--   grain = (facility_id, room_type_normalized)。
--   room_inventory_months（施設×月）の部屋タイプ版。
--   値は資料からの実数 or 暫定推定（note で区別: 'manual' / '暫定(自動推定...)'）。
-- ============================================================================

create table if not exists app.room_type_inventory (
  facility_id          uuid not null references app.facilities(id) on delete cascade,
  room_type_normalized text not null,
  room_count           integer not null check (room_count >= 0),
  note                 text,
  updated_at           timestamptz not null default now(),
  primary key (facility_id, room_type_normalized)
);

comment on table app.room_type_inventory is
  '部屋タイプ別の客室数（稼働率の分母）。grain=施設×部屋タイプ(normalized)。room_inventory_months の部屋タイプ版。';

-- RLS（施設スコープ select）。room_inventory_months と同じ扱い。
grant select on app.room_type_inventory to authenticated;
alter table app.room_type_inventory enable row level security;
drop policy if exists "facility scoped select" on app.room_type_inventory;
create policy "facility scoped select" on app.room_type_inventory
  for select to authenticated using (app.can_access_facility(facility_id));
