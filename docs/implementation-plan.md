# 宿泊BIダッシュボード（コルディオグループ）実装実行計画書

ステータス: ビジュアルデザイン完成後 / アプリ本体未着手 / 一次資料（プロトタイプ精読）+ 横断分析 4 本 統合版
前提: 日本語UI / JPY / Asia/Tokyo / Next.js App Router + TypeScript + Tailwind + lucide-react + Supabase(Auth/Postgres/Storage/RLS) + Vercel

---

## 1. エグゼクティブサマリ

- **何を作るか**: コルディオグループ（沖縄の宿泊施設群）向け宿泊BIダッシュボード。既存コルディオ Excel レポートを Web 化し、稼働・経路・国籍・泊数・部屋タイプ・全施設年間売上・ブッキングカーブの 8 分析画面＋取込/検証/マスタ/権限/設定の運用画面を、ロール別 RLS 制御で提供する。
- **リポジトリ現状**: `C:\dev\webdashboard-app` は `.git` / `README.md` / `.gitignore` / `docs/` のみで、Next.js アプリ本体は未生成。詳細設計（D01-D11）・要件（R01-R11）・api-contract / kpi-definitions / master-data-spec / import-processing-spec / claude-design-prompt の各仕様は `docs/` に揃っている。
- **プロトタイプが提供したもの**: `docs/webdashboard-app2/project/app/` 配下に Claude Design 出力の HTML+JSX(Babel standalone) モック。デザイントークン（`tokens.css`）、共通プリミティブ 12 種（`ui.jsx`）、AppShell/SidebarNav/HeaderFilterBar（`shell.jsx`/`appshell.jsx`）、自前 SVG チャート 4 種（`charts.jsx`）、実データ駆動の作り込み済み画面（稼働・経路・国籍・泊数・部屋タイプ・全施設年間・ブッキングカーブ）、運用系 9 ルートのプレースホルダ（`RoadmapScreen`）。
- **本計画の方針**: (1) プロトの**視覚出力のみを再現**し内部構造（`window`グローバル/Babel/自前switch/`/1.1`税抜ハードコード）は移植しない（README 指示）。(2) 既存 D01-D11 を捨てず、デザイン確定を踏まえ **M0-M22 に再分解・並べ替え**。(3) **API契約凍結 → フロント先行（mock adapter）→ バックエンド差し込み**のハイブリッドで、`lib/dashboard/client.ts` の fetcher 1 点で mock↔live を切替える。(4) `.env.local` は新規作成のみ・以後不可侵、PW/Token/PII を成果物・ログ・モックに出さない。

---

## 2. プロトタイプの理解（digest 根拠の事実）

### 2.1 技術構成（移植時に全廃する前提構造）
- ブラウザ内 Babel standalone。各 JSX は ESM ではなく `Object.assign(window, {...})` でグローバル結線。`React`/`ReactDOM`/`window.lucide` は CDN UMD 前提。
- ルーティングは `route` 文字列の `switch` 疑似ルーター。ルートID = `dashboard / occupancy / channels / nationalities / stay-nights / room-types / annual-sales / booking-curve`、未実装は `RoadmapScreen` フォールバック。
- 状態は `App` 内 `useState` + localStorage `stayBI.v1`（`{route, role, facility, period, range, tax, comparison, cmpDate}` を保存、`viewport` 除外）。
- `tweaks-panel.jsx` は**デザイン編集モード専用（製品外）**。`TWEAK_DEFAULTS`（`topLayout`/`kpiDelta`）も製品では固定値化。

### 2.2 画面・コンポーネント（作り込み度）
| 区分 | 実体 | 状態 |
|---|---|---|
| トップ概要 | `TopDashboard`/`OverviewCard`/`AlertStrip`（`KPI_OVERVIEW` 7件・`OCC_ALERTS` 3件） | 完全（3レイアウト×3デルタは tweaks 由来→本番1案確定要） |
| 稼働分析 | `OccupancyScreen`→`MonthlyFit`/`AnnualOcc`/`MonthlyMobile`/`AllFacilitiesOcc`。KPIストリップ9指標・当年/比較/比較対象の3列マトリクス | 骨格完全。**トレンド折れ線は未実装**（表のみ） |
| 経路分析 | `ChannelsScreen`→`ChannelsMonthly`(施設×経路)/`ChannelsAnnual`(経路×月) | 骨格完全。stacked bar / Top channel cards / group filter は未実装 |
| 国籍別分析 | `NationalitiesScreen`/`NatMatrixTable`（6指標 国籍×月） | 骨格完全。Summary / Ranking / ISO併記 は未実装 |
| 泊数分布 | `StayNightsScreen`（4指標×当年/前年、Excel忠実再現、部屋タイプslicer） | 完全（分布チャート/Insight行は未） |
| 部屋タイプ別 | `RoomTypesScreen`/`RtMatrixTable`（5指標 部屋タイプ×月、ヒートマップ） | 完全（横棒比較/予算マッピングUIは未。`RT_INV_TOT`2タイプ固定・365固定バグ有） |
| 全施設年間売上 | `AnnualSalesScreen`/`AfTable`（施設×月 12×15、4指標） | 骨格完全。heatmap/ranking/area selector/summary は未。2026固定 |
| ブッキングカーブ | `BookingCurveScreen`（12 lead-time bucket、二軸 `MultiLineChart`） | 骨格完全。snapshot比較/着地見込みSummaryは未。**ADR/売上カーブは KPI§8 と矛盾** |
| 運用系9ルート | `imports`/`validation/excel-diff`/`admin/masters`/`admin/users`/`settings` ほか | スタブ（`ROADMAP` 辞書の desc/bullets のみ。権限ゲートは実装済） |

### 2.3 共通プリミティブ（`ui.jsx` 12 種・全 props 確定）
`Btn`(5 variant) / `Badge`(6 tone, dot, icon) / `MetricDelta`(invert/muted) / `Segmented`(string[]・{value,label}両対応) / `Tabs`(underline) / `Panel`(title/sub/actions/pad) / `EmptyState` / `LoadingSkeleton`(`.skel`依存) / `PermissionDeniedState` / `ValidationBadge` / `ImportStatusBadge`(9状態) / `useMultiMetric`(Ctrl/⌘複数選択)。シェル系 = `AppShell`/`SidebarNav`/`HeaderFilterBar`/`FacilitySelector`/`PeriodSelector`/`ComparisonSelector`/`TaxToggle`/`DataFreshnessBadge`/`UserMenu`。チャート系 = `ComboChart`/`MultiLineChart`/`Sparkline`/`BarCell`（全自前SVG・固定viewBox・hover/dual-axis）。

