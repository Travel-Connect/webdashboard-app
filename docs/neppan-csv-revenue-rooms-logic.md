# ねっぱんCSVから「売上金額」と「販売室数」を取得するロジック

最終更新: 2026-06-17

> **この資料の位置づけ / 確度**
> - 旧ETL（`onhand-report/etl` の Python）の挙動と、リポジトリ同梱の実CSV 2ファイルの中身は **実コード・実データで検証済み（確定）**。列番号は実ファイルを cp932 でデコードして突合済み。
> - 新ダッシュボード（`webdashboard-app`）の canonical / 手数料補正は **設計・仕様段階**。Zod スキーマ + SQL + 仕様書までは存在するが、補正適用の実装コードは未着手（`lib/adapters` は `canonical-schema.ts` / `types.ts` のみ）。式は仕様から再構成したもの。

---

## TL;DR

- **売上金額** = `大人合計額 + 子供合計額 + 幼児合計額`（泊明細CSVの内訳列の和）。旧ETLはここまで。新canonicalはさらに `その他合計額` を加え、OTA手数料補正後の `fee_adjusted_*` を表示・集計に使う。
- **販売室数** = `室数`列（泊明細CSV）／ `部屋数`列（予約一覧CSV）をそのまま採用。新canonicalでは `sold_room_nights`（延べ室数 = 室×泊）。
- **集計は「滞在日(stay_date)ベース」**。`stay_date = チェックイン日 + (泊目 - 1日)`。チェックイン日でもチェックアウト日でもない。
- 集計キー = `(施設名, 予約番号, 滞在日)`。**室数は max（重複排除）、売上は sum（内訳行を合算）**。
- 文字コードは **cp932（Shift-JIS）固定**。UTF-8で渡すと文字化け・列名不一致で取込失敗する。

---

## 1. 2つのCSVフォーマット

ねっぱん由来のCSVには大きく2系統あり、構造がまったく異なる。**旧ETL(`transform.py`)が処理できるのは (A) のみ**で、(B)は必須列が欠落するため `validate_columns` でエラーになる（検証で確認済み）。

### (A) 泊明細CSV（44列・1予約×1泊に分解済）

代表例: `コテージスターハウス今帰仁.csv`（cp932, 44列, 15807データ行）。同一予約番号が泊数ぶんの行に展開され、列3「泊目」が1から増加する（最大30泊）。

| 用途 | 列番号 | 列名 | 備考 |
|---|---|---|---|
| 予約区分 | 1 | 予約区分 | 予約/キャンセル/変更。キャンセル除外用 |
| 予約番号 | 2 | 予約番号 | 集計キー（末尾 `_01` 等あり） |
| 泊目 | 3 | 泊目 | 1始まり。滞在日 = チェックイン日 + (泊目-1) |
| 日付起点 | 4 | チェックイン日 | `YYYY/MM/DD` |
| 申込日 | 6 | 申込日 | first集約・dropna対象（`予約日`ではなく`申込日`が正） |
| 泊数 | 7 | 泊数 | 予約全体の泊数（全泊行で同値） |
| チャネル | 8 | 予約サイト名称 | 楽天/Booking.com/じゃらん等 |
| 室数 | **11** | **室数** | **販売室数の基準列**（1が大多数、2/3/4も） |
| 人数 | 18 / 19 / 20 | 大人人数計 / 子供人数計 / 幼児人数計 | guests = この3列の和 |
| 売上(内訳) | **36** | **大人合計額** | per-night の大人内訳額 |
| 売上(内訳) | **37** | **子供合計額** | per-night の子供内訳額 |
| 売上(内訳) | **38** | **幼児合計額** | per-night の幼児内訳額 |
| 売上(内訳) | **40** | **その他合計額** | per-night のその他料金（旧ETLは未使用） |
| 予約総額 | 25 | 料金合計額 | **予約全体の総額が全泊行に同値で繰り返し**（per-nightではない） |
| 更新日 | 43 | 更新日 | `YYYY/MM/DD HH:MM:SS`。最新版判定用 |

