/* ============================================================
   screens-roomtypes.jsx — 部屋タイプ別分析（既存Excel忠実再現）
   部屋タイプ × 月 クロス集計。指標ボタン（売上 / 販売室数 / ADR / すべて表示）で切替。
   売上・販売室数=実値、ADR=売上/販売室数で算出。税込/税抜はヘッダー税表示に連動。
   ============================================================ */

const RT_TEAL = '37,111,219';  /* 統一アクセント（primary blue） */
const RT_INV_TOT = (RT_INVENTORY[0] + RT_INVENTORY[1]); /* 施設客室数合計 */

/* 指標定義 */
const RT_METRICS = [
  { id: 'sales', label: '売上', unit: 'yen', heat: true },
  { id: 'rooms', label: '販売室数', unit: 'int', heat: true },
  { id: 'adr', label: 'ADR', unit: 'yen', heat: false },
  { id: 'occ', label: '消化率', unit: 'pct', heat: true },
  { id: 'comp', label: '同伴係数', unit: 'dec', heat: false },
];

/* 値フォーマット（指標単位別） */
function rtFmt(v, unit) {
  if (v == null || isNaN(v)) return '—';
  if (unit === 'pct') return v === 0 ? '0%' : v.toFixed(1) + '%';
  if (unit === 'dec') return v === 0 ? '—' : v.toFixed(2);
  return v === 0 ? '0' : new Intl.NumberFormat('ja-JP').format(Math.round(v));
}

/* 指標×月マトリクスを生成
   rows: [{name, cells[12], total}], colTot[12], grand */
