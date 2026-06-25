# Claude Design Prompt — Top Dashboard

最終更新: 2026-06-25

このドキュメントは、ログイン後に表示するトップダッシュボード1画面のUI/UXをClaude Designへ委任するための専用プロンプトである。

既存の `docs/claude-design-prompt.md` は、詳細分析、取込、管理、Excel差分検証を含む全画面向けプロンプトとして維持する。本ドキュメントでは、それらの画面は設計せず、トップダッシュボードだけを対象とする。

参照資料:

- `docs/web-dashboard-requirements.md`
- `docs/web-dashboard-detail-design.md`
- `docs/kpi-definitions.md`
- `docs/api-contract.md`
- `docs/master-data-spec.md`
- `docs/import-processing-spec.md`

本ドキュメントに明記されたトップダッシュボード固有要件は、参照資料内の一般的なUI記述より優先する。KPIの計算式については、参照資料と本ドキュメントが競合する場合、本ドキュメントの明示的な定義を採用する。

---

## Prompt

あなたは、B2B SaaS、ホテル・宿泊施設向けBI、経営・運用ダッシュボードに強いシニアUI/UXデザイナー兼フロントエンドエンジニアです。

minpakuIN、ねっぱん、手間いらずの予約データを共通テンプレートへ変換し、Supabase + Next.js + Vercelで提供する宿泊施設グループ向けWebダッシュボードについて、**ログイン後のトップダッシュボード1画面だけ**を設計してください。

内部のchain-of-thoughtは出力しないでください。代わりに、設計判断と短い根拠を要約してください。

詳細分析画面、取込画面、管理画面、ログイン画面、Excel差分検証画面は作成しないでください。ただし、トップダッシュボード上のリンク先として既存ルートを使用して構いません。

## Product Context

- 宿泊施設グループの経営・運用担当者が、売上、販売状況、顧客属性、予算達成状況を短時間で確認する業務ダッシュボード。
- 既存ExcelレポートからWebへ移行するため、数値、単位、比較対象、集計期間が迷わず読めることを重視する。
- 施設ユーザーは自施設だけを閲覧する。
- 管理者は全施設を選択でき、施設ごとにKPIカードの前年・予算表示を設定できる。
- rawデータには個人情報が含まれる可能性があるため、画面、モック、ログ、コード例に氏名、電話番号、住所、メールアドレスを使用しない。

## Technical Assumptions

- Framework: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS
- Icons: lucide-react
- Backend: Supabase Auth, Postgres, Storage, RLS
- Deployment: Vercel
- Locale: Japanese
- Currency: JPY
- Timezone: Asia/Tokyo
- 金額表示: 3桁区切り
- 比率表示: `%`
- 0除算または算出不能: `-`
- APIやDBの追加・変更は別工程。本プロンプトでは必要なUI contractを明確にする。

## Design Tone

既存の全画面向けデザイン方針を維持してください。

- 静かで実務的
- 高密度だが読みやすい
- Excelレポートから移行しても迷わない
- 数字の比較、異常値、未登録データがすぐ分かる
- ニュートラル基調
- 左サイドナビを維持
- モバイル対応
- マーケティングサイト風のhero、巨大な余白、派手なグラデーション、装飾的なオーブ、過剰なアニメーションは使用しない
- カード内に不要なカードを入れ子にしない
- 角丸は最大8px
- 色だけで状態を伝えない
- 数値の増減を自動的に「良い・悪い」と断定しない。業務上の評価ルールが定義されていない指標は、矢印、符号、テキストを中心に中立的に示す

### Color Direction

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
- Chart palette: blue、teal、amber、rose、violet、neutral grayを用途別に限定使用

紫、濃紺、ベージュ、茶色のいずれかに支配された配色や、装飾的なぼかし背景は避けてください。

## Page Scope

対象ルート:

```text
/dashboard
```

この画面には、次の5つの概要モジュールを配置してください。

1. 6つのKPIカード
2. 国籍別分析TOP10
3. 予算達成率ゲージ
4. 国内・海外比率
5. 経路別分析円グラフ

トップ画面だけで全詳細を見せようとせず、必要なカードには設定可能なテキストリンクを付け、既存の詳細分析画面へ誘導してください。

## App Shell and Global Filters

### Desktop

- 左サイドナビ
- 上部ヘッダー
- メインコンテンツ
- 12カラムグリッド

### Tablet

- 折りたたみ可能な左サイドナビ
- コンパクトなフィルターバー

