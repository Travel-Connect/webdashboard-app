/* ============================================================
   lib.jsx — icons, formatters, sample data
   Modeled on the real 全施設レポート日報 (2026/06).
   Facility & aggregate figures come from the report.
   No guest PII (氏名/電話/住所/メール) anywhere.
   ============================================================ */

/* ---------- Icon (lucide UMD wrapper) ---------- */
function camel(attrs) {
  // convert lucide kebab svg attrs -> React camelCase
  const out = {};
  for (const k in attrs) {
    const ck = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[ck] = attrs[k];
  }
  return out;
}
function Icon({ name, size = 18, strokeWidth = 2, style, className }) {
  const node = (window.lucide && window.lucide.icons && window.lucide.icons[name]) || null;
  // lucide IconNode: ["svg", {attrs}, [ [tag, {attrs}], ... ]]
  const kids = node && Array.isArray(node[2]) ? node[2] : [];
  const children = kids.map(([tag, attrs], i) => React.createElement(tag, Object.assign({ key: i }, camel(attrs))));
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', style, className,
  }, children);
}

/* ---------- Formatters (JPY / Asia-Tokyo) ---------- */
const _nf = new Intl.NumberFormat('ja-JP');
const fmtInt = (n) => (n == null || isNaN(n)) ? '—' : _nf.format(Math.round(n));
const fmtYen = (n) => (n == null || isNaN(n)) ? '—' : '¥' + _nf.format(Math.round(n));
function fmtYenC(n) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e8) return '¥' + (n / 1e8).toFixed(2).replace(/\.?0+$/, '') + '億';
  if (a >= 1e4) return '¥' + _nf.format(Math.round(n / 1e4)) + '万';
  return '¥' + _nf.format(Math.round(n));
}
const fmtPct = (n, d = 1) => (n == null || isNaN(n)) ? '—' : n.toFixed(d) + '%';
const fmtPt = (n, d = 1) => (n == null || isNaN(n)) ? '—' : (n > 0 ? '+' : '') + n.toFixed(d) + 'pt';
const fmtDelta = (n, d = 1) => (n == null || isNaN(n)) ? '—' : (n > 0 ? '+' : '') + n.toFixed(d) + '%';

/* ---------- Facilities (real 15-property group) ---------- */
const FACILITIES = [
  { id: 'F001', name: 'アクアパレス北谷',                 short: 'アクアパレス北谷',     area: '北谷エリア', rooms: 24 },
  { id: 'F002', name: 'アクアパレス北谷 ANNEX（クローバー桑江）', short: '北谷ANNEX',     area: '北谷エリア', rooms: 16 },
  { id: 'F003', name: '結の家',                           short: '結の家',              area: '北谷エリア', rooms: 8 },
  { id: 'F004', name: '畳の宿 北谷美浜',                  short: '畳の宿 北谷美浜',     area: '北谷エリア', rooms: 12 },
  { id: 'F005', name: 'プライベートコンド北谷 ジャーガル', short: 'コンド北谷 ジャーガル', area: '北谷エリア', rooms: 10 },
  { id: 'F006', name: 'プールヴィラ古宇利島',             short: 'プールヴィラ古宇利島', area: '北部エリア', rooms: 14 },
  { id: 'F007', name: 'プライベートコンド 古宇利島',      short: 'コンド古宇利島',       area: '北部エリア', rooms: 18 },
  { id: 'F008', name: 'プールヴィラ 今泊',                short: 'プールヴィラ今泊',     area: '北部エリア', rooms: 6 },
  { id: 'F009', name: 'プールヴィラ屋我地島',             short: 'プールヴィラ屋我地島', area: '北部エリア', rooms: 8 },
  { id: 'F010', name: '畳の宿 那覇壺屋',                  short: '畳の宿 那覇壺屋',     area: '那覇エリア', rooms: 10 },
  { id: 'F011', name: 'シティコンド ジョイントホーム那覇', short: 'ジョイントホーム那覇', area: '那覇エリア', rooms: 20 },
  { id: 'F012', name: 'ミュージックホテルコザ',           short: 'ミュージックホテルコザ', area: '中部エリア', rooms: 30 },
  { id: 'F013', name: 'サンセットリゾート カンプー',       short: 'サンセットリゾート カンプー', area: '中部エリア', rooms: 22 },
  { id: 'F014', name: 'ヤンバルプールコンド屋我地',        short: 'ヤンバル屋我地',       area: '北部エリア', rooms: 9 },
  { id: 'F015', name: '琉心 プライベートプール 恩納',      short: '琉心 恩納',            area: '恩納エリア', rooms: 7 },
];

const PERIOD = { year: 2026, month: 6, label: '2026年6月', updated: '2026/06/15 06:10' };

/* ---------- 稼働分析 — アクアパレス北谷 / 2026年6月 (実データ・全室24) ----------
   sold, rem, occ%, guests, rev(客室販売金額), kt(客単価), adr(平均室単価), revpar, ppr(平均宿泊者数)
   lyOcc/lyRev = 前年実績 2025年6月（同日付） */
const OCC_DAILY = [
  { d: 1,  sold: 20, rem: 4,  occ: 83.3,  guests: 87,  rev: 553514,  kt: 6362,  adr: 27676, revpar: 23063, ppr: 4.35, lyOcc: 95.8, lyRev: 629570 },
  { d: 2,  sold: 15, rem: 9,  occ: 62.5,  guests: 67,  rev: 395228,  kt: 5899,  adr: 26349, revpar: 16468, ppr: 4.47, lyOcc: 91.7, lyRev: 555158 },
  { d: 3,  sold: 13, rem: 11, occ: 54.2,  guests: 59,  rev: 308311,  kt: 5226,  adr: 23716, revpar: 12846, ppr: 4.54, lyOcc: 100,  lyRev: 628293 },
  { d: 4,  sold: 15, rem: 9,  occ: 62.5,  guests: 73,  rev: 390651,  kt: 5351,  adr: 26043, revpar: 16277, ppr: 4.87, lyOcc: 83.3, lyRev: 522273 },
  { d: 5,  sold: 21, rem: 3,  occ: 87.5,  guests: 106, rev: 679755,  kt: 6413,  adr: 32369, revpar: 28323, ppr: 5.05, lyOcc: 83.3, lyRev: 515302 },
  { d: 6,  sold: 23, rem: 1,  occ: 95.8,  guests: 125, rev: 884313,  kt: 7075,  adr: 38448, revpar: 36846, ppr: 5.43, lyOcc: 100,  lyRev: 695703 },
  { d: 7,  sold: 22, rem: 2,  occ: 91.7,  guests: 113, rev: 600924,  kt: 5318,  adr: 27315, revpar: 25039, ppr: 5.14, lyOcc: 100,  lyRev: 800482 },
  { d: 8,  sold: 23, rem: 1,  occ: 95.8,  guests: 123, rev: 614485,  kt: 4996,  adr: 26717, revpar: 25604, ppr: 5.35, lyOcc: 100,  lyRev: 636366 },
  { d: 9,  sold: 22, rem: 2,  occ: 91.7,  guests: 113, rev: 543970,  kt: 4814,  adr: 24726, revpar: 22665, ppr: 5.14, lyOcc: 95.8, lyRev: 538339 },
  { d: 10, sold: 18, rem: 6,  occ: 75.0,  guests: 93,  rev: 433461,  kt: 4661,  adr: 24081, revpar: 18061, ppr: 5.17, lyOcc: 100,  lyRev: 555801 },
  { d: 11, sold: 20, rem: 4,  occ: 83.3,  guests: 96,  rev: 611005,  kt: 6365,  adr: 30550, revpar: 25459, ppr: 4.80, lyOcc: 87.5, lyRev: 517837 },
  { d: 12, sold: 20, rem: 4,  occ: 83.3,  guests: 91,  rev: 729432,  kt: 8016,  adr: 36472, revpar: 30393, ppr: 4.55, lyOcc: 100,  lyRev: 679724 },
  { d: 13, sold: 24, rem: 0,  occ: 100.0, guests: 113, rev: 1215724, kt: 10759, adr: 50655, revpar: 50655, ppr: 4.71, lyOcc: 95.8, lyRev: 712989 },
  { d: 14, sold: 22, rem: 2,  occ: 91.7,  guests: 94,  rev: 866083,  kt: 9214,  adr: 39367, revpar: 36087, ppr: 4.27, lyOcc: 100,  lyRev: 800630 },
  { d: 15, sold: 18, rem: 6,  occ: 75.0,  guests: 83,  rev: 532041,  kt: 6410,  adr: 29558, revpar: 22168, ppr: 4.61, lyOcc: 83.3, lyRev: 546338 },
  { d: 16, sold: 17, rem: 7,  occ: 70.8,  guests: 88,  rev: 503087,  kt: 5717,  adr: 29593, revpar: 20962, ppr: 5.18, lyOcc: 95.8, lyRev: 617069 },
  { d: 17, sold: 15, rem: 9,  occ: 62.5,  guests: 77,  rev: 369014,  kt: 4792,  adr: 24601, revpar: 15376, ppr: 5.13, lyOcc: 83.3, lyRev: 549074 },
  { d: 18, sold: 19, rem: 5,  occ: 79.2,  guests: 96,  rev: 629025,  kt: 6552,  adr: 33107, revpar: 26209, ppr: 5.05, lyOcc: 100,  lyRev: 669829 },
  { d: 19, sold: 22, rem: 2,  occ: 91.7,  guests: 106, rev: 894319,  kt: 8437,  adr: 40651, revpar: 37263, ppr: 4.82, lyOcc: 100,  lyRev: 810785 },
  { d: 20, sold: 24, rem: 0,  occ: 100.0, guests: 121, rev: 1049938, kt: 8677,  adr: 43747, revpar: 43747, ppr: 5.04, lyOcc: 91.7, lyRev: 832943 },
  { d: 21, sold: 20, rem: 4,  occ: 83.3,  guests: 102, rev: 679716,  kt: 6664,  adr: 33986, revpar: 28322, ppr: 5.10, lyOcc: 100,  lyRev: 966566 },
  { d: 22, sold: 19, rem: 5,  occ: 79.2,  guests: 94,  rev: 647390,  kt: 6887,  adr: 34073, revpar: 26975, ppr: 4.95, lyOcc: 100,  lyRev: 830965 },
  { d: 23, sold: 21, rem: 3,  occ: 87.5,  guests: 90,  rev: 609615,  kt: 6774,  adr: 29029, revpar: 25401, ppr: 4.29, lyOcc: 95.8, lyRev: 781125 },
  { d: 24, sold: 21, rem: 3,  occ: 87.5,  guests: 105, rev: 657510,  kt: 6262,  adr: 31310, revpar: 27396, ppr: 5.00, lyOcc: 95.8, lyRev: 802284 },
  { d: 25, sold: 18, rem: 6,  occ: 75.0,  guests: 95,  rev: 641895,  kt: 6757,  adr: 35661, revpar: 26746, ppr: 5.28, lyOcc: 100,  lyRev: 838383 },
  { d: 26, sold: 22, rem: 2,  occ: 91.7,  guests: 117, rev: 1018137, kt: 8702,  adr: 46279, revpar: 42422, ppr: 5.32, lyOcc: 100,  lyRev: 831787 },
  { d: 27, sold: 24, rem: 0,  occ: 100.0, guests: 129, rev: 1285032, kt: 9961,  adr: 53543, revpar: 53543, ppr: 5.38, lyOcc: 95.8, lyRev: 901594 },
  { d: 28, sold: 23, rem: 1,  occ: 95.8,  guests: 119, rev: 1001731, kt: 8418,  adr: 43554, revpar: 41739, ppr: 5.17, lyOcc: 95.8, lyRev: 917518 },
  { d: 29, sold: 22, rem: 2,  occ: 91.7,  guests: 109, rev: 929777,  kt: 8530,  adr: 42263, revpar: 38741, ppr: 5.52, lyOcc: 100,  lyRev: 897221 },
  { d: 30, sold: 20, rem: 4,  occ: 83.3,  guests: 100, rev: 690554,  kt: 6906,  adr: 34528, revpar: 28773, ppr: 5.00, lyOcc: 100,  lyRev: 856764 },
];
OCC_DAILY.forEach((r) => { r.ly = r.lyOcc; });

