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
  ('agoda_202601',   null,     'Agoda',    date '2026-01-01', null, 0.88, 0.10, 'floor'),
  ('tripcom_202602', null,     'Trip.com', date '2026-02-01', null, 0.85, 0.10, 'floor'),
  ('neppan_tax10',   'neppan', null,       date '2000-01-01', null, 1.00, 0.10, 'floor')
on conflict (rule_code) do nothing;