> 列12〜17・29〜32（氏名・カナ・電話・郵便番号・住所・メール・会員番号・法人情報）はPII。canonical/API/成果物には出さない。

**売上列の使い分け（最重要）**

- **泊(滞在日)単位**で出すなら → `大人合計額 + 子供合計額 + 幼児合計額 (+ その他合計額)` を各行で合算。
- **予約単位**で出すなら → `料金合計額`(列25) を `予約番号でmax/first`（同値繰り返しのため重複排除）。
- ⚠️ `料金合計額`を全泊行で単純SUMすると**泊数倍に膨らむ**。

### (B) 予約一覧CSV（20列・1予約1行＋室料内訳）

代表例: `8223_20260615115712.csv`（cp932, 20列, 803データ行）。チェックイン〜チェックアウトの滞在全体が1行に収まる。

| 用途 | 列番号 | 列名 | 備考 |
|---|---|---|---|
| 日付起点 | 0 | チェックイン日 | `YYYY-MM-DD`（ハイフン区切り） |
| 室数 | 2 | 部屋数 | 1予約あたりの部屋数 |
| 泊数 | 3 | 泊数 | 連泊情報の日付ペア数と全行一致 |
| チャネル | 4 | 予約サイト名 | （旧ETLの「予約サイト名称」とは別名） |
| 売上 | 11 | 合計料金 | 予約の売上総額。連泊情報の日別合計とほぼ一致 |
| 売上(検算) | 12 | 請求料金 | 合計料金とほぼ同値（17/803行で差異） |
| 売上(泊別) | 13 | 連泊情報 | `[YYYY-MM-DD] [\金額]` を泊数分繰り返し。泊日別按分の元データ |
| 予約区分 | 14 | 予約区分 | 予約/キャンセル/予約変更 |

**売上・室数の出し方**

- 売上（単純）= `合計料金`(列11) をそのまま使用。
- 売上（泊日別按分）= `連泊情報`(列13) を正規表現でパースし、各 `[日付][金額]` を滞在日に割当。**滞在日ベース集計にはこの按分が必須**。
- 延べ室数（room-nights）= `部屋数(列2) × 泊数(列3)`。

---

## 2. 売上金額の取得ロジック

### 2-1. 旧ETL（`transform.py`）

```python
# 内訳列を整数化してから加算（transform.py:257-276）
adult_amount = to_numeric(大人合計額, coerce).fillna(0).astype(int)
child_amount = to_numeric(子供合計額, coerce).fillna(0).astype(int)
infant_amount = to_numeric(幼児合計額, coerce).fillna(0).astype(int)

revenue = adult_amount + child_amount + infant_amount   # ← transform.py:276

# 集約（transform.py:287-302）
df.groupby(["facility_name", "reservation_no", "stay_date"], as_index=False).agg(
    revenue="sum",   # 内訳行を足し上げる
    rooms="max",     # 重複排除
    guests="max",
    channel="first", ...
)
```

- **`revenue` は 大人+子供+幼児 の3要素のみ**。`その他合計額`(列40) は `COLUMN_MAPPING` に存在せず**加算されない**（検証で確認 — 「+その他」は旧ETL未実装）。
- 丸めは `int` キャストのみ。税・手数料の特別処理なし。
- `sum` で集約する理由 = 同一予約・同一滞在日の金額が大人/子供/幼児や内訳で複数行に分割され得るため、足し上げる必要がある。

### 2-2. 新canonical（webdashboard-app）

補正前と手数料補正後を二重に保持し、**表示・集計は必ず `fee_adjusted_*` を参照**する。

