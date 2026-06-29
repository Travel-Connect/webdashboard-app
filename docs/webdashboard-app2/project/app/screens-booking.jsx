/* ============================================================
   screens-booking.jsx — ブッキングカーブ（既存Excel忠実再現）
   リードタイム bucket 別の累計（当年 / 前年）。
   指標切替: 販売室数(泊数) / 売上 / ADR / 稼働率。
   当日を100%とした進捗率テーブル + 折れ線チャート。
   ============================================================ */

const BC_GREEN = 'rgba(37,111,219,0.08)';   /* テーブル見出し（淡い青） */
const BC_GREEN_HD = '#A9D08E';
const BC_BLUE = '#DDEBF7';
const BC_PINK = '#F4D9E6';
const BC_LINE = 'var(--border)';
const BC_NAVY = '#2563EB';     /* 当年ライン / ドット（primary blue） */
const BC_ORANGE = '#ED7D31';   /* 前年ライン */
const BC_VIO = '37,111,219';   /* 指標タブの統一アクセント（primary blue） */

/* リードタイム bucket（Excel列順：当日→過去） */
const BC_BUCKETS = ['当日', '前日', '2日前', '3〜6日前', '7〜13日前', '14〜20日前', '21〜30日前', '31〜60日前', '61〜90日前', '91〜120日前', '121〜150日前', '151日以上前'];

/* 基準カーブ（アクアパレス北谷・6月）— Excel実値 */
const BC_BASE = {
  roomsCur: [615, 615, 610, 608, 592, 545, 506, 466, 283, 172, 105, 25],
  roomsPy: [688, 688, 684, 680, 655, 610, 552, 459, 228, 128, 44, 20],
  adrCur: [36100, 36080, 36000, 35850, 35500, 35100, 34800, 34300, 33700, 33100, 32500, 31000],
  adrPy: [34800, 34780, 34700, 34550, 34250, 33850, 33550, 33050, 32450, 31850, 31000, 29500],
};

const BC_METRICS = [
  { id: 'rooms', label: '販売室数（泊数）', unit: 'int' },
  { id: 'rev', label: '売上', unit: 'yen' },
  { id: 'adr', label: 'ADR', unit: 'yen' },
  { id: 'occ', label: '稼働率', unit: 'pct' },
];

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

/* 指標・キャンセル条件・施設規模からカーブ生成
   roomScale=施設室数/24, withCancel=キャンセル含む（数室上乗せ） */
function buildCurve(metric, st, roomScale, withCancel) {
  const cancelUp = withCancel ? 1.04 : 1;             // キャンセル含むは僅かに増
  const sellable = st.rooms * daysInMonth(st.period.year, st.period.month);
  const sellablePy = st.rooms * daysInMonth(st.period.year - 1, st.period.month);
  const rCur = BC_BASE.roomsCur.map(v => Math.round(v * roomScale * cancelUp));
  const rPy = BC_BASE.roomsPy.map(v => Math.round(v * roomScale * cancelUp));
  const aCur = BC_BASE.adrCur.map(v => v * st.adjFac * st.adjTax);
  const aPy = BC_BASE.adrPy.map(v => v * st.adjFac * st.adjTax);

  if (metric === 'rooms') return { cur: rCur, py: rPy };
  if (metric === 'occ') return { cur: rCur.map(v => v / sellable * 100), py: rPy.map(v => v / sellablePy * 100) };
  if (metric === 'adr') return { cur: aCur, py: aPy };
  // rev = rooms × adr
  return { cur: rCur.map((v, i) => v * aCur[i]), py: rPy.map((v, i) => v * aPy[i]) };
}

/* ---------- フォーマッタ ---------- */
const bcFmt = {
  int: (v) => new Intl.NumberFormat('ja-JP').format(Math.round(v)),
  yen: (v) => '¥' + new Intl.NumberFormat('ja-JP').format(Math.round(v)),
  yenK: (v) => v >= 1e8 ? '¥' + (v / 1e8).toFixed(2) + '億' : v >= 1e4 ? '¥' + Math.round(v / 1e4).toLocaleString() + '万' : '¥' + Math.round(v),
  pct: (v) => v.toFixed(1) + '%',
};

