# 稼働分析 指定日取込（as-of スナップショット）実装プラン

> 作成: 2026-06-24 ／ 対象: `/dashboard/occupancy` の比較「指定日取込（previous_snapshot）」
> 確定スコープ: **方式=日次CSVスナップショット ／ バックフィル=月末＋直近のみ ／ 取込日選択=日付ピッカー（利用可能日に制限）／ 稼働分析のみ ／ minpakuIN施設のみ**

## 0. ゴール

現在のデータ（live mart）と、**指定した取込日（base.csv 取得日）時点**のデータを比較し、
その取込日以降の **ピックアップ（純増室数・売上）／キャンセル** を日次・月次で見えるようにする。
比較は前年実績と同じ「当年実績｜差分｜基準実績」の3列帯で表現する（snapshot は完全な行を持つため）。

## 1. 調査で確定した前提（重要）

- **199日分の日次 base.csv**（`…/minpakuIN-download/YYYYMMDD_base.csv`、2025-12-08〜2026-06-24、各~100MB）＋ 現行 `base.csv` が保存済み。これが as-of の真実データ。
- **minpakuIN CSV に「更新日時」列が無い**（16列: 施設名/チェックインコード/OTA予約番号/部屋利用日/部屋タイプ/合計人数/チェックアウト日/泊数/予約受付日/予約経路/消費税/宿泊費/部屋番号/合成キー/ステータス/国）。
  → onhand-doc の「現在 canonical を更新日時で as-of 再構築」は **minpakuIN では不可能**。**日次CSV方式が唯一正確**。
- 各CSVは**完全エクスポート**（キャンセル含む全予約、stay 2022+）、UTF-8。`snapshot_date` は**ファイル名**から取る（中にエクスポート日列は無い）。
- 既存パイプライン（`load-canonical.ts` → `refresh-marts.ts`）と検証済みフィルタをそのまま再利用できる。
  - ROOMS = `filter (where is_stay_night and not is_cancelled)`（室数・人数）
  - AMT = `filter (where fee_adjusted_gross_amount <> 0 and not is_cancelled)`（金額）

## 2. 方式: 日次CSVスナップショット（M1）

```
YYYYMMDD_base.csv
  → buildContext()+parseMinpakuinCsv()+buildMinpaku()  … 既存adapterでcanonicalをメモリ生成（live canonical不可侵）
  → 検証済み ROOMS/AMT FILTER で (facility_id, stay_date) 日次集計
  → mart.daily_facility_metrics_snapshot へ snapshot_date 付きで upsert
API: aggregate() の snapshot 版で as-of を集計 → comparison(basis=previous_snapshot)
UI: 当年実績 ｜ 指定日取込比(当年−as-of) ｜ 指定日取込実績(as-of時点)
```

## 3. データモデル（新規 migration）

```sql
-- mart.daily_facility_metrics に snapshot_date を足しただけの列構成
create table if not exists mart.daily_facility_metrics_snapshot (
  snapshot_date    date    not null,         -- 取込日（= base.csv ファイル名の日付, JST）
  facility_id      uuid    not null references app.facilities(id) on delete cascade,
  stay_date        date    not null,
  sold_room_nights numeric not null default 0,
  guest_count      integer not null default 0,
  gross_amount     numeric not null default 0,
  tax_amount       numeric not null default 0,
  net_amount       numeric not null default 0,
  primary key (snapshot_date, facility_id, stay_date)
);
create index on mart.daily_facility_metrics_snapshot (snapshot_date);
-- RLS: dashboard_snapshots と同様 facility scoped select（app.can_access_facility）
```

- 既存 `mart.dashboard_snapshots`(jsonb) は使わない（occupancy の `aggregate()` を素直に流用するには列志向の方が高速・低リスク）。将来クロスタブ as-of で再検討。
- 概算規模: live `daily_facility_metrics` ~1–2万行 × （月末6+直近30≈36スナップショット）≈ 数十万行。問題なし。

## 4. 取込パイプライン（新規 `scripts/db/load-snapshots.ts`）

`load-canonical.ts` を土台に流用：
1. 対象ファイル選択（**月末＋直近**）:
   - 各月の**月末スナップショット**（その月に存在する最大日付。例 2025-12→`20251231`, 2026-02→`20260228`）
   - **直近30日**の日次スナップショット
   - 常に最新（パリティゲート用）
   - ディレクトリは引数 or env（OneDrive ローカルパス。日本語パス可）。
2. 各ファイル: `decodeUtf8(readFileSync)` → `parseMinpakuinCsv` → aquaSplit 適用 → `buildMinpaku(parsed, ctx)`（`buildContext()` は live と同じ DB seed から構築）。
3. 日次集計（**検証済み FILTER と同一**）: canonical 行を一時ステージ（session TEMP table）へ投入 → `refresh-marts.ts` の daily 集計 SQL をそのまま実行し `snapshot_date` 定数付きで `…_snapshot` へ insert → TEMP drop。
   - 代替（高速化）: TS で (facilityId, stayDate) 集計（ROOMS/AMT を再現）し集計行のみ bulk insert。**パリティゲート**で担保（下記）。
4. 冪等: `delete from …_snapshot where snapshot_date=$D` → insert。既ロード `snapshot_date` は skip（resume 可）。
5. **ローカル運用**: CSV はユーザーの OneDrive 上 → 取込は**ローカル script**（既存 `load-canonical`/`refresh-marts` と同じ運用）。Vercel/cron からは到達不可。毎朝の新CSVは日次インクリメンタルで1ファイル追加投入。

