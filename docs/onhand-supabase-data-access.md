# 入込状況表データの取得（Supabase 直接）— 突合ガイド

最終更新: 2026-06-17

> **この資料の対象**
> 既存の **onhand-report ツール**が使っている Supabase（プロジェクト ref **`ckxuzchftazqbdanusgi`**）から、入込状況表のデータを直接参照して**数値突合**するための手順。
> ⚠️ `webdashboard-app`（このリポジトリ）自体の Supabase とは**別プロジェクト**。ライブの入込データはこちらにある。集計式の定義は [neppan-csv-revenue-rooms-logic.md](neppan-csv-revenue-rooms-logic.md) を参照。

---

## 0. データの流れ（どこを見ているか）

```
ねっぱんCSV(cp932) ──ETL──▶ app.reservation_stay_fact ──RPC get_incoming_report──▶ ダッシュボード画面
                            (1行=1施設×1予約×1滞在日)        (当年/前年同期/前年最終)
```

突合は「**ダッシュボードの数字 = RPCの出力 = 生テーブルを自分で集計した値**」が一致するかを見る作業。この資料は生テーブル(`app.reservation_stay_fact`)とRPCの両方を直接叩く方法をまとめる。

---

## 1. アクセス方法（重要：`app` スキーマは直アクセス禁止）

`app` スキーマは anon / authenticated から権限剥奪（`revoke all`）されている（`001_create_schema.sql:87-94`）。つまり：

| 方法 | 生テーブル `app.*` | RPC `get_incoming_report` |
|---|---|---|
| supabase-js `.from('reservation_stay_fact')` / REST API | ❌ 取得不可（権限なし） | — |
| supabase-js `.rpc('get_incoming_report', …)` | — | ✅ 可（authenticated） |
| **Supabase Dashboard → SQL Editor** | ✅ **可**（service_role 相当で実行、RLS/grant無視） | ✅ 可 |
| **Supabase Dashboard → Table Editor** | ✅ 可（閲覧） | — |

➡️ **生テーブルの突合は「Supabase Dashboard の SQL Editor」で行う**のが正解。アプリ経由（REST/anon）では `app` テーブルは見えない。

- SQL Editor: `https://supabase.com/dashboard/project/ckxuzchftazqbdanusgi/sql/new`
- Table Editor: `https://supabase.com/dashboard/project/ckxuzchftazqbdanusgi/editor`
- ログインは当該 Supabase プロジェクトの権限を持つアカウントで。

> **1000行制限について**: Supabase の `max_rows=1000` 制限は REST/PostgREST・RPC 経由のみ。**SQL Editor の生SQLには無関係**（全行集計できる）。

---

## 2. テーブル定義（リファレンス）

### 2-1. `app.reservation_stay_fact`（入込の本体・1行=1施設×1予約×1滞在日）

| 列 | 型 | 内容 |
|---|---|---|
| `facility_name` | text | 施設名（CSVファイル名由来） |
| `source_file` | text | 取込元ファイル名 |
| `reservation_no` | text | 予約番号 |
| `stay_date` | date | **滞在日**（= チェックイン日 + 泊目-1） |
| `stay_month` | date | 滞在月（**月初日**）。月次集計はこれで `between` |
| `channel` | text | 予約サイト名称（販売チャネル） |
| `reservation_type` | text | 予約区分（`予約` / `キャンセル` / `変更`） |
| `application_date` | date | 申込日（as-of判定） |
| `update_datetime` | timestamp | 更新日（キャンセル as-of判定） |
| `rooms` | integer | **室数**（ETLで 予約番号×滞在日 の `max` 済＝重複排除済） |
| `guests` | integer | 人数（同上 `max` 済） |
| `revenue` | numeric(14,2) | **売上**（同 `sum` 済＝大人+子供+幼児合計額） |
| `loaded_at` | timestamptz | DB投入時刻 |

