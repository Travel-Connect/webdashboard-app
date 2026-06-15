# KPI 定義書

最終更新: 2026-06-15

## 1. 共通前提

通常の実績集計は、特記がない限り以下を適用する。

```sql
where is_stay_night = true
  and is_cancelled = false
```

金額は補正後列を使う。Agoda / Trip.com 等の手数料補正がある場合でも、税込・税抜・税額の整合を保つため、表示側は以下の列だけを参照する。

| 税表示 | 使用列 |
| --- | --- |
| 税込 | `fee_adjusted_gross_amount` |
| 税抜 | `fee_adjusted_net_amount` |
| 税額 | `fee_adjusted_tax_amount` |

0 除算は `null` を返す。画面表示では `-` とする。

## 2. 稼働分析

| KPI | 表示名 | 式 | 粒度 | 丸め |
| --- | --- | --- | --- | --- |
| `sold_room_nights` | 販売室数 | `sum(sold_room_nights)` | 施設+日 / 施設+月 | 小数なし |
| `sellable_room_nights` | 販売可能室数 | `app.room_inventory_months.sellable_room_nights` を対象期間按分 | 施設+日 / 施設+月 | 小数なし |
| `remaining_room_nights` | 残室 | `sellable_room_nights - sold_room_nights` | 施設+日 / 施設+月 | 小数なし |
| `occupancy_rate` | 稼働率 | `sold_room_nights / sellable_room_nights` | 施設+日 / 施設+月 | 0.01pt |
| `guest_count` | 宿泊人数 | `sum(guest_count)` | 施設+日 / 施設+月 | 小数なし |
| `room_revenue` | 客室販売金額 | 税表示に応じた補正後金額合計 | 施設+日 / 施設+月 | 1円 |
| `guest_unit_price` | 客単価 | `room_revenue / guest_count` | 施設+日 / 施設+月 | 1円 |
| `adr` | 平均室単価 | `room_revenue / sold_room_nights` | 施設+日 / 施設+月 | 1円 |
| `revpar` | RevPAR | `room_revenue / sellable_room_nights` | 施設+日 / 施設+月 | 1円 |
| `avg_guests_per_room` | 平均宿泊者数 | `guest_count / sold_room_nights` | 施設+日 / 施設+月 | 小数第2位 |

Excel 対応シート: `稼働分析表(月間)`, `稼働分析表(年間)`。

## 3. 経路分析

| KPI | 表示名 | 式 | 粒度 |
| --- | --- | --- | --- |
| `channel_revenue` | 経路別売上 | 税表示に応じた補正後金額合計 | 施設+月+経路 |
| `channel_sold_room_nights` | 経路別販売室数 | `sum(sold_room_nights)` | 施設+月+経路 |
| `composition_rate` | 構成比 | `channel_revenue / all_channel_revenue` | 施設+月+経路 |
| `previous_year_revenue` | 前年売上 | 同施設・同経路・前年同月の売上 | 施設+月+経路 |
| `yoy_diff` | 前年差 | `channel_revenue - previous_year_revenue` | 施設+月+経路 |
| `yoy_rate` | 前年比 | `channel_revenue / previous_year_revenue` | 施設+月+経路 |

Excel 対応シート: `経路別分析表(月間)`, `①経路別分析表(年間)`, `②経路別分析表(年間)`。

## 4. 国籍別分析

| KPI | 表示名 | 式 | 粒度 |
| --- | --- | --- | --- |
| `country_revenue` | 売上 | 税表示に応じた補正後金額合計 | 施設+月+国籍分類 |
| `sold_room_nights` | 販売室数 | `sum(sold_room_nights)` | 施設+月+国籍分類 |
| `adr` | ADR | `country_revenue / sold_room_nights` | 施設+月+国籍分類 |
| `reservation_count` | 予約件数 | 予約×月単位の distinct count | 施設+月+国籍分類 |
| `avg_guests_per_room` | 同伴人数 | `guest_count / sold_room_nights` | 施設+月+国籍分類 |
| `multi_night_rate` | 連泊率 | `multi_night_reservation_count / reservation_count` | 施設+月+国籍分類 |
| `avg_lead_time` | 平均リードタイム | `lead_time_total / lead_time_count` | 施設+月+国籍分類 |

`lead_time_total` と `lead_time_count` は `is_valid_lead_time = true` の予約だけを対象とする。

Excel 対応シート: `国籍別分析(NEW)`。