const OCC_TOTAL  = { sold: 603, rem: 117, sellable: 720, occ: 83.8, guests: 2984, rev: 20965637, kt: 7026, adr: 34769, revpar: 29119, ppr: 4.95 };
const OCC_BUDGET = { sold: 580, rem: 140, sellable: 720, occ: 80.6, guests: 2900, rev: 21692000, kt: 7480, adr: 37400, revpar: 30128, ppr: 5.00 };
const OCC_PRIOR  = { sold: 688, rem: 32,  sellable: 720, occ: 95.6, guests: 3583, rev: 21438712, kt: 5983, adr: 31161, revpar: 29776, ppr: 5.21 };

/* 前年実績 2025年6月（日次・実データ） sold,rem,occ,guests,rev,kt,adr,revpar,ppr */
const OCC_PY = [
  { d: 1,  sold: 23, rem: 1, occ: 95.8,  guests: 126, rev: 629570, kt: 4997, adr: 27373, revpar: 26232, ppr: 5.48 },
  { d: 2,  sold: 22, rem: 2, occ: 91.7,  guests: 113, rev: 555158, kt: 4913, adr: 23234, revpar: 23132, ppr: 5.14 },
  { d: 3,  sold: 24, rem: 0, occ: 100.0, guests: 120, rev: 628293, kt: 5236, adr: 26179, revpar: 26179, ppr: 5.00 },
  { d: 4,  sold: 20, rem: 4, occ: 83.3,  guests: 107, rev: 522273, kt: 4881, adr: 26114, revpar: 21761, ppr: 5.35 },
  { d: 5,  sold: 20, rem: 4, occ: 83.3,  guests: 105, rev: 515302, kt: 4908, adr: 25765, revpar: 21471, ppr: 5.25 },
  { d: 6,  sold: 24, rem: 0, occ: 100.0, guests: 117, rev: 695703, kt: 5946, adr: 28988, revpar: 28988, ppr: 4.88 },
  { d: 7,  sold: 24, rem: 0, occ: 100.0, guests: 122, rev: 800482, kt: 6561, adr: 33353, revpar: 33353, ppr: 5.08 },
  { d: 8,  sold: 24, rem: 0, occ: 100.0, guests: 108, rev: 636366, kt: 5892, adr: 26515, revpar: 26515, ppr: 4.50 },
  { d: 9,  sold: 23, rem: 1, occ: 95.8,  guests: 109, rev: 538339, kt: 4939, adr: 23406, revpar: 22431, ppr: 4.74 },
  { d: 10, sold: 24, rem: 0, occ: 100.0, guests: 128, rev: 555801, kt: 4342, adr: 23158, revpar: 23158, ppr: 5.33 },
  { d: 11, sold: 21, rem: 3, occ: 87.5,  guests: 108, rev: 517837, kt: 4795, adr: 24659, revpar: 21577, ppr: 5.14 },
  { d: 12, sold: 24, rem: 0, occ: 100.0, guests: 138, rev: 679724, kt: 4926, adr: 28322, revpar: 28322, ppr: 5.75 },
  { d: 13, sold: 23, rem: 1, occ: 95.8,  guests: 131, rev: 712989, kt: 5443, adr: 31000, revpar: 29708, ppr: 5.70 },
  { d: 14, sold: 24, rem: 0, occ: 100.0, guests: 142, rev: 800630, kt: 5638, adr: 33360, revpar: 33360, ppr: 5.92 },
  { d: 15, sold: 20, rem: 4, occ: 83.3,  guests: 109, rev: 546338, kt: 5012, adr: 27317, revpar: 22764, ppr: 5.45 },
  { d: 16, sold: 23, rem: 1, occ: 95.8,  guests: 120, rev: 617069, kt: 5142, adr: 26829, revpar: 25711, ppr: 5.22 },
  { d: 17, sold: 20, rem: 4, occ: 83.3,  guests: 97,  rev: 549074, kt: 5661, adr: 27454, revpar: 22878, ppr: 4.85 },
  { d: 18, sold: 24, rem: 0, occ: 100.0, guests: 121, rev: 669829, kt: 5536, adr: 27910, revpar: 27910, ppr: 5.04 },
  { d: 19, sold: 24, rem: 0, occ: 100.0, guests: 121, rev: 810785, kt: 6701, adr: 33783, revpar: 33783, ppr: 5.04 },
  { d: 20, sold: 22, rem: 2, occ: 91.7,  guests: 109, rev: 832943, kt: 7642, adr: 37861, revpar: 34706, ppr: 4.95 },
  { d: 21, sold: 24, rem: 0, occ: 100.0, guests: 131, rev: 966566, kt: 7378, adr: 40274, revpar: 40274, ppr: 5.46 },
  { d: 22, sold: 24, rem: 0, occ: 100.0, guests: 134, rev: 830965, kt: 6201, adr: 34624, revpar: 34624, ppr: 5.58 },
  { d: 23, sold: 23, rem: 1, occ: 95.8,  guests: 121, rev: 781125, kt: 6456, adr: 33962, revpar: 32547, ppr: 5.26 },
  { d: 24, sold: 23, rem: 1, occ: 95.8,  guests: 119, rev: 802284, kt: 6742, adr: 34882, revpar: 33429, ppr: 5.17 },
  { d: 25, sold: 24, rem: 0, occ: 100.0, guests: 118, rev: 838383, kt: 7105, adr: 34933, revpar: 34933, ppr: 4.92 },
  { d: 26, sold: 24, rem: 0, occ: 100.0, guests: 125, rev: 831787, kt: 6654, adr: 34658, revpar: 34658, ppr: 5.21 },
  { d: 27, sold: 23, rem: 1, occ: 95.8,  guests: 110, rev: 901594, kt: 8196, adr: 39200, revpar: 37566, ppr: 4.78 },
  { d: 28, sold: 23, rem: 1, occ: 95.8,  guests: 116, rev: 917518, kt: 7910, adr: 39892, revpar: 38230, ppr: 5.04 },
  { d: 29, sold: 23, rem: 1, occ: 95.8,  guests: 127, rev: 897221, kt: 7065, adr: 39010, revpar: 37384, ppr: 5.52 },
  { d: 30, sold: 24, rem: 0, occ: 100.0, guests: 131, rev: 856764, kt: 6540, adr: 35699, revpar: 35699, ppr: 5.46 },
];
const OCC_PY_TOTAL = { sold: 688, rem: 32, occ: 95.6, guests: 3583, rev: 21438712, kt: 5983, adr: 31161, revpar: 29776, ppr: 5.21 };

/* 比較日付比: 前回snapshot（2026/6/14 時点）からの差分。確定日は変化なし、17/25/26のみ更新 */
const OCC_CMP_DATE = '2026/6/14';
const OCC_CMP = {
  17: { sold: 1,  occ: 4.2,  guests: 6,  rev: 26736,  adr: 153,  revpar: 1114 },
  25: { sold: -1, occ: -4.2, guests: -7, rev: -47713, adr: -634, revpar: -1988 },
  26: { sold: -1, occ: -4.2, guests: -7, rev: -51755, adr: -238, revpar: -2156 },
};
const OCC_CMP_TOTAL = { sold: -1, occ: 0, guests: -8, rev: -72732, adr: -63, revpar: -101 };

