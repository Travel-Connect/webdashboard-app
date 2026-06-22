# グループ・マルチテナント ＆ URLアクセス制御 実装計画

ステータス: 策定（2026-06-22）/ ブランチ `feat/backend-foundation`
関連: [[design-parity-state]] / `docs/implementation-plan.md`（M2 認証/RLS の具体化）

---

## 0. 目的

複数の施設グループ（例: **コルディオグループ＝15施設**）を1つのアプリで扱えるようにし、
**URL（`/g/<group>`）とログインで「どのグループを閲覧できるか」を制御**する。
コルディオ用ダッシュボードでは**他グループの施設がメニュー・セレクタ・集計に一切出ない**。

## 1. 確定方針（ユーザー確認済み 2026-06-22）

| 論点 | 決定 |
|---|---|
| URL方式 | **パススラッグ `/g/<slug>`**（例 `/g/cordio/dashboard`）。DNS不要・Vercel即対応 |
| アクセス制御 | **認証あり：Supabase Auth ＋ RLS**。アカウントを閲覧可能グループに紐付け、DB/APIレベルで他グループを遮断 |
| 施設の所属 | **1施設＝1グループ**（`facilities.group_id` 単一・1:N） |
| グループ管理 | **管理画面（マスタ管理）から**グループ作成・施設割当・ユーザー権限を設定 |

---

## 2. データモデル

```
app.groups
  id uuid pk, slug text unique (URL用 'cordio'), name text ('コルディオグループ'),
  is_active bool, created_at         （将来: logo_url / theme）

app.facilities  （既存に追加）
  + group_id uuid references app.groups(id)        -- 1:N。display_order/area_name は「グループ内の並び/エリア」として継続

app.user_profiles
  user_id uuid pk references auth.users(id) on delete cascade,
  group_id uuid references app.groups(id),         -- null = super_admin(全グループ)
  role text check in ('super_admin','group_admin','viewer','facility_user'),
  facility_id uuid references app.facilities(id),   -- facility_user のみ
  email text, invited_at, created_at
```

- **`group_id` が「レポート対象集合」の正**になる。経路/年間売上で使った `display_order is not null` フィルタは **`group_id = <active group>` に置換**（並び順は引き続き `display_order`）。
- seed: `cordio` グループを作成し、現行15レポート施設（`display_order` 設定済）の `group_id` を cordio に。

## 3. ロール（プロト shell の 管理者/取込/閲覧者/施設ユーザー に対応）

- **super_admin**（トラベルコネクト）: 全グループ・全施設、管理画面フル。
- **group_admin**: 自グループの管理（ユーザー招待・施設並び・エリア）。
- **viewer**: 自グループ閲覧のみ。
- **facility_user**: 自施設のみ（`facilityId` 固定）。

## 4. URLルーティング（`/g/[group]`）

- 既存 `app/dashboard/*` を **`app/g/[group]/dashboard/*`** へ移設。`[group]` = slug が全ページ/APIに伝播。
- `app/g/[group]/login` = **グループ専用ログインURL**。
- `app/g/[group]/admin/*` = 管理画面（super_admin / group_admin）。
- ルート `/` = **ログイン画面**（未認証）。認証後は所属グループへ（super_admin はグループ選択）。`/dashboard` は廃止し `/g/<group>` に一本化。
- **`middleware.ts`（@supabase/ssr）**:
  1. セッション確認（無→ `/g/<slug>/login`）。
  2. `slug → group` 解決（無効→404）。
  3. 認可: super_admin=任意グループ可 / それ以外は `user.group == slug-group` のみ（不一致→自グループへ）。
  4. **アクティブグループ = URL slug** を下流へ（params＋必要ならheader/cookie）。

## 5. 認証（Supabase Auth）

- `@supabase/ssr` でCookieセッション（`.env.local` の URL/anon を使用。service_role は管理操作専用）。
- ログイン = email+password（**管理者招待制**・既定）。サインアウト／パスワードリセットは後続。
- ログイン後 `user_profiles` から group/role を取得しシェルに反映（ロール切替・ユーザーメニューはプロト準拠）。

## 6. データ遮断（RLS）— 多層防御

- 現状: API は **直 pg（service-role 相当・RLSバイパス）**。これを変更。
- **推奨方式（既存SQLビルダー温存）**: リクエストごとにトランザクションで
  `set local role authenticated; set local request.jwt.claims = '{"sub":"<uid>"}'`（検証済みセッション由来）→ クエリ → commit。
  これで `auth.uid()` ベースのRLSが直pgでも効く。`lib/db` にヘルパーを追加。
  - 代替（大改修）: dashboard API を supabase-js(ユーザートークン)へ全面移行＝SQLをPostgREST/RPC化。**非推奨**。
- **RLSポリシー**:
  - helper: `app.current_group()`（`auth.uid()`→`user_profiles.group_id`）, `app.is_super_admin()`。
  - `app.facilities`: `using (is_super_admin() or group_id = current_group())`。
  - `mart.*`（daily_facility / channel / room_type / country / stay_nights / booking_curve）:
    `using (is_super_admin() or facility_id in (select id from app.facilities where group_id = current_group()))`。
    性能が問題なら **mart に group_id を非正規化**（refresh時に付与）か SECURITY DEFINER 関数でファシリティ集合を返す。
  - `app.budgets` / `room_inventory_months`: 同様。`app.groups`/`user_profiles`: 自分の所属のみ可視。