```text
# 1) gross を内訳から合算（その他も含む）
gross_amount = 大人合計額 + 子供合計額 + 幼児合計額 + その他合計額

# 2) 税を逆算（ねっぱんは税込・税率10%・floor）
tax_amount = floor(gross_amount * 10 / 110)
net_amount = gross_amount - tax_amount

# 3) 手数料補正（ねっぱんは補正なし = gross_divisor=1）
fee_adjusted_gross = gross_amount / gross_divisor    # Agoda=0.88, Trip.com=0.85, 通常=1
fee_adjusted_tax   = round_fn(fee_adjusted_gross * tax_rate / (1 + tax_rate))  # round_fn=floor/round/ceil
fee_adjusted_net   = fee_adjusted_gross - fee_adjusted_tax

# 4) 税表示トグルで参照列を切替
#   税込 → sum(fee_adjusted_gross_amount)
#   税抜 → sum(fee_adjusted_net_amount)
#   税額 → sum(fee_adjusted_tax_amount)
```

- ねっぱんは手数料補正なし（`gross_divisor=1`）なので初期は `fee_adjusted_* = 補正前と同値`。補正例は Agoda/Trip.com で発生する。
- 補正前の `gross_amount/tax_amount/net_amount` は監査・検算用で、画面・mart集計には使わない。
- ⚠️ 手数料補正の演算式（`gross_divisor` が除数か乗数か）は仕様書に明記がなく一意確定できない、というのが検証時点の注意点。`canonical-schema.test.ts` には Agoda `grossDivisor=0.88 / taxRate=0.1 / floor` の例がある。

### 2-3. 実データの売上計算例

`コテージスターハウス今帰仁.csv` の実在行を使用:

```text
入力: 予約区分=予約, 泊目=1, 泊数=1, 予約サイト名称=Booking.com,
      室数(列11)=1, 料金合計額(列25)=9981,
      大人合計額(列36)=9981, 子供合計額(列37)=0, 幼児合計額(列38)=0, その他合計額(列40)=0

旧ETL  revenue = 9981 + 0 + 0 = 9981   （= 料金合計額9981 と一致）
新canon gross  = 9981 + 0 + 0 + 0 = 9981
        tax    = floor(9981 * 10 / 110) = floor(907.36) = 907
        net    = 9981 - 907 = 9074
        ねっぱんは補正なし → fee_adjusted_gross = 9981（税込表示）
        ADR = room_revenue / sold_room_nights = 9981 / 1 = 9981
```

**per-row と予約総額が食い違う例（注意喚起）**:

```text
3泊予約の泊目1行:
  大人合計額=0, 子供合計額=3580, 幼児合計額=0  → per-row 和 = 3580
  料金合計額(列25) = 10740               ← これは3泊分の予約総額
→ per-row の3要素和は列25と一致しない。予約単位で sum すると 10740 になる。
```

検証結果: 予約単位で `sum(大人+子供+幼児)==料金合計額` が一致したのは 5871/6210 予約、`+その他`で 5880/6210。楽天等が初泊行にまとめ計上するため約11%は不一致。**厳密な総額一致が必要なら予約単位の `料金合計額` を正とする。**

---

## 3. 販売室数の取得ロジック

### 3-1. 基本: 室数列の直接マッピング＋重複排除

```python
# 列「室数」を直接採用（算出式ではない、transform.py:39,257-260）
rooms = to_numeric(室数, coerce).fillna(0).astype(int)

# 集約時は max（transform.py:294）
rooms = groupby(facility_name, reservation_no, stay_date).agg(rooms="max")
```

`max` を使う理由 = 同一予約×同一滞在日が複数明細行に展開されても**室数は各行に同値（重複）で入る**ため、`sum`すると重複カウントになる。重複排除目的で最大値を採る。`guests`(宿泊者数)も同理由で `max`。

### 3-2. 滞在日の算出（図解）