### 2.4 デザイントークン（`tokens.css` :root 実値・検証済み）
- Surfaces: `--bg #F6F7F9` / `--surface #FFFFFF` / `--surface-2 #FBFCFD` / `--surface-3 #F1F3F6`
- Text: `--text #172033` / `--text-2 #667085` / `--text-3 #97A0AE`
- Lines: `--border #DDE2E8` / `--border-strong #C7CFD8`
- Semantic（base+weak）: `--primary #2563EB`/`--primary-weak #EAF1FE`/`--primary-ink #1D4FD7`、`--accent #0F766E`/`--accent-weak #E5F2F0`、`--warning #D97706`/`--warning-weak #FCF1E2`、`--danger #DC2626`/`--danger-weak #FCEBEB`、`--positive #15803D`/`--positive-weak #E7F3EC`
- Chart: `--c-blue #2563EB` / `--c-teal #0F766E` / `--c-amber #D97706` / `--c-rose #E11D6F` / `--c-violet #7C3AED` / `--c-gray #94A3B8`
- Radius（max 8px）: `--r-sm 4` / `--r-md 6` / `--r-lg 8`（px）
- Shadow: `--shadow-card`/`--shadow-pop`（2種のみ・抑制的）
- Spacing: `--s1..--s8`（4/8/12/16/20/24/32/40px）
- Layout: `--sidebar-w 240` / `--sidebar-w-collapsed 64` / `--header-h 56` / `--filterbar-h 52`（px）。fit高さ = `calc(100dvh - 152px)`
- Type: `--font`（Inter + 日本語OSフォント）/ `--num`、body `font-size 14px / line-height 1.45`、`.tabular`(tnum) 多用
- トークン外色（要新規トークン化）: `#ED7D31`(BC前年線)、`#86efac`/`#fca5a5`(primary KPI 白背景デルタ)。`.skel` クラスは**プロトCSS未定義→新規作成必須**。

---

## 3. 技術スタックと初期スキャフォールド

### 3.1 スキャフォールド（単独 commit / ユーザー承認後）
ASCII パス（現パスは適合）。`docs/` 温存。

```bash
# repo ルートで実行（src dir なし・App Router・Tailwind・TS・ESLint・alias @/*）
npx create-next-app@latest . --ts --app --tailwind --eslint --import-alias "@/*" --no-src-dir --use-npm
```
- `.gitignore` は**マージ要確認**（`.env.local` 無視を絶対に消さない）。`README.md`/`docs/`/`.git` は生成物と名前衝突しない。
- Tailwind は v4（`@tailwindcss/postcss` + `@theme`）。`tokens.css` を `app/globals.css` に逐語移植し `@theme inline` で `var(--*)` 参照。

### 3.2 ディレクトリ構成（詳細設計 §2 を実体化）
```text
app/
  (auth)/                          # Supabase email/password（初期）
  (dashboard)/
    layout.tsx                     # AppShell
    dashboard/page.tsx             # トップ概要
    occupancy|channels|nationalities|stay-nights|room-types|annual-sales|booking-curve/page.tsx
    imports/ , imports/new/ , imports/[batchId]/{preview,validate,commit}/
    admin/{masters,users}/ , validation/excel-diff/ , settings/
  api/
    dashboard/{occupancy,channels,nationalities,stay-nights,room-types,annual-sales,booking-curve}/route.ts
    imports/{raw-files,[batchId]/{parse,validate,commit}}/route.ts
    facilities/route.ts            # 契約に無い→新設（§5.8）
components/
  ui/                              # ui.jsx 由来プリミティブ
  shell/                           # appshell.jsx + shell.jsx 由来
  charts/                          # charts.jsx 由来（自前SVG）
  dashboard/ , imports/
lib/
  utils.ts                         # cn(): clsx+tailwind-merge
  format.ts                        # fmtInt/fmtYen/fmtYenC/fmtPct/fmtPt/fmtDelta + 税抜定数
  nav.ts                           # NAV/ROLES/navVisibleForRole/COMPARISONS
  api/{types.ts,client.ts,endpoints.ts}   # 契約型・fetcher抽象・pathビルダー
  viewmodels/                      # 契約型→画面表示モデル（純関数）
  supabase/{client.ts,server.ts,service.ts}
  adapters/{types.ts,canonical-schema.ts,minpakuin.ts,neppan.ts,temairazu.ts}
  aggregations/ , validation/
hooks/{use-multi-metric.ts,use-viewport.ts}
mocks/{fixtures/,builders.ts,handlers.ts,index.ts}
scripts/powershell/{fetch-neppan.ps1,upload-raw-file.ps1,run-import.ps1}
scripts/validate-excel/compare-dashboard.ts
supabase/{migrations/,seed/}
docs/                              # 既存温存
```

### 3.3 依存パッケージ（初期）
| 用途 | パッケージ | 備考 |
|---|---|---|
| アイコン | `lucide-react` | digest の lucide 名をそのまま import。`Icon` 文字列ラッパは name→component 対応表に集約 |
| Supabase | `@supabase/supabase-js`, `@supabase/ssr` | App Router SSR |
| 検証/型 | `zod` | api-contract・canonical・validation を Zod 共有 |
| UI 補助 | `clsx`, `tailwind-merge`, `class-variance-authority` | `cn()` と CVA variant |
| チャート | **自前SVG（charts.jsx 移植）** | recharts等は入れない（モックと視覚差防止） |
| テスト | `vitest` + `@testing-library/react` | adapter/format/schema 単体 |
| Excel検証 | `xlsx`(SheetJS) | excel-ops スキル既定（Python 選択も可） |
| データ取得 | （v0不要）後段 `swr` 任意 | 初期は Server Component fetch + fetcher 抽象 |

### 3.4 Supabase ローカル
- `supabase init` → `supabase start`（Docker Desktop 必須）。`supabase/migrations/` に SQL、`supabase db reset` で検証（D01 手順）。
- 開発用 service role key はローカル CLI 出力を `.env.local` の**サーバー専用変数**へ。`NEXT_PUBLIC_` を絶対に付けない。本番プロジェクトとは別、リンクは Vercel デプロイ時。

### 3.5 環境変数方針（.env.local 保護を最優先）
**鉄則: `.env.local` は新規作成のみ。上書き・削除・`git checkout`/`stash`/`reset --hard` での巻き戻し禁止。** 破壊的 git 操作前に `.env.local` が `.gitignore` 対象（untracked）であることを必ず確認。