/* budget gap + pace insight (verified against report footer) */
const OCC_INSIGHT = {
  sellable: 720, remaining: 117,
  budgetGap: OCC_BUDGET.rev - OCC_TOTAL.rev,            // ¥726,363
  budgetRate: OCC_TOTAL.rev / OCC_BUDGET.rev * 100,     // 96.6%
  yoyRevRate: OCC_TOTAL.rev / OCC_PRIOR.rev * 100,      // 97.8%
  ppr: OCC_TOTAL.ppr,
};

const _d = (cur, base) => base ? (cur / base - 1) * 100 : null;
/* KPI strip (9) — real current totals, real yoy (vs 前年) & bud (vs 予算) deltas */
const OCC_KPIS = [
  { label: '販売室数',     value: OCC_TOTAL.sold,     unit: '室', type: 'int', yoy: _d(OCC_TOTAL.sold, OCC_PRIOR.sold),     bud: _d(OCC_TOTAL.sold, OCC_BUDGET.sold) },
  { label: '販売可能室数', value: OCC_TOTAL.sellable, unit: '室', type: 'int', yoy: 0,  bud: 0 },
  { label: '稼働率',       value: OCC_TOTAL.occ,      unit: '%',  type: 'pct', yoy: OCC_TOTAL.occ - OCC_PRIOR.occ, budpt: OCC_TOTAL.occ - OCC_BUDGET.occ, primary: true },
  { label: '残室',         value: OCC_TOTAL.rem,      unit: '室', type: 'int', yoy: _d(OCC_TOTAL.rem, OCC_PRIOR.rem), bud: _d(OCC_TOTAL.rem, OCC_BUDGET.rem), invert: true },
  { label: '宿泊人数',     value: OCC_TOTAL.guests,   unit: '人', type: 'int', yoy: _d(OCC_TOTAL.guests, OCC_PRIOR.guests), bud: _d(OCC_TOTAL.guests, OCC_BUDGET.guests) },
  { label: '売上',         value: OCC_TOTAL.rev,      unit: '',   type: 'yen', yoy: _d(OCC_TOTAL.rev, OCC_PRIOR.rev),  bud: _d(OCC_TOTAL.rev, OCC_BUDGET.rev) },
  { label: 'ADR（室単価）', value: OCC_TOTAL.adr,      unit: '',   type: 'yen', yoy: _d(OCC_TOTAL.adr, OCC_PRIOR.adr),  bud: _d(OCC_TOTAL.adr, OCC_BUDGET.adr) },
  { label: 'RevPAR',       value: OCC_TOTAL.revpar,   unit: '',   type: 'yen', yoy: _d(OCC_TOTAL.revpar, OCC_PRIOR.revpar), bud: _d(OCC_TOTAL.revpar, OCC_BUDGET.revpar) },
  { label: '客単価',       value: OCC_TOTAL.kt,       unit: '',   type: 'yen', yoy: _d(OCC_TOTAL.kt, OCC_PRIOR.kt),    bud: _d(OCC_TOTAL.kt, OCC_BUDGET.kt) },
];

/* monthly trend for 年間 tab (sample, villa) */
/* ===== 年間（月次・アクアパレス北谷 2026年 実データ） ===== */
/* 当年 2026年（最新実績・snapshot反映後） */
const OCC_YEAR = [
  { m: '1月',  sold: 590, rem: 154, occ: 79.3, guests: 2825, rev: 19199897, kt: 6796,  adr: 32542, revpar: 25806, ppr: 4.79 },
  { m: '2月',  sold: 621, rem: 51,  occ: 92.4, guests: 3016, rev: 25550626, kt: 8472,  adr: 41144, revpar: 38022, ppr: 4.86 },
  { m: '3月',  sold: 653, rem: 91,  occ: 87.8, guests: 3403, rev: 24293707, kt: 7139,  adr: 37203, revpar: 32653, ppr: 5.21 },
  { m: '4月',  sold: 636, rem: 84,  occ: 88.3, guests: 2941, rev: 22380561, kt: 7610,  adr: 35190, revpar: 31084, ppr: 4.62 },
  { m: '5月',  sold: 663, rem: 81,  occ: 89.1, guests: 3414, rev: 23816810, kt: 6976,  adr: 35923, revpar: 32012, ppr: 5.15 },
  { m: '6月',  sold: 609, rem: 111, occ: 84.6, guests: 3002, rev: 21129385, kt: 7038,  adr: 34695, revpar: 29346, ppr: 4.93 },
  { m: '7月',  sold: 571, rem: 173, occ: 76.7, guests: 3038, rev: 30556298, kt: 10058, adr: 53514, revpar: 41070, ppr: 5.32 },
  { m: '8月',  sold: 386, rem: 358, occ: 51.9, guests: 2194, rev: 23136877, kt: 10546, adr: 59940, revpar: 31098, ppr: 5.68 },
  { m: '9月',  sold: 163, rem: 557, occ: 22.6, guests: 871,  rev: 7064802,  kt: 8111,  adr: 43342, revpar: 9812,  ppr: 5.34 },
  { m: '10月', sold: 122, rem: 622, occ: 16.4, guests: 658,  rev: 5525360,  kt: 8397,  adr: 45290, revpar: 7427,  ppr: 5.39 },
  { m: '11月', sold: 84,  rem: 636, occ: 11.7, guests: 390,  rev: 2918682,  kt: 7484,  adr: 34746, revpar: 4054,  ppr: 4.64 },
  { m: '12月', sold: 52,  rem: 692, occ: 7.0,  guests: 286,  rev: 2072087,  kt: 7245,  adr: 39848, revpar: 2785,  ppr: 5.50 },
];
const OCC_YEAR_TOTAL  = { sold: 5150, rem: 3610, occ: 58.8, guests: 26038, rev: 207645092, kt: 7975, adr: 40319, revpar: 23704, ppr: 5.06 };
const OCC_YEAR_BUDGET = { sold: 6740, rem: 2020, occ: 76.9, guests: 33700, rev: 297305250, kt: 8811, adr: 44111, revpar: 33939, ppr: 5.00 };

/* 前年 2025年 */
const OCC_YEAR_PY = [
  { m: '1月',  sold: 566, rem: 178, occ: 76.1, guests: 2735, rev: 19197324, kt: 7019, adr: 33918, revpar: 25803, ppr: 4.83 },
  { m: '2月',  sold: 580, rem: 92,  occ: 86.3, guests: 2881, rev: 20845555, kt: 7236, adr: 35941, revpar: 31020, ppr: 4.97 },
  { m: '3月',  sold: 683, rem: 61,  occ: 91.8, guests: 3626, rev: 22843884, kt: 6300, adr: 33446, revpar: 30704, ppr: 5.31 },
  { m: '4月',  sold: 679, rem: 41,  occ: 94.3, guests: 3507, rev: 21785153, kt: 6212, adr: 32084, revpar: 30257, ppr: 5.16 },
  { m: '5月',  sold: 665, rem: 79,  occ: 89.4, guests: 3494, rev: 20342684, kt: 5822, adr: 30591, revpar: 27342, ppr: 5.25 },
  { m: '6月',  sold: 688, rem: 32,  occ: 95.6, guests: 3583, rev: 21438712, kt: 5983, adr: 31161, revpar: 29776, ppr: 5.21 },
  { m: '7月',  sold: 717, rem: 27,  occ: 96.4, guests: 3778, rev: 31109591, kt: 8234, adr: 43389, revpar: 41814, ppr: 5.27 },
  { m: '8月',  sold: 736, rem: 8,   occ: 98.9, guests: 3975, rev: 35673376, kt: 8974, adr: 48469, revpar: 47948, ppr: 5.40 },
  { m: '9月',  sold: 667, rem: 53,  occ: 92.6, guests: 3476, rev: 21840854, kt: 6283, adr: 32745, revpar: 30335, ppr: 5.21 },
  { m: '10月', sold: 683, rem: 61,  occ: 91.8, guests: 3355, rev: 22653999, kt: 6752, adr: 33168, revpar: 30449, ppr: 4.91 },
  { m: '11月', sold: 642, rem: 78,  occ: 89.2, guests: 3088, rev: 18125915, kt: 5870, adr: 28234, revpar: 25175, ppr: 4.81 },
  { m: '12月', sold: 649, rem: 95,  occ: 87.2, guests: 3098, rev: 20873870, kt: 6738, adr: 32163, revpar: 28056, ppr: 4.77 },
];
const OCC_YEAR_PY_TOTAL = { sold: 7955, rem: 805, occ: 90.8, guests: 40596, rev: 276730917, kt: 6817, adr: 34787, revpar: 31590, ppr: 5.10 };

/* 月比（前回snapshot差分）— 月別 */
const OCC_YEAR_CMP = {
  '6月':  { sold: 6,  occ: 0.8,  guests: 18,  rev: 163748,  adr: -74,   revpar: 227 },
  '7月':  { sold: -8, occ: -1.1, guests: -59, rev: -317284, adr: 191,   revpar: -426 },
  '8月':  { sold: 6,  occ: 0.8,  guests: 32,  rev: 399359,  adr: 105,   revpar: 537 },
  '9月':  { sold: 5,  occ: 0.7,  guests: 35,  rev: 273412,  adr: 359,   revpar: 380 },
  '10月': { sold: -2, occ: -0.3, guests: -12, rev: -90071,  adr: 4,     revpar: -121 },
  '11月': { sold: -1, occ: -0.1, guests: -6,  rev: -41418,  adr: -78,   revpar: -58 },
  '12月': { sold: 5,  occ: 0.7,  guests: 26,  rev: 141830,  adr: -1221, revpar: 191 },
};
const OCC_YEAR_CMP_TOTAL = { sold: 11, occ: 0.13, guests: 34, rev: 529576, adr: 48143, revpar: 60 };

