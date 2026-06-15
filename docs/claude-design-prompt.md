# Claude Design Prompt

このドキュメントは、Web ダッシュボードの UI/UX を Claude Design に委任するためのプロンプトである。
Claude Design へ貼り付ける際は、必要に応じて `docs/web-dashboard-requirements.md`、`docs/web-dashboard-detail-design.md`、`docs/kpi-definitions.md`、`docs/api-contract.md`、`docs/master-data-spec.md`、`docs/import-processing-spec.md` も参照資料として渡す。

## Prompt

あなたは B2B SaaS、ホテル・宿泊施設向け BI、業務ダッシュボードに強いシニア UI/UX デザイナー兼フロントエンドエンジニアです。

minpakuIN、ねっぱん、手間いらずの予約データを共通テンプレートへ変換し、Supabase + Next.js + Vercel で提供する Web ダッシュボードの全画面設計を作成してください。

内部の chain-of-thought は出力しないでください。代わりに、以下の段階ごとに「設計判断」と「短い根拠」を要約して出力してください。

1. 情報設計
2. ユーザー権限ごとの導線
3. ダッシュボード画面設計
4. 取込ミニアプリ画面設計
5. 管理・マスタ画面設計
6. Excel 差分検証画面設計
7. レスポンシブ設計
8. デザイントーンとデザインシステム
9. 実装コンポーネント構成

## Product Context

- 宿泊施設グループ向けの社内・施設向けレポートダッシュボード。
- 既存の Excel レポートを Web 化し、施設ごとの閲覧権限を付与する。
- 7つの指標をカードタイプの画面として表示する。
- 施設ユーザーは自施設の数値だけを閲覧できる。
- 管理者・取込オペレーターは raw 取込、マッピング、検証、commit を操作できる。
- raw CSV には個人情報が含まれる可能性があるため、画面・モック・ログに氏名、電話番号、住所、メールアドレスを表示しない。

## Technical Assumptions

- Framework: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS
- Icons: lucide-react
- Backend: Supabase Auth, Postgres, Storage, RLS
- Deployment: Vercel
- Locale: Japanese
- Currency: JPY
- Date timezone: Asia/Tokyo
- API contract は `docs/api-contract.md` に従う
- KPI definition は `docs/kpi-definitions.md` に従う

## Design Tone

デザインは、宿泊施設の経営・運用担当者が毎月、毎日使う業務ダッシュボードとして設計してください。

- 静かで実務的
- 高密度だが読みやすい
- Excel レポートから移行しても迷わない
- 数字の比較、異常値、未処理データがすぐ分かる
- マーケティングサイト風の hero、装飾的なグラデーション、巨大な余白、派手な演出は使わない
- カードは個別指標・反復項目・モーダルに限定し、カードの中にカードを入れない
- 角丸は最大 8px
- 主要操作には lucide-react のアイコンを使う
- ボタンやラベル内のテキストがモバイルでも折り返し・省略・崩れを起こさない

### Color Direction

単一色に寄りすぎない、業務ツール向けのニュートラル基調にしてください。

- Background: `#F6F7F9`
- Surface: `#FFFFFF`
- Primary text: `#172033`
- Secondary text: `#667085`
- Border: `#DDE2E8`
- Primary action: `#2563EB`
- Secondary accent: `#0F766E`
- Warning: `#D97706`
- Danger: `#DC2626`
- Positive: `#15803D`
- Chart palette: blue, teal, amber, rose, violet, neutral gray を用途別に限定使用

紫・濃紺・ベージュ・茶色に支配された配色、装飾的なオーブやぼかし背景は避けてください。

## User Roles

画面導線と表示制御は以下のロールを前提にしてください。

| Role | Main Capability |
| --- | --- |
| admin | 全施設閲覧、取込、commit、マスタ編集、ユーザー権限編集、Excel 差分検証 |
| operator | 付与施設の取込、validation、commit、マッピング確認 |
| viewer | 付与施設または全施設の閲覧のみ |
| facility_user | 自施設のダッシュボード閲覧のみ |

施設ユーザーには、取込、マスタ、ユーザー管理、raw preview、Excel 差分検証の導線を表示しないでください。

## Global App Shell

全画面共通のレイアウトを設計してください。

- Desktop: 左サイドナビ + 上部ヘッダー + メインコンテンツ
- Tablet: 折りたたみ可能なサイドナビ
- Mobile: 上部バー + メニュー drawer + フィルター bottom sheet

Header elements:

- 施設セレクター
- 期間セレクター
- 月間 / 年間切替
- 税込 / 税抜切替
- 比較対象切替: 前年、予算、前回 snapshot
- データ最終更新日時
- validation warning badge
- user menu

