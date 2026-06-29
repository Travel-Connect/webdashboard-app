/* ============================================================
   screens-stay.jsx — 泊数分析表（既存Excel忠実再現）
   指標ボタンで切替（販売室数 / 売上 / ADR / 同伴係数 / すべて表示）。
   各指標は [当年] と [前年実績] を全幅で縦に並べて表示（横スクロールなし）。
   施設=ヘッダー / 年=ヘッダー期間 / 税=ヘッダー税表示 / 部屋タイプ=画面内セレクタ
   ============================================================ */

/* 配色：分析画面共通のブルー基調トークン */
const STAY_PINK = 'rgba(37,111,219,0.08)';   /* 列見出し（淡い青） */
const STAY_PINK_LINE = 'var(--border)';
const STAY_BLUE = 'rgba(37,111,219,0.12)';   /* 合計/平均 行 */
const STAY_BLUE_TAB = 'var(--primary)';      /* 当年タブ */
const STAY_VIO = '37,111,219';

const stThBase = {
  background: STAY_PINK, color: 'var(--text-2)', fontSize: 11, fontWeight: 700,
  padding: '6px 5px', textAlign: 'right', whiteSpace: 'normal', lineHeight: 1.18, verticalAlign: 'bottom',
  borderBottom: '1px solid ' + STAY_PINK_LINE, borderRight: '1px solid var(--border)',
};
const stTd = {
  padding: '0 6px', height: 30, lineHeight: '30px', fontSize: 11.5, textAlign: 'right',
  whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
};
const stTot = {
  padding: '0 6px', height: 32, lineHeight: '32px', fontSize: 11.5, fontWeight: 700, textAlign: 'right',
  whiteSpace: 'nowrap', background: STAY_BLUE, borderTop: '2px solid var(--border-strong)', color: 'var(--text)',
};
const th = (headTop, extra) => Object.assign({}, stThBase, headTop != null ? { position: 'sticky', top: headTop, zIndex: 1 } : {}, extra);

/* 数値ヘルパ */
const stN = (n) => (n == null || isNaN(n)) ? '—' : new Intl.NumberFormat('ja-JP').format(Math.round(n));
const stPct1 = (n) => (n == null || isNaN(n)) ? '' : n.toFixed(1) + '%';

/* 当年/前年 の小見出しタブ */
function YearTab({ year, prior }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 7px' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700,
        background: prior ? 'var(--surface-3)' : STAY_BLUE_TAB, color: prior ? 'var(--text-2)' : '#fff',
        padding: '3px 13px', borderRadius: 'var(--r-md)',
      }}>{prior ? '前年実績' : '当年'}　{year}年</span>
    </div>
  );
}

/* ---------------- 販売室数 ---------------- */
function RoomsTable({ rows, tot, prior, year, headTop }) {
  return (
    <div>
      <YearTab year={year} prior={prior} />
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '10%' }} />
          {[0, 1, 2, 3, 4].map(i => <col key={i} style={{ width: '7%' }} />)}
          <col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
          <col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '13%' }} />
        </colgroup>
        <thead><tr>
          <th style={th(headTop, { textAlign: 'left' })}>日付</th>
          {STAY_BUCKETS.map(b => <th key={b} style={th(headTop)}>{b}</th>)}
          <th style={th(headTop)}>総泊数</th><th style={th(headTop)}>平均泊数</th>
          <th style={th(headTop)}>1泊比率</th><th style={th(headTop)}>2泊比率</th><th style={th(headTop)}>3泊以上比率</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const cnt = r.c.reduce((a, b) => a + b, 0);
            const avg = cnt ? r.tn / cnt : 0;
            const r1 = cnt ? r.c[0] / cnt * 100 : 0;
            const r2 = cnt ? r.c[1] / cnt * 100 : 0;
            const r3 = cnt ? (r.c[2] + r.c[3] + r.c[4]) / cnt * 100 : 0;
            return (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ ...stTd, textAlign: 'left', fontWeight: 600 }}>{STAY_MONTHS[i]}</td>
                {r.c.map((v, k) => <td key={k} className="tabular" style={{ ...stTd, color: v === 0 ? 'var(--text-3)' : 'var(--text)' }}>{stN(v)}</td>)}
                <td className="tabular" style={{ ...stTd, fontWeight: 700 }}>{stN(r.tn)}</td>
                <td className="tabular" style={{ ...stTd, color: 'var(--text-2)' }}>{avg.toFixed(2)}</td>
                <td className="tabular" style={{ ...stTd, color: 'var(--text-2)' }}>{stPct1(r1)}</td>
                <td className="tabular" style={{ ...stTd, color: 'var(--text-2)' }}>{stPct1(r2)}</td>
                <td className="tabular" style={{ ...stTd, color: 'var(--text-2)' }}>{stPct1(r3)}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...stTot, textAlign: 'left' }}>合計</td>
            {tot.c.map((v, k) => <td key={k} className="tabular" style={stTot}>{stN(v)}</td>)}
            <td className="tabular" style={stTot}>{stN(tot.tn)}</td>
            <td style={stTot}></td><td style={stTot}></td><td style={stTot}></td><td style={stTot}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- 売上 ---------------- */
