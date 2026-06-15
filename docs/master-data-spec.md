# マスタデータ仕様

最終更新: 2026-06-15

## 1. 目的

施設、PMS別施設名、部屋タイプ、予約経路、国籍、予算、販売可能室数、補正ルールを seed/migration で管理できるようにする。

## 2. 施設マスタ

`app.facilities.facility_code` は以下の施設IDを初期値とする。

| facility_code | display_name |
| --- | --- |
| `413hamahiga` | 413はまひが HOTEL & CAFE |
| `airstreamamesoko` | Airstream 天底 |
| `airstreamnakasone` | Airstream 仲宗根 |
| `amawari` | AMAWARI |
| `aquapalace` | アクアパレス北谷 |
| `bosco` | BOSCO |
| `Canpou` | サンセットリゾートカンプー |
| `chulaumiterrace` | 美ら海テラス |
| `chulavista` | チュラビスタ |
| `gratis` | グラティスおもろまち |
| `hoteltaytan` | ホテル北谷 |
| `imadomari` | プールヴィラ今泊 |
| `infinity` | Infinity Hotel 那覇久茂地 |
| `joint` | シティコンド ジョイントホーム那覇 |
| `jyagal` | プライベートコンド北谷ジャーガル |
| `kanon` | 長浜ビーチリゾート海音 |
| `kiimi` | 紀伊見荘 |
| `kondokouri` | プライベートコンド古宇利島 |
| `koza` | ミュージックホテルコザ |
| `lavasauna` | LAVA SAUNA & VILLA |
| `moana` | サ・モアナ |
| `poolcondyagaji` | ヤンバルプールコンド屋我地 |
| `starhouse` | コテージスターハウス今帰仁 |
| `sunsetmihama` | サンセットリゾート美浜 |
| `sunsetvillage` | ザ・サンセットビレッジ沖縄北谷 |
| `t-room` | Condominium T-room |
| `tataminoyadomihama` | 畳の宿 北谷美浜 |
| `tataminoyadonaha` | 畳の宿 那覇壺屋 |
| `terraceginowan` | テラスリゾート宜野湾 |
| `terracemihama` | テラスリゾート美浜 |
| `terracesintosin` | テラスリゾート新都心 |
| `terracetyatan` | テラスリゾート北谷WEST |
| `tokinoyado` | 刻の宿 那覇 |
| `victoria` | ビクトリアホテル |
| `villakouri` | プールヴィラ古宇利島 |
| `villayagaji` | プールヴィラ屋我地島 |
| `rusin` | 琉心 RUSIN |

`area_name` は初期 seed では未分類を許容し、運用開始前に `北谷`, `北部`, `那覇`, `沖縄市`, `その他` のいずれかへ補完する。

## 3. seed CSV

### 3.1 `facilities.csv`

| column | required | note |
| --- | --- | --- |
| `facility_code` | yes | 上記施設ID |
| `display_name` | yes | Web表示名 |
| `area_name` | yes | エリア |
| `is_active` | yes | `true` / `false` |

### 3.2 `source_facilities.csv`

PMS別の施設名/コードを `facility_code` へ紐づける。

| column | required | note |
| --- | --- | --- |
| `source_system` | yes | `minpakuin`, `neppan`, `temairazu` |
| `source_facility_code` | yes | PMS側施設コード |
| `source_facility_name` | yes | PMS側施設名 |
| `facility_code` | yes | `facilities.csv` のコード |
| `is_active` | yes | 有効フラグ |

### 3.3 `room_type_mappings.csv`

| column | required | note |
| --- | --- | --- |
| `source_system` | yes | 対象ソース |
| `facility_code` | yes | 施設 |
| `room_type_raw` | yes | raw 部屋タイプ |
| `room_type_normalized` | yes | Web表示用 |
| `budget_room_type` | yes | 予算表用 |
| `valid_from` | no | 適用開始日 |
| `valid_to` | no | 適用終了日 |

### 3.4 `channel_mappings.csv`

Agoda / Agoda.com / `[海外]Agoda` のような表記ゆれを統一する。

| column | required | note |
| --- | --- | --- |
| `source_system` | yes | 対象ソース |
| `channel_raw` | yes | raw 予約経路 |
| `channel_normalized` | yes | Web表示/集計用 |
| `channel_group` | no | OTA/直予約/電話など |
| `is_active` | yes | 有効フラグ |

### 3.5 `country_mappings.csv`

| column | required | note |
| --- | --- | --- |
| `country_raw` | yes | raw 国名 |
| `country_normalized` | yes | 表示国名 |
| `country_major` | yes | 大分類 |
| `country_middle` | yes | 中分類 |

### 3.6 `room_inventory_months.csv`

稼働率、残室、RevPAR の分母。月次で管理し、日別表示時は対象月の日数で按分する。

| column | required | note |
| --- | --- | --- |
| `facility_code` | yes | 施設 |
| `month` | yes | `YYYY-MM-01` |
| `sellable_rooms_per_day` | yes | 1日あたり販売可能室数 |
| `sellable_room_nights` | yes | 月の販売可能室泊数。通常 `sellable_rooms_per_day * 月日数` |

### 3.7 `budgets.csv`

| column | required | note |
| --- | --- | --- |
| `facility_code` | yes | 施設 |
| `month` | yes | `YYYY-MM-01` |
| `budget_room_type` | no | 空なら施設全体 |
| `budget_amount` | yes | 予算売上 |
| `budget_room_nights` | no | 予算室数 |

### 3.8 `fee_adjustment_rules.csv`

OTA/PMS別の手数料補正と税計算をコードから分離する。

| column | required | note |
| --- | --- | --- |
| `rule_code` | yes | 例: `agoda_202601`, `tripcom_202602`, `neppan_tax10` |
| `source_system` | no | 対象ソース。空なら全ソース |
| `channel_normalized` | no | 対象経路 |
| `valid_from` | yes | 適用開始日 |
| `valid_to` | no | 適用終了日 |
| `gross_divisor` | yes | Agoda なら `0.88`、Trip.com なら `0.85`、通常は `1` |
| `tax_rate` | yes | 10% なら `0.10` |
| `tax_rounding` | yes | `floor`, `round`, `ceil` |

## 4. 操作権限マトリクス

| 操作 | admin | operator | viewer | facility_user |
| --- | --- | --- | --- | --- |
| ダッシュボード閲覧 | 全施設 | 権限施設 | 権限施設 | 自施設 |
| raw upload | 可 | 可 | 不可 | 不可 |
| parse 実行 | 可 | 可 | 不可 | 不可 |
| validation 結果閲覧 | 可 | 可 | 不可 | 不可 |
| commit | 可 | 可 | 不可 | 不可 |
| mapping 編集 | 可 | 不可 | 不可 | 不可 |
| 予算編集 | 可 | 不可 | 不可 | 不可 |
| 販売可能室数編集 | 可 | 不可 | 不可 | 不可 |
| Excel 差分検証実行 | 可 | 可 | 不可 | 不可 |
| ユーザー権限付与 | 可 | 不可 | 不可 | 不可 |

service role key を使う処理は import commit、mart refresh、管理者向け seed/migration に限定する。通常の dashboard API は user session + RLS で実行する。
