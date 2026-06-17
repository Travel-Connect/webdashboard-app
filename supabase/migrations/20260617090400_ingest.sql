-- ============================================================================
-- 20260617090400_ingest.sql
-- 取込テーブル。詳細設計書 §3.3 + 取込・検証・再取込仕様 §2 / §8。
-- これらは server-side service role でのみ操作する（RLS は deny by default）。
-- ============================================================================

-- raw ファイル -------------------------------------------------------------
create table if not exists ingest.raw_files (
  id                   uuid primary key default gen_random_uuid(),
  source_system        text not null check (source_system in ('minpakuin','neppan','temairazu')),
  source_facility_code text,
  storage_bucket       text not null,
  storage_path         text not null,
  original_file_name   text not null,
  content_hash         text,                  -- 重複検知用
  encoding             text,                  -- utf-8-sig / cp932 など
  uploaded_by          uuid,                  -- auth.users.id
  uploaded_at          timestamptz not null default now(),
  unique (content_hash, original_file_name, source_system)
);

-- 取込バッチ（状態遷移は取込仕様 §1）---------------------------------------
create table if not exists ingest.import_batches (
  id                 uuid primary key default gen_random_uuid(),
  raw_file_id        uuid not null references ingest.raw_files(id) on delete cascade,
  status             text not null default 'uploaded'
                       check (status in ('uploaded','parsing','parsed','validating',
                                         'validation_failed','validated','committing',
                                         'committed','failed','cancelled')),
  target_months      date[] not null default '{}',
  row_count_raw      integer,
  row_count_canonical integer,
  error_summary      jsonb,
  created_at         timestamptz not null default now(),
  committed_at       timestamptz
);

-- canonical.ingest_batch_id の FK を後付け
alter table app.reservation_stay_nights
  drop constraint if exists rsn_ingest_batch_fk;
alter table app.reservation_stay_nights
  add constraint rsn_ingest_batch_fk
  foreign key (ingest_batch_id) references ingest.import_batches(id) on delete set null;

-- マッピングプロファイル ----------------------------------------------------
create table if not exists ingest.mapping_profiles (
  id            uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system in ('minpakuin','neppan','temairazu')),
  name          text not null,
  version       integer not null default 1,
  mapping_json  jsonb not null,
  is_active     boolean not null default true
);

-- staging: raw 1行ごとの parse 結果（PII を含む可能性 → API では原則返さない）---
create table if not exists ingest.staging_rows (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references ingest.import_batches(id) on delete cascade,
  raw_file_id    uuid not null references ingest.raw_files(id) on delete cascade,
  raw_row_number integer not null,            -- 1始まり
  raw_payload    jsonb not null,              -- PII を含む可能性あり
  parse_status   text not null check (parse_status in ('parsed','warning','error')),
  parse_errors   jsonb,
  created_at     timestamptz not null default now(),
  unique (raw_file_id, raw_row_number)
);
comment on column ingest.staging_rows.raw_payload is 'PII を含む可能性。Dashboard/preview API では返さない（取込仕様 §6）';

-- staging: canonical 変換後の preview/validate 用 ---------------------------
create table if not exists ingest.staging_canonical_rows (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null references ingest.import_batches(id) on delete cascade,
  raw_row_numbers    integer[] not null default '{}',
  current_record_key text not null,           -- 正規化済み表示名を含めない
  history_record_key text,
  canonical_payload  jsonb not null,
  target_facility_id uuid references app.facilities(id),
  target_stay_month  date,
  validation_status  text not null default 'pending'
                       check (validation_status in ('pending','valid','warning','error'))
);

-- validation issue ----------------------------------------------------------
create table if not exists ingest.validation_errors (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references ingest.import_batches(id) on delete cascade,
  severity        text not null check (severity in ('error','warning')),
  code            text not null,
  message         text not null,              -- PII 値を含めない
  raw_row_number  integer,
  canonical_row_id uuid references ingest.staging_canonical_rows(id) on delete cascade,
  field_name      text
);

-- import commit 記録 --------------------------------------------------------
create table if not exists ingest.import_commits (
  id                   uuid primary key default gen_random_uuid(),
  batch_id             uuid not null references ingest.import_batches(id) on delete cascade,
  committed_by         uuid,
  committed_at         timestamptz not null default now(),
  affected_facility_ids uuid[] not null default '{}',
  affected_stay_months date[] not null default '{}',
  upserted_rows        integer not null default 0,
  deleted_rows         integer not null default 0,
  refreshed_marts      text[] not null default '{}'
);

-- mart refresh lock（同一施設・同一月の同時 commit を防ぐ。取込仕様 §8）------
create table if not exists ingest.import_locks (
  facility_id uuid not null,
  stay_month  date not null,
  batch_id    uuid references ingest.import_batches(id) on delete cascade,
  locked_at   timestamptz not null default now(),
  primary key (facility_id, stay_month)
);