```text
チェックイン日 = 2026/01/01, 泊数 = 3 の予約

 泊目=1 ──→ stay_date = 2026/01/01  (= チェックイン日 + 0日)
 泊目=2 ──→ stay_date = 2026/01/02  (= チェックイン日 + 1日)
 泊目=3 ──→ stay_date = 2026/01/03  (= チェックイン日 + 2日)

 stay_date = checkin_date + timedelta(days = 泊目 - 1)
 stay_month = stay_date の月初 (to_period('M'))
```

### 3-3. 延べ室数（room-nights）と sold_room_nights

- **延べ室数 = 室 × 泊**。泊明細CSV(A)は1泊1行に分解済みなので各泊行の `室数` を単純SUMで延べ室数が出る。予約一覧CSV(B)は `部屋数 × 泊数`。
- 新canonicalの **`sold_room_nights`** が室数集計の基準列。`is_stay_night=true` の宿泊日行を滞在日ベースで `SUM(sold_room_nights)` する（**`COUNT(*)` ではない** — 1行に複数室を持つため過小になる）。
  - minpakuIN: 常に `1`
  - 手間いらず／ねっぱん: 「部屋数/室数」列をそのまま入れ、部屋数>1でも物理展開せず数値として保持
- 泊数分布KPIのみ例外: 予約単位で `reservation_room_count = max(sold_room_nights)`、`sold_room_nights = reservation_room_count × nights` と再構成（チェックイン月基準）。
- `KPI`: `occupancy_rate = sold_room_nights / sellable_room_nights`、`ADR = room_revenue / sold_room_nights`、`RevPAR = room_revenue / sellable_room_nights`。`sold_room_nights <= 0` は `INVALID_ROOM_COUNT` エラー。

---

## 4. 集計キーと集計関数（まとめ表）

| 指標 | 集計関数 | 理由 |
|---|---|---|
| revenue / 売上 | **sum** | 内訳（大人/子供/幼児）や分割行を足し上げる |
| rooms / 室数 | **max** | 複数明細行に同値で重複記録されるため重複排除 |
| guests / 人数 | **max** | 同上 |
| channel / 申込日 / 更新日 等 | first | 代表値 |

```text
集計キー = (facility_name, reservation_no, stay_date)   # 旧ETL transform.py:299-302
新canonical upsert key = source_system + facility_id + reservation_key
                        + stay_date + room_type_raw + room_no + stay_night_index
  ・reservation_key = 予約ID + "|" + 予約番号
共通フィルタ（新canonical） = is_stay_night=true AND is_cancelled=false
```

`groupby` 前に `dropna(subset=["stay_date","application_date","update_datetime"])` で無効日付行を除外（transform.py:283）。

---

## 5. 元データの取得方法

```text
[ねっぱん管理画面] ──CSVエクスポート(PII含む予約明細, cp932)──┐
                                                              │
   (1) SharePoint sync : Graph APIで                          │
       'Shared Documents/ねっぱん取り込み用' 配下の *.csv を   ├─→ サニタイズ → 取込
       列挙・DL → cp932固定でデコード (cli.py:317)             │
   (2) load-local      : ローカルの *.csv を glob (--encoding既定cp932) ┘
```

### 取込パイプライン

1. **読み込み**: `encoding=cp932`、全列 `dtype=str`（transform.py:51-53）。UTF-8を渡すと文字化け・列名不一致。
2. **クォート修復**: 壊れたダブルクォートを `repair_csv_text` / `repair_quotes` で補修。
3. **列数ズレ補修**:
   - 列数超過（住所・氏名のカンマ未エスケープ）→ `try_merge_columns`（index15-20を結合）。超過>5は隔離。
   - 列数不足 → `try_pad_columns`（3列以内なら末尾を空文字パディング）。4列以上不足は隔離。
4. **アンカー列検証**: `予約区分`(予約/キャンセル/変更) と `更新日`(`YYYY/MM/DD HH:MM:SS`) を正規表現検証。不一致行は隔離。
5. **隔離(quarantine)**: 直せない行は `{施設名}_{YYYYMMDD_HHMMSS}.quarantine.csv`（UTF-8, 先頭に `__line_no__/__reason__` 列）として `./quarantine` に退避。
6. **施設名の決定**: CSVファイル名の stem（拡張子なし）。SharePointは `item.name.replace('.csv','')`、ローカルは `csv_file.stem`。