const _dy = (cur, base) => base ? (cur / base - 1) * 100 : null;
const OCC_YEAR_KPIS = [
  { label: '販売室数',     value: OCC_YEAR_TOTAL.sold,   unit: '室', type: 'int', yoy: _dy(OCC_YEAR_TOTAL.sold, OCC_YEAR_PY_TOTAL.sold),     bud: _dy(OCC_YEAR_TOTAL.sold, OCC_YEAR_BUDGET.sold) },
  { label: '販売可能室数', value: 8760,                  unit: '室', type: 'int', yoy: 0, bud: 0 },
  { label: '稼働率',       value: OCC_YEAR_TOTAL.occ,    unit: '%',  type: 'pct', yoy: OCC_YEAR_TOTAL.occ - OCC_YEAR_PY_TOTAL.occ, budpt: OCC_YEAR_TOTAL.occ - OCC_YEAR_BUDGET.occ, primary: true },
  { label: '残室',         value: OCC_YEAR_TOTAL.rem,    unit: '室', type: 'int', yoy: _dy(OCC_YEAR_TOTAL.rem, OCC_YEAR_PY_TOTAL.rem), bud: _dy(OCC_YEAR_TOTAL.rem, OCC_YEAR_BUDGET.rem), invert: true },
  { label: '宿泊人数',     value: OCC_YEAR_TOTAL.guests, unit: '人', type: 'int', yoy: _dy(OCC_YEAR_TOTAL.guests, OCC_YEAR_PY_TOTAL.guests), bud: _dy(OCC_YEAR_TOTAL.guests, OCC_YEAR_BUDGET.guests) },
  { label: '売上',         value: OCC_YEAR_TOTAL.rev,    unit: '',   type: 'yen', yoy: _dy(OCC_YEAR_TOTAL.rev, OCC_YEAR_PY_TOTAL.rev), bud: _dy(OCC_YEAR_TOTAL.rev, OCC_YEAR_BUDGET.rev) },
  { label: 'ADR（室単価）', value: OCC_YEAR_TOTAL.adr,    unit: '',   type: 'yen', yoy: _dy(OCC_YEAR_TOTAL.adr, OCC_YEAR_PY_TOTAL.adr), bud: _dy(OCC_YEAR_TOTAL.adr, OCC_YEAR_BUDGET.adr) },
  { label: 'RevPAR',       value: OCC_YEAR_TOTAL.revpar, unit: '',   type: 'yen', yoy: _dy(OCC_YEAR_TOTAL.revpar, OCC_YEAR_PY_TOTAL.revpar), bud: _dy(OCC_YEAR_TOTAL.revpar, OCC_YEAR_BUDGET.revpar) },
  { label: '客単価',       value: OCC_YEAR_TOTAL.kt,     unit: '',   type: 'yen', yoy: _dy(OCC_YEAR_TOTAL.kt, OCC_YEAR_PY_TOTAL.kt), bud: _dy(OCC_YEAR_TOTAL.kt, OCC_YEAR_BUDGET.kt) },
];
const OCC_YEAR_INSIGHT = {
  sellable: 8760, remaining: 3610,
  budgetGap: OCC_YEAR_BUDGET.rev - OCC_YEAR_TOTAL.rev,        // ¥89,660,158
  budgetRate: OCC_YEAR_TOTAL.rev / OCC_YEAR_BUDGET.rev * 100, // 69.8%
  yoyRevRate: OCC_YEAR_TOTAL.rev / OCC_YEAR_PY_TOTAL.rev * 100, // 75.0%
};

/* legacy monthly trend (chart fallback) */
const OCC_MONTHLY = OCC_YEAR.map(m => ({ m: m.m, occ: m.occ, adr: m.adr, rev: m.rev }));

/* comparison: facility x metrics (アクアパレス北谷 real; others sample; F003 missing inventory) */
const OCC_TABLE = [
  { id: 'F001', sold: 603, sellable: 720,  occ: 83.8, adr: 34769, revpar: 29119, rev: 20965637, yoy: -2.2, bud: -3.3, warn: null },
  { id: 'F002', sold: 384, sellable: 480,  occ: 80.0, adr: 24800, revpar: 19840, rev: 9523200,  yoy: 6.0, bud: 1.8, warn: null },
  { id: 'F003', sold: 0,   sellable: 0,    occ: null, adr: null,  revpar: null,  rev: null,     yoy: null, bud: null, warn: 'sellable' },
  { id: 'F004', sold: 268, sellable: 360,  occ: 74.4, adr: 22100, revpar: 16450, rev: 5922800,  yoy: -2.1, bud: -3.6, warn: 'budget' },
  { id: 'F005', sold: 232, sellable: 300,  occ: 77.3, adr: 26300, revpar: 20330, rev: 6101600,  yoy: 3.4, bud: 0.9, warn: null },
  { id: 'F006', sold: 291, sellable: 420,  occ: 69.3, adr: 79070, revpar: 54784, rev: 23009451, yoy: 8.2, bud: 23.9, warn: null },
  { id: 'F007', sold: 402, sellable: 540,  occ: 74.4, adr: 31200, revpar: 23220, rev: 12542400, yoy: 5.7, bud: 2.4, warn: null },
  { id: 'F008', sold: 152, sellable: 180,  occ: 84.4, adr: 68400, revpar: 57730, rev: 10396800, yoy: 11.2, bud: 6.8, warn: null },
  { id: 'F009', sold: 198, sellable: 240,  occ: 82.5, adr: 52100, revpar: 42980, rev: 10315800, yoy: 4.8, bud: 1.1, warn: null },
  { id: 'F010', sold: 224, sellable: 300,  occ: 74.7, adr: 18600, revpar: 13890, rev: 4166400,  yoy: 1.9, bud: -0.4, warn: null },
  { id: 'F011', sold: 468, sellable: 600,  occ: 78.0, adr: 16800, revpar: 13100, rev: 7862400,  yoy: 2.3, bud: 0.7, warn: null },
  { id: 'F012', sold: 712, sellable: 900,  occ: 79.1, adr: 14200, revpar: 11230, rev: 10110400, yoy: -0.8, bud: -1.9, warn: null },
  { id: 'F013', sold: 542, sellable: 660,  occ: 82.1, adr: 23400, revpar: 19210, rev: 12682800, yoy: 5.1, bud: 2.0, warn: null },
  { id: 'F014', sold: 214, sellable: 270,  occ: 79.3, adr: 41200, revpar: 32660, rev: 8816800,  yoy: 6.7, bud: 3.3, warn: null },
  { id: 'F015', sold: 168, sellable: 210,  occ: 80.0, adr: 58900, revpar: 47120, rev: 9895200,  yoy: 9.4, bud: 4.6, warn: null },
];

const OCC_ALERTS = [
  { level: 'danger',  icon: 'TriangleAlert', title: '販売可能室数 未登録', body: '結の家 — 2026年6月の販売可能室数が未登録です。稼働率・残室・RevPAR を算出できません。', cta: '在庫を登録', route: 'admin/inventory' },
  { level: 'warning', icon: 'TrendingDown',  title: '稼働率 低下', body: '畳の宿 北谷美浜 — 前年比 −2.1pt。直近7日の稼働が予算を下回っています。', cta: '詳細を見る', route: 'occupancy' },
  { level: 'warning', icon: 'FileWarning',   title: '予算 未登録', body: '1施設で 2026年6月の予算が未登録です。予算差分は「—」で表示されます。', cta: '予算を確認', route: 'admin/budgets' },
];

/* ---------- Channels (経路) — real channel names ---------- */
const CHANNELS = [
  { name: 'Booking.com', group: 'OTA',    rev: 25313956, rooms: 318, bookings: 296, adr: 79604, yoy: 6.2 },
  { name: 'Agoda',       group: 'OTA',    rev: 14280598, rooms: 196, bookings: 181, adr: 72860, yoy: 9.1 },
  { name: 'DYNA IBE',    group: 'OTA',    rev: 12401605, rooms: 142, bookings: 128, adr: 87335, yoy: 3.4 },
  { name: 'Expedia',     group: 'OTA',    rev: 10050919, rooms: 128, bookings: 119, adr: 78523, yoy: -1.8 },
  { name: '一休.com',    group: 'OTA',    rev: 6967655,  rooms: 86,  bookings: 80,  adr: 81019, yoy: 4.6 },
  { name: '楽天トラベル', group: 'OTA',    rev: 7793236,  rooms: 104, bookings: 97,  adr: 74935, yoy: 2.1 },
  { name: 'じゃらんnet',  group: 'OTA',    rev: 2290590,  rooms: 34,  bookings: 31,  adr: 67370, yoy: -3.2 },
  { name: 'Airbnb',      group: 'OTA',    rev: 1572360,  rooms: 22,  bookings: 19,  adr: 71471, yoy: 5.0 },
  { name: '直予約',      group: 'Direct', rev: 187040,   rooms: 4,   bookings: 3,   adr: 46760, yoy: 0 },
  { name: '電話予約',    group: 'Direct', rev: 0,        rooms: 0,   bookings: 0,   adr: null,  yoy: null },
  { name: 'ちゅらとく・温泉ぱらだいす', group: 'Other', rev: 654610, rooms: 9, bookings: 8, adr: 72734, yoy: 12.0 },
  { name: '沖縄ツーリスト', group: 'Other', rev: 190320, rooms: 3, bookings: 3, adr: 63440, yoy: -5.0 },
];

