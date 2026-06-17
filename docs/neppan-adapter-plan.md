# ねっぱん adapter（M14）実装計画書

format (A) 泊明細CSV（44列, cp932, 1予約×1泊分解済）専用 / バックエンド先行 / PIIゼロ漏洩

---

## 1. スコープと前提

### 1.1 対象スコープ

本計画は **ねっぱん adapter（M14）** の実装計画である。製品はトラベルコネクト（Travel-Connect）が契約施設向けに提供する宿泊BIダッシュボードで、マルチPMS（minpakuIN・ねっぱん・手間いらず）対応が必須要件。本タスクはそのうち **ねっぱん adapter** を実装する。

| 項目 | 内容 |
|---|---|
| 対象フォーマット | **format (A) 泊明細CSV のみ**（44列, cp932, 1予約×1泊に分解済。例: `コテージスターハウス今帰仁.csv`） |
| 対象外フォーマット | **format (B) 20列「予約一覧CSV」**（例: `8223_…csv`）。列名が異なり必須列（`泊目`/`大人合計額`等）が欠落するため本 adapter では扱わない。要件§5.2 は 8223 を**手間いらず**と記載しており、**手間いらず adapter=次フェーズ**の領域 |
| 実行層 | バックエンド（`lib/adapters/neppan.ts`）。フロントエンドは本計画スコープ外 |
| 文字コード | **cp932 固定**（UnicodeDecodeError 耐性のため行単位フォールバックを持つ） |
| PII方針 | PII列を canonical / mart / API / preview / ログ / fixture / 成果物に**一切出さない** |

### 1.2 format (B) を扱わない判定（adapter `detect()`）

`detect()` は format (A) の44列ヘッダ署名で判定する。最低限 **`泊目` ＋ `予約サイト名称` ＋ `大人合計額` の同時存在**を必須条件とする。format (B) は `泊目`/`大人合計額` を欠き、列名揺れ（`予約サイト名称↔予約サイト名`、`室数↔部屋数`、`大人人数計↔大人人数`）と日付区切り（`YYYY-MM-DD`）が異なるため、`detect()` は `false` を返す。これにより 8223 系 CSV を本 adapter が誤って取り込むことを防ぐ。

### 1.3 検証基準

| 基準 | 内容 | フェーズ |
|---|---|---|
| **parity（旧onhand ETL）** | 旧 `transform.py` / `sanitize_csv.py` / `cli.py` の集計結果と突合。集計キー `(facility_name, reservation_no, stay_date)`、`revenue=sum / rooms=max / guests=max`、旧 revenue は **大人+子供+幼児の3要素和（その他合計額は未加算）**、`dropna(stay_date, application_date, update_datetime)` | **当面の主基準** |
| **Excel突合（将来）** | `コルディオレポートNEW.xlsm`（detail-design §12）と mart を施設×月×税表示で突合。端数差は `fee_adjustment_rules`（divisor/tax_rounding）で吸収 | 将来 |

### 1.4 既存実装の現状

`lib/adapters` には型定義のみが存在し、adapter 実体は**未着手**。

| ファイル | 現状 |
|---|---|
| `lib/adapters/canonical-schema.ts` | `CanonicalStayNight` の Zod スキーマ（`canonicalStayNightSchema`）、`feeAdjustmentRuleSchema` 等。実装済み |
| `lib/adapters/types.ts` | `ImportAdapter` インターフェース（`detect`/`parse`/`validate`/`normalize` の4メソッド）、`NormalizeContext`、`RawFileContext` 等。実装済み |
| `lib/adapters/neppan.ts` | **未作成（本計画で新規作成）** |
| `lib/adapters/__tests__/canonical-schema.test.ts` | 既存。テスト規約（`describe/it/expect`、`@/lib/...` エイリアス、PIIなしダミー factory、Agoda `grossDivisor=0.88` 例）の参照元 |
| migrations | `20260617090300_canonical.sql`（canonical / unique key）、`20260617090400_ingest.sql`（`staging_rows.raw_payload`=PII保持可 / `validation_errors.message`=PII禁止）、`20260617090500_mart.sql`、`20260617090200_app_master.sql`（`source_facilities` unique=`(source_system, source_facility_code)`） |

---

## 2. 入力フォーマット(44列)と canonical 列マッピング

### 2.1 列番号の表記ゆれと、列名ベースのマッピング方針（最重要前提）

ねっぱん資料 `neppan-csv-revenue-rooms-logic.md §1(A)` は **0 始まり**で列番号を振っている（実データ探索ダンプと同採番: `予約ID`=0 / `室数`=11 / `大人人数計`=18 / `大人合計額`=36 / `その他合計額`=40 / `更新日`=43）。本計画の §2.2 / §2.3 の表は **1 始まりの物理列位置**で記載する（`予約ID`=1 / `室数`=12 / `大人合計額`=37 / `その他合計額`=41 / `更新日`=44）。**両者は同一の物理列を指す**（資料に誤りがあるわけではなく、0 始まり / 1 始まりの採番の違いにすぎない）。

混乱と取りこぼしを避けるため、**adapter は列番号ではなく列名（日本語完全一致）でマッピングする**（旧ETL `transform.py` の `COLUMN_MAPPING` と同方式）。列番号は fixture 設計・列数補修の確認用に限る。実装時は実ファイルのヘッダ行（PIIなし）で 44 列名を再確認し、必須列欠落は取込を止める（§3）。

> **PII 遮断も位置レンジではなく列名 allow/deny リスト方式**で行う。位置で実装すると 0/1 始まりの取り違えで `法人情報` 等を canonical へ漏らす致命リスクがあるため。

### 2.2 確定ヘッダ44列（1始まり実位置）

| # | 列名 | # | 列名 | # | 列名 | # | 列名 |
|---|---|---|---|---|---|---|---|
| 1 | 予約ID | 12 | **室数** | 23 | 備考2 | 34 | 大人単価 |
| 2 | 予約区分 | 13 | 宿泊者氏名 🔒 | 24 | メモ | 35 | 子供単価 |
| 3 | 予約番号 | 14 | 宿泊者氏名カタカナ 🔒 | 25 | 食事 | 36 | 幼児単価 |
| 4 | 泊目 | 15 | 電話番号 🔒 | 26 | **料金合計額** | 37 | **大人合計額** |
| 5 | チェックイン日 | 16 | 郵便番号 🔒 | 27 | ポイント額 | 38 | **子供合計額** |
| 6 | チェックアウト日 | 17 | 住所1 🔒 | 28 | ポイント割引額 | 39 | **幼児合計額** |
| 7 | 申込日 | 18 | メールアドレス 🔒 | 29 | 決済方法 | 40 | その他明細 |
| 8 | 泊数 | 19 | 大人人数計 | 30 | 予約者氏名 🔒 | 41 | **その他合計額** |
| 9 | 予約サイト名称 | 20 | 子供人数計 | 31 | 予約者氏名カタカナ 🔒 | 42 | 商品プランコード |
| 10 | 部屋タイプ名称 | 21 | 幼児人数計 | 32 | 会員番号 🔒 | 43 | チェックイン時刻 |
| 11 | 商品プラン名称 | 22 | 備考1 | 33 | 法人情報 🔒 | 44 | 更新日 |

🔒 = PII列。**PII allow-block リスト（実1始まり）= 13, 14, 15, 16, 17, 18, 30, 31, 32, 33**。加えて自由記述列 **22 備考1 / 23 備考2 / 24 メモ** は PII 混入常習列のため canonical へ写さない（29 決済方法は PII ではないが canonical 非保持）。

### 2.3 canonical 列マッピング表（`CanonicalStayNight` 全フィールド）

凡例: **由来** = raw列(1始まり)直値 / 算出式 / 固定値 / context(マスタ解決) / 除外。`row[n]` は当該泊行の値。

#### ソース識別