Navigation:

- ダッシュボード
- 稼働分析
- 経路分析
- 国籍別分析
- 泊数分布
- 部屋タイプ別分析
- 全施設年間売上
- ブッキングカーブ
- データ取込
- Excel 差分検証
- マスタ管理
- ユーザー・権限
- 設定

## Dashboard Screens

7指標は、それぞれ独立した画面としても、トップ画面のカード一覧からも遷移できるようにしてください。

トップ画面では、7指標をカード型の概要モジュールで表示してください。各カードには、主要 KPI、前年差分、予算差分、警告状態、詳細画面への遷移を入れてください。

### 1. 稼働分析

Route: `/dashboard/occupancy`

Tabs:

- 月間
- 年間

Main layout:

- KPI strip: 販売室数、販売可能室数、稼働率、残室、宿泊人数、売上、ADR、RevPAR、客単価
- Trend chart: 日別または月別の稼働率・売上・ADR
- Comparison table: 施設別 / 月別の数値
- Alert row: 稼働率低下、販売可能室数未登録、予算未登録

Design notes:

- 数値カードは compact にし、主値、単位、前年差、予算差を同じパターンで配置する
- 月間タブでは日次推移、年間タブでは月次推移を優先する

### 2. 経路分析

Route: `/dashboard/channels`

Tabs:

- 月間
- 年間

Main layout:

- Channel share stacked bar
- 経路別 table: 経路、売上、販売室数、予約数、構成比、ADR、RevPAR、前年差
- Top channel cards: Agoda、Booking.com、公式、電話などの主要経路
- Filter: channel group, OTA / Direct / Other

Design notes:

- 経路名が長くても崩れない table cell を設計する
- 構成比は bar-in-cell で視認性を上げる

### 3. 国籍別分析

Route: `/dashboard/nationalities`

Main layout:

- Summary: 国内比率、海外比率、主要国籍、平均リードタイム
- Ranking table: 国籍、予約数、販売室数、宿泊人数、売上、ADR、平均リードタイム
- Horizontal bar chart: 国籍別構成比
- Unknown / 未設定 bucket を明示

Design notes:

- 地図に依存しない。国籍別の比較と順位が読みやすい画面にする
- 国籍名は日本語表示と ISO code の併記を検討する

### 4. 泊数分布

Route: `/dashboard/stay-nights`

Main layout:

- Metric segmented control: 予約数、販売室数、売上、ADR、宿泊人数
- Distribution chart: 1泊、2泊、3泊、4泊、5泊、6泊、7泊以上
- Bucket table: bucket、予約数、販売室数、売上、ADR、構成比
- Insight row: 連泊率、平均泊数

Design notes:

- bucket 幅を固定し、モバイルでは横スクロール可能にする
- ADR が算出不能な bucket は `-` 表示にする

### 5. 部屋タイプ別分析

Route: `/dashboard/room-types`

Main layout:

- Room type performance table
- Horizontal comparison bars: 売上、販売室数、ADR
- Budget room type mapping warning
- Facility / room type drilldown

Design notes:

- 部屋タイプ名が長い前提で、2行まで表示し、それ以上は tooltip
- マッピング未設定は warning badge で明示する

### 6. 全施設年間売上

Route: `/dashboard/annual-sales`

Main layout:

- Year summary: 全施設売上、前年差、予算達成率、施設数
- Facility ranking table
- Monthly heatmap: 施設 x 月
- Area / facility group selector
- Export action

Design notes:

- 管理者・viewer 向けの横断画面。facility_user には表示しない、または自施設のみの年間売上画面として制限する
- heatmap は色だけに依存せず、数値と tooltip を付ける

### 7. ブッキングカーブ

Route: `/dashboard/booking-curve`

Main layout:

- Lead time curve chart: 予約作成日から宿泊日までの日数 bucket
- Comparison: current vs previous year / previous snapshot
- Summary: 当月最終着地見込み、現時点販売室数、残室、前年差
- Bucket table: lead time bucket、累計販売室数、累計売上、予約数

Design notes:

- bucket 値は `is_valid_lead_time=true` の `sold_room_nights` 累計として扱う
- previous snapshot が利用できない場合は feature unavailable state を表示する

## Import Mini App Screens

Route group: `/imports`

### Import List

- batch list table
- source system filter: minpakuIN、ねっぱん、手間いらず
- status filter: uploaded, parsing, parsed, validation_failed, validated, committing, committed, failed, cancelled
- latest batch summary
- actions: 新規取込、詳細、再検証、commit

### New Import Wizard

Steps:

1. Source selection
2. File upload
3. Facility mapping preview
4. Parsed preview
5. Validation result
6. Commit confirmation
7. Completion

Design requirements:

- raw の氏名、電話番号、住所、メールアドレスを preview に出さない
- validation error は行番号、項目名、原因、対応方法を表示し、PII 値は表示しない
- commit 前に対象施設、対象月、追加件数、更新件数、除外件数、warning 件数を確認する
- 同時 commit 中は操作を disable し、進捗状態を表示する

## Admin Screens

Route group: `/admin`

### Facilities

- facilities table
- facility_id、表示名、エリア、有効状態
- source facility mapping summary
- missing mapping alerts

### Source Facility Mappings

- PMS 別施設名を内部 facility_id に紐付ける
- duplicate / unmapped state を明示する

### Room Type Mappings

- source room type、normalized room type、budget room type
- facility scope
- unmapped warning

### Channel Mappings

- source channel、normalized channel、channel group
- fee adjustment rule link

### Country Mappings

- raw nationality、country code、display name、domestic / international

### Budgets

- facility、year_month、budget amount、budget room nights、budget ADR
- CSV import / inline edit

### Room Inventory

- facility、year_month、sellable room nights
- 稼働率・残室・RevPAR の分母に使うため、未登録を強く警告する

### Fee Adjustment Rules

- channel / source system / effective date
- gross multiplier
- adjusted gross / net / tax の説明表示

### Users and Facility Permissions

- user list
- role
- allowed facilities
- last sign-in
- invitation status

## Excel Difference Validation Screen

Route: `/validation/excel-diff`

Purpose:

既存のコルディオレポート Excel と Web mart/API の数値差異を確認する。

Main layout:

- Validation run list
- Upload / select Excel reference file
- Target period / facility selector
- Result summary: pass, warning, failed
- Difference table: sheet, metric, facility, period, Excel value, Web value, diff, tolerance, status
- Drilldown: API payload reference, mart row reference, formula reference

Design requirements:

- 差分が許容範囲内かを status badge で明示する
- 金額は 1 円以内、比率は 0.01pt 以内などの tolerance を表示する
- 個人情報や raw row の値は表示しない

## Settings / Audit

Route: `/settings` or `/admin/audit`

- system status
- latest mart refresh
- latest import commit
- snapshot availability
- audit log: user, action, target, timestamp, result
- no secret values, no raw payload

## Responsive Rules

Desktop `>= 1280px`:

- 12 column grid
- sidebar width 240px
- KPI cards 4-6 per row depending on content
- data tables use full width

Tablet `768px - 1279px`:

- collapsible sidebar
- KPI cards 2-3 per row
- filters in compact toolbar

Mobile `< 768px`:

- 1 column layout
- filters in bottom sheet
- tables become horizontally scrollable with sticky first column
- charts keep minimum width and allow horizontal scroll if necessary
- destructive or commit actions require confirmation modal
- primary actions remain reachable without overlapping fixed bars

## Component Requirements

Design reusable components:

- AppShell
- SidebarNav
- HeaderFilterBar
- FacilitySelector
- PeriodSelector
- TaxModeToggle
- ComparisonSelector
- DataFreshnessBadge
- KpiCard
- MetricDelta
- ChartPanel
- DataTable
- EmptyState
- LoadingSkeleton
- ErrorState
- PermissionDeniedState
- ValidationBadge
- ImportStatusBadge
- ImportWizard
- MappingTable
- ConfirmCommitModal
- AuditLogTable

Each component must have:

- default state
- loading state where applicable
- empty state where applicable
- error state where applicable
- mobile behavior

## Output Expected From Claude Design

以下を出力してください。

1. 全体の情報設計
2. ルート一覧
3. 画面ごとのレイアウト説明
4. ロールごとの表示制御
5. デザイントーン、色、typography、spacing、border、radius の design tokens
6. 主要コンポーネント一覧
7. responsive behavior
8. loading / empty / error / permission denied states
9. Next.js + TypeScript + Tailwind CSS で実装する場合の component structure
10. 可能であれば、最初に実装するべき dashboard shell と 7指標カードのコード案

## Guardrails

- 実在の宿泊者名、電話番号、住所、メールアドレスをモックデータに使わない
- raw CSV の列値を画面に露出しない
- 施設名や売上数値はサンプル値として扱い、実データに依存しない
- API schema は `docs/api-contract.md` の型を優先する
- KPI formula は `docs/kpi-definitions.md` を優先する
- 画面の見た目だけでなく、権限、未登録マスタ、validation warning、再取込状態を UI に含める
- landing page は作らない。ログイン後は業務ダッシュボードを最初の画面にする