### Mobile

- 上部バー
- メニューdrawer
- フィルターbottom sheet
- メインコンテンツは1カラム

### Header Elements

最低限、次を配置してください。

- 施設セレクター
- 対象年
- 対象月
- 月間／年間切替
- 税込／税抜切替
- データ最終更新日時
- validation warning badge
- user menu
- 管理者だけに表示する「表示設定」ボタン

期間切替の仕様:

- 月間: 対象年と対象月を使用
- 年間: 対象年を使用し、対象月は無効化または非表示
- 各カードは同じ施設・期間・税表示に連動

前年と予算は排他的なグローバル切替にしないでください。施設ごとの管理者設定に応じて、同じKPIカード内へ前年差と予算差を同時表示できる構造にしてください。

## Module 1 — KPI Cards

6つの小さなKPIカードを、トップダッシュボードの最優先領域にまとめて配置してください。

1. 売上
2. 販売室数
3. ADR
4. 同伴平均数
5. 平均泊数
6. キャンセル率

### Common KPI Card Pattern

各KPIカードは、次の情報構造を共通化してください。

- KPI名
- 現在実績
- 単位
- 対象期間ラベル
- 前年差
  - 実数差
  - 割合差
- 予算差
  - 実数差
  - 割合差
- 任意のテキストリンク
- loading、empty、error、comparison unavailable state

前年差と予算差は、該当KPIの管理設定とデータ可否に応じて個別に非表示にできること。非表示時に空の行や不自然な余白を残さないでください。

割合差の基本式:

```text
(current - baseline) / baseline
```

baselineが0またはnullの場合、割合差は `-` とする。

### KPI Definitions and Comparison Rules

| KPI | 現在実績 | 予算比較 | 前年比較 | 集計期間の基準 |
| --- | --- | --- | --- | --- |
| 売上 | 税表示に応じた補正後売上合計 | 予算表の売上予算 | 前年同期間の売上 | 宿泊月 |
| 販売室数 | `sum(sold_room_nights)` | 予算表の予算販売室数 | 前年同期間の販売室数 | 宿泊月 |
| ADR | `売上 / 販売室数` | **予算表シートのADR列を直接参照**。予算売上÷予算販売室数で再計算しない | 前年同期間のADR | 宿泊月 |
| 同伴平均数 | `宿泊人数 / 販売室数` | **予算表シートの同伴係数列を直接参照**。予算側も同じ定義 | 前年同期間の同伴平均数 | 宿泊月 |
| 平均泊数 | `販売室泊数 / 予約件数` | 予算値なし。予算比較は常に非表示 | 前年同期間の平均泊数 | チェックイン月 |
| キャンセル率 | `キャンセル予約件数 / 全予約件数` | 予算値なし。予算比較は常に非表示 | 前年同期間のキャンセル率 | チェックイン月 |

### Cancellation Rate Rules

- 予約は予約単位のdistinct countとする。
- 月をまたぐ予約でも、チェックイン月にだけ1件として計上する。
- 分子はチェックイン月のキャンセル予約件数。
- 分母はチェックイン月の全予約件数。キャンセル予約も全予約件数に含む。
- 年間表示は、月別キャンセル率の単純平均にしない。
- 年間の `キャンセル予約件数合計 / 全予約件数合計` で計算する。

### Budget Availability

- 売上: 予算表示可能
- 販売室数: 予算表示可能
- ADR: 予算表示可能
- 同伴平均数: 予算表示可能
- 平均泊数: 予算表示不可
- キャンセル率: 予算表示不可

平均泊数とキャンセル率について、管理画面上の予算トグルは表示しないか、理由付きでdisabledにしてください。

### KPI Action Links

カードごとにリンク文言とリンク先を設定できる設計にしてください。

初期リンク先:

| KPI | link |
| --- | --- |
| 売上 | `/dashboard/occupancy` |
| 販売室数 | `/dashboard/occupancy` |
| ADR | `/dashboard/occupancy` |
| 同伴平均数 | `/dashboard/occupancy` |
| 平均泊数 | `/dashboard/stay-nights` |
| キャンセル率 | リンクなし |

コンポーネントcontract:

```ts
export type DashboardCardAction = {
  label: string;
  href: string;
};

export type DashboardCardLinkProps = {
  action?: DashboardCardAction;
  isCardClickable?: boolean;
};
```

