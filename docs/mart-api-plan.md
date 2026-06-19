# (D) mart + dashboard API 実行計画

最終更新: 2026-06-18

> 検証済みの adapter（minpakuIN=Excel±0 / ねっぱん=入込状況表±0）を、画面に繋がる
> **集計(mart)＋API** に落とす計画。`implementation-plan.md` M16/M17、`web-dashboard-detail-design.md`
> §7/§8、`api-contract.md`、`kpi-definitions.md`(金額フィルタ修正済)、`minpakuin-master-data.md` を統合。

## 1. 現状と方針

- adapters: 実装・検証済（canonical を生成できる）。
- DB: 未起動（Docker/Supabase CLI 未導入）。canonical 未ロード。取込パイプ(M18)未実装。
- → **方針 = 案2 mock-first（実数つき）**: mart 集計を **TS純関数**で実装し、検証済み adapter で実CSV→canonical→mart を生成して **PIIなし集計fixture** をコミット。API はそれを `api-contract` 形で返す。**DBなしで“本物の数字”のAPIが動く**。後で mart を SQL 化し Supabase に load → live 切替（API契約不変）。

```
実CSV ──adapter(検証済)──▶ canonical[] ──lib/mart/aggregate──▶ mart rows ──build──▶ DashboardResponse(API)
                                                  ▲ 検証済みフィルタ/KPI        ▲ taxMode/compareWith/facility
  (将来) Supabase: canonical表 → SQL mart/RPC ──────────────────────────────┘ 同じ契約
```

## 2. モジュール構成

| パス | 役割 |
|---|---|
| `lib/api/types.ts` | api-contract の Zod + 型（共通封筒 `DashboardResponse` + 7エンドポイントの Summary/Row）。**契約の単一真実源(M1)** |
| `lib/mart/types.ts` | mart 行の型（6 mart。SQL テーブルと対応） |
| `lib/mart/aggregate.ts` | `canonical[] → mart rows`。検証済みフィルタ。parity script のロジックを昇格 |
| `lib/mart/kpi.ts` | mart(+inventory/budget) → KPI（occupancy_rate/ADR/RevPAR/客単価/連泊率/平均LT…）。kpi-definitions 準拠・0除算→null |
| `lib/api/build.ts` | mart+KPI → `DashboardResponse`（filters/summary/rows/comparison/generatedAt） |
| `lib/api/client.ts` | fetcher 抽象（mock↔live 切替、既存方針） |
| `app/api/dashboard/*/route.ts` | 7 route handler（mart fixture or live を読み、build で整形） |
| `mocks/marts/*` | 実CSVから生成した PII なし mart fixture（実数。差し替え可能） |

## 3. mart 集計仕様（検証済みフィルタを反映）

共通（`kpi-definitions §1` 修正済）:
- **金額系**（gross/tax/net）: `fee_adjusted_gross != 0 AND not is_cancelled`（**is_stay_night では絞らない**）
- **室数/人数系**: `is_stay_night = true AND not is_cancelled`
- groupby のキー（channel/room_type/country/OTA）が空の行は当該 mart から除外（dropna 相当）
- 経路は **raw channel** でグルーピング（normalized でマージしない＝Excel/旧ETL一致）

| mart | grain | 備考 |
|---|---|---|
| daily_facility_metrics | facility×date | sold/guest/gross/tax/net。稼働分析の元 |
| monthly_channel_metrics | facility×month×channel | 経路分析 |
| monthly_room_type_metrics | facility×month×room_type(+budget) | budget=施設名で導出（BUDGET_TYPE_MAP 全一致・検証済） |
| monthly_country_metrics | facility×month×大分類×中分類×国 | 国籍別。分類は country_mappings(施設非依存) |
| stay_nights_distribution | facility×checkin_month×room_type×nights_bucket | 予約単位集約。合計人数=予約先頭代表値 |
| booking_curve_monthly | facility×month×cancel_scope | lead_time 累積 sold_room_nights。with/without cancel |

> adapter 別の集約差は canonical 生成側で吸収済（minpakuIN=非集約1行=1室泊 / ねっぱん=料金内訳集約）。mart 集計は canonical を一律に扱える。

## 4. API endpoint 仕様（`api-contract.md` 準拠）

7 endpoint: `occupancy / channels / nationalities / stay-nights / room-types / annual-sales / booking-curve`。共通 query `facilityId / year / month / period / taxMode / compareWith`。

- `taxMode`: gross→`fee_adjusted_gross`、net→`fee_adjusted_net`。
- `compareWith=previous_year`: 複数年 canonical があるので実装可（前年同月/同期）。`budget`: 予算マスタ投入後。`previous_snapshot`: 初期 `400 FEATURE_NOT_ENABLED`。
- `facilityId=all`: admin のみ（RLS は live 化時。mock 期は role を query/固定で）。
- レスポンスは `DashboardResponse<TSummary,TRow,...>`（filters/summary/rows/series?/comparison?/generatedAt）。

## 5. KPI 計算（kpi-definitions 準拠）

canonical/mart から: 販売室数・宿泊人数・客室販売金額・客単価(=売上/人数)・ADR(=売上/室数)・平均宿泊者数・経路構成比・連泊率・平均リードタイム・泊数分布・ブッキングカーブ。
**外部マスタ依存（投入待ち）**: 稼働率/残室/RevPAR=`room_inventory_months`、予算達成率=`budgets`。未投入の間は `null`→画面 `-`。0除算→null。

## 6. フェーズ

| Phase | 内容 | 依存 |
|---|---|---|
| **D1** | `lib/api/types.ts`（契約Zod）＋`lib/mart/aggregate.ts`（6 mart, 検証済みフィルタ）＋単体テスト | なし（着手可） |
| **D2** | mart fixture 生成（実CSV→canonical→mart, PIIなし）＋ `lib/mart/kpi.ts` | adapters（済） |
| **D3** | 7 API route handler ＋ `lib/api/build.ts` ＋ fetcher 抽象。compareWith=previous_year | D1/D2 |
| **D4** | room_inventory/budgets 投入（ユーザー提供後）→ 稼働率/RevPAR/予算達成率を実数化 | マスタ提供 |
| 後続 | mart を SQL 化、Supabase に canonical load、live 切替（Docker 導入後）。フロント画面（M2-M8）。 | DB |

## 7. 検証戦略
- mart 集計の単体テスト: parity script で ±0 検証済みの数値（minpakuIN/ねっぱん）を期待値に使う。
- API: fixture/レスポンスが `lib/api/types.ts`(Zod) を満たす（型＋ランタイム）。
- compareWith=previous_year は複数年 canonical で前年セルを突合。