| canonical (camel / db) | 由来 | 式・規則 |
|---|---|---|
| `sourceSystem` / `source_system` | 固定値 | `"neppan"` |
| `currentRecordKey` / `current_record_key` | 算出 | `neppan + "|" + facility_id + "|" + reservation_key + "|" + stay_date + "|" + room_type_raw + "|" + room_no + "|" + stay_night_index`。`room_no=""`。`room_type_normalized`/`budget_room_type` は**含めない**（mapping変更で key が動かないため） |
| `ingestBatchId` / `ingest_batch_id` | context | 取込 batch の uuid。呼出側が注入 |

#### 施設・予約

| canonical | 由来 | 式・規則 |
|---|---|---|
| `facilityId` / `facility_id` | context | `resolveFacilityId({sourceSystem:"neppan", sourceFacilityCode, sourceFacilityName})`。format(A) に施設識別列は無く、施設名は**CSVファイル名 stem**。解決不可は `UNKNOWN_FACILITY`(error) |
| `reservationKey` / `reservation_key` | 列1 + 列3 | `予約ID + "|" + 予約番号` = `row[1] + "|" + row[3]` |
| `checkinCode` / `checkin_code` | なし | `null`（ねっぱんにチェックインコード列なし） |
| `otaReservationNo` / `ota_reservation_no` | 列3 | `予約番号` = `row[3]` |
| `status` / `status` | 列2 | `予約区分` = `row[2]`（"予約"/"キャンセル"/"変更" を raw 保持） |
| `isCancelled` / `is_cancelled` | 算出（列2） | `row[2] === "キャンセル"`。**"変更" は false で通常集計対象** |
| `channel` / `channel` | 列9 | `予約サイト名称` = `row[9]`（raw値を保持）。正規化は `resolveChannel({channelRaw})` で別途取得し fee rule 照合・mart 表示に使用。解決不可は `UNKNOWN_CHANNEL`(warning) |

#### 日付（JST暦日。CSVは `YYYY/MM/DD`、更新日は `YYYY/MM/DD HH:MM:SS`）

| canonical | 由来 | 式・規則 |
|---|---|---|
| `stayDate` / `stay_date` | 算出（列5+列4） | `parseDate(row[5]) + (int(row[4]) - 1)日` → `YYYY-MM-DD`。作成不能は `MISSING_REQUIRED_DATE`(error) |
| `stayMonth` / `stay_month` | 算出 | `stay_date` 月初 `YYYY-MM-01`（Zod `monthString` `^\d{4}-\d{2}-01$`） |
| `checkinDate` / `checkin_date` | 列5 | `parseDate(row[5])` → `YYYY-MM-DD` |
| `checkoutDate` / `checkout_date` | 列6 | `parseDate(row[6])` → `YYYY-MM-DD`（全行充足。canonical 必須でなく nullish） |
| `bookedAt` / `booked_at` | 列7 | `申込日`（**`予約日`でなく`申込日`が正**）。日付のみ→JST `YYYY-MM-DDT00:00:00+09:00`（Zod `z.iso.datetime({offset:true})`）。欠損は null |

#### 部屋

| canonical | 由来 | 式・規則 |
|---|---|---|
| `roomTypeRaw` / `room_type_raw` | 列10 | `部屋タイプ名称`。key 構成要素のため raw 保持（空欄許容） |
| `roomTypeNormalized` / `room_type_normalized` | context | `resolveRoomType(...).roomTypeNormalized`。解決不可は `UNKNOWN_ROOM_TYPE`(warning)、null |
| `budgetRoomType` / `budget_room_type` | context | `resolveRoomType(...).budgetRoomType`。null 許容 |
| `roomNo` / `room_no` | 固定値 | `""`（部屋番号列なし。Zod `default("")` / SQL `not null default ''`） |

> 列11 `商品プラン名称`・列42 `商品プランコード` は検算・mapping補助。canonical 専用列が無いため**載せない**。

#### 泊数・室数・人数

| canonical | 由来 | 式・規則 |
|---|---|---|
| `nights` / `nights` | 列8 | `int(row[8])`（全泊行で同値） |
| `stayNightIndex` / `stay_night_index` | 列4 | `int(row[4])`（1始まり、最大30） |
| `soldRoomNights` / `sold_room_nights` | 列12 | `numeric(row[12])`。**物理展開しない**。`<= 0` は `INVALID_ROOM_COUNT`(error)。同一キー複数行は **max** |
| `adultCount` / `adult_count` | 列19 | `int(row[19])` |
| `childCount` / `child_count` | 列20 | `int(row[20])` |
| `guestCount` / `guest_count` | 算出（列19+20+21） | `大人人数計 + 子供人数計 + 幼児人数計`。**幼児は専用列が無く guest_count にのみ寄与**。同一キー複数行は **max** |

#### 金額（補正前。監査・検算用）

| canonical | 由来 | 式・規則 |
|---|---|---|
| `grossAmount` / `gross_amount` | 算出（列37+38+39+41） | `大人合計額 + 子供合計額 + 幼児合計額 + その他合計額`。**新spec=4要素**。空欄/非数値→0、非数値文字列は `INVALID_AMOUNT`(error)。同一キー複数行は **sum** |
| `taxAmount` / `tax_amount` | 算出 | `floor(gross_amount * 10 / 110)`（税込・10%逆算） |
| `netAmount` / `net_amount` | 算出 | `gross_amount - tax_amount` |

> 検算用（canonical非搭載、validation内のみ）: `reservation_total_amount = 料金合計額`（列26）。**全泊行に同値繰り返し → 単純SUM禁止**。予約単位で `sum(gross_amount)` と比較し1円超差で `AMOUNT_TOTAL_MISMATCH`(warning)。単価34/35/36・その他明細40・ポイント27/28・食事25・決済方法29・備考22-24 は canonical 非搭載。

#### 金額（手数料補正後。表示・mart集計はこちら）

| canonical | 由来 | 式・規則 |
|---|---|---|
| `feeAdjustedGrossAmount` / `fee_adjusted_gross_amount` | 算出 | `round(gross_amount / gross_divisor)`。**ねっぱんは `gross_divisor=1`**（補正なし）→ gross と同値 |
| `feeAdjustedTaxAmount` / `fee_adjusted_tax_amount` | 算出 | `round_fn(fee_adjusted_gross * tax_rate / (1 + tax_rate))`、`round_fn=floor`、`tax_rate=0.10` → `floor(gross*10/110)` |
| `feeAdjustedNetAmount` / `fee_adjusted_net_amount` | 算出 | `fee_adjusted_gross - fee_adjusted_tax` |
| `feeAdjustmentRuleId` / `fee_adjustment_rule_id` | context | `feeRules` から `source_system="neppan"`（または channel一致）かつ `valid_from <= stay_date <= valid_to(or null)` で選択（`neppan_tax10` 相当）。該当無は `null` |

#### 国籍（ねっぱんに国籍列なし）

| canonical | 由来 | 式・規則 |
|---|---|---|
| `countryRaw` / `country_raw` | 固定値 | `"不明"` |
| `countryNormalized` / `country_normalized` | 固定値 | `"不明"` |
| `countryMajor` / `country_major` | 固定/context | `"不明"`（`country_mappings` に "不明"→major/middle="不明" を seed 推奨） |
| `countryMiddle` / `country_middle` | 固定/context | `"不明"` |

#### 集計制御・更新日

| canonical | 由来 | 式・規則 |
|---|---|---|
| `isStayNight` / `is_stay_night` | 算出 | format(A) は1泊1行分解済（チェックアウト日のみの行を持たない）→ **`true` 固定** |
| `leadTimeDays` / `lead_time_days` | 算出 | `stay_date - booked_at::date`。欠損時 null |
| `isValidLeadTime` / `is_valid_lead_time` | 算出 | `booked_at あり かつ lead_time_days >= 0`。違反は `LEAD_TIME_INVALID`(warning) |
| `sourceUpdatedAt` / `source_updated_at` | 列44 | `更新日`（`YYYY/MM/DD HH:MM:SS`）→ JST(+09:00) timestamptz。**unique key 非搭載**（後勝ち判定用） |
| `createdAt` / `created_at` | DB既定 | `now()`（normalize 出力対象外） |

