-- ============================================================================
-- supabase/seed.sql
-- 初期 seed。マスタデータ仕様 §2 の 37 施設と、要件定義 §2.2 の手数料補正ルール。
-- area_name は初期は未分類（NULL）を許容し、運用開始前に補完する。
-- 個人情報は一切含めない。`supabase db reset` 時に適用される。
-- ============================================================================

insert into app.facilities (facility_code, display_name, area_name, is_active) values
  ('413hamahiga',       '413はまひが HOTEL & CAFE',        null, true),
  ('airstreamamesoko',  'Airstream 天底',                  null, true),
  ('airstreamnakasone', 'Airstream 仲宗根',                null, true),
  ('amawari',           'AMAWARI',                         null, true),
  ('aquapalace',        'アクアパレス北谷',                 null, true),
  ('bosco',             'BOSCO',                           null, true),
  ('Canpou',            'サンセットリゾートカンプー',        null, true),
  ('chulaumiterrace',   '美ら海テラス',                     null, true),
  ('chulavista',        'チュラビスタ',                     null, true),
  ('gratis',            'グラティスおもろまち',             null, true),
  ('hoteltaytan',       'ホテル北谷',                       null, true),
  ('imadomari',         'プールヴィラ今泊',                 null, true),
  ('infinity',          'Infinity Hotel 那覇久茂地',        null, true),
  ('joint',             'シティコンド ジョイントホーム那覇', null, true),
  ('jyagal',            'プライベートコンド北谷ジャーガル',  null, true),
  ('kanon',             '長浜ビーチリゾート海音',           null, true),
  ('kiimi',             '紀伊見荘',                         null, true),
  ('kondokouri',        'プライベートコンド古宇利島',        null, true),
  ('koza',              'ミュージックホテルコザ',           null, true),
  ('lavasauna',         'LAVA SAUNA & VILLA',              null, true),
  ('moana',             'サ・モアナ',                       null, true),
  ('poolcondyagaji',    'ヤンバルプールコンド屋我地',        null, true),
  ('starhouse',         'コテージスターハウス今帰仁',        null, true),
  ('sunsetmihama',      'サンセットリゾート美浜',           null, true),
  ('sunsetvillage',     'ザ・サンセットビレッジ沖縄北谷',    null, true),
  ('t-room',            'Condominium T-room',              null, true),
  ('tataminoyadomihama','畳の宿 北谷美浜',                  null, true),
  ('tataminoyadonaha',  '畳の宿 那覇壺屋',                  null, true),
  ('terraceginowan',    'テラスリゾート宜野湾',             null, true),
  ('terracemihama',     'テラスリゾート美浜',               null, true),
  ('terracesintosin',   'テラスリゾート新都心',             null, true),
  ('terracetyatan',     'テラスリゾート北谷WEST',           null, true),
  ('tokinoyado',        '刻の宿 那覇',                      null, true),
  ('victoria',          'ビクトリアホテル',                 null, true),
  ('villakouri',        'プールヴィラ古宇利島',             null, true),
  ('villayagaji',       'プールヴィラ屋我地島',             null, true),
  ('rusin',             '琉心 RUSIN',                       null, true)
on conflict (facility_code) do nothing;

-- 手数料補正・税計算ルール ---------------------------------------------------
-- Agoda: 2026-01-01 以降 宿泊費 / 0.88 / Trip.com: 2026-02-01 以降 / 0.85
-- ねっぱん: 税込のため税率10%で逆算（gross_divisor=1）
insert into app.fee_adjustment_rules
  (rule_code, source_system, channel_normalized, valid_from, valid_to, gross_divisor, tax_rate, tax_rounding) values
  ('agoda_202601',   'minpakuin', 'Agoda',    date '2026-01-01', null, 0.88, 0.10, 'floor'),
  ('tripcom_202602', 'minpakuin', 'Trip.com', date '2026-02-01', null, 0.85, 0.10, 'floor'),
  ('neppan_tax10',   'neppan',    null,       date '2000-01-01', null, 1.00, 0.10, 'floor')
on conflict (rule_code) do nothing;

-- ============================================================================
-- minpakuIN 施設マスタ（DRAFT・要レビュー）
-- 方針: base.csv のレポート施設名（create_report.py の前処理後）を正とする。
-- 詳細仕様は docs/minpakuin-master-data.md。検証ハーネス scripts/verify/minpakuin-parity.ts。
-- ============================================================================

-- 1) 分割/新規の施設を追加（area_name は運用前に補完）
insert into app.facilities (facility_code, display_name, area_name, is_active) values
  ('elsinn_naha',      'コンドミニアム エルズイン 那覇樋川',          null, true),
  ('chatanhills',      'ファミリーコンド 北谷ヒルズ',                null, true),
  ('yuinoie',          '結の家',                                     null, true),  -- アクアパレス北谷から分割
  ('aquapalace_annex', 'アクアパレス北谷ANNEX（クローバー桑江）',     null, true)   -- アクアパレス北谷から分割
on conflict (facility_code) do nothing;

