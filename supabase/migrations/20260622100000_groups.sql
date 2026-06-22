-- ============================================================
-- groups: 施設グループ（マルチテナント）。facilities.group_id で 1:N。
-- 1施設=1グループ。アクティブグループ（URL slug / 当面は env 既定 'cordio'）で
-- ダッシュボードをスコープする。user_profiles / RLS は認証ステップで追加。
-- ============================================================
create table if not exists app.groups (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,        -- URL用 ('cordio')
  name       text not null,               -- 表示名 ('コルディオグループ')
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table app.facilities add column if not exists group_id uuid references app.groups(id);
create index if not exists idx_facilities_group_id on app.facilities(group_id);