### strictモード（既定）

`has_quarantine=true` の施設は `should_load=False` で**その施設のCSV全行をDB投入スキップ**。`--allow-partial` を付けないと**1行の隔離で当該ファイル全データが反映されない**。集計の取りこぼしに直結する。`--fail-on-quarantine` 指定時は隔離1件でも exit code 1。

---

## 6. 落とし穴 / 注意点

### 列名揺れ・フォーマット差で取込失敗（検証済み）

- 旧ETLの `REQUIRED_COLUMNS`（14列）は `list(COLUMN_MAPPING.keys())` で動的生成され、**日本語完全一致**が前提。1列でも欠けると `ValueError("Missing required columns: ...")` で処理停止。
- **44列CSV** は14列すべて一致 → 正常取込。「申込日 vs 予約日」の懸念は誤りで、実列名は `申込日`(列6) で旧仕様と一致。
- **20列CSV(予約一覧)** は2列(予約区分・チェックイン日)しか一致せず、**12列が欠落** → 確実に `ValueError`。
  - `予約サイト名称` ↔ `予約サイト名`（末尾「称」なし）、`室数` ↔ `部屋数`、`大人人数計` ↔ `大人人数`（「計」なし）と**列名が微妙に違う**。
  - `予約番号`・`更新日`・`幼児列`・`金額内訳列` は**物理的に存在しない**。`泊目`(night_index)が無く `stay_date` 展開不能。
  - 日付が `YYYY-MM-DD`（ハイフン）で、旧ETLの `%Y/%m/%d`（スラッシュ）想定と非互換。
  - → 単純なリネームでは適合不可。別フォーマットとして扱う必要がある。

### 売上・室数まわり

- **`料金合計額` は予約総額が全泊行に同値で繰り返される**。単純SUMで泊数倍に膨張。予約単位は max/first で重複排除。
- per-night内訳の合算は約89%で `料金合計額` に一致するが、楽天等が初泊にまとめ計上するため約11%不一致。総額厳密一致が要るなら予約単位の `料金合計額` を正とする。
- **その他合計額(列40) は旧ETLでは未加算**。新canonicalは加算。**売上が系統で変わる**。
- 数値列は `to_numeric(coerce)→fillna(0)→astype(int)`。空欄・非数値は**0扱い**、小数は切り捨て。パディングで埋まった金額・室数が静かに0になる欠損に注意。
- `rooms=max`・`guests=max` は「同値で重複記録される」前提。**1予約が同日に複数室を別行で持つ運用なら過小計上**になり得る。
- `予約区分` にはキャンセル・変更行が含まれる（44列CSVでキャンセル6460行・変更500行）。**確定売上はキャンセル除外**が必須。

### 手数料補正の有無で売上が変わる（新canonical）

- 表示・mart集計は必ず `fee_adjusted_*`。補正前 `gross/net/tax` を使うとOTA手数料分ずれる。
- 税表示トグル（税込/税抜/税額）で参照列が切替わる。売上KPIは固定列ではない。**ただし文書間で税額列(`fee_adjusted_tax_amount`)の記載に不整合あり**（kpi-definitionsは3列、detail-design §7.1は税込/税抜の2列のみ）。要すり合わせ。
- ねっぱんは**手数料補正なし**（`gross_divisor=1`）で `fee_adjusted_*=補正前` だが、税は `floor(gross*10/110)` で逆算する。
- ねっぱんは**国籍列が無く** `country='不明'`。`guest_count = 大人人数計+子供人数計+幼児人数計`。
- ねっぱんは `予約区分=='変更'` を**キャンセル扱いにせず**通常集計対象。除外するのは `=='キャンセル'` のみ。

### その他