function SalesTable({ rows, prior, year, adj, headTop }) {
  const colTot = [0, 1, 2, 3, 4].map(k => rows.reduce((s, r) => s + r[k], 0));
  const grand = colTot.reduce((a, b) => a + b, 0);
  const cTd = { ...stTd, fontSize: 10.5, padding: '0 5px' };
  const cTot = { ...stTot, fontSize: 10.5, padding: '0 5px' };
  return (
    <div>
      <YearTab year={year} prior={prior} />
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '6%' }} />
          {[0, 1, 2, 3, 4].map(i => <col key={i} style={{ width: '11%' }} />)}
          <col style={{ width: '13%' }} /><col style={{ width: '10%' }} />
          <col style={{ width: '5.33%' }} /><col style={{ width: '5.33%' }} /><col style={{ width: '5.33%' }} />
        </colgroup>
        <thead><tr>
          <th style={th(headTop, { textAlign: 'left', fontSize: 10.5, padding: '7px 5px' })}>日付</th>
          {STAY_BUCKETS.map(b => <th key={b} style={th(headTop, { fontSize: 10.5, padding: '7px 5px' })}>{b}</th>)}
          <th style={th(headTop, { fontSize: 10.5, padding: '7px 5px' })}>総売上</th><th style={th(headTop, { fontSize: 10.5, padding: '7px 5px' })}>平均売上</th>
          <th style={th(headTop, { fontSize: 10, padding: '7px 4px' })}>1泊<br />構成比</th><th style={th(headTop, { fontSize: 10, padding: '7px 4px' })}>2泊<br />構成比</th><th style={th(headTop, { fontSize: 10, padding: '7px 4px' })}>3泊以上<br />構成比</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const tot = r.reduce((a, b) => a + b, 0);
            const p1 = tot ? r[0] / tot * 100 : 0;
            const p2 = tot ? r[1] / tot * 100 : 0;
            const p3 = tot ? (r[2] + r[3] + r[4]) / tot * 100 : 0;
            return (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ ...cTd, textAlign: 'left', fontWeight: 600 }}>{STAY_MONTHS[i]}</td>
                {r.map((v, k) => <td key={k} className="tabular" style={{ ...cTd, color: v === 0 ? 'var(--text-3)' : 'var(--text)' }}>{stN(v * adj)}</td>)}
                <td className="tabular" style={{ ...cTd, fontWeight: 700 }}>{stN(tot * adj)}</td>
                <td className="tabular" style={{ ...cTd, color: 'var(--text-2)' }}>{stN(tot / 5 * adj)}</td>
                <td className="tabular" style={{ ...cTd, color: 'var(--text-2)' }}>{stPct1(p1)}</td>
                <td className="tabular" style={{ ...cTd, color: 'var(--text-2)' }}>{stPct1(p2)}</td>
                <td className="tabular" style={{ ...cTd, color: 'var(--text-2)' }}>{stPct1(p3)}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...cTot, textAlign: 'left' }}>合計</td>
            {colTot.map((v, k) => <td key={k} className="tabular" style={cTot}>{stN(v * adj)}</td>)}
            <td className="tabular" style={cTot}>{stN(grand * adj)}</td>
            <td className="tabular" style={cTot}>{stN(grand / 5 * adj)}</td>
            <td style={cTot}></td><td style={cTot}></td><td style={cTot}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- ADR / 同伴係数（5バケット + 平均 1列） ---------------- */