- `action` がある場合、カード下部などに明確なテキストリンクを表示できること。
- `isCardClickable=true` のカードだけ、カード全体をクリック可能にすること。
- カード全体がクリック可能な場合でも、内部の設定ボタンやリンクとのクリック競合を起こさないこと。
- カード全体をクリック可能にするかどうかはカード単位で変更可能にすること。

## Admin-only KPI Display Settings

管理者だけに、トップダッシュボードの「表示設定」ボタンを表示してください。

クリックすると、モーダルまたはドロワーで施設別設定を変更できるようにしてください。モーダルとドロワーのどちらが適切かは、デスクトップとモバイルの操作性を踏まえて提案してください。

設定UIに必要な項目:

- 対象施設
- KPI一覧
- 各KPIの「前年を表示」トグル
- 各KPIの「予算を表示」トグル
- 保存
- キャンセル
- 保存中
- 保存成功
- 保存失敗
- 未保存変更の警告

設定単位:

```text
施設 × KPI × 比較種別
```

例:

```ts
export type TopDashboardKpiId =
  | "revenue"
  | "soldRoomNights"
  | "adr"
  | "avgGuestsPerRoom"
  | "averageNights"
  | "cancellationRate";

export type KpiComparisonVisibility = {
  facilityId: string;
  kpiId: TopDashboardKpiId;
  showPreviousYear: boolean;
  showBudget: boolean;
};
```

平均泊数とキャンセル率は予算データが存在しないため、`showBudget` を有効化できない設計にしてください。

管理者以外には、表示設定ボタンと設定UIを表示しないでください。

## Module 2 — Nationality TOP 10

国籍別分析TOP10を、表形式で表示してください。

### Metric Switching

カード内のラジオボタンまたは同等の単一選択コントロールで、次を切り替えます。

- 売上
- 販売室数

選択中の指標に応じて、順位、値、表の見出しを切り替えてください。売上と販売室数の両方の状態をデザイン成果物に含めてください。初期選択値をUI仕様へ固定する必要はありません。

### Ranking Rules

- 選択中の指標の降順で上位10国を表示
- 11位以下を「その他」にまとめない
- 国籍不明・未設定は通常のTOP10から除外
- 国籍名、順位、選択中指標の値を最低限表示
- 長い国籍名でもレイアウトが崩れない
- 同順位や0件時の表示ルールを視覚的に破綻させない

### Unknown Nationality Toggle

「不明を表示」ボタンまたはトグルを付けてください。

- オフ: 不明・未設定を非表示
- オン: TOP10の順位と順位計算は変えず、ランキング外の独立行として「不明」を追加表示
- 不明を11位として扱わない
- 不明をTOP10へ割り込ませない

### Link

```text
label: 国籍別分析を見る
href: /dashboard/nationalities
```

## Module 3 — Budget Achievement Gauge

売上実績に対する売上予算の達成率をゲージチャートで表示してください。

### Formula

```text
budgetAchievementRate = actualRevenue / budgetRevenue
```

### Gauge Rules

- ゲージの視覚上の最大値は100%
- 100%を超えてもゲージは満杯のまま
- 中央の数値は実際の達成率を表示
- 例: 実績が予算の118%なら、ゲージは満杯、中央は `118%`
- 100%以上の場合は `🎉 予算を達成しました` のような、達成が明確に分かる絵文字入りテキストを表示
- 100%未満では、達成メッセージを表示しない。未定義の追加メッセージを推測して作らない

### Footer Text

カード下部に次の形式で表示してください。

```text
実績 ¥8,500,000 / 予算 ¥10,000,000
```

### Missing Budget

予算が未登録、null、または0の場合:

- カード自体を非表示
- 空のカード枠やプレースホルダーを残さない
- 周囲のカードが自動的に再配置され、グリッドに穴が空かない

### Link

```text
label: 年間売上を見る
href: /dashboard/annual-sales
```

月間表示時もリンク先は同じでよい。

## Module 4 — Domestic / International Ratio

国内・海外比率をカードで表示してください。

### Classification

- 国内: 国籍が日本
- 海外: 日本以外の国籍
- 不明・未設定: 常に表示対象外

不明・未設定は分子と分母の両方から除外し、国内と海外の合計を常に100%として表示してください。

このカードには「不明を表示」切替を付けないでください。

### Metric Switching

カード内で次の2項目を切り替えられるようにしてください。

- 売上
- 販売室数

選択中指標について、国内と海外の構成比を再計算してください。

地図には依存しないでください。コンパクトなドーナツ、100%積み上げバー、または同等の読みやすい表現から最適なものを選び、短い根拠を示してください。