### 2.4 PII・非搭載列の扱い（明示）

| 実列 | 列名 | canonical | staging | 備考 |
|---|---|---|---|---|
| 13,14 | 宿泊者氏名/カナ | **除外** | raw_payload 残存 | normalize 参照禁止 |
| 15 | 電話番号 | **除外** | 同上 | |
| 16 | 郵便番号 | **除外** | 同上 | |
| 17 | 住所1 | **除外** | 同上 | カンマ未エスケープ→列数補修対象 |
| 18 | メールアドレス | **除外** | 同上 | |
| 30,31 | 予約者氏名/カナ | **除外** | 同上 | |
| 32 | 会員番号 | **除外** | 同上 | |
| 33 | 法人情報 | **除外** | 同上 | off-by-one で取りこぼし注意 |
| 22,23,24 | 備考1/備考2/メモ | **除外（PII混入リスク）** | 同上 | 自由記述 |

PII は `ingest.staging_rows.raw_payload`(jsonb) には保持されるが（admin/operator のみ取得）、`normalize()` は上記列を一切読まず、canonical_payload・preview・validation message・log・fixture に値を出さない。preview API はマスク（`***`）または非返却。

---

## 3. パース＆サニタイズ設計

parse 段は「行を作れたか」のみ判定し、内容妥当性（施設/金額/日付の意味検証）は §7 validation 段へ寄せる。隔離は専用ファイルを作らず `ingest.staging_rows`（`parse_status` / `parse_errors`）に内包する。

### 3.1 デコードと dtype

| 旧ETL挙動 | 新実装 | parse_status / 記録先 |
|---|---|---|
| `encoding=cp932` 固定 | encoding が cp932/shift_jis でなければ batch 単位で失敗。`raw_files.encoding` に確定値記録 | UTF-8誤投入 → `import_batches.status='failed'`, `error_summary.code=ENCODING_MISMATCH`。staging_rows 作らない |
| `errors` 未指定で `UnicodeDecodeError`（施設まるごと失敗リスク） | cp932 strict が第一選択。失敗時は**行単位フォールバック**（該当行のみ `errors='replace'`、`parse_status='error'`、施設全体は落とさない） | デコード不能行 → `parse_status='error'`, `parse_errors:[{code:'DECODE_ERROR'}]`（生バイト出さない） |
| 全列 `dtype=str` | parse 段では全列 string で `raw_payload` jsonb へ。数値化・日付化は normalize 段 | — |

### 3.2 CSVサニタイズ（旧 `sanitize_csv.py` → parse段）

修復できた行は `warning`（何を直したか parse_errors に残す）、修復不能は `error`（quarantine 相当）。

| 旧ETL処理 | 発火条件 | 新挙動 | parse_status | code |
|---|---|---|---|---|
| `repair_quotes` | 壊れたダブルクォート | 補修継続 | `warning` | `QUOTE_REPAIRED` |
| `try_merge_columns` | **列数超過 ≤5**（住所/氏名のカンマ未エスケープ） | PII帯（実13-18, 特に住所17/氏名13）を結合し44列復元 | `warning` | `COLS_MERGED` |
| 同上 | 超過 > 5 | 復元せず隔離 | `error` | `COLS_OVERFLOW` |
| `try_pad_columns` | **列数不足 ≤3** | 末尾を空文字パディング | `warning` | `COLS_PADDED` |
| 同上 | 不足 ≥4 | 隔離 | `error` | `COLS_UNDERFLOW` |
| `try_shift_repair` | （旧実装は常に None＝未実装） | 列シフト自動是正は実装しない。シフト疑いは anchor 検証で落とす | `error` | `ANCHOR_INVALID` |

**ねっぱん固有の最重要注意**: 列数超過の主因は PII 帯（住所17/氏名13）のカンマ。マージで44列に戻すが、**`parse_errors.message` に PII 値を絶対出さない**。構造情報のみ残す（例 `{code:'COLS_MERGED', mergedColumnRange:[13,18], originalFieldCount:47}`）。パディングで0埋めされた金額・室数が静かに0になる欠損は parse 段で検知できないため、normalize 後に `INVALID_ROOM_COUNT`/`INVALID_AMOUNT` で再捕捉する。

### 3.3 ヘッダ照合（旧 `validate_columns` → parse段前処理）

必須14列の日本語完全一致を `ingest.mapping_profiles`（`source_system='neppan'`）の列名集合と照合。

必須14列 = 予約区分 / 予約番号 / 泊目 / チェックイン日 / 申込日 / 更新日 / 予約サイト名称 / 室数 / 大人人数計 / 子供人数計 / 幼児人数計 / 大人合計額 / 子供合計額 / 幼児合計額。1列でも欠落 → batch `failed`, `error_summary.code=HEADER_MISMATCH`（staging行作らない）。これにより format(B) 20列・UTF-8文字化けヘッダも確実に弾く。

### 3.4 anchor列検証（旧 `try_shift_repair` 枠 → parse段の行検証）

行構造が壊れていないか（列ズレ）を2アンカーで検証。正規表現はバックエンドで固定。

| anchor | 実列# | 正規表現 | 不一致時 |
|---|---|---|---|
| 予約区分 | 2 | `^(予約\|キャンセル\|変更)$` | `parse_status='error'`, `code:ANCHOR_INVALID`(`field:予約区分`) |
| 更新日 | 44 | `^\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}$` | `parse_status='error'`, `code:ANCHOR_INVALID`(`field:更新日`) |

anchor は構造判定（parse段）。日付の意味的妥当性は §7 `MISSING_REQUIRED_DATE` で別途判定する（責務分離）。

### 3.5 quarantine の扱い

- 隔離相当行 = `staging_rows.parse_status='error'`。`raw_payload` に raw 1行保持（PII含み得る、DB private）。`parse_errors` に `[{code, reason, originalLineNo}]`（PII値なし）。
- `raw_row_number` で原ファイル行と対応（旧 `__line_no__` 代替）。再取込・監査は `raw_file_id + raw_row_number` で追跡。
- preview/validation API は `parse_status='error'` 行の**件数と code のみ**返す（`raw_payload` 非返却、必要時 `***` マスク）。

### 3.6 strict / allow-partial 方針

旧ETL: `has_quarantine=true` の施設は `should_load=False` で全行スキップ。`--allow-partial` で部分取込、`--fail-on-quarantine` で隔離1件で exit 1。新システムは「ファイル=1 batch」なので batch status の分岐に写す。

| 旧モード | 新挙動（batch単位） | status遷移 |
|---|---|---|
| strict（既定） | parse error が1件でもあれば validate を blocking 扱い、commit不可 | `parsed`→`validate`→`validation_failed`(blocking) |
| allow-partial | error 行を除外し正常行だけ canonical 化。error は warning 集計に残す | `parsed`→`validated`(warning)→commit可 |
| fail-on-quarantine | error 1件で `failed` | `parsed`→`failed` |

**推奨**: モードは batch 単位の取込パラメータ（API `parse`/`validate` 引数 or mapping_profile 設定）。**既定は strict 相当**（旧運用「1行隔離→施設全データ未反映」が取りこぼしの主因だったため、まず strict で parity を一致させ warning を可視化してから部分取込を判断）。warning 集計は `import_batches.error_summary`(jsonb) に code 別件数（例 `{"COLS_MERGED":12,"QUOTE_REPAIRED":3,"AMOUNT_TOTAL_MISMATCH":41}`）。個票は `validation_errors`（PII なし）。

---

## 4. 正規化ロジック

`normalize()` の確定式（§8 の意思決定を反映）。マッピングは**日本語ヘッダ名キー（列番号非依存）**で行う。