/* ---------- 経路 × 施設 クロス集計（既存Excel「経路別実績一覧」踏襲・2026年6月 税込） ----------
   列はエリアでグループ化。各経路の v[] は CH_FACS と同順の15施設。行合計・列合計は ¥145,354,954 で整合 */
const CH_FACS = [
  { key: 'F001', short: 'アクアパレス北谷',          area: '北谷エリア' },
  { key: 'F002', short: '北谷ANNEX',                area: '北谷エリア' },
  { key: 'F003', short: '結の家',                   area: '北谷エリア' },
  { key: 'F004', short: '畳の宿 北谷美浜',           area: '北谷エリア' },
  { key: 'F005', short: 'ジャーガル',               area: '北谷エリア' },
  { key: 'F006', short: 'プール古宇利',             area: '北部エリア' },
  { key: 'F007', short: 'コンド古宇利',             area: '北部エリア' },
  { key: 'F008', short: '今泊',                     area: '北部エリア' },
  { key: 'F009', short: '屋我地島',                 area: '北部エリア' },
  { key: 'F013', short: 'サンセットリゾート カンプー', area: '北部エリア' },
  { key: 'F014', short: 'ヤンバル屋我地',           area: '北部エリア' },
  { key: 'F015', short: '琉心 恩納',                area: '北部エリア' },
  { key: 'F011', short: 'ジョイントホーム那覇',      area: '那覇エリア' },
  { key: 'F010', short: '畳の宿 那覇壺屋',           area: '那覇エリア' },
  { key: 'F012', short: 'コザ',                     area: '沖縄市エリア' },
];
const _z15 = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
const CH_ROUTES = [
  { name: '楽天トラベル',     v: [1331170,0,208250,1078576,146520,2294690,2757570,1262250,1931990,39600,182310,0,173080,315180,2587300] },
  { name: 'じゃらんnet',      v: [207160,118650,55440,710770,156600,277960,741170,179980,901220,0,20310,0,0,250940,930040] },
  { name: '一休.com',         v: [964960,0,207900,206990,189440,2748420,2696445,2083630,3316210,314220,472080,0,131580,326350,598390] },
  { name: 'るるぶトラベル',   v: _z15 },
  { name: 'ちゅらとく',       v: _z15 },
  { name: 'Booking.com',      v: [9985481,1091485,410044,3278503,1234112,4453629,4888087,5256826,4966816,2499271,182411,0,1617408,726259,2070288] },
  { name: 'Expedia',          v: [1720022,905549,251891,1118866,387244,1968643,4021695,467112,637814,2147077,0,0,347465,215733,906210] },
  { name: 'Agoda',            v: [1770233,1242510,339651,2368359,468997,4860555,3164737,992241,1362798,2011484,36807,0,768527,157120,859329] },
  { name: 'Airbnb',           v: [1029150,0,155160,0,427050,0,0,0,413720,0,0,0,442610,866270,163480] },
  { name: 'Trip.com',         v: [0,0,0,0,0,0,0,0,0,523585,0,0,0,0,0] },
  { name: '電話予約',         v: _z15 },
  { name: 'WBFTOS',           v: _z15 },
  { name: 'OneTwoSmileHOTEL', v: _z15 },
  { name: 'Direct In S4',     v: [0,0,0,296376,0,0,0,0,0,0,0,0,0,0,0] },
  { name: 'skyticket',        v: _z15 },
  { name: 'Rakuten',          v: _z15 },
  { name: '直予約',           v: [0,0,0,0,0,40000,147040,58930,115940,50000,89210,0,0,0,1157000] },
  { name: 'ちゅらとく・温泉ぱらだいす', v: [37470,0,0,0,0,80700,536440,0,0,0,676580,0,0,0,0] },
  { name: 'DYNA IBE',         v: [2160030,235200,345330,714920,271140,5922925,2820460,1661790,2237770,0,264740,0,118620,153200,794060] },
  { name: '沖縄ツーリスト株式会社', v: [190320,0,0,0,0,0,0,0,0,0,0,0,0,24960,0] },
  { name: 'Trip.com Group(new)', v: [1733389,243384,47300,0,461826,361929,319595,607326,946111,0,50523,0,789541,226243,1629071] },
  { name: '株式会社SEEC',     v: _z15 },
  { name: 'JTB現地払_るるぶ', v: _z15 },
  { name: '楽天グローバルプラットフォーム', v: _z15 },
  { name: 'tripla',           v: [0,0,0,0,0,0,0,0,0,865880,0,0,0,0,0] },
  { name: 'WelBox',           v: _z15 },
  { name: '一休.com（直販）', v: [0,0,0,576030,0,0,0,0,0,0,0,0,0,0,0] },
];
/* 前年（2025年同月）— 経路別の前年実績。経路ごとのYoY係数で各セルをスケール */
const _CH_PYF = [0.94,1.08,0.88,1,1,0.91,1.06,0.97,0.86,0.7,1,1,1,1.25,1,1,0.78,1.12,1.04,1.08,0.9,1,1,1,0.95,1,1.15];
const CH_ROUTES_PY = CH_ROUTES.map((r, i) => ({ name: r.name, v: r.v.map(x => Math.round(x * (_CH_PYF[i] != null ? _CH_PYF[i] : 1))) }));

/* 経路 × 月 クロス集計（年間）を生成。
   facIdx=施設index（null=全施設）, yearRows=OCC_YEAR(当年)/OCC_YEAR_PY(前年) の月次売上シェイプ。
   6月列は monthly cross-tab（routes）の実値と一致、各月合計は施設の月次売上シェイプに比例。 */
function buildChannelAnnual(routes, facIdx, yearRows) {
  const june = routes.map(r => facIdx == null ? r.v.reduce((a, b) => a + b, 0) : r.v[facIdx]);
  const juneTotal = june.reduce((a, b) => a + b, 0) || 1;
  const yearRev = yearRows.map(y => y.rev);
  const scale = juneTotal / (yearRev[5] || 1);
  const monthlyTotal = yearRev.map(r => Math.round(r * scale));
  const g = yearRev.map(r => r / (yearRev[5] || 1)); // 月別シェイプ（6月=1基準）
  const w = routes.map((r, ci) => {
    const base = june[ci];
    const share = base / juneTotal;
    const a = 0.32 * Math.sin((ci + 1) * 1.9 + 0.6); // 経路ごとの季節傾斜
    return g.map(gm => base <= 0 ? 0 : Math.max(0.02 * share, share * (1 + a * (gm - 1))));
  });
  const v = routes.map(() => new Array(12).fill(0));
  for (let m = 0; m < 12; m++) {
    if (m === 5) { routes.forEach((r, ci) => { v[ci][5] = june[ci]; }); continue; }
    const sw = w.reduce((s, ww) => s + ww[m], 0) || 1;
    routes.forEach((r, ci) => { v[ci][m] = Math.round(monthlyTotal[m] * w[ci][m] / sw); });
  }
  const rows = routes.map((r, ci) => ({ name: r.name, v: v[ci], total: v[ci].reduce((a, b) => a + b, 0) }));
  const colTot = new Array(12).fill(0).map((_, m) => rows.reduce((s, r) => s + r.v[m], 0));
  const grand = colTot.reduce((a, b) => a + b, 0);
  return { rows, colTot, grand };
}

/* ---------- 国籍 × 月 クロス集計（既存Excel「国籍別分析」忠実再現・アクアパレス北谷 / 2026年）----------
   rev[]・rooms[] は12ヶ月の実値（合計・ADRはExcelと一致）。ppr/stay/lt は年間実値（月次は室数加重で年間に整合） */
