-- ============================================================================
-- 20260617090500_mart.sql
-- ダッシュボード用集計マート。詳細設計書 §7.2 + KPI定義書。
-- 金額は手数料補正後（fee_adjusted_*）の合計を gross/tax/net として保持し、
-- 税込/税抜の切替を再集計なしで行えるようにする。差分更新は M16 で実装。
-- ============================================================================

-- 稼働分析（施設+日）。稼働率/残室/RevPAR は app.room_inventory_months と結合 ---
create table if not exists mart.daily_facility_metrics (
  facility_id      uuid not null references app.facilities(id) on delete cascade,
  stay_date        date not null,
  sold_room_nights numeric not null default 0,
  guest_count      integer not null default 0,
  gross_amount     numeric not null default 0,  -- sum(fee_adjusted_gross_amount)
  tax_amount       numeric not null default 0,  -- sum(fee_adjusted_tax_amount)
  net_amount       numeric not null default 0,  -- sum(fee_adjusted_net_amount)
  primary key (facility_id, stay_date)
);

-- 経路分析（施設+月+経路）--------------------------------------------------
create table if not exists mart.monthly_channel_metrics (
  facility_id      uuid not null references app.facilities(id) on delete cascade,
  stay_month       date not null,
  channel          text not null,
  sold_room_nights numeric not null default 0,
  guest_count      integer not null default 0,
  gross_amount     numeric not null default 0,
  tax_amount       numeric not null default 0,
  net_amount       numeric not null default 0,
  primary key (facility_id, stay_month, channel)
);

-- 部屋タイプ別（施設+月+部屋タイプ+予算部屋タイプ）-------------------------
create table if not exists mart.monthly_room_type_metrics (
  facility_id          uuid not null references app.facilities(id) on delete cascade,
  stay_month           date not null,
  room_type_normalized text not null,
  budget_room_type     text not null default '',
  sold_room_nights     numeric not null default 0,
  guest_count          integer not null default 0,
  reservation_count    integer not null default 0,  -- 予約×月単位の distinct count
  gross_amount         numeric not null default 0,
  tax_amount           numeric not null default 0,
  net_amount           numeric not null default 0,
  primary key (facility_id, stay_month, room_type_normalized, budget_room_type)
);

-- 国籍別（施設+月+大分類+中分類+国）----------------------------------------
create table if not exists mart.monthly_country_metrics (
  facility_id                 uuid not null references app.facilities(id) on delete cascade,
  stay_month                  date not null,
  country_major               text not null,
  country_middle              text not null,
  country_normalized          text not null,
  sold_room_nights            numeric not null default 0,
  guest_count                 integer not null default 0,
  gross_amount                numeric not null default 0,
  tax_amount                  numeric not null default 0,
  net_amount                  numeric not null default 0,
  reservation_count           integer not null default 0,
  multi_night_reservation_count integer not null default 0, -- 泊数>=2 の予約数
  lead_time_total             bigint  not null default 0,    -- is_valid_lead_time の lead time 合計
  lead_time_count             integer not null default 0,    -- is_valid_lead_time の予約数
  primary key (facility_id, stay_month, country_major, country_middle, country_normalized)
);

-- 泊数分布（施設+チェックイン月+部屋タイプ+泊数バケット）-------------------
-- 予約単位に集約してから作成する（KPI定義書 §5）。
create table if not exists mart.stay_nights_distribution (
  facility_id          uuid not null references app.facilities(id) on delete cascade,
  checkin_month        date not null,
  room_type_normalized text not null,
  nights_bucket        text not null check (nights_bucket in ('1','2','3_4','5_6','7_plus')),
  reservation_count    integer not null default 0,
  sold_room_nights     numeric not null default 0,
  guest_count          integer not null default 0,
  gross_amount         numeric not null default 0,
  tax_amount           numeric not null default 0,
  net_amount           numeric not null default 0,
  primary key (facility_id, checkin_month, room_type_normalized, nights_bucket)
);

-- ブッキングカーブ（施設+月+キャンセルスコープ）----------------------------
-- 各 bucket 値は is_valid_lead_time=true の宿泊日の累積 sum(sold_room_nights)。
create table if not exists mart.booking_curve_monthly (
  facility_id  uuid not null references app.facilities(id) on delete cascade,
  stay_month   date not null,
  cancel_scope text not null check (cancel_scope in ('with_cancelled','without_cancelled')),
  same_day                            numeric not null default 0,  -- lead_time_days >= 0
  one_day_before                      numeric not null default 0,  -- >= 1
  two_days_before                     numeric not null default 0,  -- >= 2
  three_to_six_days_before            numeric not null default 0,  -- >= 3
  seven_to_thirteen_days_before       numeric not null default 0,  -- >= 7
  fourteen_to_twenty_days_before      numeric not null default 0,  -- >= 14
  twenty_one_to_thirty_days_before    numeric not null default 0,  -- >= 21
  thirty_one_to_sixty_days_before     numeric not null default 0,  -- >= 31
  sixty_one_to_ninety_days_before     numeric not null default 0,  -- >= 61
  ninety_one_to_one_twenty_days_before numeric not null default 0, -- >= 91
  one_twenty_one_to_one_fifty_days_before numeric not null default 0, -- >= 121
  one_fifty_one_plus_days_before      numeric not null default 0,  -- >= 151
  primary key (facility_id, stay_month, cancel_scope)
);

-- 前回 snapshot 比較用（取込仕様 §7）---------------------------------------
create table if not exists mart.dashboard_snapshots (
  id            uuid primary key default gen_random_uuid(),
  snapshot_date date not null,                -- JST 基準
  created_at    timestamptz not null default now(),
  mart_name     text not null,
  facility_id   uuid not null references app.facilities(id) on delete cascade,
  target_month  date not null,
  payload       jsonb not null,
  unique (snapshot_date, mart_name, facility_id, target_month)
);
