# KPI 定義書

最終更新: 2026-06-15

## 1. 共通前提

集計対象のフィルタは**指標タイプで異なる**。これは既存 `create_report.py` の挙動を実データで検証（minpakuIN base.csv 545k行 → 集計データ.xlsx と全シート ±0 一致）した確定事実である。

| 指標タイプ | フィルタ | 補足 |
| --- | --- | --- |
| 室数 / 宿泊人数（子データ系） | `is_stay_night = true AND is_cancelled = false` | `is_stay_night` = 親子判別=1（部屋利用日 ≠ チェックアウト日）。室数は `SUM(sold_room_nights)` = 行数 |
| 金額（宿泊費 / 消費税 / 税抜・親データ系） | `fee_adjusted_gross_amount <> 0 AND is_cancelled = false` | **`is_stay_night` では絞らない**。チェックアウト日行でも補正後宿泊費 ≠ 0 の行は金額に算入する |

> 旧 `where is_stay_night AND not is_cancelled` を金額にも一律適用すると Excel と乖離する（チェックアウト日かつ宿泊費≠0 の行が落ちる）。金額側は `is_stay_night` を使わないこと。
>
> 経路別 / 部屋タイプ別 / 国籍別の各シートは `groupby(dropna)` 相当で、グループキー（経路 / 部屋タイプ / OTA予約番号 等）が空の行は当該集計から除外される。

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

予約単位集約の grain は `facility_id + reservation_key + checkin_date + room_type_raw` とする。`room_type_normalized` は集計表示属性であり、予約単位集約の同一性判定には使わない。

予約単位指標は以下で作る。

| field | definition |
| --- | --- |
| `reservation_room_count` | 同一予約・同一部屋タイプ内の `max(sold_room_nights)` |
| `sold_room_nights` | `reservation_room_count * nights` |
| `guest_count` | 同一予約・同一部屋タイプ内の代表値。日別行を sum しない |
| `room_revenue` | 同一予約・同一部屋タイプの宿泊日別 `fee_adjusted_*` を sum |

| KPI | 表示名 | 式 | 粒度 |
| --- | --- | --- | --- |
| `reservation_count` | 予約件数 | 予約数 | 施設+チェックイン月+泊数バケット |
| `sold_room_nights` | 販売室数 | 予約単位集約後の `sum(reservation_room_count * nights)` | 施設+チェックイン月+泊数バケット |
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

各 bucket の値は、条件を満たす宿泊日の累積 `sum(sold_room_nights)` とする。予約件数や売上ではない。

共通条件:

- `is_stay_night = true`
- `is_valid_lead_time = true`
- `cancel_scope = without_cancelled` の場合は `is_cancelled = false`
- bucket は範囲別ではなく累積値

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