const NAT_ROWS = [
  { name: '大韓民国',              rev: [6858993,8211197,5373936,6576741,5049207,2443780,95501,1112831,143693,0,0,0],        rooms: [215,199,139,184,149,72,2,20,3,0,0,0],  ppr: 5.20, stay: 79.78, lt: 43.88 },
  { name: '台湾（中華民国）',       rev: [3662376,4151075,2237912,3980167,4517106,3502799,659381,269175,549456,251373,0,117767], rooms: [124,92,61,116,139,107,11,5,11,7,0,4],  ppr: 5.39, stay: 73.70, lt: 56.26 },
  { name: 'アメリカ合衆国',         rev: [1154958,591674,628478,1470668,2744081,1671349,365436,0,0,0,0,0],                 rooms: [34,14,14,40,74,56,9,0,0,0,0,0],        ppr: 4.06, stay: 82.54, lt: 38.75 },
  { name: '香港',                  rev: [300125,1857959,838094,2126459,1732794,643099,0,0,0,0,0,104480],                rooms: [10,40,22,64,54,20,0,0,0,0,0,5],        ppr: 4.97, stay: 81.71, lt: 41.50 },
  { name: '合衆国領有小離島',       rev: [0,0,0,1747985,136175,0,0,0,0,0,0,0],                                          rooms: [0,0,0,48,5,0,0,0,0,0,0,0],             ppr: 2.06, stay: 83.33, lt: 31.67 },
  { name: 'シンガポール',           rev: [30564,57525,316590,0,146357,348923,0,0,0,49509,177119,0],                     rooms: [1,1,10,0,5,10,0,0,0,1,5,0],            ppr: 4.82, stay: 77.78, lt: 96.11 },
  { name: '中華人民共和国',         rev: [160830,0,127870,237862,147896,310413,127421,0,0,0,0,0],                       rooms: [3,0,3,8,3,11,3,0,0,0,0,0],             ppr: 4.65, stay: 75.00, lt: 24.33 },
  { name: 'タイ',                  rev: [182162,183320,58036,159310,0,0,0,0,0,0,0,0],                                  rooms: [6,4,2,5,0,0,0,0,0,0,0,0],              ppr: 5.47, stay: 71.43, lt: 78.71 },
  { name: 'マカオ',                rev: [0,0,117890,34242,0,0,0,472160,0,0,0,0],                                       rooms: [0,0,3,1,0,0,0,10,0,0,0,0],             ppr: 3.71, stay: 100.00, lt: 107.50 },
  { name: 'オーストラリア',         rev: [0,0,0,53551,218620,171767,0,0,0,0,0,0],                                       rooms: [0,0,0,2,7,5,0,0,0,0,0,0],              ppr: 6.29, stay: 100.00, lt: 108.25 },
  { name: 'オランダ',              rev: [0,0,178187,0,76630,181197,0,0,0,0,0,0],                                       rooms: [0,0,4,0,3,6,0,0,0,0,0,0],              ppr: 2.85, stay: 75.00, lt: 32.50 },
  { name: 'フィリピン',            rev: [435259,0,0,0,0,0,0,0,0,0,0,0],                                                rooms: [11,0,0,0,0,0,0,0,0,0,0,0],             ppr: 6.00, stay: 100.00, lt: 110.00 },
  { name: 'イギリス',              rev: [0,52615,35960,60760,0,199437,0,0,0,0,0,0],                                    rooms: [0,2,1,2,0,6,0,0,0,0,0,0],              ppr: 3.82, stay: 83.33, lt: 55.67 },
  { name: 'カナダ',                rev: [78408,0,0,117957,100366,29496,0,0,0,0,0,0],                                   rooms: [3,0,0,3,3,1,0,0,0,0,0,0],              ppr: 4.40, stay: 75.00, lt: 45.50 },
  { name: '朝鮮民主主義人民共和国', rev: [57060,0,0,0,229335,0,0,0,0,0,0,0],                                            rooms: [2,0,0,0,7,0,0,0,0,0,0,0],              ppr: 5.11, stay: 66.67, lt: 49.33 },
  { name: 'デンマーク',            rev: [0,0,0,0,341145,0,0,0,0,0,0,0],                                                rooms: [0,0,0,0,9,0,0,0,0,0,0,0],              ppr: 5.89, stay: 66.67, lt: 96.67 },
  { name: 'その他',                rev: [235415,251110,148611,581493,1622036,265110,0,0,0,0,0,0],                      rooms: [10,8,5,15,46,7,0,0,0,0,0,0],           ppr: 3.77, stay: 90.00, lt: 41.33 },
];
const NAT_METRICS = [
  { id: 'rev',    label: '売上',     fmt: 'yen',  tax: true },
  { id: 'rooms',  label: '販売室数', fmt: 'int' },
  { id: 'adr',    label: 'ADR',      fmt: 'yen',  tax: true },
  { id: 'ppr',    label: '同伴人数', fmt: 'dec2' },
  { id: 'stay',   label: '連泊率',   fmt: 'pct2' },
  { id: 'lt',     label: 'リードタイム', fmt: 'dec2' },
];
/* 国籍×月マトリクスを指標別に生成。facScale で施設規模をスケール（アクアパレス北谷=1.0） */
function buildNatMatrix(metric, facScale) {
  const fs = facScale || 1;
  const nM = 12;
  const rows = NAT_ROWS.map((r, ri) => {
    const roomsM = r.rooms.map(x => Math.round(x * fs));
    const revM = r.rev.map(x => Math.round(x * fs));
    let cells, total;
    if (metric === 'rev') { cells = revM; total = revM.reduce((a, b) => a + b, 0); }
    else if (metric === 'rooms') { cells = roomsM; total = roomsM.reduce((a, b) => a + b, 0); }
    else if (metric === 'adr') {
      cells = revM.map((v, m) => roomsM[m] > 0 ? Math.round(v / roomsM[m]) : 0);
      const rt = roomsM.reduce((a, b) => a + b, 0);
      total = rt > 0 ? Math.round(revM.reduce((a, b) => a + b, 0) / rt) : 0;
    } else {
      // intensive (ppr/stay/lt): 室数加重で年間実値に整合する月次を生成
      const A = r[metric];
      const s = r.rooms.map((rm, m) => rm > 0 ? 1 + 0.13 * Math.sin((m + 1) * 1.27 + ri * 0.9) + 0.06 * Math.cos((m + 1) * 0.7 + ri) : 0);
      const wsum = r.rooms.reduce((a, rm, m) => a + rm * s[m], 0);
      const rt = r.rooms.reduce((a, b) => a + b, 0);
      const k = wsum > 0 ? (rt / wsum) : 0;
      cells = r.rooms.map((rm, m) => rm > 0 ? +(A * s[m] * k).toFixed(2) : 0);
      if (metric === 'stay') cells = cells.map(v => v > 100 ? 100 : v);
      total = +A.toFixed(2);
    }
    return { name: r.name, rooms: roomsM, cells, total };
  });
  // 列合計
  const colTot = Array.from({ length: nM }, (_, m) => {
    if (metric === 'rev' || metric === 'rooms') return rows.reduce((a, r) => a + r.cells[m], 0);
    // ADR/intensive は室数加重平均
    const rw = rows.reduce((a, r) => a + r.rooms[m], 0);
    if (metric === 'adr') {
      const rev = rows.reduce((a, r) => a + r.cells[m] * r.rooms[m], 0);
      return rw > 0 ? Math.round(rev / rw) : 0;
    }
    const wv = rows.reduce((a, r) => a + r.cells[m] * r.rooms[m], 0);
    return rw > 0 ? +(wv / rw).toFixed(2) : 0;
  });
  // 総合計
  let grand;
  if (metric === 'rev' || metric === 'rooms') grand = rows.reduce((a, r) => a + r.total, 0);
  else {
    const rwAll = rows.reduce((a, r) => a + r.rooms.reduce((x, y) => x + y, 0), 0);
    const wv = rows.reduce((a, r) => a + r.total * r.rooms.reduce((x, y) => x + y, 0), 0);
    grand = metric === 'adr' ? Math.round(wv / rwAll) : +(wv / rwAll).toFixed(2);
  }
  return { rows, colTot, grand };
}

/* ---------- Nationalities (国籍別) ---------- */
const NATIONALITIES = [
  { key: '海外', label: '海外', rev: 61843763, rooms: 742, bookings: 690, guests: 3960, adr: 83347, lt: 31, intl: true },
  { key: '日本', label: '日本国内', rev: 56152969, rooms: 698, bookings: 651, guests: 3210, adr: 80448, lt: 18, intl: false },
  { key: '不明', label: '不明 / 未設定', rev: 10377562, rooms: 121, bookings: 110, guests: 540, adr: 85765, lt: null, intl: null },
];

/* ---------- Room types (部屋タイプ別) — real names ---------- */
const ROOM_TYPES = [
  { name: 'ラグジュアリープールヴィラ', norm: 'プールヴィラ', budget: 'ヴィラ', rev: 118255236, rooms: 248, adr: 89308, yoy: 7.4, mapped: true },
  { name: 'ユニバーサル ラグジュアリープールヴィラ', norm: 'プールヴィラ(UD)', budget: 'ヴィラ', rev: 10119058, rooms: 43, adr: 81021, yoy: 3.1, mapped: true },
  { name: 'スタンダードツイン', norm: 'スタンダード', budget: null, rev: 8642000, rooms: 196, adr: 44092, yoy: 2.0, mapped: false },
  { name: '和室8畳', norm: '和室', budget: null, rev: 5210400, rooms: 142, adr: 36693, yoy: -1.2, mapped: false },
];

/* ---------- Top dashboard: 7 indicator overview (プールヴィラ古宇利島 / 2026年6月) ----------
   delta は前年比、budpt は予算差(pt)、bud は予算差(%)、status: ok|warn|danger */
const KPI_OVERVIEW = [
  { key: 'occupancy', route: 'occupancy', icon: 'Percent', title: '稼働分析',
    main: '83.8%', sub: '稼働率（当月）', yoy: -11.8, yoyUnit: 'pt', budpt: 3.2, status: 'warn',
    note: '販売室数 603室 ・ 売上 ¥2,097万' },
  { key: 'channels', route: 'channels', icon: 'Route', title: '経路分析',
    main: '¥2,097万', sub: '当月売上（全経路）', yoy: -2.2, bud: -3.3, status: 'warn',
    note: 'OTA 92% ・ 直販 1% ・ その他 7%' },
  { key: 'nationalities', route: 'nationalities', icon: 'Globe', title: '国籍別分析',
    main: '48.2%', sub: '海外比率', yoy: 6.4, yoyUnit: 'pt', status: 'ok',
    note: '主要: 海外 ・ 平均リードタイム 31日' },
  { key: 'stay-nights', route: 'stay-nights', icon: 'MoonStar', title: '泊数分布',
    main: '2.6泊', sub: '平均泊数', yoy: 0.3, yoyUnit: '泊', status: 'ok',
    note: '連泊率 52% ・ 最頻 3泊' },
  { key: 'room-types', route: 'room-types', icon: 'BedDouble', title: '部屋タイプ別分析',
    main: '¥34,769', sub: '平均ADR（室単価）', yoy: 11.6, bud: -7.0, status: 'warn',
    note: '2タイプで予算マッピング未設定' },
  { key: 'annual-sales', route: 'annual-sales', icon: 'Building2', title: '全施設年間売上',
    main: '¥6.42億', sub: '年間売上（7施設）', yoy: 9.2, bud: 3.4, status: 'ok',
    note: '予算達成率 103% ・ 7施設' },
  { key: 'booking-curve', route: 'booking-curve', icon: 'TrendingUp', title: 'ブッキングカーブ',
    main: '¥2,468万', sub: '当月着地見込み', yoy: 4.1, bud: -0.8, status: 'warn',
    note: '現時点 291室 ・ 残室 129室' },
];

