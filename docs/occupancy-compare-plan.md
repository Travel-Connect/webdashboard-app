# 稼働分析 比較タブ 実装プラン（前年実績 / 予算 / 指定日取込）

> 作成: 2026-06-24 ／ 対象: `/dashboard/occupancy`（稼働分析）の比較機能（Phase 2「比較モードセレクタ」）
> 確定スコープ: **① 指定日取込は後回し（前年＋予算を先に）／② 稼働分析のみ実装（比較ロジックは再利用可能なヘルパ化）**

## 0. ゴール

グローバル比較セレクタ（なし / 前年実績 / 予算 / 前回取込）の選択を稼働分析ページに反映し、
**前年実績**（実装済だが未配線）と **予算**（データはあるが未実装）を動作させる。
**指定日取込（previous_snapshot）はデータ基盤が未整備のため本プランの実装対象外**（別プランで扱う）。

## 1. 現状（調査で確定）

| モード | 型/契約 | API (`occupancy.ts`) | UI (`page.tsx`) | データ |
|---|---|---|---|---|
| 前年実績 | ✅ | ✅ `buildOccupancy` が前年再集計し `comparison{basis,metrics(6),rows}` 構築 | △ ページが `compareWith:"previous_year"` を固定上書き（セレクタ無効） | ✅ canonical 複数年 |
| 予算 | ✅ enum 定義済 | ❌ `budget` 分岐なし＝黙って無視（`comparison` undefined） | ❌ 到達不能 | ✅ `app.budgets`（月次・税込・施設×月） |
| 指定日取込 | ✅ enum 定義済 | ❌ `comparison:null` スタブ | ❌ | ❌ `mart.dashboard_snapshots` は空・書込コードゼロ |

- 共通封筒は整備済：`DashboardComparison{basis,metrics,rows}` / `MetricComparison{current,baseline,diff,rate}`（`lib/api/types.ts`）。型変更はほぼ不要。
- セレクタ UI（`filter-bar.tsx` `ComparisonSelector`）と URL 同期（`use-filters.ts` `compareWith`）は完成済。
- `cmp()` ヘルパと metrics 配列組立は `occupancy.ts` に**ローカル**（previous_year ブロックにハードコード）。

### 予算データの形（`app.budgets` / `app.room_inventory_months`）
- `app.budgets(facility_id, month[月初], budget_room_type[''=施設全体], budget_amount[税込], budget_room_nights[室数予算])`。**月次粒度のみ**。
- `app.room_inventory_months(facility_id, month, sellable_rooms_per_day, sellable_room_nights)`（稼働率/RevPAR の分母。`aggregate()` が既に読む）。
- 予算は **金額＋室数の2種のみ**。宿泊人数・客単価・平均人数の予算は存在しない。
- 予算は **税込固定**。`annualsales.ts` に `budgetAchievementRate = revenue/budget_amount` の既存実装あり（流用元）。

## 2. 確定済みの軽微判断（実装に織り込み）

- **月予算の日割り**：日次ビュー（月間モード）は日別予算が意味を持たないため、**日別行には予算差を出さず、合計行＋タイトルインサイトに集約**。年次ビュー（月別行）は月単位で予算差を表示。
  - 実装上は、月間モードの予算比較では3テーブル帯（日別）の代わりに **予算サマリーパネル（達成率・予算差・予算残）** を出す。年間モードは従来どおり3テーブル帯（中央=予算差・右=予算）。
- **税抜モード**：予算は税込のみ → 予算比較は**税込基準に固定**（`net` 選択時も予算側は税込。`annualsales` と同じ既存前提。画面に注記を出すか実装時に判断）。
- **「なし」の扱い**：稼働分析ページは従来から比較前提のため、`compareWith` 未指定/なしは **`previous_year` にフォールバック**（現行挙動を維持）。`予算`/`前回取込` を選んだ時のみ切替。

## 3. 予算 baseline の導出式

各期間粒度（月間=日別の合計、年間=月別）について施設スコープ内で集計：

| 指標 | 予算 baseline |
|---|---|
| 売上 roomRevenue | Σ `budget_amount` |
| 販売室数 soldRoomNights | Σ `budget_room_nights` |
| 販売可能室数 sellable | Σ `sellable_room_nights`（既存 `inv` 流用） |
| 稼働率 occupancyRate | soldRoomNights ÷ sellable |
| ADR | roomRevenue ÷ soldRoomNights |
| RevPAR | roomRevenue ÷ sellable |
| 宿泊人数 / 客単価 / 平均人数 | **null**（予算データ無し→画面「—」） |

達成率（タイトルインサイト用）= 当年 roomRevenue ÷ 予算 roomRevenue（`comparison.metrics` の `roomRevenue.{current,baseline}` から算出可。**型追加不要**）。

## 4. 実装タスク

