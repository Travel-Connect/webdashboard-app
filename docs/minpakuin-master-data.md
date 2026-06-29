# minpakuIN マスタデータ・変換仕様（create_report.py 検証済）

最終更新: 2026-06-18

> 本書は `create_report.py` を読み、実データ（`minpakuIN-download/base.csv` 545,207行）で
> 出力 `集計データ.xlsx` と**全シート ±0 一致**を確認した確定事実をまとめたもの。
> 後続の seed / マスタ / mart / adapter resolver の正とする。検証ハーネス: `scripts/verify/minpakuin-parity.ts`。

## 1. base.csv

- 正の場所: `…/コルディオグループレポートNEW/minpakuIN-download/base.csv`（親フォルダのは旧版・別物）。UTF-8 BOM。
- 列（16）: 施設名, チェックインコード, OTA予約番号, 部屋利用日, 部屋タイプ, 合計人数, チェックアウト日, 泊数, 予約受付日, 予約経路, 消費税, 宿泊費, **部屋番号**, **部屋番号|OTA予約番号|部屋利用日**, ステータス, **国**。
- 日付は `YYYY/MM/DD`（時刻成分なし）。

## 2. 集計フィルタ（指標で異なる）

| 指標 | フィルタ | 集計 |
| --- | --- | --- |
| 室数 | `親子判別=1（部屋利用日≠チェックアウト日）AND ステータス≠キャンセル済み` | 行数 = `SUM(sold_room_nights)` |
| 人数 | 同上 | `SUM(合計人数)` |
| 金額（宿泊費/消費税/税抜） | `宿泊費(補正後)≠0 AND ステータス≠キャンセル済み`（**is_stay_night では絞らない**） | `SUM` |

経路別/部屋タイプ別/国籍別/泊数分布は `groupby(dropna)`：キー（経路・部屋タイプ・OTA予約番号）が空の行は当該シートから脱落。

## 3. 手数料補正（宿泊費のみ・banker's rounding）

- 適用は **raw 予約経路の完全一致**:
  - Agoda: `予約経路.lower()=="agoda"` かつ `部屋利用日 >= 2026-01-01` → `宿泊費 = round(宿泊費 / 0.88)`
  - Trip.com: `予約経路 ∈ {"Trip.com","Trip.com Group(new)"}` かつ `部屋利用日 >= 2026-02-01` → `宿泊費 = round(宿泊費 / 0.85)`
- **消費税は補正しない**。税抜 = 補正後宿泊費 − 生消費税。
- `round` は **numpy/pandas .round()（round-half-to-even, banker's）**。`Math.round` だと一部 ±1 ずれる。
- 補正は**行ごと**に適用してから合算（合算後補正ではない）。
- 経路分析シートは **raw 予約経路** でグルーピング（補正後金額を raw 経路で集計）。→ mart の経路分析は raw channel を使う（normalized でマージしない）。

seed: `supabase/seed/channel_mappings.csv`（33経路）。`channel_normalized` は既定で raw、例外 `Trip.com Group(new)→Trip.com`（手数料ルール照合用）。`channel_group`(OTA/直販/電話/その他) は**要レビュー**（OTA/Direct フィルタ用の新規分類）。

## 4. 施設の分割・リネーム・予算部屋タイプ

base.csv の施設名は16種。create_report は前処理で以下を行う。

### 4.1 施設名リネーム（FACILITY_RENAME_MAP）
| base.csv 施設名 | レポート施設名 |
| --- | --- |
| `琉心 恩納` | `琉心 プライベートプール 恩納` |

※ base.csv には `琉心 恩納`(46行) と `琉心 プライベートプール 恩納`(39行) が併存 → リネームで1施設に統合。

### 4.2 施設分割（AQUA_PALACE_FACILITY_MAP / 施設名＝アクアパレス北谷 のとき 部屋タイプで分割）
| 部屋タイプ（清掃後） | 分割後 施設名 |
| --- | --- |
| `【別邸】結の家 Ⅰ` | `結の家` |
| `【別邸】結の家 Ⅱ` | `結の家` |
| `【別邸】クローバー` | `アクアパレス北谷ANNEX（クローバー桑江）` |

### 4.3 予算部屋タイプ（BUDGET_TYPE_MAP、未登録は施設名（分割後）にフォールバック）
| 部屋タイプ | budget_room_type |
| --- | --- |
| `プレミアムスイートコンド` | `アクアパレス北谷` |
| `上層階プレミアムスイートコンド特別仕様` | `アクアパレス北谷` |
| `【別邸】結の家 Ⅰ` / `【別邸】結の家 Ⅱ` | `結の家` |
| `【別邸】クローバー` | `アクアパレス北谷ANNEX（クローバー桑江）` |

### 4.4 部屋タイプ清掃
`部屋タイプ` はタブ削除・全角空白→半角・trim してから分割/予算判定/集計に使う。