-- 2) 表示名を base.csv 準拠に更新（表記ゆれ/別名の吸収）
update app.facilities set display_name = 'サンセットリゾート カンプー'        where facility_code = 'Canpou';
update app.facilities set display_name = '畳の宿 那覇壼屋'                    where facility_code = 'tataminoyadonaha'; -- 壼（base.csv）
update app.facilities set display_name = 'プライベートコンド 古宇利島'        where facility_code = 'kondokouri';
update app.facilities set display_name = 'プールヴィラ 今泊'                  where facility_code = 'imadomari';
update app.facilities set display_name = 'プライベートコンド北谷 ジャーガル'  where facility_code = 'jyagal';
-- rusin(琉心 RUSIN) = base.csv「琉心 プライベートプール 恩納」（同一施設・確認済 2026-06-18）
update app.facilities set display_name = '琉心 プライベートプール 恩納'        where facility_code = 'rusin';

-- 2b) エリアと表示順（経路別実績一覧 Excel ＋ 運用指示を正: 北谷 / 北部 / 那覇 / 沖縄市）。
--     display_order = 施設の表示並び順（10刻み・運用で変更可）。エリアの並び順も
--     display_order の昇順から導出されるので、ここを編集すれば順序を変更できる。
--     ※ ファミリーコンド北谷ヒルズ(chatanhills) / コンドミニアム エルズイン那覇樋川(elsinn_naha)
--       は運営会社変更のため現行コルディオレポートから除外（area_name=null）。
alter table app.facilities add column if not exists display_order int;

update app.facilities set area_name = null, display_order = null
  where facility_code in ('chatanhills','elsinn_naha');

update app.facilities set area_name = '北谷', display_order = v.ord
  from (values ('aquapalace',10),('aquapalace_annex',20),('yuinoie',30),
               ('tataminoyadomihama',40),('jyagal',50)) as v(code, ord)
  where app.facilities.facility_code = v.code;

update app.facilities set area_name = '北部', display_order = v.ord
  from (values ('villakouri',60),('kondokouri',70),('imadomari',80),('villayagaji',90),
               ('Canpou',100),('poolcondyagaji',110),('rusin',120)) as v(code, ord)
  where app.facilities.facility_code = v.code;

update app.facilities set area_name = '那覇', display_order = v.ord
  from (values ('joint',130),('tataminoyadonaha',140)) as v(code, ord)
  where app.facilities.facility_code = v.code;

update app.facilities set area_name = '沖縄市', display_order = 150 where facility_code = 'koza';

-- 3) source_facilities: base.csv 施設名 → 施設コード（minpakuin）
insert into app.source_facilities (facility_id, source_system, source_facility_code, source_facility_name, is_active)
select f.id, 'minpakuin', v.src, v.src, true
from (values
  ('ミュージックホテルコザ',           'koza'),
  ('アクアパレス北谷',                 'aquapalace'),
  ('コンドミニアム エルズイン 那覇樋川', 'elsinn_naha'),
  ('ファミリーコンド 北谷ヒルズ',       'chatanhills'),
  ('プライベートコンド 古宇利島',       'kondokouri'),
  ('プールヴィラ 今泊',                'imadomari'),
  ('プールヴィラ古宇利島',             'villakouri'),
  ('プライベートコンド北谷 ジャーガル',  'jyagal'),
  ('シティコンド ジョイントホーム那覇',  'joint'),
  ('プールヴィラ屋我地島',             'villayagaji'),
  ('畳の宿 北谷美浜',                  'tataminoyadomihama'),
  ('畳の宿 那覇壼屋',                  'tataminoyadonaha'),
  ('サンセットリゾート カンプー',       'Canpou'),
  ('ヤンバルプールコンド屋我地',        'poolcondyagaji'),
  ('琉心 恩納',                       'rusin'),  -- リネームで統合
  ('琉心 プライベートプール 恩納',      'rusin')
) as v(src, code)
join app.facilities f on f.facility_code = v.code
on conflict (source_system, source_facility_code) do nothing;

-- 4) 部屋タイプ依存の施設分割（アクアパレス北谷 + 部屋タイプ → 別施設）。
--    budget_room_type は分割後施設名（＝予算カテゴリ）。create_report の BUDGET_TYPE_MAP は
--    全エントリが「分割後施設名」と一致するため、予算は施設名で導出する（個別 budget 行は不要）。
insert into app.room_type_mappings
  (source_system, facility_id, room_type_raw, room_type_normalized, budget_room_type, override_facility_id)
select 'minpakuin', aqua.id, v.rt, v.rt, ov.display_name, ov.id
from (values
  ('【別邸】結の家 Ⅰ',  'yuinoie'),
  ('【別邸】結の家 Ⅱ',  'yuinoie'),
  ('【別邸】クローバー',  'aquapalace_annex')
) as v(rt, ovcode)
join app.facilities aqua on aqua.facility_code = 'aquapalace'
join app.facilities ov   on ov.facility_code  = v.ovcode
on conflict do nothing;