| 変数 | 公開範囲 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ブラウザ可 | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ブラウザ可 | anon key（RLS前提） |
| `SUPABASE_SERVICE_ROLE_KEY` | **サーバーのみ** | import commit / mart refresh / seed。`NEXT_PUBLIC_` 厳禁 |
| `DASHBOARD_DATA_SOURCE` | サーバーのみ | `mock` / `live` 切替 |
| `NEXT_PUBLIC_USE_MOCK` | ブラウザ可 | クライアント fetcher の mock 切替（MSW 不使用時） |

`.env.example` に全変数をダミー値（`YOUR_KEY_HERE`）で列挙。`.env.local` は各自管理・Git管理外。

---

## 4. デザインシステム移植計画

### 4.1 トークン → globals.css / Tailwind（二層構成）
`app/globals.css` の `:root` に `tokens.css` 実値を逐語転記し、Tailwind theme は `var(--*)` を**参照**する（値の二重管理回避）。

| プロト変数 | 値 | Tailwind theme キー |
|---|---|---|
| `--bg` | `#F6F7F9` | `colors.background` |
| `--surface` / `-2` / `-3` | `#FFFFFF` / `#FBFCFD` / `#F1F3F6` | `colors.surface.{DEFAULT,2,3}` |
| `--text` / `-2` / `-3` | `#172033` / `#667085` / `#97A0AE` | `colors.text.{DEFAULT,2,3}` |
| `--border` / `--border-strong` | `#DDE2E8` / `#C7CFD8` | `colors.border.{DEFAULT,strong}` |
| `--primary` / `-weak` / `-ink` | `#2563EB` / `#EAF1FE` / `#1D4FD7` | `colors.primary.{DEFAULT,weak,ink}` |
| `--accent` / `-weak` | `#0F766E` / `#E5F2F0` | `colors.accent.{DEFAULT,weak}` |
| `--warning` / `-weak` | `#D97706` / `#FCF1E2` | `colors.warning.{DEFAULT,weak}` |
| `--danger` / `-weak` | `#DC2626` / `#FCEBEB` | `colors.danger.{DEFAULT,weak}` |
| `--positive` / `-weak` | `#15803D` / `#E7F3EC` | `colors.positive.{DEFAULT,weak}` |
| `--c-blue/teal/amber/rose/violet/gray` | 上記実値 | `colors.chart.{blue,teal,amber,rose,violet,gray}` |
| `--r-sm/md/lg` | 4/6/8px | `borderRadius.{sm,md,lg}`（**既定radius破棄しこの3段のみ**） |
| `--shadow-card/pop` | 実値2種 | `boxShadow.{card,pop}` |
| `--sidebar-w(-collapsed)/--header-h/--filterbar-h` | 240/64/56/52px | `width/height/spacing` 拡張 + fit高さは `h-[calc(100dvh-152px)]` |
| `--font` / `--num` | Inter+NotoJP / Inter | `fontFamily.{sans,num}`。`next/font` で Inter + Noto Sans JP を `--font-inter`/`--font-noto-jp` 注入 |

**新規トークン化（二重管理解消）**: `--c-orange:#ED7D31`（BC前年線）、`--delta-up-on-dark:#86efac`/`--delta-down-on-dark:#fca5a5`（primary KPI 白背景デルタ）。**RGB直書き `37,111,219`（`STAY_VIO`/`RT_TEAL`/`AF_VIO`/`BC_VIO`/`CH_BLUE`/`NAT_VIO`、命名と実値不一致）は全て `--primary` 由来に統一**し、半透明は `bg-primary/[0.08]` 等で再現。

**globals.css 逐語移植規則**: `.tabular`(tnum) / `.mono` / quiet scrollbar / `:focus-visible outline 2px var(--primary)` / `button{font-family:inherit;cursor:pointer}`。**新規追加**: `.skel`（keyframes `skel` + linear-gradient シマーアニメ。プロト未定義のため `LoadingSkeleton` 用に作成）。

### 4.2 shadcn 導入時の衝突回避
| 論点 | 対応 |
|---|---|
| トークン名衝突 | shadcn 生成の `--primary`/`--primary-foreground`/`--background`/`--ring`/`--radius` を**プロト値で上書き**。`--primary-foreground:#fff`/`--ring:var(--primary)`/`--radius:8px` をエイリアス追加 |
| radius 3段 | `--radius:8px` を置きつつ `rounded-sm/md/lg` を `--r-sm/md/lg` に再マップ |
| focus ring 二重発火 | プロトの outline 方式に統一、shadcn の `ring` は無効化 or 値を揃える |
| dark mode | 非対象。`.dark` は空 or 無視 |

### 4.3 プリミティブ → shadcn / 自作 対応と構築順
判断基準: a11y/インタラクションを持つ汎用部品は shadcn ベース（Radix）、ドメイン固有の表示専用は自作（見た目厳密再現）。全インラインスタイル → Tailwind class + `cn()` へ機械翻訳。

| プロト | 方針 | ベース |
|---|---|---|
| `Btn` | shadcn `Button` 拡張（5 variant/2 size、accent/danger 追加） | button(CVA) |
| `Badge` | shadcn `Badge` を 6 tone CVA 化（rounded-full, dot, icon） | badge |
| `Tabs` | shadcn `Tabs` underline variant | tabs(Radix) |
| `Segmented` | **自作**（string[]・{value,label}両対応、フィルタバー多用で最優先安定化） | — |
| `MetricDelta`/`ValidationBadge`/`ImportStatusBadge`/`Panel`/`EmptyState`/`LoadingSkeleton`/`PermissionDeniedState` | **自作**（ドメイン固有・余白厳密再現） | （`Panel`は shadcn Card 余白差のため自作推奨） |
| `Dropdown`/`MenuItem` | shadcn `DropdownMenu`/`Popover` 置換（手書きportal廃止、衝突回避/フォーカストラップ獲得） | dropdown-menu/popover |
| `FilterButton`/各Selector/`SidebarNav`/`AppShell`/`HeaderFilterBar` | **自作** | モバイルは shadcn `Sheet`(bottom) |
| `ComboChart`/`MultiLineChart`/`Sparkline`/`BarCell` | **自作SVG逐語移植** | 外部ライブラリ不使用踏襲 |
| `useMultiMetric` | **自作フック** `hooks/use-multi-metric.ts` | — |