### 4.5 base.csv 施設名 16種（出現順）
ミュージックホテルコザ / アクアパレス北谷 / コンドミニアム エルズイン 那覇樋川 / ファミリーコンド 北谷ヒルズ / プライベートコンド 古宇利島 / プールヴィラ 今泊 / プールヴィラ古宇利島 / プライベートコンド北谷 ジャーガル / シティコンド ジョイントホーム那覇 / プールヴィラ屋我地島 / 畳の宿 北谷美浜 / 畳の宿 那覇壼屋 / サンセットリゾート カンプー / ヤンバルプールコンド屋我地 / 琉心 恩納 / 琉心 プライベートプール 恩納

> **要確認（master-data-spec §2 の37施設リストとの差異）**: 表記ゆれ（`プライベートコンド 古宇利島` vs `プライベートコンド古宇利島`、`畳の宿 那覇壼屋`(壼) vs `畳の宿 那覇壺屋`(壺)）、master に無い施設（`コンドミニアム エルズイン 那覇樋川`、`ファミリーコンド 北谷ヒルズ`）、`琉心 RUSIN` と `琉心 プライベートプール 恩納` の同一性。→ source_facilities / facilities seed を作る前に「正の施設名・コード」を確定する必要がある。

## 5. 国籍分類

- `国分類リスト.xlsx`(`minpakuIN-download/`)：(施設名, 国) → (大分類, 中分類)。558行。
- **検証: 分類は施設非依存**（103国すべて施設をまたいで分類が一致）→ `country_mappings`（国→大分類/中分類）で十分。大分類 ∈ {海外, 日本, 不明}。
- base.csv の `国` が空 → `不明`。`不明` は (不明, 不明)。
- 分類キーの施設名には FACILITY_RENAME を適用（create_report と同様）。
- seed: `supabase/seed/country_mappings.csv`（103国）。country_normalized = 国名そのもの。

## 6. canonical / 集約（adapter）

- **集約しない**：1行=1室泊（sold_room_nights=1）。`current_record_key = source + facility + reservation_key + stay_date + room_type_raw + room_no + checkoutDate + cancelFlag + seq`。集約すると予約受付日（ブッキングカーブ）・合計人数（泊数分布の先頭代表値）が壊れる。
- 取込 commit は「対象施設×月を delete → insert」前提（upsert by key ではない。detail-design §11.1 と整合）。
- reservation_key = OTA予約番号、空なら チェックインコード。
- リードタイム = 部屋利用日 − 予約受付日（日付差）。泊数分布 合計人数 = グループ先頭行(CSV順)の代表値。

## 7. resolver interface への影響

- `resolveFacilityId` は施設名だけでなく **部屋タイプ依存**（アクアパレス北谷 分割）。adapter 前処理で「施設名＋部屋タイプ→実施設」を解決してから canonical 化する設計が要る。
- `resolveCountry` は本来 (施設, 国) だが、分類が施設非依存のため **国のみ**で可。
- budget_room_type は (部屋タイプ→budget、未登録は施設名) で解決。

## 8. 生成済み seed
- `supabase/seed/country_mappings.csv`（103国・確定）
- `supabase/seed/channel_mappings.csv`（33経路・channel_group は要レビュー）
- `supabase/seed.sql` に minpakuIN 施設マスタを追記（**DRAFT・要レビュー**、方針=base.csv名を正）:
  - 分割/新規4施設（elsinn_naha / chatanhills / yuinoie / aquapalace_annex）
  - 表示名を base.csv 準拠に更新（Canpou/壼屋/古宇利島/今泊/ジャーガル、rusin=琉心 プライベートプール 恩納 確認済）
  - **area_name**（料金変動資料フォルダ構成を正: 那覇・沖縄市 / 中部 / 北部 の3エリア）を17施設に付与
  - source_facilities（16 base名→施設コード、琉心系は rusin に統合）
  - room_type_mappings（分割3行・`override_facility_id` で施設振替、budget=分割後施設名）
- `supabase/migrations/20260618120000_room_type_override_facility.sql`（`override_facility_id` 追加）

### 8.1 予算部屋タイプの簡略化（検証）
create_report の `BUDGET_TYPE_MAP` 5エントリは全て「分割後施設名」と一致する（プレミアム系→アクアパレス北谷、結の家系→結の家、クローバー→ANNEX）。よって **budget_room_type = 実施設の表示名** で導出でき、個別の予算マッピング行は不要。

### 8.2 未実装（後続）
- DB ランタイム検証（`supabase db reset`）— Docker/CLI 未導入のため未実施。SQL は目視レビューのみ。
- production resolver（source_facilities / room_type override / channel / country を引く実装）は取込パイプライン（M18）で。adapter ロジック自体は検証済み。
- channel_group のレビュー（ユーザー確認中）。`部屋タイプ(予算表用)` 列の parity 突合（金額/室数は ±0 検証済だが予算列は未突合）。
- エリアは「料金変動資料」フォルダ構成（那覇・沖縄市 / 中部 / 北部）を正とする。中部は旧「北谷」を含む。