### Phase 0 — セレクタ配線 + basis 汎用化（小・データ不要）
1. `app/dashboard/occupancy/page.tsx`：`occFilters` の `compareWith:"previous_year"` 固定上書きを撤廃し `filters.compareWith ?? "previous_year"` を渡す。
2. 比較基準を汎用化：`isPY` 専用判定 → `comparison.basis` 駆動。`hasCmp = comparison != null`。
3. ラベル解決ヘルパ `resolveCompare(basis, year)` を新設（中央/右列タイトル・sub・KPIラベル）：
   - `previous_year` → 中央「前年実績比 / 当年−前年」・右「前年実績 / {year-1}年」・KPI「前年」
   - `budget` → 中央「予算差 / 当年−予算」・右「予算 / {year}年 計画」・KPI「予算」
4. `kpi-strip.tsx`：`metrics` ラベルの「前年」を basis 駆動に（`occupancyRate`=pt差、他=%は現行ロジックのまま流用可）。
- **完了条件**：前年実績がセレクタ駆動で動作（固定上書き撤廃後も従来表示を維持）。

### Phase 1 — 予算比較（中・データあり）
5. **共通化リファクタ** `lib/api/compare.ts` 新設：`cmp()`（`occupancy.ts` から昇格）＋ `occupancyMetrics(current, baseline): MetricComparison[]`（6指標配列を関数化）。`previous_year` と `budget` で共用。
6. `lib/api/occupancy.ts`：`aggregateBudget(pool, f)` 新設（`app.budgets` を施設×月で集計、`annualsales.ts` の JOIN を流用、sellable は既存 `room_inventory_months` クエリを共用）。
   - 年間モード：月別 budget rows（右列の月別予算）。
   - 月間モード：日別 budget rows は作らず summary のみ（サマリーパネル用）。
7. `buildOccupancy`：`else if (f.compareWith === "budget")` を追加 → `aggregateBudget` の summary を baseline に `occupancyMetrics` で metrics 生成、`basis:"budget"`、`rows`=（年間=月別予算行 / 月間=空）。
8. UI：
   - `page.tsx` 帯：basis=`budget` かつ月間モード → **予算サマリーパネル**（達成率・予算差・予算残）。年間モード → 3テーブル帯（中央=予算差・右=予算）。
   - `page.tsx` タイトル行：basis=`budget` 時に「予算まで残り / 達成率」インサイト（Target アイコン、`comparison.metrics.roomRevenue` から算出）。
   - `compare-matrix.tsx` / `matrix.tsx`：予算 basis のラベル・tfoot（既存 dCell/footCell の符号色分けを流用。達成率列が要る場合は basis 駆動で追加）。
- **完了条件**：予算選択で達成率・予算差が出る。値が `annualsales`（同一施設×期間）と整合。

### 指定日取込（previous_snapshot）＝ 本プラン対象外（後回し）
- `occupancy.ts` は現状どおり `comparison:null` を返す。
- UI：`前回取込` 選択時は空表示でなく **「準備中（未対応）」プレースホルダ**を表示（`pytd` の UnconfirmedPanel 相当）。
- 別途プラン化：保存方式（毎朝バッチ→`dashboard_snapshots`）か動的 as-of（canonical 再集計＋基準日）の選択、基準日ピッカー、`FEATURE_NOT_ENABLED` ゲートが必要。**前向き蓄積前提で過去は遡れない**点に留意。

## 5. 検証

- `tsc --noEmit` / `eslint`。
- 実 DB（service-role）：予算選択時の達成率＝`annualsales` の `budgetAchievementRate` と一致（同一施設×年）。予算差＝売上−`budget_amount`。前年実績は既存値から不変（リグレッションなし）。
- ブラウザ目視（コルディオ施設・2026月間/年間）：なし/前年/予算の切替、サマリーパネル、横/縦スクロールなし（直近のレスポンシブ対応を維持）。
- 予算未登録の施設/年は「—」表示になること（コルディオ2025-26 以外）。

## 6. リスク / 留意

- 予算は施設別かつ `budget_room_type=''`（施設全体）粒度のみ。部屋タイプ別予算は未活用。
- `facilityId=all` の予算/稼働率はグループ内・在庫ありCordioのみの概算（既存の注意点と同じ）。
- 月間モードの予算 UX（サマリーパネル）はプロト（`screens-occupancy.jsx` の budget tfoot）とレイアウトが完全一致しない可能性 → 実装時にプロトと突合。
- セレクタはグローバルだが本実装は occupancy のみ。他タブは当面セレクタ無反応（スコープ確定済）。比較ロジックは `lib/api/compare.ts` に置き横展開可能にしておく。

## 7. 想定コミット分割

1. `refactor(api): extract cmp/occupancyMetrics to lib/api/compare.ts`
2. `feat(web): wire comparison selector + basis-driven labels (occupancy)`（Phase 0）
3. `feat(api): occupancy budget comparison (aggregateBudget + budget basis)`（Phase 1 API）
4. `feat(web): occupancy budget view — summary panel + achievement insight`（Phase 1 UI）
5. `feat(web): previous_snapshot placeholder (準備中)`（後回しの体裁）
