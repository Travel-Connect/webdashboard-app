-- ============================================================================
-- 20260617090100_schemas.sql
-- スキーマと拡張の作成。詳細設計書 §3.1 を実体化する。
--   app    : 施設・権限・マスタ・正規化(canonical)
--   ingest : raw ファイル・取込バッチ・staging・ロック
--   mart   : ダッシュボード用集計
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

create schema if not exists app;
create schema if not exists ingest;
create schema if not exists mart;

comment on schema app is '施設・ユーザー権限・マスタ・正規化済み宿泊日別データ';
comment on schema ingest is 'raw ファイル / 取込バッチ / staging / 取込ロック';
comment on schema mart is 'ダッシュボード用の事前集計テーブル';