```text
# キー生成
reservation_key      = 予約ID + "|" + 予約番号                      # 列1 + "|" + 列3
stay_date            = parse(チェックイン日,"YYYY/MM/DD") + (泊目 - 1)日   # 列5 + (列4-1)
stay_month           = stay_date の月初日（YYYY-MM-01）
room_type_raw        = 部屋タイプ名称（列10）;  room_no = ""（列なし）
current_record_key   = "neppan" + facility_id + reservation_key + stay_date
                       + room_type_raw + room_no + 泊目

# 売上（内訳合算・4要素）
gross_amount         = sum(大人合計額 + 子供合計額 + 幼児合計額 + その他合計額)  # 列37+38+39+41
                       # 空欄/非数値→0、非数値文字列はINVALID_AMOUNT(error)

# 室数・人数
sold_room_nights     = max(室数)                                    # 列12
adult_count          = max(大人人数計)  ; child_count = max(子供人数計)   # 列19/20
guest_count          = max(大人人数計 + 子供人数計 + 幼児人数計)        # 列19+20+21
nights               = 泊数（列8）;  stay_night_index = 泊目（列4）

# 税逆算（ねっぱん税込・10%・floor）
tax_amount           = floor(gross_amount * 10 / 110)
net_amount           = gross_amount - tax_amount

# 手数料補正（feeRulesをchannelで解決。ねっぱん通常 gross_divisor=1）
fee_adjusted_gross   = round(gross_amount / gross_divisor)          # divisor=1 → = gross_amount
fee_adjusted_tax     = round_fn(fee_adjusted_gross * tax_rate / (1 + tax_rate))   # round_fn=floor
fee_adjusted_net     = fee_adjusted_gross - fee_adjusted_tax

# 日付・lead
booked_at            = 申込日 + "T00:00:00+09:00"                   # 列7（時刻なし→JST 0時）
lead_time_days       = stay_date - booked_at::date
is_valid_lead_time   = (booked_at != null) && lead_time_days >= 0
source_updated_at    = 更新日（YYYY/MM/DD HH:MM:SS, JST offset付与）  # 列44

# フラグ・固定値
is_cancelled         = (予約区分 == "キャンセル")                    # "変更"はfalse
is_stay_night        = true                                         # format(A)は分解済
country_raw = country_normalized = country_major = country_middle = "不明"   # 国籍列なし

# 検算（canonical列に保存せず validation で実施）
reservation_total    = 予約単位 max(料金合計額)                       # 列26（全泊行同値→単純SUM禁止）
warning if |予約単位 sum(gross_amount) - reservation_total| > 1円    # code=AMOUNT_TOTAL_MISMATCH
parity_gross_excl_other = 大人+子供+幼児（旧ETL突合用に別途再計算）   # canonical列追加しない
```

### 4.1 算出根拠の補足

- **stay_date**: チェックインでもチェックアウトでもなく `チェックイン日 + (泊目 - 1)日`。全ドキュメント一致。
- **税逆算は floor 固定**: `gross=12000` で floor=1090, round/ceil=1091。round/ceil への取り違えを test で検出する。
- **fee_adjusted_gross の丸め**は spec 未定義のため **round（四捨五入で円整数化）**で固定（§8 D5）。ねっぱんは divisor=1 で実害なし。
- **channel 混在**: 予約サイト名称に Agoda / Trip.com が混在し得るため、adapter は「source_system=neppan 固定 divisor=1」と決め打ちせず、`resolveChannel` 正規化 channel に紐づく feeRule を `channel × valid_from/to` で解決して適用する設計とする（将来 Agoda 補正を有効化しても再取込不要）。
- **country='不明'**: 毎行 `UNKNOWN_COUNTRY` warning を出すと全行 warning で無意味なため、ねっぱんでは "不明" を既知正規値として扱い本 code は発火させない（件数のみ error_summary に出す）。

---

## 5. canonical 集約・冪等性

新 canonical には**2つの異なる「まとめ」**があり混同厳禁。M14 では明確に分離する。

### 5.1 二層構造

1. **adapter(normalize)内の集約**: 1取込ファイル内で同一 `current_record_key` に**料金内訳行が複数ある場合**に1 canonical 行へ集約。金額3系統=**sum**、室数/人数=**max**（代表値）、channel/booked_at/source_updated_at=**first**。集約元 raw 行は `staging_canonical_rows.raw_row_numbers[]` に痕跡を残す。
2. **commit時の upsert（後勝ち）**: DB の既存行に対し `unique(source_system, current_record_key)`（SQL `rsn_current_record_key_uidx`）で照合し、`source_updated_at`(列44) が新しい方を現在値として**上書き（置換）**。**ここは sum しない**。

> **取り違え厳禁**: adapter 内=「同一キーは sum 集約して1行」、commit=「キー単位で置換 upsert」。commit 時に sum すると二重計上になる。

### 5.2 集約関数（同一 current_record_key 内）

| 項目 | 集約 | 根拠 |
|---|---|---|
| `gross_amount`（および内訳3系統） | **sum** | 内訳が複数行に分割され得る（logic §4: revenue=sum） |
| `sold_room_nights` | **max** | 各明細行に同値重複記録 → max で重複排除（logic §4: rooms=max） |
| `guest_count` / `adult_count` / `child_count` | **max** | 同上（logic §4: guests=max）。行間 sum しない |
| `channel` / `booked_at` / `source_updated_at` 等 | **first**（代表値） | — |

> format(A) は1泊1行展開済のため通常は1行=1キーだが、内訳分割行のケースを集約で吸収する。新spec §4 は室数/人数の集約関数を明記していないため、本計画で「室数/人数=max、金額=sum」と確定する（§8 D6）。

### 5.3 無効日付除外（旧 dropna 相当）

`stay_date` / `booked_at`(申込日) / `source_updated_at`(更新日) のいずれかが作れない行は除外/隔離。`stay_date` 不成立は `MISSING_REQUIRED_DATE`(error) で commit 前に弾かれる。申込日/更新日欠損の扱いは §6・§11 参照。

### 5.4 検算（料金合計額 列26）

予約単位で `reservation_total = max(料金合計額)`（全泊行同値のため max/first）を取り、`sum(gross_amount)` と比較。1円超差で `AMOUNT_TOTAL_MISMATCH`(warning)。**全泊行の料金合計額を単純 SUM すると泊数倍に膨張する**ため、検算は必ず予約単位で実施する。実データでは約11%が不一致（楽天等が初泊にまとめ計上）だが warning は commit 可。

---

## 6. キャンセル・dropna・共通集計フィルタ

### 6.1 キャンセル・変更

| 予約区分（列2） | `is_cancelled` | 集計 |
|---|---|---|
| キャンセル | `true` | 通常集計から除外。canonical 行は**生成・保持**（ブッキングカーブ `with_cancelled` 用途） |
| **変更** | **`false`** | **通常集計対象**（"変更"をキャンセル扱いしない） |
| 予約 | `false` | 通常集計対象 |

実 CSV にはキャンセル 6460行・変更 500行が含まれる。`is_cancelled` の取り違えは売上全体を狂わせる最大リスクのため、test で「変更=false」を必ず固定する。

### 6.2 共通集計フィルタ

```
is_stay_night = true  AND  is_cancelled = false
```

format(A) は分解済のため `is_stay_night` は常時 true。lead系 KPI は加えて `is_valid_lead_time = true` でフィルタ。

### 6.3 dropna（無効日付）の写像

| 旧 dropna 対象 | 由来列 | 新判定 | code | severity |
|---|---|---|---|---|
| `stay_date` 欠損 | 泊目(4)/チェックイン日(5) | 算出不能 | `MISSING_REQUIRED_DATE` | error |
| `application_date`（申込日, 7）欠損 | 申込日(7) | `booked_at=null` → `is_valid_lead_time=false`、lead系除外 | `LEAD_TIME_INVALID` | warning |
| `update_datetime`（更新日, 44）欠損 | 更新日(44) | anchor 検証で `ANCHOR_INVALID`（parse error）として捕捉済 | （parse段で処理） | — |

> **方針差（parity 影響）**: 旧ETL は申込日欠損行を**行ごと落とす**（売上・室数も消える）。新システムは行を残し warning フラグ管理（売上・室数は集計に残す）。parity 突合時は新側に「申込日 not null」相当フィルタを揃える（§11 申し送り）。