/* ---------- Excel風テーブル（累計値 / 進捗率） ---------- */
function BcTable({ cur, py, curLabel, pyLabel, periodCur, periodPy, fmt }) {
  const thBase = { background: BC_GREEN, fontSize: 10.5, fontWeight: 700, color: 'var(--text)', borderRight: '1px solid ' + BC_LINE, borderBottom: '1px solid ' + BC_LINE, padding: '6px 4px', textAlign: 'center', lineHeight: 1.16, whiteSpace: 'normal', wordBreak: 'break-word' };
  const td = { padding: '0 6px', height: 30, lineHeight: '30px', fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap', borderRight: '1px solid ' + BC_LINE, borderBottom: '1px solid ' + BC_LINE };
  const labelTd = { ...td, textAlign: 'left', fontWeight: 700, background: '#fff', whiteSpace: 'nowrap' };
  const row = (label, period, vals, dotColor) => (
    <tr>
      <td style={{ ...labelTd, borderLeft: '1px solid ' + BC_LINE }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: dotColor, marginRight: 6, verticalAlign: 'middle' }} /><span style={{ fontSize: 10.5 }}>{label}</span>
      </td>
      <td className="tabular" style={{ ...td, textAlign: 'center', color: 'var(--text-2)' }}>{period}</td>
      {vals.map((v, i) => <td key={i} className="tabular" style={td}>{fmt(v)}</td>)}
    </tr>
  );
  return (
    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', borderTop: '1px solid ' + BC_LINE }}>
      <colgroup>
        <col style={{ width: '15%' }} /><col style={{ width: '7%' }} />
        {BC_BUCKETS.map((_, i) => <col key={i} style={{ width: (78 / 12) + '%' }} />)}
      </colgroup>
      <thead><tr>
        <th style={{ ...thBase, borderLeft: '1px solid ' + BC_LINE }}>集計区分</th>
        <th style={thBase}>対象期間</th>
        {BC_BUCKETS.map((b, i) => <th key={i} style={thBase}>{b}</th>)}
      </tr></thead>
      <tbody>
        {row(curLabel, periodCur, cur, BC_NAVY)}
        {row(pyLabel, periodPy, py, BC_ORANGE)}
      </tbody>
    </table>
  );
}

/* 指標ごとの値・フォーマッタを生成 */
function metricBundle(id, ctx, roomScale, withCancel) {
  const M = BC_METRICS.find(m => m.id === id);
  const { cur, py } = buildCurve(id, ctx, roomScale, withCancel);
  const fmtVal = M.unit === 'yen' ? bcFmt.yen : M.unit === 'pct' ? bcFmt.pct : bcFmt.int;
  const yFmt = M.unit === 'yen' ? bcFmt.yenK : M.unit === 'pct' ? (v => Math.round(v) + '%') : (v => bcFmt.int(v));
  const hoverFmt = M.unit === 'yen' ? bcFmt.yen : M.unit === 'pct' ? bcFmt.pct : bcFmt.int;
  return { M, cur, py, fmtVal, yFmt, hoverFmt };
}