- **アクティブグループ = URL slug** でアプリ層フィルタ＋RLSで「そのユーザーがそのグループを見てよいか」を担保。super_admin は任意グループ閲覧可。
- **✅ 実現性検証済み（2026-06-22）**: 直pg(postgres)で `set local role authenticated` ＋ `request.jwt.claims` set → `auth.uid()` が解決し、一時テーブルRLS(`uid=auth.uid()`)が正しく1行だけ返すことを確認。`.env.local` に `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` あり。→ この方式で確定。

## 7. 既存画面のグループスコープ化

- `/api/facilities` → アクティブグループの施設のみ（`display_order` 順）。
- 「全施設」= **グループ内全施設**。
- クロスタブの固定列/レポート集合（現 `display_order is not null`）→ **`group_id = active group`**。
  経路/全施設年間売上の施設列、国籍/部屋タイプ集計が自動的にグループ範囲に収まる。
- occupancy 等 `facilityId=all` → グループ内集計。**→ 他グループ施設がメニュー・セレクタ・数値に出ない（要件達成）。**

## 8. 管理画面（マスタ管理 ＋ ユーザー権限）

- グループ: 作成/編集（slug, name, active）。
- 施設割当: 施設→グループ、`display_order`/`area_name` 編集（経路で使った並び順もここで運用）。
- ユーザー: 招待（email）・group/role 割当・facility_user の施設指定・失効。
- （後続）監査ログ・データ取込/差分検証。プロトの `admin/masters`・`admin/users` Roadmap 画面を実体化。

## 9. 実装フェーズ（順序・各ステップでコミット）

> **まず「コルディオ専用版」(= ステップ1+2) を先に出す。** 認証・URLルーティング・RLS・管理画面は後続。

| ステップ | 内容 | 認証/URL |
|---|---|---|
| **1. データモデル＋seed** | `app.groups`＋`facilities.group_id`、cordio グループに15施設割当（`user_profiles`・RLS helper は認証ステップで追加） | 不要 |
| **2. コルディオ専用スコープ** | アクティブグループ=cordio（env `ACTIVE_GROUP_SLUG` 既定 'cordio'）。施設セレクタ・「全施設」集計・クロスタブ集合・シェルのグループ名を cordio に限定（アプリ層フィルタ） | 不要 |
| ―― ここまでで **コルディオ専用版 完成（他施設非表示）** ―― | | |
| **3. 認証＋ルーティング** | `@supabase/ssr`・`/g/[group]` 移設・`/`ログイン・`middleware`（セッション＋slug認可）・`user_profiles`。※B（アクティブグループ受け渡し）が登場 | ◯ |
| **4. RLS有効化** | 直pg＋JWTクレーム方式（**実現性検証済み**）＋mart/app ポリシー | ◯ |
| **5. 管理画面** | グループ作成＋施設割当 →（2段）ユーザー招待/権限 | ◯ |

## 10. 影響ファイル（概算）

`supabase/migrations/*`（groups/user_profiles/rls 追加）, `supabase/seed.sql`,
`lib/db/*`（JWTクレーム接続ヘルパー）, `lib/api/*`（group フィルタ）,
`app/`（`/g/[group]` へ移設）, `middleware.ts`（新）,
`components/dashboard/{sidebar,filter-bar,app-shell}`（グループ名/スコープ・UserMenu）,
`app/g/[group]/admin/*`（新・管理画面）。

## 11. リスク・前提

- `.env.local`（URL/anon/service_role）は**不可侵・ログ非出力**。anon=SSR auth、service_role=管理/検証のみ。
- mart に RLS を掛けると直pg APIの既存挙動（全件）が変わる → **P4で慎重に**。`scripts/verify/*`（±0パリティ）は **service-role で全件実行を継続**して維持。
- 「直pg＋JWTクレームで `auth.uid()` が効くか」は P4 冒頭で要検証。効かなければ supabase-js 移行へ切替。
- 移設に伴い `/dashboard` 直アクセスは廃止 → `/g/<group>` に一本化（下記オープン論点6）。

## 12. 決定事項（2026-06-22 確定）

1. **コルディオ外の施設**: 当面 `group_id = null`（どのグループにも出さない）。**管理者が管理画面でグループを作成**して施設を割り当てる運用（ねっぱん「コテージスターハウス今帰仁」・運営会社変更2施設・データ無24施設は必要時にグループ化）。→ P1 seed は cordio グループ＋15施設のみ。残りは null。
2. **ログイン方式**: email+password・**管理者招待制**。
3. **super_admin 初期ユーザー**: **Supabase 管理画面で auth ユーザーを手動作成** → その `user_id` に `user_profiles(role='super_admin', group_id=null)` を投入（SQLスニペットを用意）。
4. **ルート `/`**: **ログイン画面**（未認証時）。認証後はアカウントの所属グループへ（super_admin はグループ選択）。
5. **ブランディング**: シェルに**グループ名（またはロゴ）を表示**（`groups.name` を使用、`logo_url` は任意・後続）。
6. **`/dashboard` 廃止**: `/g/<group>` に一本化。
