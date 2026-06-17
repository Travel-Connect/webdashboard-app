-- ============================================================================
-- 20260617090200_app_master.sql
-- マスタテーブル。詳細設計書 §3.2 + マスタデータ仕様 §2-§3。
-- source_system は全体で 'minpakuin' / 'neppan' / 'temairazu' を使う。
-- ============================================================================

-- 施設マスタ ---------------------------------------------------------------
create table if not exists app.facilities (
  id            uuid primary key default gen_random_uuid(),
  facility_code text not null unique,
  display_name  text not null,
  area_name     text,                       -- 北谷/北部/那覇/沖縄市/その他。初期は未分類許容
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
comment on table app.facilities is '内部施設マスタ。facility_code はマスタデータ仕様 §2 の施設IDを正とする';

-- PMS 別施設名 → 内部施設 ---------------------------------------------------
create table if not exists app.source_facilities (
  id                   uuid primary key default gen_random_uuid(),
  facility_id          uuid not null references app.facilities(id) on delete cascade,
  source_system        text not null check (source_system in ('minpakuin','neppan','temairazu')),
  source_facility_code text not null,
  source_facility_name text,
  is_active            boolean not null default true,
  unique (source_system, source_facility_code)
);

-- ユーザー権限（Supabase Auth user → 施設 + ロール）-------------------------
create table if not exists app.profile_facilities (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null,                 -- auth.users.id
  facility_id uuid references app.facilities(id) on delete cascade, -- admin は NULL（全施設）
  role        text not null check (role in ('admin','operator','viewer','facility_user')),
  created_at  timestamptz not null default now(),
  unique (profile_id, facility_id, role)
);
comment on column app.profile_facilities.facility_id is 'admin ロールは NULL（全施設）。それ以外は付与施設ごとに1行';

-- 販売可能室数（稼働率・残室・RevPAR の分母）-------------------------------
create table if not exists app.room_inventory_months (
  facility_id           uuid not null references app.facilities(id) on delete cascade,
  month                 date not null,        -- 月初日
  sellable_rooms_per_day integer not null,
  sellable_room_nights  integer not null,     -- 通常 sellable_rooms_per_day * 月日数
  primary key (facility_id, month)
);

-- 予算 ---------------------------------------------------------------------
create table if not exists app.budgets (
  facility_id       uuid not null references app.facilities(id) on delete cascade,
  month             date not null,            -- 月初日
  budget_room_type  text not null default '', -- 空なら施設全体
  budget_amount     numeric not null,
  budget_room_nights integer,
  primary key (facility_id, month, budget_room_type)
);

-- 部屋タイプマッピング ------------------------------------------------------
create table if not exists app.room_type_mappings (
  id                   uuid primary key default gen_random_uuid(),
  source_system        text not null check (source_system in ('minpakuin','neppan','temairazu')),
  facility_id          uuid not null references app.facilities(id) on delete cascade,
  room_type_raw        text not null,
  room_type_normalized text not null,
  budget_room_type     text not null,
  valid_from           date,
  valid_to             date,
  unique (source_system, facility_id, room_type_raw, valid_from)
);

-- 経路マッピング（表記ゆれ統一）---------------------------------------------
create table if not exists app.channel_mappings (
  id                 uuid primary key default gen_random_uuid(),
  source_system      text not null check (source_system in ('minpakuin','neppan','temairazu')),
  channel_raw        text not null,
  channel_normalized text not null,
  channel_group      text,                    -- OTA/直予約/電話 など
  is_active          boolean not null default true,
  unique (source_system, channel_raw)
);

-- 国籍マッピング ------------------------------------------------------------
create table if not exists app.country_mappings (
  id                 uuid primary key default gen_random_uuid(),
  country_raw        text not null unique,
  country_normalized text not null,
  country_major      text not null,           -- 大分類（国内/海外 など）
  country_middle     text not null            -- 中分類
);

-- 手数料補正・税計算ルール（コードから分離）---------------------------------
create table if not exists app.fee_adjustment_rules (
  id                 uuid primary key default gen_random_uuid(),
  rule_code          text not null unique,    -- agoda_202601 / tripcom_202602 / neppan_tax10
  source_system      text check (source_system in ('minpakuin','neppan','temairazu')), -- NULL=全ソース
  channel_normalized text,                    -- NULL=全経路
  valid_from         date not null,
  valid_to           date,
  gross_divisor      numeric not null default 1,  -- Agoda=0.88 / Trip.com=0.85 / 通常=1
  tax_rate           numeric not null default 0.10,
  tax_rounding       text not null default 'floor' check (tax_rounding in ('floor','round','ceil')),
  created_at         timestamptz not null default now()
);