色だけで国内・海外を識別させず、ラベル、割合、値を併記してください。

既知国籍のデータが0件の場合は、誤って国内0%・海外0%を100%として見せず、empty stateを表示してください。

### Link

```text
label: 国籍別分析を見る
href: /dashboard/nationalities
```

## Module 5 — Channel Analysis Pie Chart

経路別分析を円グラフで表示してください。ドーナツ型にする場合も、円グラフとしての構成比が直感的に読める設計にしてください。

### Metric Switching

カード内で次を切り替えられるようにしてください。

- 売上
- 販売室数

### Aggregation Rules

- 選択中の指標で降順に並べる
- 上位5経路を個別表示
- 6位以下は「その他」へ合算
- 指標を切り替えた場合は、上位5経路も再計算
- 売上の上位5と販売室数の上位5が異なることを前提にする

### Display Requirements

- 円グラフ
- 凡例
- 経路名
- 構成比
- 選択中指標の実数
- 「その他」の内容が上位5以外の合算であることが分かる表現
- 長い経路名への対応
- tooltipだけに重要情報を閉じ込めない
- 色だけに依存しない

### Link

```text
label: 経路別分析を見る
href: /dashboard/channels
```

## Suggested Information Hierarchy

次の優先順位を守りつつ、最適な12カラム配置を提案してください。

1. 施設、期間、税表示、更新状態
2. 6つのKPIカード
3. 国籍別TOP10
4. 予算達成率
5. 国内・海外比率
6. 経路別分析

国籍別TOP10は表の可読性を保てる十分な横幅を確保してください。予算達成率カードが非表示でも、他カードが不自然に拡大または孤立しない構成にしてください。

「全カードを同じ大きさにする」ことを優先せず、内容量と読みやすさに応じてカード幅・高さを設計してください。

## Responsive Requirements

### Desktop `>= 1280px`

- 左サイドナビ幅の目安: 240px
- 12カラムグリッド
- 6つのKPIをcompactに一覧できる
- 表とチャートのラベルを省略しすぎない

### Tablet `768px - 1279px`

- 折りたたみ可能なサイドナビ
- KPIカードは2〜3カラムを基本とする
- フィルターはコンパクトなツールバー
- 国籍表は必要に応じて横スクロール

### Mobile `< 768px`

- メインコンテンツは1カラム
- フィルターはbottom sheet
- KPIカードは数値、単位、比較値が折り返しで崩れないこと
- テーブルは重要列を優先し、必要なら横スクロール
- 円グラフ、ゲージ、凡例が画面外へはみ出さないこと
- 操作対象は十分なタップ領域を持つこと
- 管理者向け表示設定はfull-screen drawerまたは同等のモバイル向けUIを検討すること

以下の幅で表示確認を行ってください。

- 375px
- 768px
- 1024px
- 1440px

## State Design

各モジュールについて、次の状態を設計してください。

- default
- loading
- empty
- partial data
- error
- permission denied where applicable
- comparison hidden
- comparison unavailable

### Loading

- レイアウトシフトを抑えるskeleton
- KPIの桁幅、表の行数、グラフ領域を概ね維持

### Empty

例:

- 対象期間に実績なし
- 国籍データなし
- 経路データなし
- 既知国籍が0件

0を実績として表示する場合と、データが存在しない場合を視覚的に区別してください。

### Partial Data

例:

- 実績と前年はあるが予算がない
- 売上はあるが国籍が不明
- 一部経路だけmapping未設定

カード全体を壊さず、該当部分だけを `-`、badge、補足文で表現してください。ただし予算達成率カードは、予算が未登録または0ならカード自体を非表示にします。

### Error

1モジュールの取得エラーでトップダッシュボード全体を操作不能にしないでください。カード単位で再読み込みできる設計を提案してください。

## Accessibility

- WCAGを意識したコントラスト
- キーボード操作可能
- ラジオボタン、トグル、リンク、設定ボタンに明確なfocus state
- グラフはaria-labelまたは代替テキストを持つ
- 色だけで増減、国内・海外、経路、達成状態を表さない
- 絵文字だけで達成を伝えず、必ずテキストを併記
- 円グラフとゲージの情報を数値テキストでも読める

## Mock Data Guardrails