/* ===== 稼働分析 比較モード (3パターン: 前年実績 / 前年同期(未確定) / 指定日付) ===== */
const _diffRow = (c, b) => ({
  sold:   c.sold - b.sold,
  occ:    +(c.occ - b.occ).toFixed(1),
  guests: c.guests - b.guests,
  rev:    c.rev - b.rev,
  adr:    c.adr - b.adr,
  revpar: c.revpar - b.revpar,
  ppr:    +(((c.ppr || 0) - (b.ppr || 0))).toFixed(2),
});
/* 全行の差分マップ（前年実績比など、毎行差がある比較に使用） */
function _diffMap(cur, base, key) {
  const map = {};
  cur.forEach((c, i) => { const b = base[i]; if (b) map[c[key]] = _diffRow(c, b); });
  return map;
}
/* 差分が出た行のみ（snapshot比較。未変更日はハイライトしない） */
function _diffMapNZ(cur, base, key) {
  const map = {};
  cur.forEach((c, i) => {
    const b = base[i]; if (!b) return;
    const d = _diffRow(c, b);
    if (d.sold || d.occ || d.guests || d.rev || d.adr || d.revpar || d.ppr) map[c[key]] = d;
  });
  return map;
}
/* 指定日付実績: 前回snapshot(OCC_CMP差分)から復元した実績テーブル */
function _snapRows(rows, cmpMap, key) {
  return rows.map(r => {
    const d = cmpMap[r[key]] || {};
    const sold = r.sold - (d.sold || 0);
    const guests = r.guests - (d.guests || 0);
    return { ...r,
      sold, guests,
      rem:    (r.rem || 0) + (d.sold || 0),
      occ:    +(r.occ - (d.occ || 0)).toFixed(1),
      rev:    r.rev - (d.rev || 0),
      adr:    r.adr - (d.adr || 0),
      revpar: r.revpar - (d.revpar || 0),
      ppr:    sold ? +(guests / sold).toFixed(2) : 0,
    };
  });
}
function _snapTotal(rows, sellable) {
  const sold = rows.reduce((a, r) => a + r.sold, 0);
  const rev = rows.reduce((a, r) => a + r.rev, 0);
  const guests = rows.reduce((a, r) => a + r.guests, 0);
  return {
    sold, rem: sellable - sold, guests, rev,
    occ:    +(sold / sellable * 100).toFixed(1),
    adr:    Math.round(rev / sold),
    revpar: Math.round(rev / sellable),
    ppr:    sold ? +(guests / sold).toFixed(2) : 0,
  };
}

/* 前年実績比（当年 − 前年） */
const OCC_PY_DIFF            = _diffMap(OCC_DAILY, OCC_PY, 'd');
const OCC_PY_DIFF_TOTAL      = _diffRow(OCC_TOTAL, OCC_PY_TOTAL);
const OCC_YEAR_PY_DIFF       = _diffMap(OCC_YEAR, OCC_YEAR_PY, 'm');
const OCC_YEAR_PY_DIFF_TOTAL = _diffRow(OCC_YEAR_TOTAL, OCC_YEAR_PY_TOTAL);

/* 指定日付実績 + 指定日付比（当年 − 指定日付snapshot） */
const OCC_SNAP            = _snapRows(OCC_DAILY, OCC_CMP, 'd');
const OCC_SNAP_TOTAL      = _snapTotal(OCC_SNAP, 720);
const OCC_SNAP_DIFF       = _diffMapNZ(OCC_DAILY, OCC_SNAP, 'd');
const OCC_SNAP_DIFF_TOTAL = _diffRow(OCC_TOTAL, OCC_SNAP_TOTAL);
const OCC_YEAR_SNAP            = _snapRows(OCC_YEAR, OCC_YEAR_CMP, 'm');
const OCC_YEAR_SNAP_TOTAL      = _snapTotal(OCC_YEAR_SNAP, 8760);
const OCC_YEAR_SNAP_DIFF       = _diffMapNZ(OCC_YEAR, OCC_YEAR_SNAP, 'm');
const OCC_YEAR_SNAP_DIFF_TOTAL = _diffRow(OCC_YEAR_TOTAL, OCC_YEAR_SNAP_TOTAL);

/* 年間 予算（月次・配賦）: 予算総量(OCC_YEAR_BUDGET)を前年構成比で各月へ配賦。端数は12月で吸収し合計一致 */
const _DAYS_2026 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const _OCC_ROOMS = 24;
const OCC_YEAR_BUD = (function () {
  const T = OCC_YEAR_BUDGET, shape = OCC_YEAR_PY;
  const sS = shape.reduce((a, r) => a + r.sold, 0);
  const sR = shape.reduce((a, r) => a + r.rev, 0);
  const sG = shape.reduce((a, r) => a + r.guests, 0);
  let aS = 0, aR = 0, aG = 0;
  return shape.map((r, i) => {
    const last = i === shape.length - 1;
    const sold = last ? T.sold - aS : Math.round(r.sold / sS * T.sold);
    const rev = last ? T.rev - aR : Math.round(r.rev / sR * T.rev);
    const guests = last ? T.guests - aG : Math.round(r.guests / sG * T.guests);
    aS += sold; aR += rev; aG += guests;
    const sellable = _OCC_ROOMS * _DAYS_2026[i];
    return { m: r.m, sold, rem: sellable - sold, occ: +(sold / sellable * 100).toFixed(1), guests, rev, adr: Math.round(rev / sold), revpar: Math.round(rev / sellable), ppr: +(guests / sold).toFixed(2) };
  });
})();
const OCC_YEAR_BUD_DIFF       = _diffMap(OCC_YEAR, OCC_YEAR_BUD, 'm');
const OCC_YEAR_BUD_DIFF_TOTAL = _diffRow(OCC_YEAR_TOTAL, OCC_YEAR_BUDGET);

/* ============================================================
   泊数分析表 — 既存Excel「泊数分析表」忠実再現
   アクアパレス北谷 / プレミアムスイートコンド / 室数24 / 税込ベース
   当年=2026年, 前年実績=2025年。月次（12ヶ月）。
   4セクション: 販売室数(チェックインベース) / 売上 / ADR / 同伴係数
   ・販売室数: c=[1泊,2泊,3-4泊,5-6泊,7泊以上]の件数, tn=総泊数
       比率・平均泊数は件数から算出（Excelと一致）
   ・売上: r=[5バケットの売上(税込)], 総売上=Σr, 平均売上=総売上/5, 構成比=r/Σr
   ・ADR : a=[5バケットのADR(税込)], avg=平均ADR（実値）
   ・同伴係数: a=[5バケット], avg=平均（null は「-」表示）
   ============================================================ */
const STAY_BUCKETS = ['1泊', '2泊', '3-4泊', '5-6泊', '7泊以上'];
const STAY_MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const STAY_ROOMS = {
  2026: [
    { c: [70, 94, 71, 2, 5], tn: 542 }, { c: [65, 109, 64, 11, 3], tn: 563 },
    { c: [74, 116, 87, 6, 2], tn: 635 }, { c: [53, 95, 84, 6, 7], tn: 629 },
    { c: [72, 109, 81, 11, 2], tn: 641 }, { c: [46, 89, 75, 10, 8], tn: 594 },
    { c: [32, 77, 56, 15, 10], tn: 528 }, { c: [15, 48, 46, 13, 2], tn: 343 },
    { c: [6, 36, 20, 2, 0], tn: 158 }, { c: [10, 23, 15, 2, 0], tn: 115 },
    { c: [5, 11, 7, 0, 2], tn: 72 }, { c: [5, 6, 8, 1, 1], tn: 56 },
  ],
  2025: [
    { c: [67, 87, 58, 11, 1], tn: 494 }, { c: [79, 106, 64, 7, 2], tn: 553 },
    { c: [105, 116, 88, 7, 2], tn: 669 }, { c: [85, 100, 89, 13, 4], tn: 678 },
    { c: [121, 108, 69, 6, 4], tn: 639 }, { c: [80, 112, 76, 9, 10], tn: 699 },
    { c: [62, 107, 83, 15, 7], tn: 694 }, { c: [86, 101, 100, 13, 3], tn: 713 },
    { c: [124, 92, 90, 10, 1], tn: 660 }, { c: [113, 115, 71, 11, 3], tn: 655 },
    { c: [96, 121, 75, 9, 2], tn: 646 }, { c: [78, 102, 75, 12, 4], tn: 693 },
  ],
};
const STAY_ROOMS_TOT = {
  2026: { c: [453, 813, 614, 79, 42], tn: 4876 },
  2025: { c: [1096, 1267, 938, 123, 43], tn: 7793 },
};

const STAY_SALES = {
  2026: [
    [2367093, 5603078, 7272926, 271265, 1431517], [2947492, 9688945, 9328483, 2184588, 892145],
    [3103422, 9099067, 10610563, 1081881, 601380], [2204319, 6808971, 9784898, 1002991, 2897233],
    [3359619, 8030888, 9040663, 1803668, 950287], [1832214, 6862609, 9148270, 1775091, 2110781],
    [1836595, 9329646, 10603992, 4165261, 4123557], [1059413, 6682322, 9367458, 4403755, 938429],
    [305306, 3214165, 3379673, 398628, 0], [531020, 2856783, 2054787, 408377, 0],
    [219674, 851059, 653157, 0, 833434], [237683, 540892, 1111319, 104480, 320900],
  ],
  2025: [
    [2183325, 5562210, 6511196, 2014337, 516253], [3153060, 7911935, 8018933, 1294119, 237587],
    [3919163, 7861524, 9117870, 1428966, 421539], [2930818, 6384858, 9549478, 2216198, 1436904],
    [4035818, 6905813, 6552560, 885249, 1240258], [2607225, 7061115, 7914011, 1498345, 3415157],
    [2981590, 9337341, 12223207, 3677657, 2744676], [3350868, 7376279, 13628736, 2428224, 1049806],
    [1250457, 439994, 209260, 0, 0], [2336152, 3700792, 2663541, 411159, 0],
    [2274407, 4394051, 3453629, 314920, 220140], [2460290, 5715597, 7772417, 2023252, 1912760],
  ],
};