**構築順（依存の浅い順 / レイヤ0→4）**:
- **L0 基盤**: `globals.css`(tokens) → `tailwind.config`/`@theme` → `layout.tsx`(font) → `lib/utils.ts`(cn) → `lib/format.ts` → `components/icon.tsx`(lucide ラッパ)
- **L1 アトム（相互独立・並行可）**: Button / Badge / MetricDelta / Segmented / Tabs / states(EmptyState・LoadingSkeleton・PermissionDenied) / useMultiMetric
- **L2 合成**: Panel / ValidationBadge / ImportStatusBadge / **KpiCard**(=`OverviewCard` 汎用化: layout 3種 + deltaMode 3種) / Dropdown+MenuItem / FilterButton
- **L3 テーブル/チャート**: **ScrollTable/DataTable**(`thStyle`/`tdStyle`+sticky列+`minWidth` を共通化。過度な汎用 DataTable は作らない) / ChartPanel / SVGチャート群(BarCell 含む)
- **L4 シェル**: useViewport → SidebarNav → 各 Selector/TaxToggle/DataFreshnessBadge → HeaderFilterBar → FilterSheet → UserMenu → **AppShell**

**AppShell `<main>` 分岐（プロト厳密値）**: ワイドルート群=`occupancy/channels/nationalities/stay-nights/room-types/annual-sales/booking-curve`。padding: mobile`16px` / desktopワイド`20px 18px` / desktop他`22px 26px`。maxWidth: ワイド`none` / 他`1480`。共通 `width:100% margin:0 auto`。

---

## 5. データ契約とフロントエンド・モック戦略

### 5.1 最重要の横断的不一致（プロト vs 契約）
| 観点 | プロト | 契約（api-contract） | 解消方針 |
|---|---|---|---|
| 封筒 | バラの global 変数 | 全EP `DashboardResponse<TSummary,TRow,TSeries,TComparisonRow>`（`filters`/`summary`/`rows`/`series?`/`comparison?`/`generatedAt`） | global → `summary`/`rows`/`comparison` にマップ |
| 比較 | client で `_diffRow`/`_diffMap`/`buildChannelAnnual` 算出 | server が `comparison.metrics[]`/`rows[]`（current/baseline/diff/rate 計算済み） | client 差分計算を**全廃**、`comparison` 消費のみ |
| 税抜 | `adj=1/1.1` 一律 | `taxMode: gross/net` をサーバが手数料補正後で切替 | client `/1.1` を**全廃**、`taxMode` を query に乗せる |
| 集計 | client で reduce/sin季節傾斜/構成比按分 | mart/RPC が集計済み（route handler は重group by禁止） | UI は集計しない |
| pt vs % | `occ` YoY は pt、他は %（`budpt`/`yoyUnit` フラグ） | `diff`(絶対差) と `rate`(比率) を両方返す | 「率KPIは diff→pt表示、額/数量KPIは rate→%表示」を viewmodel で判定 |
| 施設ID | `'F001'..'F015'` | `facilityId` uuid + `facilityCode`/`facilityName` | プロト id=facilityCode 相当。UI内部キーは uuid、表示は code/name |
| 欠損 | `null`+`warn:'sellable'\|'budget'`、`'—'` | `null`、snapshot 無効 `400 FEATURE_NOT_ENABLED`、対象なし `comparison:null` | `warn` は契約に無い→null + マスタ登録状態から UI 派生 |

### 5.2 正規型の置き場と viewmodel
- `lib/api/types.ts` を**単一の真実源**として api-contract を Zod + 型で厳密移植（共通封筒 + 7 EP の Summary/Row/ComparisonRow）。
- `lib/viewmodels/*.ts` に「契約型→画面表示モデル」の純関数を置き、プロトの `OCC_KPIS`/`OCC_INSIGHT`/`*_DIFF`/`*_SNAP*` 相当を viewmodel に**降格**。バケット日本語ラベル / enum→表示名 / 配列⇔named field のマップもここに集約。

### 5.3 wide→long 変換（4 EP で必須）
`stay-nights` / `room-types` / `annual-sales` / `nationalities` はプロトが wide マトリクス、契約は long 行。**long をUIピボットして月マトリクス表示を再現**（または契約に `series`/別RPC を追記。§5.8 で確定）。

### 5.4 ブッキングカーブ bucket（配列 index ⇔ named field 固定マップ）
| idx | プロト `BC_BUCKETS` | 契約 field |
|---|---|---|
| 0 | 当日 | `sameDay` |
| 1 | 前日 | `oneDayBefore` |
| 2 | 2日前 | `twoDaysBefore` |
| 3 | 3〜6日前 | `threeToSixDaysBefore` |
| 4 | 7〜13日前 | `sevenToThirteenDaysBefore` |
| 5 | 14〜20日前 | `fourteenToTwentyDaysBefore` |
| 6 | 21〜30日前 | `twentyOneToThirtyDaysBefore` |
| 7 | 31〜60日前 | `thirtyOneToSixtyDaysBefore` |
| 8 | 61〜90日前 | `sixtyOneToNinetyDaysBefore` |
| 9 | 91〜120日前 | `ninetyOneToOneTwentyDaysBefore` |
| 10 | 121〜150日前 | `oneTwentyOneToOneFiftyDaysBefore` |
| 11 | 151日以上前 | `oneFiftyOnePlusDaysBefore` |

**(注意・KPI矛盾)** KPI§8 は bucket 値を「累積 `sum(sold_room_nights)`、売上・予約件数ではない」と明記。プロトの ADR/売上カーブ・二軸チャートは契約/KPIと矛盾 → **販売室数累積カーブのみを正**とし、売上カーブを残すなら別 RPC 定義が必要（§5.8 採否確定）。