## 5. 泊数分布

泊数分布は予約単位で集約してから作成する。チェックイン月基準とし、同じ予約が月を跨ぐ場合でもチェックイン月に寄せる。

| KPI | 表示名 | 式 | 粒度 |
| --- | --- | --- | --- |
| `reservation_count` | 予約件数 | 予約数 | 施設+チェックイン月+泊数バケット |
| `sold_room_nights` | 販売室数 | `sum(nights * room_count)` または canonical 由来の室泊数 | 施設+チェックイン月+泊数バケット |
| `guest_count` | 合計人数 | 予約単位人数合計 | 施設+チェックイン月+泊数バケット |
| `room_revenue` | 売上 | 税表示に応じた補正後金額合計 | 施設+チェックイン月+泊数バケット |
| `average_nights` | 平均泊数 | `sold_room_nights / reservation_count` | 施設+チェックイン月 |
| `adr` | ADR | `room_revenue / sold_room_nights` | 施設+チェックイン月+泊数バケット |
| `guest_factor` | 同伴係数 | `guest_count / reservation_count` | 施設+チェックイン月+泊数バケット |

泊数バケット:

| bucket | 条件 |
| --- | --- |
| `1` | `nights = 1` |
| `2` | `nights = 2` |
| `3_4` | `nights between 3 and 4` |
| `5_6` | `nights between 5 and 6` |
| `7_plus` | `nights >= 7` |

Excel 対応シート: `泊数分布(NEW)(部屋タイプ別)`。

## 6. 部屋タイプ別分析

| KPI | 表示名 | 式 | 粒度 |
| --- | --- | --- | --- |
| `room_type_revenue` | 部屋タイプ別売上 | 税表示に応じた補正後金額合計 | 施設+月+部屋タイプ |
| `sold_room_nights` | 販売室数 | `sum(sold_room_nights)` | 施設+月+部屋タイプ |
| `adr` | ADR | `room_type_revenue / sold_room_nights` | 施設+月+部屋タイプ |

Excel 対応シート: `部屋タイプ別分析(NEW) (全施設)`。

## 7. 全施設年間売上

| KPI | 表示名 | 式 | 粒度 |
| --- | --- | --- | --- |
| `facility_revenue` | 施設別年間売上 | 対象年の補正後金額合計 | 施設+年 |
| `area_revenue` | エリア別売上 | `facility_revenue` のエリア集計 | エリア+年 |
| `total_revenue` | 全施設合計 | 全施設の補正後金額合計 | 年 |
| `budget_amount` | 予算売上 | `app.budgets.budget_amount` 合計 | 施設+年 |
| `budget_achievement_rate` | 予算達成率 | `facility_revenue / budget_amount` | 施設+年 |
| `previous_year_revenue` | 前年売上 | 前年同期間の売上 | 施設+年 |
| `yoy_rate` | 前年比 | `facility_revenue / previous_year_revenue` | 施設+年 |

Excel 対応シート: `全施設年間売上`, `全施設年間予算`。

## 8. ブッキングカーブ

`lead_time_days = stay_date - booked_at::date` とする。`lead_time_days >= 0` の行だけを対象にする。

| bucket | 条件 |
| --- | --- |
| `same_day` | `lead_time_days >= 0` |
| `one_day_before` | `lead_time_days >= 1` |
| `two_days_before` | `lead_time_days >= 2` |
| `three_to_six_days_before` | `lead_time_days >= 3` |
| `seven_to_thirteen_days_before` | `lead_time_days >= 7` |
| `fourteen_to_twenty_days_before` | `lead_time_days >= 14` |
| `twenty_one_to_thirty_days_before` | `lead_time_days >= 21` |
| `thirty_one_to_sixty_days_before` | `lead_time_days >= 31` |
| `sixty_one_to_ninety_days_before` | `lead_time_days >= 61` |
| `ninety_one_to_one_twenty_days_before` | `lead_time_days >= 91` |
| `one_twenty_one_to_one_fifty_days_before` | `lead_time_days >= 121` |
| `one_fifty_one_plus_days_before` | `lead_time_days >= 151` |

`cancel_scope`:

| scope | 条件 |
| --- | --- |
| `with_cancelled` | キャンセルを含む |
| `without_cancelled` | `is_cancelled = false` |

Excel 対応シート: `ブッキングカーブ`, `ブッキングカーブ集計`。