---

## 7. validation ルール対応表

`import-processing-spec.md §5` の各 code を、ねっぱん44列の具体 field・式に紐づけた発火条件。

| code | severity | ねっぱん固有 発火条件（実列#・式） | 対象 field | canCommit |
|---|---|---|---|---|
| `MISSING_REQUIRED_DATE` | error | 泊目(4)/チェックイン日(5) parse 不能で `stay_date` 計算不可。チェックアウト日(6) 不正含む | `stay_date`/`checkin_date` | false |
| `UNKNOWN_FACILITY` | error | `resolveFacilityId(neppan, code/name)` が null | `facility_id` | false |
| `INVALID_AMOUNT` | error | 大人/子供/幼児/その他合計額(37/38/39/41) が**空でも0でもない非数値文字列**（空欄→0 は許容、`abc`→error） | `gross_amount` | false |
| `INVALID_ROOM_COUNT` | error | `sold_room_nights = 室数(12)` が数値化後 `<= 0`（0除算源） | `sold_room_nights` | false |
| `UNKNOWN_ROOM_TYPE` | warning | `resolveRoomType(neppan, facilityId, 部屋タイプ名称(10))` が null。`room_type_raw` 保持・`_normalized=null` で commit 可 | `room_type_normalized` | true |
| `UNKNOWN_CHANNEL` | warning | `resolveChannel(neppan, 予約サイト名称(9))` が null。表記揺れは `channel_mappings` で吸収 | `channel` | true |
| `UNKNOWN_COUNTRY` | warning | **発火させない**（国籍列なし→ "不明" を既知正規値扱い。全行 warning 無意味化を回避）。"不明" 件数は error_summary に出す | — | true |
| `AMOUNT_TOTAL_MISMATCH` | warning | 予約単位 `sum(gross_amount)` と `料金合計額(26)` が **1円超**乖離。約11%恒常発火、blocking にしない | （予約単位） | true |
| `LEAD_TIME_INVALID` | warning | `booked_at`(申込日 7) が null、または `lead_time_days < 0`（申込日>滞在日）。`is_valid_lead_time=false` | `lead_time_days`/`booked_at` | true |

### 7.1 ねっぱん固有の追加検証（§5 に無いが必要）

- **キャンセル/変更**: `is_cancelled = (予約区分=="キャンセル")` のみ true。"変更" は集計対象（validation error ではなく canonical フラグ設定）。
- **内訳二重計上防止**: 同一 `current_record_key` の複数 raw 行は `gross=sum`・`sold_room_nights=max`。誤ると室数が膨張。
- **料金合計額(26)の単純SUM禁止**: per-night ではなく予約総額の同値繰り返し。集計に使わず検算専用。
- **anchor 予約区分の値域**: `予約/キャンセル/変更` の3値前提。他値混入は `ANCHOR_INVALID` で落ちる（§11 申し送り: 実値分布での網羅確認）。

---

## 8. 意思決定・不整合（最重要）

各項目に「推奨」と「確認待ち(仮定)」を明示する。**ねっぱん資料（実コード/実データ検証済）を最優先の正**とし、新spec(import-processing §4 等)との差分を明示する。

### D1. 列番号の採番差（資料=0始まり vs 本計画=1始まり）

| | 内容 |
|---|---|
| 内容 | ねっぱん資料/データ探索ダンプは **0 始まり**採番（`予約ID`=0…`更新日`=43）、本計画 §2 は **1 始まり**採番（`予約ID`=1…`更新日`=44）。**同一の物理列を指しており資料に誤りはない**（0/1 始まりの違い）。PII も同様（資料の 0 始まり「12-17,29-32」＝本計画 1 始まり「13-18,30-33」） |
| **推奨** | **列番号に依存せず日本語ヘッダ名でマッピング**（旧 `transform.py` も `COLUMN_MAPPING` の日本語完全一致）。PII 遮断は位置レンジでなく**列名 allow/deny リスト**。`fixtures`/`mapping_profile` も列名キーで定義 |
| 確認待ち(仮定) | なし。資料の列番号は 0 始まり、本計画の列番号は 1 始まりと読めば一致 |

### D2. その他合計額（列41）の売上算入 — 旧ETL非加算 vs 新spec加算（最重要）

| | 旧ETL（`transform.py:276`） | 新spec（import §4-5 / detail §5.5） |
|---|---|---|
| gross 構成 | 大人+子供+幼児（**3要素、その他未加算**） | 大人+子供+幼児+**その他**（**4要素**） |
| 影響 | 予約単位一致 5871/6210 | +その他で 5880/6210（+9予約改善） |

| | 内容 |
|---|---|
| **推奨** | **新spec準拠（4要素=その他を含む）を canonical に保存**。canonical の真実源は import-processing §4 / detail-design §5.5。**parity 検証用に `gross_excl_other = 大人+子供+幼児`（3要素）を検証ハーネス側で再計算**（canonical 列は4要素固定、スキーマ不変、DB再取込なしで両方検証可能）。preview で「その他合計額>0 の行数・合計」を可視化し parity 差分の説明根拠にする |
| **dual parity 検証** | 同一 CSV を旧ETL に通した `(facility,予約番号,stay_date)` 単位の `revenue(3要素sum)/rooms(max)/guests(max)` と、新 canonical を「その他を除いた3要素和」「stay_date 粒度へ room_type_raw を畳む」「旧 dropna 相当フィルタ」で揃えて突合。差分主因は (i) その他合計額 +9予約、(ii) dropna で旧が落とす欠損行、の2点に限定されることを可視化 |
| 確認待ち(仮定) | 「canonical=4要素固定」をプロダクト合意とする前提（仮定）。要件初版 §2.2 は「その他/ポイント割引の算入は v1 非対象=後回し」と読めるため、**最終的にどちらを表示の真実とするかはユーザー確認待ち**。実装は両系統を併走可能にして判断を遅延させる |

### D3. 税額列: 3列 vs 2列の文書不整合