### 5.5 fixture 置き場と差し替え
```
mocks/fixtures/   occupancy.{monthly,yearly}.gross.ts, channels.monthly.gross.ts,
                  nationalities.monthly.gross.ts, stay-nights.yearly.gross.ts,
                  room-types.yearly.gross.ts, annual-sales.yearly.gross.ts,
                  booking-curve.gross.ts, facilities.ts
mocks/builders.ts プロト実数値(lib.jsx/annual-data.jsx)→契約型へ機械写経（wide→long, /1.1除去, '6月'→2026-06-01, 配列⇔named field）
mocks/handlers.ts MSW ハンドラ（任意・推奨）
mocks/index.ts    getMock(endpoint, filters) ディスパッチャ
```
- **差し替え**: `lib/api/client.ts` の fetcher 1 点。`USE_MOCK`（or `DASHBOARD_DATA_SOURCE`）true で `getMock`、false で `fetch('/api/dashboard/...')`。返り値の型を契約型に固定し mock↔実API を型レベル互換に。MSW を使えば本番コードパスのまま開発可（推奨）。
- **決定論担保**: 乱数禁止・固定値のみ。`taxMode` 別に gross/net 両 fixture（net=gross/1.1 を**ビルド時に1回**計算した固定値）。`generatedAt` 固定 ISO（`2026-06-15T06:10:00+09:00`）。0除算KPIは `null`→UI`'—'`。`comparison` 付きを `previous_year`/`budget` の2 basis 分、`previous_snapshot` は `400 FEATURE_NOT_ENABLED` の error fixture。**PII（氏名/電話/住所/メール）を fixture に一切入れない**（施設名・経路名・国籍ラベルのみ）。
- **契約適合自動チェック**: `mocks/__tests__/fixtures.contract.test.ts` で型コンパイル検証＋（任意）zod ランタイム検証（ソート順・必須キー・null許容）。

### 5.6 不一致の解消方針（プロト独自 → 採否）
| プロト独自 | 扱い |
|---|---|
| `OCC_KPIS`/`OCC_YEAR_KPIS`/`OCC_INSIGHT`/`OCC_ALERTS` | UI viewmodel（`summary`+`comparison` から組成）。アラートは別 `/api/alerts` or 欠損派生、固定3件はモック |
| `OCC_TABLE`（施設横断・`warn`） | `occupancy?facilityId=all` を施設別 rows で返す拡張 or 別RPC |
| `CHANNELS[].group/bookings/adr` | 契約に追加候補（KPI拡張要） |
| `NATIONALITIES`(3サマリ) / `NAT_ROWS[].rev[12]` 月配列 | サマリは `summary` 追加、月軸は yearly series/別RPC |
| `RT_COMP`/`RT_INVENTORY`/`RT_DAYS`/消化率 | 契約/KPI に無い独自指標。採用なら KPI定義拡張が前提（`RT_INV_TOT`2タイプ固定・365固定バグ修正も） |
| `BC_BASE.adr*`/売上カーブ/進捗率/二軸 | KPI§8 と矛盾。販売室数累積のみ正 |
| `OCC_YEAR_BUD*`/`*_SNAP*`/`*_DIFF*` | 全廃→`comparison` へ |

### 5.7 比較モード対応
プロト `py/pytd/date/budget` ⇔ 契約 `previous_year/(pytd=契約に無い)/previous_snapshot/budget`。`pytd`（前年同期）は契約に無く、プロトでも常に未確定プレースホルダ→**初期は非対応表示で整合**。`date`=`previous_snapshot`（無効時 `FEATURE_NOT_ENABLED`、対象なし `comparison:null`）。`budget` の月次→py フォールバック（プロト挙動）は契約上許容。

### 5.8 計画段階で確定すべき契約の穴（型/fixture をブロック）
1. `occupancyRate`/`occ` の単位（0-1 か 0-100）— KPIは「率」、プロトは%。**契約に明記**。
2. nationalities/stay-nights/room-types/annual-sales の `summary` 型が**契約未定義**（`DashboardResponse` は `TSummary` 必須）。
3. 月マトリクス表示を `period=yearly`+`series` で返すか別RPCか。
4. 施設×経路クロス・経路×月クロス（channels）、施設×月（annual）のクロス表現が契約に無い→追加EP/RPCの要否。
5. **施設マスタEP `/api/facilities` が契約に無い→追加必須**（uuid/code/name/area/rooms）。
6. プロト独自指標（経路ADR/group/bookings、部屋タイプ消化率/同伴係数、booking 売上・ADRカーブ）の採否→採用なら KPI定義へ追記。

---

## 6. 画面カバレッジ・マトリクスと不足分

### 6.1 ナビ13項目
| # | ルートID | 状態 | 残作業（設計） | 残作業（実装） |
|---|---|---|---|---|
| 0 | `dashboard` | 完全 | 本番1案確定（comfortable+badge 推奨）/ エクスポート本番仕様 | KPI_OVERVIEW API化・App Router 遷移化 |
| 1 | `occupancy` | 部分 | トレンド折れ線(ComboChart)設計 / `pytd` 本番ロジック | OCC_* API化・差分のサーバ移管・満室強調/税抜本番化 |
| 2 | `channels` | 部分 | stacked bar / Top channel cards / OTA-Direct-Other filter / ADR-RevPAR-前年差列 | CH_* API化・季節傾斜→実集計 |
| 3 | `nationalities` | 部分 | Summary(国内/海外比率・主要国籍・平均LT) / Ranking / 横棒構成比 / Unknown明示 / ISO併記 | NAT_* API化・施設スケール近似→実集計 |
| 4 | `stay-nights` | 完全 | 分布チャート / 連泊率・平均泊数 Insight行 / 予約数指標 / ラベル不一致確認 | STAY_* API化・SalesTable 素配列整合 |
| 5 | `room-types` | 完全 | 横棒比較 / 予算マッピングUI | RT_* API化・`RT_INV_TOT`/365 バグ修正 |
| 6 | `annual-sales` | 部分 | 施設×月 heatmap(`areaTint` デッドコード活用) / ranking / area selector / year summary / export | AF_* API化・2026固定→動的年・**facility_user 自施設限定版** |
| 7 | `booking-curve` | 部分 | snapshot比較 / feature-unavailable state / 着地見込みSummary | BC_* スケール→実カーブ・ALL時F001フォールバック本番方針 |
| 8 | `imports` | スタブ | Import List + 7ステップウィザード（§6.2） | 全面 |
| 9 | `validation/excel-diff` | スタブ | 検証履歴/参照Excel/差分表/drilldown（§6.3） | 全面 |
| 10 | `admin/masters` | スタブ | 8マスタ画面（§6.4） | 全面 |
| 11 | `admin/users` | スタブ | user list/role/施設スコープ/招待・失効 | 全面（Supabase Auth連携） |
| 12 | `settings` | スタブ | system status/mart refresh/commit/snapshot/監査ログ表・機微マスキング | 全面 |

### 6.2 取込ウィザード（`imports`）
Import List(batch table・source filter[minpakuIN/ねっぱん/手間いらず]・status filter[9状態]・latest summary) + 7ステップ（Source選択→Upload[Storage]→施設マッピングpreview→**PII非表示preview**→Validation result[行番号/項目/原因/対応、PII値非表示]→`ConfirmCommitModal`[追加/更新/除外/warning件数、同時commit中disable+進捗]→完了）。`ImportStatusBadge`/`IMPORT_STATUS`(9状態) は流用可。**ロール: admin/operator のみ**。