- ユニーク制約: `(facility_name, reservation_no, stay_date)` → **1行=1予約ナイト**。だから月集計は単純に `sum(rooms)` / `sum(revenue)` でよい（再重複排除は不要）。

### 2-2. `app.facility_import_status`（取込状況）

`facility_name`(pk), `file_name`, `drive_item_id`, `etag`, `last_modified`, `last_imported_at`, `row_count`, `updated_at`
→ 「どの施設が・いつ・何行取り込まれたか」。**データ欠落の一次切り分け**に使う。

### 2-3. `app.snap_revenue`（前年同期スナップ。Lincoln系の月次事前集約）

`snap_date`(抽出日), `facility_name`, `stay_month`, `channel`, `revenue`, `rooms`, `guests`
→ **前年同期(yoy)** は、この snap があればそちらを優先。なければ fact からフォールバック（後述）。

---

## 3. 突合用SQL（SQL Editor にコピペ）

`:base_date`（基準日）, `:start`, `:end`（表示月の開始/終了の月初日）等は実値に置き換える。

### 3-1. 取込状況の確認（まず最初に）

```sql
select facility_name, file_name, last_imported_at, row_count
from app.facility_import_status
order by facility_name;
```
→ ダッシュボードの `list_facilities()` と同じ内容。row_count が想定と違えば取込漏れを疑う。

### 3-2. 生明細を眺める（特定施設×滞在月）

```sql
select stay_date, channel, reservation_type, reservation_no,
       rooms, guests, revenue, application_date, update_datetime
from app.reservation_stay_fact
where facility_name = 'コテージスターハウス今帰仁'
  and stay_month = date '2026-01-01'      -- 滞在月（月初日）
order by stay_date, channel, reservation_no;
```

### 3-3. 当年オンハンド（基準日時点）をチャネル×月で再現

RPC `get_incoming_report` の「当年(current)」と同じ条件（`008_modify_get_incoming_report.sql:78-95`）。

```sql
select f.channel,
       f.stay_month,
       sum(f.rooms)   as rooms,
       sum(f.guests)  as guests,
       sum(f.revenue) as revenue
from app.reservation_stay_fact f
where f.stay_month between date '2026-01-01' and date '2026-06-01'   -- :start ～ :end（月初日）
  and (/* 施設絞り込みするなら */ f.facility_name = any (array['コテージスターハウス今帰仁'])
       /* 全施設なら上の行を消して true */ )
  and f.application_date <= date '2026-06-18'                         -- :base_date 以前の申込のみ
  and not (f.reservation_type = 'キャンセル'
           and f.update_datetime < date '2026-06-18'::timestamp)     -- 基準日前にキャンセル確定したものは除外
group by f.channel, f.stay_month
order by f.channel, f.stay_month;
```

- **as-of の肝**: ①申込日 ≤ 基準日、②「キャンセル かつ 更新日 < 基準日00:00」は除外（＝基準日当日以降にキャンセルされたものは“まだオンハンド”として残す）。基準日は `00:00:00` 扱い。

### 3-4. 前年最終（確定実績）を再現

「前年最終(last)」と同じ条件（`008…:172-188`）。**as-of フィルタなし・キャンセルのみ除外**。

```sql
select f.channel,
       (f.stay_month + interval '1 year')::date as month,   -- 前年→当年の月に並べ替え
       sum(f.rooms) as rooms, sum(f.guests) as guests, sum(f.revenue) as revenue
from app.reservation_stay_fact f
where f.stay_month between date '2025-01-01' and date '2025-06-01'   -- 前年の :start ～ :end
  and f.reservation_type <> 'キャンセル'
group by f.channel, f.stay_month
order by f.channel, month;
```

> **前年同期(yoy)** は snap_revenue 優先＋fact フォールバックの合成ロジックで、手書きSQLでは再現が複雑（`008…:97-169`）。yoy の突合は **3-5 のRPC直叩き**を使うのが確実。