| | 内容 |
|---|---|
| 不整合 | `kpi-definitions §1`=税込/税抜/**税額**の3列。`detail-design §7.1`=税込/税抜の2列。`api-contract §1.1`=`taxMode:"gross"\|"net"` の2値。canonical/SQL/migration は **3列セット物理保持** |
| **推奨** | **物理層は3列（gross/tax/net とその fee_adjusted_*）を保持**（migration/Zod/mart 不変、M14 は3つとも書く）。**API公開は `gross\|net` の2モードに統一**（税額は gross-net で導出）。M14 adapter は `fee_adjusted_tax_amount` を**必ず埋める**（後段で税額モード有効化時に再取込不要） |
| 確認待ち(仮定) | kpi-definitions の「税額」行を「内部保持列・API当面非公開」と注記する文書修正提案（コード不変）。文書すり合わせはユーザー確認待ち |

### D4. gross_divisor は除数か乗数か

| | 内容 |
|---|---|
| 根拠 | 要件「Agoda は宿泊費/0.88」=**除算で増額**。logic §2-2 が `gross/gross_divisor`（除数）明記。Zod `grossDivisor: z.number().positive()`、test `Agoda grossDivisor=0.88` |
| **推奨（一意確定）** | **除数**。`fee_adjusted_gross = gross_amount / gross_divisor`。ねっぱんは `gross_divisor=1` で実質 no-op。channel 混在に備え `feeRules` を `channel × valid_from/to` で解決 |
| 確認待ち(仮定) | なし（除数で確定） |

### D5. fee_adjusted_gross の丸め未定義

| | 内容 |
|---|---|
| 不整合 | 除算で小数が出るが `fee_adjusted_gross` 自体の丸めが spec 未定義 |
| **推奨** | `fee_adjusted_gross` = **round（四捨五入で円整数化）**、`tax` は `tax_rounding`(=floor) を適用。Excel 突合で差が出たら `fee_adjustment_rules` で吸収 |
| 確認待ち(仮定) | ねっぱんは divisor=1 で丸め影響なし。round/floor どちらにするかの最終確定はユーザー確認待ち（実害が出るのは Agoda 等補正チャネルのみ） |

### D6. 室数/人数の集約関数が新spec §4 で未明記

| | 内容 |
|---|---|
| 不整合 | 旧ETL=室数/人数とも groupby **max**。新spec §4 は「集約」とのみ記載し関数未明記。detail §5.5/kpi §5 は代表値扱いを示唆 |
| **推奨** | 同一 `current_record_key` 内で **室数/人数=max（代表値）、金額=sum** と明文化。spec §4 への追記提案 |
| 確認待ち(仮定) | なし（旧ETL 実装＝max を正とする） |

### D7. adapter内集約 vs commit後勝ち upsert の混同

| | 内容 |
|---|---|
| リスク | §4 集約（sum）と §3/§11.2 upsert（置換）を取り違えると二重計上 |
| **推奨** | **2層分離**: adapter=同一キー sum 集約で1行 / commit=キー単位置換 upsert（sum しない） |
| 確認待ち(仮定) | なし |

### D8. is_stay_night の定義差

| | 内容 |
|---|---|
| 不整合 | minpakuIN は `stay_date != checkout_date`（チェックアウト日行除外）。ねっぱん format(A) は1泊1行分解済 |
| **推奨** | ねっぱんは **`is_stay_night = true` 固定** |
| 確認待ち(仮定) | なし |

### D9. 旧ETL dropna vs 新canonicalフラグ保持（申込日欠損）

| | 内容 |
|---|---|
| 不整合 | 旧=申込日欠損行を除外（売上も消える）。新=行残し `LEAD_TIME_INVALID` warning（売上残る）。parity 件数差の主因 |
| **推奨** | parity 比較時に新側へ「stay_date/申込日/更新日 not null」相当フィルタを揃える。mapping_profile に「申込日欠損→行除外」モード要否を検討 |
| 確認待ち(仮定) | 「申込日欠損→行除外」モードを実装するかはユーザー確認待ち |

### D10. 空欄金額の0扱い vs 非数値の INVALID_AMOUNT

| | 内容 |
|---|---|
| 不整合 | 旧ETL は `to_numeric(coerce)→fillna(0)` で空欄/非数値を黙って0化。パディング由来の静かな0欠損を露見させたい |
| **推奨** | **空欄→0 は許容**（数値化可）、**非数値文字列（`abc`等）→`INVALID_AMOUNT`(error)** と線引き |
| 確認待ち(仮定) | C10（空欄金額0）を warning にするか黙認0かは最終確定がユーザー確認待ち。test では両期待を明示 |

### 不整合サマリ表

| # | 不整合 | 出典A（正） | 出典B | 推奨 |
|---|---|---|---|---|
| D1 | 列番号の採番差(0始まり/1始まり) | 実ファイル header(列名) | — | 列名でマップ（資料に誤りなし） |
| D2 | その他合計額算入 | 旧ETL=3要素 | 新spec=4要素 | canonical=4要素固定＋3要素を検証側で再計算（dual parity） |
| D3 | 税額3列 vs 2列 | api/detail=2モード | kpi=3列 | 物理3列保持＋API2モード、fee_adjusted_tax必ず埋める |
| D4 | divisor 除数/乗数 | 要件「/0.88」=除数 | spec無明記 | 除数で確定、ねっぱんdivisor=1 |
| D5 | fee_adjusted_gross 丸め | — | spec無明記 | gross=round, tax=floor |
| D6 | 室数/人数集約関数 | 旧ETL=max | spec「集約」のみ | max(代表値)・金額sum |
| D7 | 集約 vs upsert | — | §4 と §3/§11.2 | 2層分離 |
| D8 | is_stay_night | minpakuIN=≠checkout | — | ねっぱん=true固定 |
| D9 | dropna vs フラグ | 旧=行除外 | 新=行残し | parity時フィルタ整合 |
| D10 | 空欄0 vs 非数値error | 旧=黙って0 | — | 空欄=0/非数値=error |

---

## 9. テスト計画（vitest マトリクス）＋ sanitized fixture

### 9.1 sanitized fixture 仕様

| 項目 | 値 |
|---|---|
| パス | `lib/adapters/__tests__/fixtures/neppan/cottage-star-house-nakijin.sanitized.csv` |
| 文字コード | **cp932（Shift-JIS）でディスク保存**、BOMなし、改行 CRLF |
| 構造 | **実ヘッダ44列を1列も欠かさず保持**（列名・列順は §2.2 と完全一致） |
| 施設名 | ファイル stem = `cottage-star-house-nakijin`（`source_facility_name` 解決対象） |
| 行数 | ヘッダ1 + データ約25-30行（ケース網羅優先の最小構成） |

**PIIサニタイズ規約（絶対厳守、実在値を一切転記しない）**:

| 列 | サニタイズ値 |
|---|---|
| 13 宿泊者氏名 / 30 予約者氏名 | `テスト 太郎`（固定ダミー） |
| 14 カナ / 31 予約者カナ | `テスト タロウ` |
| 15 電話番号 | `000-0000-0000` |
| 16 郵便番号 | `000-0000` |
| 17 住所1 | `テスト県テスト市1-1-1, テスト` ← **1ケースは意図的にカンマを含め**列数超過補修の素材にする |
| 18 メールアドレス | `test@example.com` |
| 32 会員番号 | 空 or `MEMBER-DUMMY` |
| 33 法人情報 | 空 |
| 29 決済方法 | `クレジットカード`（非機密の一般語） |

別 fixture `cottage-star-house-nakijin.cp932-check.csv`（cp932デコード/UTF-8 negative 検証用）を用意。

### 9.2 fixture データ行ケース（合成・丸い金額）

| ケースID | 区分 | 泊目/泊数 | 室数 | 大人/子/幼/その他合計額 | 料金合計額 | 期待 gross | 期待 tax | 関心 |
|---|---|---|---|---|---|---|---|---|
| C01 単泊標準 | 予約 | 1/1 | 1 | 11000/0/0/0 | 11000 | 11000 | 1000 | 基本・net=10000 |
| C02 3泊(3行) | 予約 | 1-3/3 | 1 | 各8000/0/0/0 | 24000 | 各8000 | 各727 | stay_date連番、列26を3回足さない |
| C03 内訳2行collapse | 予約 | 1/1 | 1 | 行A 9000・行B 0/3000 | 12000 | 12000 | 1090 | gross=sum, rooms/guests=max |
| C04 キャンセル | キャンセル | 1/1 | 1 | 7000/0/0/0 | 7000 | (除外) | — | is_cancelled=true、canonical行は残す |
| C05 変更 | 変更 | 1/1 | 1 | 13000/0/0/0 | 13000 | 13000 | 1181 | is_cancelled=false、集計対象 |
| C06 室数>1 | 予約 | 1/1 | 2 | 22000/0/0/0 | 22000 | 22000 | 2000 | sold_room_nights=2 |
| C07 その他あり | 予約 | 1/1 | 1 | 10000/0/0/**2000** | 12000 | 旧10000/新12000 | 新1090 | **dual**（D2） |
| C08 合計額不一致 | 予約 | 1/1 | 1 | 5000/0/0/0 | **9999** | 5000 | 454 | AMOUNT_TOTAL_MISMATCH |
| C09 子供幼児混在 | 予約 | 1/1 | 1 | 8000/2000/1000/0 | 11000 | 11000 | 1000 | guest=4,adult=2,child=1 |
| C10 金額空欄 | 予約 | 1/1 | 1 | (空)/0/0/0 | 0 | 0 | 0 | 空欄→0（D10） |
| C11 室数0 | 予約 | 1/1 | **0** | 5000/0/0/0 | 5000 | — | — | INVALID_ROOM_COUNT(error) |
| C12 金額非数値 | 予約 | 1/1 | 1 | `abc`/0/0/0 | 5000 | — | — | INVALID_AMOUNT(error) |
| C13 日付欠損 | 予約 | 1/1 | 1 | 5000/0/0/0 | 5000 | — | — | MISSING_REQUIRED_DATE(error) |
| C14 申込日欠損 | 予約 | 1/1 | 1 | 5000/0/0/0 | 5000 | 5000 | 454 | is_valid_lead_time=false, LEAD_TIME_INVALID |
| C15 負lead | 予約 | 1/1 | 1 | 5000/0/0/0 | 5000 | 5000 | 454 | 申込日>滞在日 → LEAD_TIME_INVALID |
| C16 室数2×2泊 | 予約 | 1-2/2 | 2 | 各12000/0/0/0 | 24000 | 各12000 | 各1090 | room-nights=4 |
| C17 住所カンマ→45列 | 予約 | 1/1 | 1 | 6000/0/0/0 | 6000 | 6000 | 545 | try_merge_columns |
| C18 末尾欠落→42列 | 予約 | 1/1 | 1 | 6000/0/0/0 | 6000 | 6000 | 545 | try_pad_columns |
| C19 後勝ち(旧/新2行) | 予約 | 1/1 | 1 | 旧5000・新5500 | — | 5500 | 500 | source_updated_at 後勝ち |
| C20 アンカー不正 | `不明区分` | 1/1 | 1 | 5000/0/0/0 | 5000 | — | — | ANCHOR_INVALID |
| C21 30泊上限 | 予約 | 30/30 | 1 | 1000/0/0/0 | 30000 | 1000 | 90 | stay_date=+29日、泊数バケット7_plus |

### 9.3 テストファイル構成

| ファイル | 対象 |
|---|---|
| `lib/adapters/__tests__/neppan-adapter.detect.test.ts` | `detect()` |
| `lib/adapters/__tests__/neppan-adapter.parse.test.ts` | `parse()`（cp932・列数補修・PII payload） |
| `lib/adapters/__tests__/neppan-adapter.validate.test.ts` | `validate()`（§5 codes） |
| `lib/adapters/__tests__/neppan-adapter.normalize.test.ts` | `normalize()`（変換式・collapse・税逆算・PII非出力） |
| `lib/adapters/__tests__/neppan-adapter.pii.test.ts` | 横断PIIガード |

既存 `canonical-schema.test.ts` の規約（`describe/it/expect`、`@/lib/...` エイリアス、`vitest.config.ts` の `include **/__tests__/**/*.test.{ts,tsx}`、env node）に合わせる。

### 9.4 テストマトリクス（抜粋）

**detect()**:

| ID | 入力 | 期待 |
|---|---|---|
| D-01 | 44列・必須日本語列含む | `true` |
| D-02 | 20列(format B, `予約サイト名`/`部屋数`) | `false` |
| D-03 | neppan ヒントだが必須列欠落(13列) | `false` |
| D-04 | encoding 未指定で cp932 推定・列名一致 | `true` |
| D-05 | minpakuIN 列構成 | `false` |
| D-06 | ヘッダのみ44列一致 | `true` |

**parse()**:

| ID | 入力 | 期待 |
|---|---|---|
| P-01 | cottage fixture(cp932) | rows.length=データ行数, sourceSystem='neppan' |
| P-02 | cp932専用fixture | 日本語列名・施設名が文字化けせずデコード |
| P-03 | 同データをUTF-8 | 列名不一致を検知(throw/error行) |
| P-04 | C17(住所カンマ45列) | 補修後44キー整列, 住所サニタイズ済 |
| P-05 | C18(42列不足) | 末尾空文字パディング44キー |
| P-06 | 5列不足(4列超) | error/隔離, parse_status='error' |
| P-07 | C20(アンカー不正) | parse_status='error', rawRowNumber付与 |
| P-08 | 任意行 | payload に PII列キー有・値はサニタイズ済, rawRowNumber 1始まり連番 |
| P-09 | shift_jis範囲外文字 | デコード失敗を行/ファイル単位 error 捕捉 |
| P-10 | クォート破損 | repair後に正しく列分割 |

**normalize()（中核、抜粋）**:

| ID | ケース | 検証 |
|---|---|---|
| N-01 | C01 | gross=11000, tax=floor=1000, net=10000, fee_adjusted_*=同値, country='不明' |
| N-03 | C01 | current_record_key = neppan+facilityId+`R001|N001`+`2026-01-10`+room_type_raw+`""`+`1` |
| N-04 | C02 | 3行、stay_date=01-10/-11/-12、stay_night_index=1/2/3、nights=3 |
| N-06 | C03 | collapse 1行、gross=12000、rooms=max=1、guests=max=3、raw_row_numbers=[..] |
| N-08/09 | C04/C05 | is_cancelled=true / =false |
| N-11 | C07 その他算入 | gross=12000（新canonical） |
| N-12 | C07 dual旧parity | parity フラグ時 gross=10000（3要素） |
| N-13 | C09 | adult=2,child=1,guest=4 |
| N-17 | 横断 | canonical 出力に PII値が一切含まれない |
| N-18 | C19 | source_updated_at=新版ISO(後勝ち) |
| N-19 | C01 | `canonicalStayNightSchema.safeParse()` を通る |
| N-21 | 端数 | tax=floor（12000→1090, round/ceilだと1091を検出） |
| N-22 | fee rule | neppan_tax10(divisor=1,floor)適用、Agoda補正は適用されない |

**validate()**:

| ID | ケース | code | severity | canCommit |
|---|---|---|---|---|
| V-01 | C01正常 | — | — | true |
| V-02 | C08 | AMOUNT_TOTAL_MISMATCH | warning | true |
| V-03 | C11 | INVALID_ROOM_COUNT | error | false |
| V-04 | C12 | INVALID_AMOUNT | error | false |
| V-05 | C13 | MISSING_REQUIRED_DATE | error | false |
| V-06 | 施設null | UNKNOWN_FACILITY | error | false |
| V-07 | room type null | UNKNOWN_ROOM_TYPE | warning | true |
| V-08 | channel null | UNKNOWN_CHANNEL | warning | true |
| V-09 | C14/C15 | LEAD_TIME_INVALID | warning | true |
| V-11 | C02 Σ=料金合計額 | mismatch出ない(差≤1) | — | true |
| V-12 | 差1円 | warning出ない | — | true |
| V-13 | 差2円 | AMOUNT_TOTAL_MISMATCH | warning | true |
| V-14 | error+warning混在 | 分離格納 | — | false |

**横断PIIガード（pii.test.ts）**:

| ID | 観点 | 期待 |
|---|---|---|
| T-S1 | fixture自体スキャン | §9.1 ダミー語以外の氏名/メール/電話様パターン無し（正規表現検査） |
| T-G1 | normalize出力 | 全 canonical 行の全フィールド連結にダミーPII値が1つも出現しない |
| T-G2 | validation issue | message/field に PII列の**値**が出ない（列名言及は可） |
| T-G3 | preview payload | PII列がマスク/除外（`***`/非返却） |
| T-G4 | ログ非出力 | console/logger に raw payload・PII値を出さない（spy assert） |

### 9.5 テスト用 NormalizeContext stub

```
resolveFacilityId({sourceFacilityName:'cottage-star-house-nakijin'}) → 固定uuid。未知→null(UNKNOWN_FACILITY)
resolveRoomType  → {normalized:'コテージ', budget:'コテージ'}。未知→null(UNKNOWN_ROOM_TYPE)
resolveChannel   → {normalized:'Booking.com'}等。未知→null(UNKNOWN_CHANNEL)
resolveCountry({countryRaw:'不明'}) → {normalized/major/middle:'不明'}
feeRules → [{ruleCode:'neppan_tax10', sourceSystem:'neppan', channelNormalized:null,
             validFrom:'2026-01-01', grossDivisor:1, taxRate:0.10, taxRounding:'floor'}]