### 6.3 Excel差分検証（`validation/excel-diff`）
検証実行履歴 / 参照Excel upload[Storage] / 期間・施設セレクタ(流用) / pass-warning-failed サマリ(`ValidationBadge` 流用) / 差分表(sheet/metric/施設/期間/Excel値/Web値/diff/tolerance/status、**金額±1円・比率±0.01pt**) / drilldown(API payload/mart row/formula、**PII・raw値非表示**)。**ロール: admin のみ**。`ValidationBadge` はヘッダーで全ロール表示→**非adminにはバッジ自体を隠す設計を検討**。

### 6.4 admin 8マスタ（`admin/masters`）
Facilities / Source Facility Mappings / Room Type Mappings / Channel Mappings / Country Mappings / Budgets(CSV import/inline edit) / **Room Inventory(未登録の強警告。`OCC_TABLE.warn:'sellable'`/`OCC_ALERTS[0]` と整合)** / Fee Adjustment Rules(gross/net/tax 説明)。`MappingTable` は新規。**ロール: admin のみ**（プロンプトは operator に「マッピング確認」を許可＝NAV定義と差異→要確認）。

### 6.5 ロール別表示制御（`navVisibleForRole` + 画面内ガード）
| ルート | admin | operator | viewer | facility_user | 追加制御 |
|---|---|---|---|---|---|
| dashboard | ✅ | ✅ | ✅ | ✅ | facility_user+ALL で「全施設年間売上」カード除外、ALL→F001 矯正 |
| occupancy/channels | ✅ | ✅ | ✅ | ✅ | facility_user は全施設選択不可（`allowAll && role!=='facility_user'`） |
| nationalities/stay-nights/room-types/booking-curve | ✅ | ✅ | ✅ | ✅ | booking-curve は ALL→F001 |
| annual-sales | ✅ | ✅ | ✅ | ⚠️ ownOnly | 「(自施設)」ラベル。**facility_user 自施設版が未実装** |
| imports | ✅ | ✅ | ❌ | ❌ | opOnly ゲート |
| validation/excel-diff・admin/masters・admin/users | ✅ | ❌ | ❌ | ❌ | adminOnly ゲート |
| settings | ✅ | ✅ | ✅ | ✅ | 監査ログ等の機微出し分けは未設計 |

**`ROLES`**: admin=全権 / operator=付与施設の取込・検証・commit / viewer=閲覧のみ / facility_user=自施設ダッシュボード閲覧のみ。**プロトの `UserMenu` デモ用ロール切替は本番では削除**し、Supabase Auth の JWT claim / RLS で制御。

### 6.6 不足コンポーネント
未実装（新規）: **ImportWizard / MappingTable / ConfirmCommitModal / AuditLogTable / ErrorState**（ErrorState はプロンプト要求だがプロトに無し）。部分（汎用化要）: KpiCard（`OverviewCard`/`OccKpiStrip` 統合）、ChartPanel/DataTable（各画面ベタ書き→抽象化）。

---

## 7. 再考した実装シーケンス（M0-M22）

`feat:`/`chore:` は例。**M1 契約凍結後、フロント track（M2-M9）とバック track（M10-M18）を並行**。クリティカルパス: M0→M1→M10→M12→(M13/M14/M15)→M16→M17→M20。M19 は M17 と M9 の合流点。

### Phase 0 — 足場（直列・最優先）
| MS | commit | 目的 | 成果物 | 完了条件 | D/R対応 |
|---|---|---|---|---|---|
| M0 | `chore: scaffold next.js app router + tailwind + ts` | アプリ本体生成 | create-next-app・`.gitignore`マージ・`.env.example`・docs温存 | `npm run build` 通過・`/`表示 | 新規(前提) |
| M0.1 | `chore: supabase local init + docker` | ローカルDB枠 | `supabase init/start`・空migration枠 | `supabase start` 起動 | D01前段 |

### Phase 1 — 契約凍結 + デザインシステム（フロント先行の土台）
| MS | commit | 目的 | 成果物 | 完了条件 | D/R対応 |
|---|---|---|---|---|---|
| M1 | `feat: dashboard api zod schema + fetcher abstraction` | **契約凍結** | `lib/api/types.ts`(7型Zod)・`client.ts`(mock/live切替)・digest形状mock | Zod parse test green・mock が型充足 | D08前段/R07契約 |
| M2 | `feat: design tokens + format utils` | トークン土台 | `globals.css`(tokens+`.skel`新規)・`@theme`・`format.ts` | format 単体test・トークン視覚再現 | D09前段 |
| M3 | `feat: design-system primitives` | L1-L2 アトム | Btn/Badge/MetricDelta/Panel/Segmented/Tabs/states/`useMultiMetric` | 各props描画・Ctrl/⌘複数選択 | D09 |
| M4 | `feat: charts (svg)` | チャート移植 | ComboChart/MultiLineChart/Sparkline/BarCell | path生成スナップショット | D09 |

### Phase 2 — AppShell + 画面（フロント・mock 駆動）
| MS | commit | 目的 | 成果物 | 完了条件 | D/R対応 |
|---|---|---|---|---|---|
| M5 | `feat: app shell` | シェル合成 | AppShell/SidebarNav/HeaderFilterBar/各Selector/`navVisibleForRole`/レスポンシブ/`st`(URL searchParams+localStorage相当) | 375/768/1280 崩れなし・ロール別ナビ | D09 |
| M6 | `feat: top dashboard + occupancy` | 主要2画面 | TopDashboard(7カード・AlertStrip)・OccupancyScreen(月間/年間/モバイル/全施設・比較4モード・満室強調・税抜) | 各分岐描画・比較切替 | D09/R09 |
| M7 | `feat: channels + nationalities` | クロス集計 | 施設×経路/国籍×月・当年/前年・0隠し・`build*` 移植 | 列順/合計/構成比一致(mock) | D09 |
| M8 | `feat: stay/room-types/annual/booking` | 残4画面 | 泊数/部屋タイプ/全施設年間/カーブ(dual-axis)・残ルートはプレースホルダ維持 | 指標切替・すべて表示・税連動 | D09 |
| M9 | `chore: vercel preview (mock)` | 早期価値提示 | preview デプロイ(`DASHBOARD_DATA_SOURCE=mock`) | preview URL で全画面閲覧 | 新規 |