function buildRtMatrix(metricId, year, adj) {
  const sales = RT_SALES[year] || RT_SALES[2026];
  const rooms = RT_ROOMS[year] || RT_ROOMS[2026];
  const nT = RT_TYPES.length;
  let rows, colTot, grand;

  if (metricId === 'sales') {
    rows = RT_TYPES.map((name, i) => {
      const cells = sales[i].map(v => v * adj);
      return { name, cells, total: cells.reduce((a, b) => a + b, 0) };
    });
    colTot = Array.from({ length: 12 }, (_, m) => rows.reduce((a, r) => a + r.cells[m], 0));
    grand = colTot.reduce((a, b) => a + b, 0);
  } else if (metricId === 'rooms') {
    rows = RT_TYPES.map((name, i) => {
      const cells = rooms[i].slice();
      return { name, cells, total: cells.reduce((a, b) => a + b, 0) };
    });
    colTot = Array.from({ length: 12 }, (_, m) => rows.reduce((a, r) => a + r.cells[m], 0));
    grand = colTot.reduce((a, b) => a + b, 0);
  } else if (metricId === 'occ') { // 消化率 = 販売室数 / (客室数 × 日数)
    rows = RT_TYPES.map((name, i) => {
      const cells = rooms[i].map((v, m) => RT_DAYS[m] ? v / (RT_INVENTORY[i] * RT_DAYS[m]) * 100 : 0);
      const soldY = rooms[i].reduce((a, b) => a + b, 0);
      const total = soldY / (RT_INVENTORY[i] * 365) * 100; // 年間消化率
      return { name, cells, total };
    });
    colTot = Array.from({ length: 12 }, (_, m) => {
      const soldM = rows.reduce((a, r, i) => a + rooms[i][m], 0);
      return RT_DAYS[m] ? soldM / (RT_INV_TOT * RT_DAYS[m]) * 100 : 0;
    });
    const soldAll = rooms.reduce((a, t) => a + t.reduce((x, y) => x + y, 0), 0);
    grand = soldAll / (RT_INV_TOT * 365) * 100; // 年間 全体消化率
  } else if (metricId === 'comp') { // 同伴係数（平均で集計）
    const comp = (RT_COMP[year] || RT_COMP[2026]);
    rows = RT_TYPES.map((name, i) => {
      const cells = comp[i].slice();
      const valid = cells.filter(v => v > 0);
      return { name, cells, total: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0 };
    });
    colTot = Array.from({ length: 12 }, (_, m) => {
      const vals = rows.map(r => r.cells[m]).filter(v => v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    const all = rows.flatMap(r => r.cells).filter(v => v > 0);
    grand = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  } else { // adr = sales/rooms（部屋タイプ別）。合計列=月合計、合計行=部屋タイプ平均（Excel踏襲）
    rows = RT_TYPES.map((name, i) => {
      const cells = sales[i].map((v, m) => rooms[i][m] ? Math.round(v * adj / rooms[i][m]) : 0);
      return { name, cells, total: cells.reduce((a, b) => a + b, 0) };
    });
    colTot = Array.from({ length: 12 }, (_, m) => {
      const vals = rows.map(r => r.cells[m]).filter(v => v > 0);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    });
    grand = colTot.reduce((a, b) => a + b, 0);
  }
  return { rows, colTot, grand };
}

/* 単一指標の 部屋タイプ×月 マトリクス表 */
function RtMatrixTable({ metricId, year, adj, sticky }) {
  const M = RT_METRICS.find(m => m.id === metricId);
  const { rows, colTot, grand } = buildRtMatrix(metricId, year, adj);
  const months = Array.from({ length: 12 }, (_, m) => (m + 1) + '月');
  const nM = 12;
  const fmt = (v) => rtFmt(v, M.unit);
  const colMax = months.map((_, m) => Math.max(...rows.map(r => r.cells[m]), 0.0001));
  const alphaFor = (v, m) => {
    if (!M.heat || v === 0) return 0;
    if (M.unit === 'pct') return Math.min(v / 100, 1) * 0.5;          // 消化率：絶対値で濃淡
    return (v / (colTot[m] || colMax[m] || 1)) * 0.5;                 // 売上/室数：月内シェア
  };

  const topOff = sticky ? 40 : 0;
  const cName = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', textAlign: 'left', padding: '0 12px', fontSize: 12, height: 30, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border)' };
  const cNum = { padding: '0 8px', fontSize: 11.5, height: 30, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' };
  const hTop = { position: 'sticky', top: topOff, zIndex: 5, height: 28, boxSizing: 'border-box', background: 'rgba(' + RT_TEAL + ',0.08)', fontSize: 11.5, fontWeight: 700, color: 'var(--text)', padding: '0 8px', textAlign: 'center', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const hMon = { position: 'sticky', top: topOff + 27, zIndex: 4, height: 26, boxSizing: 'border-box', background: 'rgba(' + RT_TEAL + ',0.07)', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', padding: '0 8px', textAlign: 'right', borderBottom: '1px solid var(--border-strong)', whiteSpace: 'nowrap' };
  const totCol = { ...cNum, fontWeight: 700, background: 'rgba(' + RT_TEAL + ',0.07)', borderLeft: '1px solid var(--border-strong)' };

  return (
    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>
      <colgroup>
        <col style={{ width: '15%' }} />
        {months.map((m, i) => <col key={i} style={{ width: '6%' }} />)}
        <col style={{ width: '13%' }} />
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={2} style={{ ...cName, ...hTop, zIndex: 7, top: topOff, textAlign: 'left', borderRight: '1px solid var(--border-strong)' }}>{M.label}　部屋タイプ \ 月</th>
          <th colSpan={nM} style={hTop}>アクアパレス北谷 · {year}年</th>
          <th rowSpan={2} style={{ ...hTop, top: topOff, zIndex: 6, borderLeft: '1px solid var(--border-strong)', textAlign: 'right' }}>合計</th>
        </tr>
        <tr>{months.map((m, i) => <th key={i} style={hMon}>{m}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
            <td style={cName} title={r.name}>{r.name}</td>
            {r.cells.map((v, m) => <td key={m} className="tabular" style={{ ...cNum, color: v === 0 ? 'var(--text-3)' : 'var(--text)', background: v === 0 ? undefined : 'rgba(' + RT_TEAL + ',' + alphaFor(v, m).toFixed(3) + ')' }}>{fmt(v)}</td>)}
            <td className="tabular" style={{ ...totCol, color: r.total === 0 ? 'var(--text-3)' : 'var(--text)' }}>{fmt(r.total)}</td>
          </tr>
        ))}
        <tr>
          <td style={{ ...cName, fontWeight: 700, background: 'rgba(' + RT_TEAL + ',0.07)', borderTop: '2px solid var(--border-strong)' }}>{metricId === 'adr' ? '合計（平均）' : metricId === 'occ' ? '全体' : metricId === 'comp' ? '平均' : '合計'}</td>
          {colTot.map((v, m) => <td key={m} className="tabular" style={{ ...cNum, fontWeight: 700, background: 'rgba(' + RT_TEAL + ',0.07)', borderTop: '2px solid var(--border-strong)' }}>{fmt(v)}</td>)}
          <td className="tabular" style={{ ...totCol, fontWeight: 800, borderTop: '2px solid var(--border-strong)' }}>{fmt(grand)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function RoomTypesScreen({ st }) {
  const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
  const { sel, setAll, pick, isOn, allOn } = useMultiMetric(['sales'], RT_METRICS.map(m => m.id));
  const shown = RT_METRICS.filter(m => sel.includes(m.id));
  const multi = shown.length > 1;
  const isAll = st.facility === 'ALL';
  const fac = FACILITIES.find(f => f.id === st.facility);
  const facName = isAll ? '全施設' : (fac?.name || 'アクアパレス北谷');
  const year = RT_SALES[st.period.year] ? st.period.year : 2026;

  const wrap = { flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' };
  const tabBtn = (id, label) => (
    <button key={id} onClick={(e) => pick(id, e)} title="Ctrl/⌘+クリックで複数選択" style={{
      height: 32, padding: '0 15px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
      border: '1px solid ' + (isOn(id) ? 'rgba(' + RT_TEAL + ',0.5)' : 'var(--border)'),
      background: isOn(id) ? 'rgba(' + RT_TEAL + ',0.1)' : 'var(--surface)',
      color: isOn(id) ? 'var(--primary-ink)' : 'var(--text-2)',
    }}>{label}</button>
  );
  const sectionBar = (label) => (
    <div style={{ position: 'sticky', top: 0, zIndex: 8, height: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '.02em', boxShadow: 'var(--shadow-card)' }}>
      <span style={{ opacity: .8, fontSize: 11.5, fontWeight: 600 }}>指標</span>{label}
    </div>
  );

  return (
    <div style={{ height: 'calc(100dvh - 152px)', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>部屋タイプ別分析</h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, whiteSpace: 'nowrap' }}>
            {facName} · {year}年（月次）· {st.tax === 'incl' ? '税込' : '税抜'}表示 · 指標：<strong style={{ color: 'var(--text)' }}>{allOn ? 'すべて（5指標）' : shown.map(m => m.label).join('・')}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
        </div>
      </div>

      {/* 指標セレクタ */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
        {RT_METRICS.map(m => tabBtn(m.id, m.label))}
        <span style={{ width: 1, height: 20, background: 'var(--border-strong)', margin: '0 4px' }} />
        <button onClick={setAll} style={{
          height: 32, padding: '0 16px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px solid ' + (allOn ? 'var(--primary)' : 'rgba(' + RT_TEAL + ',0.4)'),
          background: allOn ? 'var(--primary)' : 'var(--surface)',
          color: allOn ? '#fff' : 'var(--primary-ink)',
        }}><Icon name="Rows3" size={14} />すべて表示</button>
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4, whiteSpace: 'nowrap' }}>Ctrl/⌘+クリックで複数選択</span>
      </div>

      {multi ? (
        <div style={wrap}>
          {shown.map((m, i) => (
            <div key={m.id} style={{ marginBottom: i === shown.length - 1 ? 0 : 20 }}>
              {sectionBar(m.label)}
              <RtMatrixTable metricId={m.id} year={year} adj={adj} sticky />
            </div>
          ))}
        </div>
      ) : (
        <div style={wrap}>
          <RtMatrixTable metricId={shown[0].id} year={year} adj={adj} />
        </div>
      )}
    </div>
  );
}

Object.assign(window, { RoomTypesScreen });