function MetricTable({ rows, avgRow, prior, year, adj, footLabel, lastLabel, dash, headTop }) {
  const fmt = (v) => {
    if (v == null) return dash ? '-' : '';
    if (dash) return v.toFixed(2);          // 同伴係数
    return v === 0 ? '0' : stN(v * adj);    // ADR
  };
  return (
    <div>
      <YearTab year={year} prior={prior} />
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '16%' }} />
          {[0, 1, 2, 3, 4].map(i => <col key={i} style={{ width: '13%' }} />)}
          <col style={{ width: '19%' }} />
        </colgroup>
        <thead><tr>
          <th style={th(headTop, { textAlign: 'left' })}>日付</th>
          {STAY_BUCKETS.map(b => <th key={b} style={th(headTop)}>{b}</th>)}
          <th style={th(headTop)}>{lastLabel}</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
              <td style={{ ...stTd, textAlign: 'left', fontWeight: 600 }}>{STAY_MONTHS[i]}</td>
              {r.a.map((v, k) => <td key={k} className="tabular" style={{ ...stTd, color: (v === 0 || v == null) ? 'var(--text-3)' : 'var(--text)' }}>{fmt(v)}</td>)}
              <td className="tabular" style={{ ...stTd, fontWeight: 700 }}>{fmt(r.avg)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...stTot, textAlign: 'left' }}>{footLabel}</td>
            {avgRow.a.map((v, k) => <td key={k} className="tabular" style={stTot}>{fmt(v)}</td>)}
            <td className="tabular" style={stTot}>{fmt(avgRow.avg)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- 指標 ---------------- */
const STAY_METRICS = [
  { id: 'rooms', label: '販売室数' },
  { id: 'sales', label: '売上' },
  { id: 'adr', label: 'ADR' },
  { id: 'comp', label: '同伴係数' },
];
function stayNote(id, tax) {
  if (id === 'rooms') return '※チェックインベースで計算';
  if (id === 'sales') return tax === 'incl' ? '※税込' : '※税抜';
  if (id === 'adr') return tax === 'incl' ? '※税込・室単価' : '※税抜・室単価';
  if (id === 'comp') return '※1予約あたりの平均同伴人数';
  return '';
}

/* 指標ごとに [当年] + [前年] の2テーブルを返す */
function MetricPair({ id, kc, kp, curY, priorY, adj, headTop }) {
  if (id === 'rooms') return (
    <>
      <RoomsTable rows={STAY_ROOMS[kc]} tot={STAY_ROOMS_TOT[kc]} year={curY} headTop={headTop} />
      <RoomsTable rows={STAY_ROOMS[kp]} tot={STAY_ROOMS_TOT[kp]} year={priorY} prior headTop={headTop} />
    </>
  );
  if (id === 'sales') return (
    <>
      <SalesTable rows={STAY_SALES[kc]} year={curY} adj={adj} headTop={headTop} />
      <SalesTable rows={STAY_SALES[kp]} year={priorY} adj={adj} prior headTop={headTop} />
    </>
  );
  if (id === 'adr') return (
    <>
      <MetricTable rows={STAY_ADR[kc]} avgRow={STAY_ADR_AVG[kc]} year={curY} adj={adj} footLabel="平均" lastLabel="平均ADR" headTop={headTop} />
      <MetricTable rows={STAY_ADR[kp]} avgRow={STAY_ADR_AVG[kp]} year={priorY} adj={adj} footLabel="平均" lastLabel="平均ADR" prior headTop={headTop} />
    </>
  );
  return (
    <>
      <MetricTable rows={STAY_COMP[kc]} avgRow={STAY_COMP_AVG[kc]} year={curY} footLabel="平均" lastLabel="平均同伴件数" dash headTop={headTop} />
      <MetricTable rows={STAY_COMP[kp]} avgRow={STAY_COMP_AVG[kp]} year={priorY} footLabel="平均" lastLabel="平均同伴件数" dash prior headTop={headTop} />
    </>
  );
}

/* ---------------- 部屋タイプ セレクタ（Excelスライサー再現） ---------------- */
function RoomTypeSelect({ value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: 6 }}>
      {STAY_ROOMTYPES.map(rt => {
        const active = rt === value;
        return (
          <button key={rt} onClick={() => onChange(rt)} style={{
            height: 32, padding: '0 13px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
            border: '1px solid ' + (active ? 'var(--primary)' : 'var(--border)'),
            background: active ? 'var(--primary-weak)' : 'var(--surface)',
            color: active ? 'var(--primary-ink)' : 'var(--text-2)',
          }}>{rt}</button>
        );
      })}
    </div>
  );
}