### Phase 3 — バックエンド（M1 後に並行開始可能）
| MS | commit | 目的 | 成果物 | 完了条件 | D/R対応 |
|---|---|---|---|---|---|
| M10 | `feat: supabase schema + rls` | DB土台 | 全migration・RLS `can_access_facility`・`fee_adjustment_rules`/`dashboard_snapshots`/`import_locks` | `supabase db reset`・RLS select test | D01/R01/R08 |
| M11 | `feat: master seed csv + import script` | マスタ投入 | facilities/source/room_type/channel/country/inventory/budgets/fee_rules seed | seed投入・件数一致 | D01/R01 |
| M12 | `feat: canonical template + zod` | 共通テンプレ | `adapters/types.ts`/`canonical-schema.ts`・fixture CSV | parse/required-missing test | D02/R02 |
| M13 | `feat: minpakuin adapter` | adapter | `sold_room_nights=1`・Agoda 0.88/Trip 0.85 補正・キャンセル除外 | 現行 create_report.py と一致 | D03/R03 |
| M14 | `feat: neppan adapter (+sanitized fixture)` | adapter | CP932・泊目集約・料金内訳合算・**PII非保存** | PII列がcanonical/APIに出ない test | D05/R05 |
| M15 | `feat: temairazu adapter` | adapter | CP932・連泊配賦・部屋数→sold_room_nights | 連泊配賦/キャンセル test | D04/R04 |
| M16 | `feat: mart refresh (affected month diff)` | 集計 | 6 mart 差分更新SQL/server action・冪等upsert | 対象月のみ再集計・再取込重複なし | D07/R07 |
| M17 | `feat: dashboard api route handlers (live)` | 実API | 7 endpoint・RLS連動・`compareWith`・`facilityId=all` admin判定・`previous_snapshot`→`FEATURE_NOT_ENABLED` | 403/空結果・mart=API一致・比較別test | D08/R07/R08 |
| M18 | `feat: import mini app + import api` | 取込 | /imports 系画面 + parse/validate/commit API・PII非表示preview | upload→preview→validate→commit E2E | D06/R06 |

### Phase 4 — 統合・検証・運用
| MS | commit | 目的 | 成果物 | 完了条件 | D/R対応 |
|---|---|---|---|---|---|
| M19 | `feat: switch fetcher to live api` | 合流 | `DASHBOARD_DATA_SOURCE=live`・Server Component 実fetch | 全画面が実mart値で描画 | D08+D09結合 |
| M20 | `feat: excel diff validation script` | 検証ゲート | `compare-dashboard.ts`・tolerance(金額±1円/比率±0.01pt/室数完全一致)・差分レポート | Excel vs mart 差分0で pass | D11/R11 |
| M21 | `feat: powershell ingest scripts` | 連携 | fetch-neppan/upload-raw-file/run-import・**credential非ログ** | upload で raw_files 作成・batch開始 | D10/R10 |
| M22 | `feat: roadmap screens build-out` | 運用画面 | masters/users/settings/excel-diff をプレースホルダ→実画面(合意後) | 権限ゲート・実テーブル | D08/D09補完 |

### 7.1 既存 D01-D11 / R01-R11 対応表
| 既存ID | 内容 | 新MS | 位置づけ |
|---|---|---|---|
| D01/R01 | schema+RLS+seed | M10,M11 | バック起点（M1後） |
| D02/R02 | canonical+Zod | M12 | adapter前提 |
| D03/R03 | minpakuIN adapter | M13 | M12後 |
| D04/R04 | 手間いらず adapter | M15 | M12後 |
| D05/R05 | ねっぱん adapter | M14 | PII検証重点 |
| D06/R06 | 取込ミニアプリ+import API | M18 | adapter+mart後 |
| D07/R07(一部) | mart refresh | M16 | adapter後・API前 |
| D08/R07(一部)/R08 | dashboard API+RLS連動 | M17(RLS土台M10) | mart後 |
| D09/R09 | dashboard UI 7カード | **M2,M3,M4,M5,M6,M7,M8 に分割** | 契約M1後・最先行群 |
| D10/R10 | PowerShell連携 | M21 | import API後 |
| D11/R11 | Excel差分検証 | M20 | mart/API後・実API接続ゲート |
| 新規 | scaffold/契約凍結/preview/実API差替/運用画面 | M0,M0.1,M1,M9,M19,M22 | D分解に無かった足場・契約・統合を明示化 |

ポイント: **D09 は単一でなく M2-M8 の7 MS に分割**。**D08↔D09 間に「M1 契約凍結」「M19 実API差し替え」を新設**しフロント/バック並行を成立。D01 の RLS は M10 で土台、D08 の権限連動テストは M17 に分離。

---

## 8. 検証戦略

| 領域 | 内容 | 合格基準 | MS |
|---|---|---|---|
| Excel差分検証 | コルディオExcel vs Web mart を `compare-dashboard.ts` で突合（sheet×metric×施設×期間） | **金額±1円 / 比率±0.01pt / 室数完全一致**。差分0で pass、実API接続のゲート | M20 |
| KPI一致（許容差） | KPI定義式どおりサーバ算出（occ/adr/revpar/ppr/guest_factor 等）。0除算は `null`→`'—'` | tolerance 内一致。occ単位（0-1 or 0-100）を契約で確定後に検証 | M16/M17/M20 |
| レスポンシブ | 375 / 768 / 1280px。AppShell `<main>` のワイドルート群 padding/maxWidth 分岐、mobile drawer/FilterSheet、fit高さ `calc(100dvh-152px)` | 各幅で崩れなし・横スクロール想定どおり | M5-M8 |
| RLS/権限 | `can_access_facility` で施設スコープ。`facilityId=all` は admin/operator/viewer のみ、facility_user は自施設強制 | 非許可施設は 403/空結果・ナビ非表示・`PermissionDeniedState` | M10/M17 |
| PII非漏洩 | ねっぱん raw の氏名/電話/住所/メール/会員番号が canonical/mart/API/preview/ログ/fixture/E2E成果物 いずれにも出ない | sanitized fixture で「PII列が出ない」test 必須 green | M14/M18 |
| アクセシビリティ | `:focus-visible` リング・Radix(Dropdown/Tabs/Sheet) の a11y・`role=tablist/tab`・キーボード操作 | フォーカス可視・キーボード到達・コントラスト（業務ツール基調） | M3/M5 |
| 契約適合 | fixture と実API が `lib/api/types.ts` を満たす（型コンパイル+zod） | CI で型/スキーマ green | M1/M17 |