### パリティゲート（バックフィル前に必須）
最新スナップショット（`20260624` 相当＝現行 `base.csv` と同一データ）の `…_snapshot` 集計が
live `mart.daily_facility_metrics` と **±0** であることを確認 → 集計ロジックの一致を保証してから残りを投入。
`scripts/verify/` に確認スクリプトを追加（既存 parity 群と同様）。

### ファイル名↔as-of日 の確定（実装時に検証）
`20260624_base.csv` の更新時刻が 06-23 ＝自動化のタイミング差の可能性。
各ファイルの**最大 `予約受付日(booked_at)` ≤ ファイル名日付** を検証し、ファイル名=as-of日 として確定（ずれていればオフセット補正）。

## 5. API

- `lib/api/types.ts`: `DashboardFilters.asOfDate?: string`（ISO `YYYY-MM-DD`）追加。`dashboardQuerySchema` に `asOfDate: z.string().date().optional()`。
- `lib/api/occupancy.ts`:
  - `aggregate(pool, f, year, snapshotDate?)` に任意 `snapshotDate` を追加。指定時は `from mart.daily_facility_metrics_snapshot d where d.snapshot_date=$X and …`（在庫 `room_inventory_months` は現マスタ共通）。それ以外は現状どおり live。
  - `buildOccupancy` の `previous_snapshot` 分岐を実装:
    ```
    const asOf = await resolveAsOfDate(pool, f);  // f.asOfDate or 既定=最新 snapshot_date < 当日(JST)
    if (asOf) { const snap = await aggregate(pool, f, f.year, asOf);
      res.comparison = { basis:"previous_snapshot", metrics: occupancyMetrics(cur.summary, snap.summary), rows: snap.rows }; }
    else res.comparison = null;  // スナップショット未投入 → フロントで「準備中/未投入」
    ```
- `/api/dashboard/snapshots`（新, 軽量）: `select distinct snapshot_date from …_snapshot order by 1 desc` を返す（ピッカーの選択肢）。
- 既定「前回取込」= `max(snapshot_date) where snapshot_date < current_date`。

## 6. UI

- `components/dashboard/filter-bar.tsx`: 比較=**指定日取込**選択時に **as-of 日付ピッカー**を表示（`/api/dashboard/snapshots` の利用可能日のみ選択可、既定=最新前日）。`useFilters` で `asOfDate` を URL 同期。COMPARISON ラベルを「前回取込」→「指定日取込」に調整（任意）。
- `app/dashboard/occupancy/page.tsx`: `basis="previous_snapshot"` → **前年実績と同じ3列帯を流用**（`ActualMatrix` + `CompareMatrix`）。
  - `resolveCompare(basis)` を拡張: 中央「指定日取込比 / 当年 − {asOf} 時点」・右「指定日取込実績 / {asOf} 時点」。
  - `OccKpiStrip` の `compareLabel` を `{asOf} 比` 等に。
  - 差分（当年 − as-of）＝ピックアップ。プロト同様、変化のあった stay_date を強調する余地あり（任意）。
- snapshot 未投入の施設/期間（ねっぱん等）は baseline 欠落 → 「—」。

## 7. フェーズ / コミット分割

1. `feat(db): daily_facility_metrics_snapshot table + RLS`（migration）
2. `feat(scripts): load-snapshots.ts（月末＋直近, 冪等, parity gate）` ＋ `scripts/verify/` 確認
3. （ローカル実行）パリティ確認 → 月末＋直近をバックフィル
4. `feat(api): occupancy as-of (asOfDate, aggregate snapshot 版, previous_snapshot 分岐) + /api/dashboard/snapshots`
5. `feat(web): as-of 日付ピッカー + previous_snapshot 3列帯 + ラベル`
6. （運用）日次インクリメンタル取込の手順化

## 8. 検証

- パリティ: 最新 snapshot 集計 == live `daily_facility_metrics` ±0。
- API: `previous_snapshot` で basis/metrics(6)/rows が返る。既定 as-of=最新前日。差分=当年−as-of。
- 突合例: アクアパレス北谷 2026-05 を当年 vs 直近 as-of で比較し、増減が妥当（新規予約/キャンセルの net）。
- `tsc` / `eslint` / ブラウザ目視（横/縦スクロール維持、日付ピッカー、3列帯）。
- 未投入日選択時のフォールバック表示。

## 9. リスク / 留意

- **バックフィルは重い**（各CSV ~545k行のパース＋adapter）。月末＋直近に限定して負荷を抑える。TEMP staging は確実だが遅い → TS集計＋パリティゲートで高速化可。
- **ファイル名↔as-of日**のオフセットは実装時に必ず検証（§4）。
- **在庫(sellable)は現マスタを両期間共通**で使用（capacity はブッキング状態に依らない）。稼働率差 = (sold_now − sold_asof)/sellable。
- **minpakuIN施設のみ**。ねっぱん（コテージ）は日次CSVが無く as-of 不可（baseline 欠落→「—」）。
- 税込/税抜は snapshot に gross/net 両方を保持するため `taxMode` 切替は live 同様に動作。
- 過去の価格変更も日次CSVが実値で捕捉するため、売上ピックアップも正確（動的as-of方式の弱点を回避）。

## 10. 将来拡張（本プラン対象外）

- 他タブ（経路/部屋タイプ/国籍/泊数/年間売上）への as-of 展開（snapshot mart を各 mart 分に拡張 or `dashboard_snapshots` jsonb 汎用化）。
- 日次インクリメンタル取込の自動化（ローカルのスケジュールタスク。毎朝の新 `base.csv` を `…_snapshot` に1日分追加）。
- 全199日フルバックフィル（任意の過去日比較が必要になった場合）。