- すべてサンプル値と明記する
- 実在の宿泊者情報を使用しない
- 氏名、電話番号、住所、メールアドレスを使用しない
- raw CSVの値を表示しない
- 施設名は `サンプル施設A` などの架空名称を使用してよい
- 売上、予算、販売室数、国籍、経路は現実的だが架空の値を使用する
- 予算達成率が100%未満の状態と100%以上の状態を両方確認できるようにする
- 国籍不明の表示オフ／オン状態を両方確認できるようにする

## Component Structure

最低限、次の再利用可能コンポーネントを設計してください。

- `TopDashboardPage`
- `DashboardShell`
- `TopDashboardHeader`
- `FacilitySelector`
- `PeriodSelector`
- `PeriodModeToggle`
- `TaxModeToggle`
- `DataFreshnessBadge`
- `ValidationWarningBadge`
- `KpiGrid`
- `KpiCard`
- `MetricDelta`
- `CardActionLink`
- `NationalityTopTenCard`
- `UnknownNationalityToggle`
- `BudgetAchievementGaugeCard`
- `DomesticInternationalRatioCard`
- `ChannelSharePieCard`
- `MetricRadioGroup`
- `AdminDisplaySettingsButton`
- `KpiVisibilitySettingsPanel`
- `LoadingSkeleton`
- `EmptyState`
- `PartialDataNotice`
- `CardErrorState`

### Suggested TypeScript Contracts

```ts
export type PeriodMode = "monthly" | "yearly";
export type TaxMode = "gross" | "net";
export type SwitchableMetric = "revenue" | "soldRoomNights";

export type MetricDeltaValue = {
  baseline: number | null;
  absoluteDiff: number | null;
  percentageDiff: number | null;
};

export type KpiCardData = {
  id: TopDashboardKpiId;
  label: string;
  current: number | null;
  unit: "JPY" | "rooms" | "people" | "nights" | "percent";
  previousYear?: MetricDeltaValue | null;
  budget?: MetricDeltaValue | null;
  showPreviousYear: boolean;
  showBudget: boolean;
  action?: DashboardCardAction;
  isCardClickable?: boolean;
};

export type NationalityRankingRow = {
  rank: number;
  country: string;
  revenue: number;
  soldRoomNights: number;
};

export type UnknownNationalityRow = {
  country: "不明";
  revenue: number;
  soldRoomNights: number;
};

export type DomesticInternationalRatio = {
  metric: SwitchableMetric;
  domesticValue: number;
  internationalValue: number;
  domesticRate: number;
  internationalRate: number;
};

export type ChannelShareRow = {
  channel: string;
  value: number;
  rate: number;
  isOther: boolean;
};
```

型はUI contractのたたき台として使用し、必要であればより良い命名・構造を提案してください。ただし、確定済みのKPI定義や表示条件は変更しないでください。

## Output Expected From Claude Design

以下を順番に出力してください。

1. トップダッシュボードの設計判断と短い根拠
2. デスクトップ1440pxの情報設計
3. 1024px、768px、375pxのresponsive behavior
4. 5モジュールの配置とサイズ設計
5. 6つのKPIカードの共通パターン
6. 管理者向け施設別表示設定UI
7. 国籍別TOP10の売上／販売室数状態
8. 国籍不明の表示オフ／オン状態
9. 予算達成率100%未満／100%以上／予算なし状態
10. 国内・海外比率の売上／販売室数状態
11. 経路別円グラフの売上／販売室数状態
12. loading、empty、partial data、error state
13. design tokens
14. component tree
15. TypeScript propsとstate設計
16. Next.js + TypeScript + Tailwind CSSで実装可能なトップ画面コード案

コード案では、詳細画面、バックエンド、認証、データ取込を実装しないでください。モックデータを使い、トップダッシュボードの見た目、responsive behavior、interaction stateを確認できる状態にしてください。

## Guardrails

- トップダッシュボード以外の画面を設計しない
- landing pageを作らない
- 詳細分析画面の中身を作らない
- KPI定義を独自に変更しない
- 平均泊数とキャンセル率に存在しない予算値を作らない
- 予算ADRを `予算売上 / 予算販売室数` から再計算しない
- 予算同伴係数を別の式へ変更しない
- キャンセル率を月別率の単純平均で年間化しない
- 国籍不明を通常のTOP10へ混ぜない
- 国内・海外比率に国籍不明を含めない
- 経路別円グラフで6位以下を個別表示しない
- 予算なしの予算達成率カードを空枠として残さない
- 前年と予算を排他的な単一比較切替にしない
- 実在の宿泊者情報をモックへ使用しない
- rawデータや秘密情報を画面、コード、ログへ露出しない
