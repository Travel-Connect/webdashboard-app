-- ============================================================================
-- 20260617090300_canonical.sql
-- 正規化テーブル app.reservation_stay_nights。詳細設計書 §3.4 / §3.5。
-- 原則 1レコード = 1施設 × 1予約 × 1部屋タイプ × 1宿泊日。
-- 室数集計は COUNT(*) ではなく SUM(sold_room_nights) を使う。
-- ============================================================================

create table if not exists app.reservation_stay_nights (
  id                          uuid primary key default gen_random_uuid(),
  source_system               text not null check (source_system in ('minpakuin','neppan','temairazu')),
  current_record_key          text not null,   -- canonical 現在値 upsert key（§3.5 unique）
  ingest_batch_id             uuid,            -- ingest.import_batches.id（FK は ingest 作成後に付与）
  facility_id                 uuid not null references app.facilities(id),

  -- 予約 ---------------------------------------------------------------
  reservation_key             text not null,
  checkin_code                text,
  ota_reservation_no          text,
  status                      text,
  is_cancelled                boolean not null default false,
  channel                     text,

  -- 日付 ---------------------------------------------------------------
  stay_date                   date not null,
  stay_month                  date not null,   -- 部屋利用日の月初日
  checkin_date                date,
  checkout_date               date,
  booked_at                   timestamptz,

  -- 部屋 ---------------------------------------------------------------
  room_type_raw               text,
  room_type_normalized        text,
  budget_room_type            text,
  room_no                     text not null default '',

  -- 泊数・室数 ---------------------------------------------------------
  nights                      integer,
  stay_night_index            integer,         -- 何泊目か
  sold_room_nights            numeric not null default 1,  -- minpakuIN は 1

  -- 人数 ---------------------------------------------------------------
  guest_count                 integer,
  adult_count                 integer,
  child_count                 integer,

  -- 金額（補正前）------------------------------------------------------
  gross_amount                numeric,
  tax_amount                  numeric,
  net_amount                  numeric,

  -- 金額（手数料補正後。表示・集計はこちらを参照）---------------------
  fee_adjusted_gross_amount   numeric,
  fee_adjusted_tax_amount     numeric,
  fee_adjusted_net_amount     numeric,
  fee_adjustment_rule_id      uuid references app.fee_adjustment_rules(id),

  -- 国籍 ---------------------------------------------------------------
  country_raw                 text,
  country_normalized          text,
  country_major               text,
  country_middle              text,

  -- 集計制御 -----------------------------------------------------------
  is_stay_night               boolean not null default true,  -- チェックアウト日行を除外後の宿泊行
  lead_time_days              integer,         -- stay_date - booked_at::date
  is_valid_lead_time          boolean not null default false, -- booked_at あり かつ lead_time_days >= 0

  source_updated_at           timestamptz,     -- PMS 側更新日時（unique key には含めない）
  created_at                  timestamptz not null default now()
);

comment on table app.reservation_stay_nights is '共通テンプレートへ正規化した宿泊日別データ（canonical 現在値）';
comment on column app.reservation_stay_nights.sold_room_nights is '室数集計用。minpakuIN=1、ねっぱん/手間いらずは室数を保持';

-- index（詳細設計書 §3.5）---------------------------------------------------
create index if not exists rsn_facility_stay_month_idx
  on app.reservation_stay_nights (facility_id, stay_month);
create index if not exists rsn_facility_stay_date_idx
  on app.reservation_stay_nights (facility_id, stay_date);
create index if not exists rsn_facility_channel_month_idx
  on app.reservation_stay_nights (facility_id, channel, stay_month);
create index if not exists rsn_facility_roomtype_month_idx
  on app.reservation_stay_nights (facility_id, room_type_normalized, stay_month);
create index if not exists rsn_facility_country_month_idx
  on app.reservation_stay_nights (facility_id, country_normalized, stay_month);

-- canonical 現在値 upsert key（後勝ち更新の一意制約）
create unique index if not exists rsn_current_record_key_uidx
  on app.reservation_stay_nights (source_system, current_record_key);