function BookingCurveScreen({ st, set }) {
  const { sel, setAll, pick, isOn, allOn } = useMultiMetric(['rooms'], BC_METRICS.map(m => m.id));
  const [cancel, setCancel] = React.useState('excl'); // excl=除く / incl=含む
  const shown = BC_METRICS.filter(m => sel.includes(m.id));
  const multi = shown.length > 1;
  const fac = FACILITIES.find(f => f.id === (st.facility === 'ALL' ? 'F001' : st.facility)) || FACILITIES[0];
  const facName = fac.name;
  const adjTax = st.tax === 'excl' ? 1 / 1.1 : 1;
  const adjFac = fac.adrScale || 1;          // 施設別ADR係数（無ければ1）
  const roomScale = fac.rooms / 24;          // 基準=アクアパレス北谷24室
  const year = st.period.year, month = st.period.month;
  const ctx = { rooms: fac.rooms, period: st.period, adjTax, adjFac };
  const withCancel = cancel === 'incl';

  const periodCur = year + '/' + month;
  const periodPy = (year - 1) + '/' + month;
  const cancelLbl = withCancel ? 'キャンセルを含む' : 'キャンセルを除く';
  const card = { border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' };
  const cap = (txt, sub) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>{txt}</h3>
      {sub && <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
    </div>
  );

  const tabBtn = (id, label) => (
    <button key={id} onClick={(e) => pick(id, e)} title="Ctrl/⌘+クリックで複数選択" style={{
      height: 32, padding: '0 15px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      border: '1px solid ' + (isOn(id) ? 'rgba(' + BC_VIO + ',0.5)' : 'var(--border)'),
      background: isOn(id) ? 'rgba(' + BC_VIO + ',0.1)' : 'var(--surface)',
      color: isOn(id) ? 'var(--primary-ink)' : 'var(--text-2)',
    }}>{label}</button>
  );

  // 単一指標のテーブル（累計 + 進捗率）
  function renderSingle(id, opts) {
    const { M, cur, py, fmtVal } = metricBundle(id, ctx, roomScale, withCancel);
    const progCur = cur.map(v => cur[0] ? v / cur[0] * 100 : 0);
    const progPy = py.map(v => py[0] ? v / py[0] * 100 : 0);
    const sub = facName + ' / ' + periodCur + '（' + M.label + '）';
    return (
      <React.Fragment key={id}>
        <div style={card}>
          {cap('ブッキングカーブ 累計', sub)}
          <div style={{ overflowX: 'auto' }}>
            <BcTable cur={cur} py={py} fmt={fmtVal} curLabel={cancelLbl + '（当年）'} pyLabel={cancelLbl + '（前年）'} periodCur={periodCur} periodPy={periodPy} />
          </div>
        </div>
        {opts !== 'compact' && (
          <div style={card}>
            {cap('当日を100%とした進捗率', sub)}
            <div style={{ overflowX: 'auto' }}>
              <BcTable cur={progCur} py={progPy} fmt={bcFmt.pct} curLabel={cancelLbl + '（当年）'} pyLabel={cancelLbl + '（前年）'} periodCur={periodCur} periodPy={periodPy} />
            </div>
          </div>
        )}
      </React.Fragment>
    );
  }

  // 二軸チャート：販売室数（第一軸）× 売上（第二軸）、当年 vs 前年
  const roomsCurve = buildCurve('rooms', ctx, roomScale, withCancel);
  const revCurve = buildCurve('rev', ctx, roomScale, withCancel);
  const dualSeries = [
    { label: '販売室数 当年', color: BC_NAVY, values: roomsCurve.cur, axis: 'left' },
    { label: '販売室数 前年', color: BC_NAVY, values: roomsCurve.py, axis: 'left', dashed: true },
    { label: '売上 当年', color: BC_ORANGE, values: revCurve.cur, axis: 'right' },
    { label: '売上 前年', color: BC_ORANGE, values: revCurve.py, axis: 'right', dashed: true },
  ];
  const dualChart = (
    <div style={card}>
      {cap('ブッキングカーブ チャート', '販売室数（左軸）× 売上（右軸・' + (st.tax === 'incl' ? '税込' : '税抜') + '）・当年 vs 前年')}
      <div style={{ padding: '18px 18px 12px' }}>
        <MultiLineChart series={dualSeries} xLabels={BC_BUCKETS} yFmt={bcFmt.int} yFmtRight={bcFmt.yenK} hoverFmt={bcFmt.int} hoverFmtRight={bcFmt.yen} height={360} />
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>ブッキングカーブ</h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, whiteSpace: 'nowrap' }}>
            {facName} · 室数 <strong style={{ color: 'var(--text)' }}>{fac.rooms}</strong> · {year}年{month}月 · {st.tax === 'incl' ? '税込' : '税抜'}表示
          </div>
        </div>
      </div>

      {/* 指標セレクタ + キャンセル可否 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {BC_METRICS.map(m => tabBtn(m.id, m.label))}
        <span style={{ width: 1, height: 20, background: 'var(--border-strong)', margin: '0 4px' }} />
        <button onClick={setAll} style={{
          height: 32, padding: '0 16px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px solid ' + (allOn ? 'var(--primary)' : 'rgba(' + BC_VIO + ',0.4)'), background: allOn ? 'var(--primary)' : 'var(--surface)', color: allOn ? '#fff' : 'var(--primary-ink)',
        }}><Icon name="Rows3" size={14} />すべて表示</button>
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4, whiteSpace: 'nowrap' }}>Ctrl/⌘+クリックで複数選択</span>

        <div style={{ flex: 1 }} />

        {/* キャンセル可否（インライン・セグメント） */}
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          {[{ v: 'excl', l: 'キャンセルを除く' }, { v: 'incl', l: 'キャンセルを含む' }].map((o, i) => (
            <button key={o.v} onClick={() => setCancel(o.v)} style={{
              height: 32, padding: '0 14px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', border: 'none',
              borderLeft: i ? '1px solid var(--border)' : 'none', cursor: 'pointer',
              background: cancel === o.v ? 'var(--primary-weak)' : 'var(--surface)',
              color: cancel === o.v ? 'var(--primary-ink)' : 'var(--text-2)',
            }}>{o.l}</button>
          ))}
        </div>
        <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
      </div>

      {multi
        ? shown.map(m => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 6 }}>
            {renderSingle(m.id, 'compact')}
          </div>
        ))
        : renderSingle(shown[0].id)}

      {/* 二軸チャート（販売室数 × 売上） */}
      {dualChart}
    </div>
  );
}

Object.assign(window, { BookingCurveScreen });