---

## 9. リスク・未確定事項・ユーザー確認事項

### 9.1 トップリスク（暫定方針付き）
| ランク | リスク | 暫定方針（確認できるまで） |
|---|---|---|
| R1 | Excel 1円一致のバック検証コスト（adapter補正・端数 `floor(gross*10/110)`・連泊配賦・泊数予約単位集約のずれ） | M13-M15 を adapter ごと独立test化、M20 を**実API接続ゲート**化、tolerance を script 定数化 |
| R2 | モックと実マスタの乖離（digest 15施設・恩納/中部 vs master-data-spec 37施設・北谷/北部/那覇/沖縄市） | **正は master-data-spec(37施設)**。プロトの `FACILITIES`/`AF_AREAS`/列順・施設名は視覚確認用ダミー扱い、`mocks/` を実マスタ施設コードに寄せ再生成 |
| R3 | PII漏洩（ねっぱん raw） | M14 で sanitized fixture + 「PII列が出ない」test 必須化、import preview マスキング、service role key は `NEXT_PUBLIC_` 厳禁 |
| R4 | `.env.local` 巻き戻し事故 | `.gitignore` 対象確認、破壊的 git 操作前に存在確認を手順化、本計画では新規作成のみ |
| R5 | 比較 `previous_snapshot`/`pytd` 未確定 | 初期は UI で「未確定/未対応」表示（モック踏襲）、snapshot 実装は別 MS 切り出し |
| R6 | プロト構造の安易移植（`window`/Babel/自前switch/`/1.1`/`count={3}`） | README どおり**視覚のみ再現**。税抜は mart `fee_adjusted_net_amount` を正、UIの`/1.1`は mock 専用、固定値は実APIで置換 |
| R7 | Vercel Function 制約と重集計 | route handler は mart/RPC のみ（raw group by 禁止）。重集計は M16 server action/バッチ側 |

### 9.2 仮定を置いて進める項目（宣言して実行）
| # | 未確定 | 置く仮定(仮定) |
|---|---|---|
| 1 | ログイン方式 | (仮定) Supabase email/password 初期、magic link は後差し替え |
| 2 | エリア分類最終確定 | (仮定) seed で `北谷/北部/那覇/沖縄市/その他` の5値、未分類許容。モックの恩納/中部は seed で吸収 |
| 3 | ねっぱん国籍 | (仮定) 国籍列なし→`不明` 固定、別ファイル取得時に mapping 追加 |
| 4 | 手間いらず `予約区分=キャンセル` の売上扱い | (仮定) 売上0ではなくステータスのみキャンセル（`is_cancelled` で集計除外）、Excel差分で再確認 |
| 5 | 補正ルール seed 初期範囲 | (仮定) `agoda_202601`(0.88)/`tripcom_202602`(0.85)/`neppan_tax10` の3件 |
| 6 | 施設マスタ数 | (仮定) 正は master-data-spec(37施設)、モック15施設は視覚確認用ダミー→実マスタへ置換 |
| 7 | occupancyRate 単位 | (仮定) 契約で 0-100(%) を採用しUI表示と整合、確定次第 types.ts に明記 |

### 9.3 ユーザー確認事項
- **ブロッキング（着手前に唯一聞く1問）**: 「Phase 1-2（フロント先行・mock データで Vercel preview まで）を先に進め、実API・実データ検証（Phase 3-4）はその後で着手する方針で良いか。」No なら全体順序が変わる。
- 非ブロッキング（仮定で進行・後修正可）: 上記 9.2 の各項目、月マトリクスの `series`/別RPC 方針、channels/annual クロスの追加EP要否、プロト独自指標（経路ADR/group/bookings・部屋タイプ消化率/同伴係数・booking 売上カーブ）の採否、operator のマスタ「マッピング確認」権限の要否、非adminへの `ValidationBadge` 表示有無。

---

## 10. 次の一手（最初の1-2 commit のチェックリスト）

**commit 1 — `chore: scaffold next.js app router + tailwind + ts`（M0）**
- [ ] main から `chore/scaffold-nextjs` ブランチを切る（main 直押し禁止）
- [ ] `npx create-next-app@latest . --ts --app --tailwind --eslint --import-alias "@/*" --no-src-dir --use-npm` を**ユーザー承認後**に実行
- [ ] `.gitignore` をマージ（`.env*.local` 無視を維持・消さない）、`docs/` が温存されているか確認
- [ ] `.env.example` を新規作成（§3.5 の全変数をダミー値で列挙）。`.env.local` は作成のみ・以後不可侵
- [ ] `lucide-react`/`@supabase/supabase-js`/`@supabase/ssr`/`zod`/`clsx`/`tailwind-merge`/`class-variance-authority`/`vitest`/`@testing-library/react` を導入
- [ ] `npm run build` 通過・`/` 表示を確認 → PR 作成

**commit 2 — `feat: design tokens + format utils` ＋ `feat: dashboard api zod schema`（M2 / M1）**
- [ ] `app/globals.css` に `tokens.css` の `:root` 実値を逐語移植 + `.tabular`/`.mono`/scrollbar/`:focus-visible`/`.skel`(新規keyframes)
- [ ] Tailwind `@theme inline` で colors/radius(3段)/shadow(2種)/layout/font を `var(--*)` 参照に。新規トークン `--c-orange`/`--delta-up-on-dark`/`--delta-down-on-dark`
- [ ] `app/layout.tsx` で `next/font` の Inter + Noto Sans JP を `--font-inter`/`--font-noto-jp` 注入
- [ ] `lib/utils.ts`(cn) / `lib/format.ts`(fmtInt/fmtYen/fmtYenC/fmtPct/fmtPt/fmtDelta・`'—'`規約・億/万圧縮) + 単体 test
- [ ] `lib/api/types.ts` に api-contract 7型を Zod+型で移植（共通封筒 + Summary/Row/ComparisonRow）。occupancyRate 単位は (仮定)0-100 で明記
- [ ] `lib/api/client.ts` に fetcher 抽象（`USE_MOCK`/`DASHBOARD_DATA_SOURCE` 切替）と `mocks/index.ts` の `getMock` スケッチ
- [ ] `mocks/builders.ts` の写経方針（wide→long・`/1.1`除去・`'6月'`→`2026-06-01`・配列⇔named field）を1 EP（occupancy）分だけ着手し型適合 test を green に