- `clean_snap.py` は**別データ系統**（OTAスナップ `past_reports_ota.csv`, utf-8-sig, 列名=`販売室数/客室販売金額/宿泊人数`）の異常値クレンジング専用で、`transform.py` の集計とは無関係。R1: 販売室数>500 かつ 客室販売金額==0 → 室数0・人数0。R2: 宿泊人数>1000 → 人数0。
- `try_shift_repair` は枠だけで**未実装**（常に None）。列シフト自動是正は実質効かない。
- 施設名はファイル名 stem がそのまま `facility_name` キーになるため、**命名ブレ（全角/半角・接尾辞）で別施設として重複登録**される。
- `content.decode(encoding)` は `errors` 指定なしのため、shift_jis範囲外文字が混じると `UnicodeDecodeError` で施設まるごと取り込み失敗のリスク。
- Lincoln / Snap は別フォーマット・別経路（encoding既定 `utf-8-sig`）で、ねっぱん本流の cp932 とは異なる。

---

## 7. 要件定義書との対応（トレーサビリティ）

本資料の「ねっぱん」ロジックは、原典である要件定義書（`…/入込状況表まとめ(ねっぱん)/docs/251204要件定義書.txt` および `251204要件定義書ver1.txt`）の**確定ロジックと一致**している。

| 項目 | 要件定義書の記述 | 本資料 / 実装 | 一致 |
|---|---|---|---|
| 文字コード cp932 | 初版 §3.1 | TL;DR・§5 | ✅ |
| 必須14列（予約区分/予約番号/泊目/チェックイン日/申込日/更新日/予約サイト名称/室数/大人・子供・幼児人数計/大人・子供・幼児合計額） | 初版 §3.2・ver1 §4.3 | §1(A)表 = `transform.py` の `REQUIRED_COLUMNS` | ✅ |
| 日付形式（チェックイン日/申込日=`YYYY/MM/DD`、更新日=`YYYY/MM/DD HH:MM:SS`） | 初版 §3.1 | §1(A)・§5 | ✅ |
| 滞在日 = チェックイン日 + (泊目 − 1) | 初版 §4.1・ver1 §5.1 | §3-2 | ✅ |
| **売上 = 大人合計額 + 子供合計額 + 幼児合計額** | 初版 §5.1・ver1 §5.2(L133) | §2-1（旧ETL `transform.py:276`） | ✅ |
| `料金合計額`は売上に使わない（内訳行で繰り返し入るため） | 初版 §5.1注・ver1 §5.3.1(L162) | §1(A)注記・§6 | ✅ |
| ユニークキー = (施設, 予約番号, 滞在日) | 初版 §7.1・ver1 §5.3.1(L160) | §4（`groupby` キー） | ✅ |
| 室数 = max・人数 = max（重複排除）、売上 = 合算（ユニーク化なし＝sum） | 初版 §7.2・ver1 §5.3 | §4表 | ✅ |
| 施設名 = ファイル名（拡張子除く） | 初版 §10・ver1 §4.2 | §5 | ✅ |
| キャンセル除外（前年最終は `予約区分 != "キャンセル"`） | 初版 §6.2/§8.3 | §6 | ✅ |
| ADR = 売上 ÷ 室数（`Math.floor`、室数0→0、合計行は加重平均） | ver1 §5.2(L135-141) | §3-3・`plan.md` | ✅ |
| **その他合計額を売上に含める** | 初版 §2.2「**v1では非対象／後回し**」 | 旧ETL=**未加算** ／ 新canonical=**加算** | ⚠️ 意図的な差分 |

**唯一の差分（要注意）**: `その他合計額` の扱い。要件定義書（初版 §2.2）は「『その他合計額』『ポイント割引』等を売上に含める拡張」を **v1非対象＝後回し** と明記しており、旧ETL（`transform.py`）はこれに従い **大人+子供+幼児のみ**。一方、新ダッシュボード（`webdashboard-app`）の `import-processing-spec.md §4` は `gross_amount = sum(大人合計額 + 子供合計額 + 幼児合計額 + その他合計額)` と定義し、**かつて後回しにした拡張を実装**している。**どちらの売上定義を採るかで金額が変わる**ため、移行・突合時は要確認。