const STAY_ADR = {
  2026: [
    { a: [33816, 29804, 31760, 27126, 31812], avg: 30863 }, { a: [45346, 44445, 45953, 39010, 42483], avg: 43447 },
    { a: [41938, 39220, 37895, 32784, 37586], avg: 37885 }, { a: [41591, 35837, 35842, 31343, 35769], avg: 36076 },
    { a: [46661, 36839, 33608, 30571, 41317], avg: 37799 }, { a: [39831, 38554, 37340, 32275, 30154], avg: 35631 },
    { a: [57393, 60582, 57630, 51423, 53553], avg: 56116 }, { a: [70627, 69608, 62450, 64761, 67031], avg: 66895 },
    { a: [50884, 44642, 48981, 36239, 0], avg: 45186 }, { a: [53102, 62104, 42808, 37125, 0], avg: 48785 },
    { a: [43934, 38685, 31103, 0, 34726], avg: 37112 }, { a: [47536, 45074, 41160, 20896, 45843], avg: 40102 },
  ],
  2025: [
    { a: [32587, 31967, 35196, 35970, 43021], avg: 35748 }, { a: [39912, 37321, 36954, 34056, 33941], avg: 36437 },
    { a: [37325, 33885, 33036, 36640, 24796], avg: 33137 }, { a: [34480, 31925, 33158, 33078, 37813], avg: 34091 },
    { a: [33353, 31971, 28994, 27664, 28188], avg: 30034 }, { a: [32590, 31523, 31035, 31880, 36722], avg: 32750 },
    { a: [48090, 43632, 44448, 45971, 43566], avg: 45142 }, { a: [38964, 36516, 41299, 35191, 40377], avg: 38469 },
    { a: [10085, 2391, 714, 0, 0], avg: 4397 }, { a: [20674, 16090, 11531, 7213, 0], avg: 13877 },
    { a: [23691, 18157, 14330, 6561, 11586], avg: 14865 }, { a: [31542, 28018, 30361, 31127, 21253], avg: 28460 },
  ],
};
const STAY_ADR_AVG = {
  2026: { a: [47722, 45449, 42211, 36687, 42027], avg: 42819 },
  2025: { a: [31941, 28616, 28421, 29577, 32126], avg: 30136 },
};

const STAY_COMP = {
  2026: [
    { a: [5.15, 4.88, 5.00, 6.00, 4.80], avg: 5.00 }, { a: [4.68, 4.90, 5.19, 4.82, 4.67], avg: 4.91 },
    { a: [5.26, 5.22, 5.22, 4.83, 5.00], avg: 5.22 }, { a: [4.83, 4.90, 4.95, 5.50, 2.43], avg: 4.85 },
    { a: [5.59, 5.57, 4.92, 4.36, 5.00], avg: 5.33 }, { a: [5.54, 5.19, 5.05, 4.60, 4.13], avg: 5.15 },
    { a: [5.69, 5.63, 5.43, 5.33, 4.60], avg: 5.50 }, { a: [5.73, 6.00, 5.63, 5.31, 8.00], avg: 5.79 },
    { a: [5.67, 5.67, 5.90, 3.50, null], avg: 5.67 }, { a: [5.90, 5.35, 5.47, 4.50, null], avg: 5.46 },
    { a: [5.60, 5.45, 5.00, null, 3.50], avg: 5.20 }, { a: [6.80, 5.67, 5.38, 4.00, 6.00], avg: 5.76 },
  ],
  2025: [
    { a: [5.00, 5.26, 5.15, 4.55, 1.00], avg: 5.10 }, { a: [5.19, 5.36, 5.11, 4.43, 5.00], avg: 5.22 },
    { a: [5.39, 5.42, 5.26, 5.14, 4.50], avg: 5.35 }, { a: [5.40, 5.13, 5.30, 4.54, 4.75], avg: 5.23 },
    { a: [5.21, 5.16, 5.48, 5.17, 5.00], avg: 5.25 }, { a: [5.59, 5.41, 5.34, 4.89, 4.10], avg: 5.38 },
    { a: [5.29, 5.40, 5.46, 5.20, 4.57], avg: 5.36 }, { a: [5.55, 5.32, 5.48, 5.31, 4.67], avg: 5.43 },
    { a: [5.15, 5.66, 5.20, 4.00, 3.00], avg: 5.27 }, { a: [5.13, 5.11, 4.90, 5.00, 2.33], avg: 5.04 },
    { a: [5.02, 5.15, 4.57, 4.33, 3.00], avg: 4.93 }, { a: [4.99, 5.11, 4.95, 4.50, 3.00], avg: 4.97 },
  ],
};
const STAY_COMP_AVG = {
  2026: { a: [5.54, 5.37, 5.26, 4.80, 4.81], avg: 5.32 },
  2025: { a: [5.24, 5.29, 5.18, 4.75, 3.74], avg: 5.21 },
};
/* Excel 部屋タイプ slicer の選択肢（再現用） */
const STAY_ROOMTYPES = ['プレミアムスイートコンド', '上層階プレミアムスイートコンド特別仕様'];

/* ============================================================
   部屋タイプ別分析 — 既存Excel「部屋タイプ別実績一覧」忠実再現
   アクアパレス北谷 / 2026年 / 税込ベース。部屋タイプ × 月 クロス集計。
   売上(税込)・販売室数 は実値。ADR は 売上/販売室数 で算出（Excelと一致）。
   ============================================================ */
const RT_TYPES = ['プレミアムスイートコンド', '上層階プレミアムスイートコンド特別仕様'];
const RT_SALES = {  // 税込・[12ヶ月]
  2026: [
    [11946168, 15340071, 15154175, 13912448, 14978504, 13318535, 18260021, 12798728, 4006260, 1875872, 1127751, 1103660],
    [7253729, 10210555, 9139532, 8468113, 8838306, 7998786, 11919086, 10405566, 3277645, 3627651, 1830531, 1014455],
  ],
};
const RT_ROOMS = {  // 販売室数・[12ヶ月]
  2026: [
    [383, 387, 407, 397, 430, 396, 342, 207, 94, 45, 32, 29],
    [207, 234, 246, 239, 233, 219, 221, 181, 75, 77, 53, 24],
  ],
};
/* 消化率の分母：部屋タイプ別 客室数（施設合計24室を配分）と各月の日数(2026・非閏) */
const RT_INVENTORY = [15, 9];
const RT_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/* 同伴係数（部屋タイプ × 月）：1予約あたりの平均同伴人数 */
const RT_COMP = {
  2026: [
    [5.42, 5.18, 5.30, 5.05, 5.51, 5.36, 5.62, 5.74, 5.40, 5.28, 5.10, 5.55],
    [5.08, 4.86, 5.05, 4.74, 5.18, 4.98, 5.41, 5.49, 5.12, 4.96, 4.80, 5.22],
  ],
};

/* ---------- expose ---------- */
Object.assign(window, {
  KPI_OVERVIEW,
  STAY_BUCKETS, STAY_MONTHS, STAY_ROOMS, STAY_ROOMS_TOT, STAY_SALES, STAY_ADR, STAY_ADR_AVG, STAY_COMP, STAY_COMP_AVG, STAY_ROOMTYPES,
  RT_TYPES, RT_SALES, RT_ROOMS, RT_INVENTORY, RT_DAYS, RT_COMP,
  Icon, fmtInt, fmtYen, fmtYenC, fmtPct, fmtPt, fmtDelta,
  FACILITIES, PERIOD,
  OCC_DAILY, OCC_TOTAL, OCC_BUDGET, OCC_PRIOR, OCC_PY, OCC_PY_TOTAL, OCC_CMP, OCC_CMP_DATE, OCC_CMP_TOTAL, OCC_INSIGHT, OCC_KPIS, OCC_MONTHLY, OCC_TABLE, OCC_ALERTS,
  OCC_YEAR, OCC_YEAR_TOTAL, OCC_YEAR_BUDGET, OCC_YEAR_PY, OCC_YEAR_PY_TOTAL, OCC_YEAR_CMP, OCC_YEAR_CMP_TOTAL, OCC_YEAR_KPIS, OCC_YEAR_INSIGHT,
  OCC_PY_DIFF, OCC_PY_DIFF_TOTAL, OCC_YEAR_PY_DIFF, OCC_YEAR_PY_DIFF_TOTAL,
  OCC_SNAP, OCC_SNAP_TOTAL, OCC_SNAP_DIFF, OCC_SNAP_DIFF_TOTAL,
  OCC_YEAR_SNAP, OCC_YEAR_SNAP_TOTAL, OCC_YEAR_SNAP_DIFF, OCC_YEAR_SNAP_DIFF_TOTAL,
  OCC_YEAR_BUD, OCC_YEAR_BUD_DIFF, OCC_YEAR_BUD_DIFF_TOTAL,
  CHANNELS, CH_FACS, CH_ROUTES, CH_ROUTES_PY, buildChannelAnnual, NAT_ROWS, NAT_METRICS, buildNatMatrix, NATIONALITIES, ROOM_TYPES,
});
