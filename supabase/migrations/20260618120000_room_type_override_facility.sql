-- ============================================================================
-- 20260618120000_room_type_override_facility.sql
-- 部屋タイプ依存の施設分割に対応する override 列を room_type_mappings に追加。
-- minpakuIN の create_report.py は「施設名＝アクアパレス北谷 かつ 部屋タイプ＝【別邸】…」
-- の行を別施設（結の家 / アクアパレス北谷ANNEX（クローバー桑江））へ振り替える。
-- source_facilities（施設名→施設）だけでは部屋タイプ依存の分割を表せないため、
-- room_type_mappings に override_facility_id を持たせて adapter 前処理で解決する。
-- ============================================================================

alter table app.room_type_mappings
  add column if not exists override_facility_id uuid references app.facilities(id);

comment on column app.room_type_mappings.override_facility_id is
  '部屋タイプ依存の施設振替先。NULL なら source_facilities で解決した施設のまま';