> 補足: 要件定義書 Appendix（ver1 L935〜）に出てくる `base.csv` / `集計データ.xlsx`（`宿泊費`・`消費税`・CO日按分・室数=行数）は **minpaku-IN（コルディオグループ）系の別データソース**であり、本資料が対象とするねっぱんCSV（泊明細44列）とは別系統。混同しないこと（`base-csv集計ロジック.md` 参照）。

---

## 8. 参照ソース

**旧ETL（Python） — `…/入込状況表まとめ(ねっぱん)/onhand-report/`**
- `etl/src/onhand_etl/transform.py:31-48`（COLUMN_MAPPING / REQUIRED_COLUMNS）
- `transform.py:51-53`（read_csv: encoding=cp932, dtype=str）
- `transform.py:223-226,344-346`（validate_columns / 必須列欠落で ValueError）
- `transform.py:257-260`（数値列 to_numeric→fillna(0)→int）
- `transform.py:262-267`（stay_date = checkin_date + (泊目-1日)）
- `transform.py:276`（revenue = 大人+子供+幼児合計額）
- `transform.py:283`（dropna: stay_date/application_date/update_datetime）
- `transform.py:287-302`（集計キー groupby、rooms=max/guests=max/revenue=sum/他=first）
- `transform.py:56-220`（repair_csv_text / fix_row_columns / read_csv_from_text）
- `etl/src/onhand_etl/clean_snap.py:16-17,56-85`（別系統 R1/R2 クレンジング）
- `etl/src/onhand_etl/cli.py:68-187`（load-local）, `:240-382`（SharePoint sync, encoding='cp932' L317）, `:116,304`（facility_name=stem）
- `etl/src/onhand_etl/sharepoint.py:90-123`（Graph API）, `config.py:17-61`（SharePointConfig）
- `etl/src/onhand_etl/sanitize_csv.py:57-139`（repair_quotes）, `:142-187`（merge/pad）, `:190-251`（anchor検証 / shift未実装）, `:254-453`（隔離判定・write_quarantine）
- `.env.example:19-21`（SP_FOLDER_PATH='Shared Documents/ねっぱん取り込み用'）

**実データCSV（検証） — `webdashboard-app/docs/`**
- `コテージスターハウス今帰仁.csv`（泊明細, cp932, 44列, 15807行）
- `8223_20260615115712.csv`（予約一覧, cp932, 20列, 803行）

**新ダッシュボード（webdashboard-app）**
- `lib/adapters/canonical-schema.ts:50-69,87-100`（補正前/補正後金額・soldRoomNights・feeAdjustmentRuleSchema）
- `lib/adapters/__tests__/canonical-schema.test.ts:71-93`（Agoda grossDivisor=0.88/taxRate=0.1/floor 例）
- `docs/kpi-definitions.md:6-22`（共通前提・税表示別対応表）, `:24-39`（sold_room_nights/ADR/RevPAR）, `:80-92`（泊数分布の予約単位集約）
- `docs/import-processing-spec.md:114-138`（§4 ねっぱん集約ルール・§5 validation）
- `docs/web-dashboard-detail-design.md:187-232`（reservation_stay_nights列定義）, `:374-420`（ねっぱんadapter変換表）, `:418-419`（税逆算 floor(gross*10/110)）, `:484-569`（税表示トグルとmart集計）
- `docs/master-data-spec.md:111-146`（room_inventory_months / fee_adjustment_rules）
- `supabase/migrations/20260617090200_app_master.sql:40-47,92-104`, `20260617090300_canonical.sql:5-6,39,46-55,73`, `20260617090500_mart.sql:11-101`