/* ---------------- 画面本体 ---------------- */
function StayNightsScreen({ st }) {
  const [roomType, setRoomType] = React.useState(STAY_ROOMTYPES[0]);
  const { sel, setAll, pick, isOn, allOn } = useMultiMetric(['rooms'], STAY_METRICS.map(m => m.id));
  const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
  const isAll = st.facility === 'ALL';
  const fac = FACILITIES.find(f => f.id === st.facility);
  const facName = isAll ? '全施設' : (fac?.name || 'アクアパレス北谷');
  const rooms = isAll ? '—' : (fac?.rooms ?? 24);
  const shown = STAY_METRICS.filter(m => sel.includes(m.id));
  const multi = shown.length > 1;

  // 当年=選択年、前年=選択年-1。実データは2026/2025のみ保持（他年も同形状で表示＝モック）
  const curY = st.period.year;
  const priorY = curY - 1;
  const kc = STAY_ROOMS[curY] ? curY : 2026;
  const kp = STAY_ROOMS[priorY] ? priorY : 2025;

  const wrap = { flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' };
  const tabBtn = (id, label) => (
    <button key={id} onClick={(e) => pick(id, e)} title="Ctrl/⌘+クリックで複数選択" style={{
      height: 32, padding: '0 15px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
      border: '1px solid ' + (isOn(id) ? 'rgba(' + STAY_VIO + ',0.5)' : 'var(--border)'),
      background: isOn(id) ? 'rgba(' + STAY_VIO + ',0.1)' : 'var(--surface)',
      color: isOn(id) ? 'var(--primary-ink)' : 'var(--text-2)',
    }}>{label}</button>
  );
  const sectionBar = (label, note) => (
    <div style={{ position: 'sticky', top: 0, zIndex: 8, height: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '.02em', boxShadow: 'var(--shadow-card)' }}>
      <span style={{ opacity: .8, fontSize: 11.5, fontWeight: 600 }}>指標</span>{label}
      {note && <span style={{ opacity: .8, fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap' }}>{note}</span>}
    </div>
  );

  return (
    <div style={{ height: 'calc(100dvh - 152px)', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
      {/* タイトル + メタ */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>泊数分析表</h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3 }}>
            {facName} · {roomType} · 室数 <strong style={{ color: 'var(--text)' }}>{rooms}</strong> · {st.tax === 'incl' ? '税込' : '税抜'}表示 · 当年 {curY}年 / 前年 {priorY}年 · 指標：<strong style={{ color: 'var(--text)' }}>{allOn ? 'すべて（4指標）' : shown.map(m => m.label).join('・')}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>部屋タイプ</span>
          <RoomTypeSelect value={roomType} onChange={setRoomType} />
          <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
        </div>
      </div>

      {/* 指標セレクタ */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
        {STAY_METRICS.map(m => tabBtn(m.id, m.label))}
        <span style={{ width: 1, height: 20, background: 'var(--border-strong)', margin: '0 4px' }} />
        <button onClick={setAll} style={{
          height: 32, padding: '0 16px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px solid ' + (allOn ? 'var(--primary)' : 'rgba(' + STAY_VIO + ',0.4)'),
          background: allOn ? 'var(--primary)' : 'var(--surface)',
          color: allOn ? '#fff' : 'var(--primary-ink)',
        }}><Icon name="Rows3" size={14} />すべて表示</button>
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4, whiteSpace: 'nowrap' }}>Ctrl/⌘+クリックで複数選択</span>
      </div>

      {!STAY_ROOMS[curY] && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--warning)', background: 'var(--warning-weak)', border: '1px solid #F1D9B5', borderRadius: 'var(--r-md)', padding: '8px 12px', flexShrink: 0 }}>
          <Icon name="Info" size={14} />{curY}年の確定データは未取込のため、直近の実績（2026年/2025年）を表示しています。
        </div>
      )}

      {multi ? (
        <div style={wrap}>
          {shown.map((m, i) => (
            <div key={m.id} style={{ marginBottom: i === shown.length - 1 ? 0 : 22 }}>
              {sectionBar(m.label, stayNote(m.id, st.tax))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, padding: 18 }}>
                <MetricPair id={m.id} kc={kc} kp={kp} curY={curY} priorY={priorY} adj={adj} headTop={null} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={wrap}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, padding: 18, alignItems: 'start' }}>
            <MetricPair id={shown[0].id} kc={kc} kp={kp} curY={curY} priorY={priorY} adj={adj} headTop={0} />
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { StayNightsScreen });