### 3-5. RPC を直接叩いてダッシュボードと一致確認（★突合の本命）

ダッシュボードが表示しているのと**完全に同じ値**が返る。当年/前年同期/前年最終が1発で出る。

```sql
select public.get_incoming_report(
  base_date   => date '2026-06-18',   -- 基準日
  start_month => date '2026-01-01',   -- 表示開始月（月初日）
  month_count => 6,                   -- 月数
  metric      => 'revenue',           -- 'rooms' | 'guests' | 'revenue'
  facility_names => array['コテージスターハウス今帰仁']  -- null で全施設
);
```

返却 JSON: `meta` / `months[]` / `rows[]`(channel・current[]・yoy[]・last[]) / `total` / `yoy_ratio[]`。
→ この `rows[].current[i]` 等が画面のセルと一致する。**3-3 の手書きSQLの合計と、このRPCの `total.current` が一致すれば突合OK**。

### 3-6. チャネル一覧（任意）

```sql
select * from public.list_channels(null);          -- 全施設のチャネル
select * from public.list_facilities();            -- 施設＋取込状況
```

---

## 4. 突合でズレる主因（チェックリスト）

| 確認点 | 内容 |
|---|---|
| **集計軸が滞在日** | チェックイン日でもチェックアウト日でもなく `stay_date`/`stay_month`。月をまたぐ予約は各滞在日に分散している |
| **as-of フィルタ** | 当年は「申込日≤基準日」「キャンセル&更新日<基準日 を除外」。基準日は 00:00 扱い。基準日がズレると一致しない |
| **前年同期は snap 優先** | `snap_revenue` にデータがある施設は snap を使う。fact だけ手集計すると yoy が合わない → RPCで確認 |
| **重複排除は ETL 済** | `rooms`/`guests` は 予約番号×滞在日 の `max`、`revenue` は `sum` 済。fact 上は1行=1予約ナイトなので、月集計は単純 `sum` でよい（再 dedup 不要） |
| **metric=ADR はRPCに無い** | RPC(008版)は `rooms/guests/revenue` のみ。**ADRはフロントで「売上÷室数」を計算**（`Math.floor`、室数0→0、合計行は加重平均）。SQLで突合するなら `sum(revenue)/sum(rooms)` |
| **売上の定義** | `revenue` = 大人+子供+幼児合計額（`料金合計額`や`その他合計額`は含まない）。新 webdashboard 仕様は `その他合計額` を加える点が異なる（突合時の差分要因） |
| **アクセス権** | `app.*` は anon/authenticated から見えない。REST/anonで0件になるのは正常。SQL Editor で見ること |

---

## 5. 参照ソース

**Supabase 定義（onhand-report リポジトリ）— `…/入込状況表まとめ(ねっぱん)/onhand-report/supabase/migrations/`**
- `001_create_schema.sql:12-48`（`app.reservation_stay_fact` 列定義・ユニーク制約）, `:53-67`（`facility_import_status`）, `:87-94`（app スキーマ権限剥奪）
- `002_create_rpc.sql:233-256`（`list_facilities`）, `:262-280`（`list_channels`）
- `006_create_snap_revenue.sql:7-32`（`app.snap_revenue`）
- `008_modify_get_incoming_report.sql:8-43`（RPCシグネチャ・metricバリデーション）, `:78-95`（当年）, `:97-169`（前年同期 snap優先+fallback）, `:172-188`（前年最終）, `:230-287`（返却JSON構造）

**Web（呼び出し側）**
- `onhand-report/web/lib/supabase.ts:57-89`（`getIncomingReport` / `listFacilities` の引数・戻り値型）

**集計式の定義**
- [neppan-csv-revenue-rooms-logic.md](neppan-csv-revenue-rooms-logic.md)（売上=大人+子供+幼児合計額、室数=max、滞在日=チェックイン+泊目-1 等）