```

---

## 10. 実装ステップ（M14 サブタスク）

作成ファイルと完了条件。`lib/adapters/neppan.ts` が adapter 本体。

| サブタスク | 内容 | 作成/変更ファイル | 完了条件 |
|---|---|---|---|
| **M14.1** | 列名定数・PII allow-list・必須14列定義 | `lib/adapters/neppan.ts`（`NEPPAN_COLUMNS`, `PII_COLUMNS`, `REQUIRED_COLUMNS`） | 列名定数が実ヘッダ44列と一致、PII allow-list=13-18/30-33＋備考22-24、必須14列定義 |
| **M14.2** | `detect()` 実装 | `lib/adapters/neppan.ts` | D-01〜D-06 緑。format(B)/minpakuIN を false |
| **M14.3** | `parse()`（cp932デコード・行単位フォールバック・ヘッダ照合・anchor検証・列数補修・quote修復・raw_payload構築） | `lib/adapters/neppan.ts`, sanitize ヘルパ（`lib/adapters/neppan-sanitize.ts` 任意分割） | P-01〜P-10 緑。PII値が parse_errors/log に出ない |
| **M14.4** | `normalize()`（§4 全式・キー生成・税逆算・fee補正・country固定・lead算出） | `lib/adapters/neppan.ts` | N-01〜N-23 緑。`canonicalStayNightSchema.safeParse` 通過 |
| **M14.5** | 同一キー集約（sum/max/first）・後勝ち準備 | `lib/adapters/neppan.ts` | N-06/N-20 緑。集約元 raw_row_numbers 痕跡 |
| **M14.6** | `validate()`（§5 codes・予約単位検算・PIIなしmessage） | `lib/adapters/neppan.ts` | V-01〜V-14 緑 |
| **M14.7** | sanitized fixture 2本作成（cp932保存） | `fixtures/neppan/cottage-star-house-nakijin.sanitized.csv` ＋ `.cp932-check.csv` | T-S1 緑。実在PIIゼロ |
| **M14.8** | 横断PIIガードテスト | `neppan-adapter.pii.test.ts` | T-G1〜T-G4 緑 |
| **M14.9** | dual parity 検証ハーネス（3要素 gross 再計算・旧ETL突合）＋ parity フィルタ整合 | `lib/adapters/__tests__/neppan-adapter.parity.test.ts`（または scripts） | 旧ETL集計と差分主因2点（その他+9・dropna欠損）に限定されることを確認 |
| **M14.10** | adapter レジストリ登録（minpakuIN/手間いらずと並ぶ adapter 配列に neppan を追加） | adapter 登録箇所（`lib/adapters/index.ts` 等） | 取込パイプラインから neppan adapter が解決される |

### 10.1 関数シグネチャ・スケッチ（実装コードではない）

```ts
// lib/adapters/neppan.ts
export const neppanAdapter: ImportAdapter = {
  sourceSystem: "neppan",
  detect(input: DetectInput): boolean { /* 必須14列の日本語完全一致 */ },
  parse(input: ParseInput): ParseResult { /* cp932 decode → sanitize → anchor → raw_payload */ },
  validate(rows: ParsedRawRow[], ctx: NormalizeContext): ValidationResult { /* §5 codes */ },
  normalize(rows: ParsedRawRow[], ctx: NormalizeContext): NormalizeResult { /* §4 式 + 集約 */ },
};
```

### 10.2 既存 D05 / R05 との対応

- **D05 受入基準への追補**（detail-design §13 D05: CP932読込/PII不含fixture/予約ID+予約番号+泊目集約/内訳二重計上なし/キャンセル/室数反映/PII不漏洩）に、本計画から以下を**追加テスト**として補強:
  - その他合計額>0 で gross が4要素和（D2 / C07・N-11）
  - 同一キー内訳複数行→金額sum・室数/人数max（D6 / C03・N-06）
  - divisor=1 で fee_adjusted_*=補正前、tax=floor(gross*10/110)（D4/D5 / N-22・N-21）
  - "変更"行が is_cancelled=false で集計対象（C05・N-09）
  - is_stay_night 常時 true（D8）
  - 予約単位 sum(gross) と料金合計額の乖離で AMOUNT_TOTAL_MISMATCH（C08・V-02）
  - 列名マッピングが採番差（0/1始まり）に関係なく正しく解決し**法人情報(列33)が PII 遮断される**（D1 / T-G1）
- **R05**: ねっぱん adapter の実装・テスト要件項目。本 M14.1〜M14.10 が R05 の実装実体に対応し、上記 D05 追補テストが受入の検証手段となる。

---

## 11. リスク・ユーザー確認事項

### 11.1 リスク

| # | リスク | 影響 | 緩和策 |
|---|---|---|---|
| R-1 | 列番号の採番差(0/1始まり)で位置レンジ実装すると `法人情報`(列33) を PII 漏洩 | 重大（PII漏洩） | 列名 allow-list 方式（M14.1）＋ T-G1 ガード |
| R-2 | adapter集約(sum)と commit upsert(置換)の取り違え | 売上二重計上 | D7 二層分離・C03 test |
| R-3 | 料金合計額(列26)を per-night SUM | 売上が泊数倍に膨張 | 予約単位検算限定・C02 test |
| R-4 | `is_cancelled` に "変更" を含めてしまう | 売上過小（500行除外） | C05/N-09 で "変更"=false 固定 |
| R-5 | UTF-8 誤投入で文字化けヘッダ | 施設まるごと取込失敗 | ENCODING_MISMATCH / HEADER_MISMATCH で明示失敗・行単位フォールバック |
| R-6 | 施設名表記ブレで複数 source_facilities に分散（name は unique 制約なし） | 別施設誤割当 or 取りこぼし | sourceFacilityCode 主導解決・name は NFKC+trim 正規化・曖昧時 UNKNOWN_FACILITY で停止・seed に表記ブレ集約 |
| R-7 | パディング由来の静かな0欠損 | 金額/室数が0に | normalize後 INVALID_AMOUNT/INVALID_ROOM_COUNT 再捕捉 |

### 11.2 ユーザー確認事項（実装着手前に確定したい）

1. **その他合計額の最終算入方針（D2）**: canonical 表示の真実を「4要素（新spec）」で確定してよいか。要件初版 §2.2 は「その他は後回し」と読める。**仮定: 4要素を canonical に保存しつつ 3要素を parity 検証で併走**で進める。違えば指示を。
2. **申込日欠損行の扱い（D9）**: 旧ETL は行除外、新は warning 残し。parity を厳密一致させるため mapping_profile に「申込日欠損→行除外」モードを設けるか。**仮定: 行残し＋parity比較時フィルタ整合**で進める。
3. **空欄金額の扱い（D10）**: 空欄→0 を黙認でよいか（warning にしないか）。**仮定: 空欄=0 許容・非数値文字列のみ error**。
4. **税額列の文書修正（D3）**: kpi-definitions の「税額」行を「内部保持・API当面非公開」と注記する文書修正に合意いただけるか（コード不変）。
5. **fee_adjusted_gross の丸め（D5）**: round で確定してよいか（ねっぱんは divisor=1 で実害なし、Agoda 等補正チャネルでのみ影響）。
6. **strict 既定（§3.6）**: parse error 1件で commit ブロック（旧 strict 相当）を既定とし、部分 commit は UI で明示選択、で合意いただけるか。
7. **anchor 予約区分の値域**: `予約/キャンセル/変更` の3値前提。実 format(A) 全データで他値（表記揺れ等）が無いことの確認可否。

### 11.3 確定事項（確認不要・本計画で固定）

- 列名マッピング（列番号非依存）、PII allow-list=実13-18/30-33＋備考22-24
- `stay_date = チェックイン日 + (泊目-1)日`、`reservation_key = 予約ID|予約番号`
- 税逆算 `floor(gross*10/110)`、gross_divisor=除数・ねっぱん=1
- 室数/人数=max・金額=sum、is_stay_night=true、country='不明'
- `is_cancelled = (予約区分=="キャンセル")`、"変更"は集計対象
- format(B) 8223 は対象外（detect で false、手間いらず次フェーズ）