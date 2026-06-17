/* ============================================================
   screens-stub.jsx — remaining screens (mock fidelity)
   Channels & Nationalities use real report data; others are
   descriptive placeholders for the agreed roadmap.
   ============================================================ */

/* ---------- 経路分析 — 既存Excel「経路別実績一覧」踏襲・施設横断クロス集計 ---------- */
const CH_BLUE = '37,111,219';
function ChannelsScreen({ st }) {
  if (st.range === 'year') return <ChannelsAnnual st={st} />;
  return <ChannelsMonthly st={st} />;
}
function ChannelsMonthly({ st }) {
  const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
  const [hideZero, setHideZero] = React.useState(true);
  const [view, setView] = React.useState('cur');
  const isPY = view === 'py';
  const SRC = isPY ? CH_ROUTES_PY : CH_ROUTES;
  const periodLabel = isPY ? (st.period.year - 1) + '年' + st.period.month + '月' : st.period.label;
  const facs = CH_FACS;
  const nF = facs.length;
  const colTot = facs.map((_, ci) => SRC.reduce((s, r) => s + r.v[ci], 0));
  const grand = colTot.reduce((a, b) => a + b, 0);
  const routesAll = SRC.map(r => ({ ...r, total: r.v.reduce((a, b) => a + b, 0) }));
  const routes = hideZero ? routesAll.filter(r => r.total > 0) : routesAll;
  const hiddenN = routesAll.length - routes.length;

  // area groupings for header colspans
  const areaGroups = [];
  facs.forEach((f, i) => {
    const last = areaGroups[areaGroups.length - 1];
    if (last && last.area === f.area) last.span++;
    else areaGroups.push({ area: f.area, span: 1, start: i });
  });
  const selIdx = facs.findIndex(f => f.id === st.facility || f.key === st.facility);

  // styles
  const wrap = { flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' };
  const cName = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', textAlign: 'left', padding: '0 10px', fontSize: 11.5, height: 24, whiteSpace: 'nowrap', borderRight: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border)' };
  const cNum = { padding: '0 6px', fontSize: 11, height: 24, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' };
  const hArea = { position: 'sticky', top: 0, zIndex: 5, height: 28, boxSizing: 'border-box', background: 'var(--surface-2)', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', padding: '0 8px', textAlign: 'center', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const hFac = { position: 'sticky', top: 27, zIndex: 4, height: 40, boxSizing: 'border-box', background: 'var(--surface-2)', fontSize: 10, fontWeight: 600, color: 'var(--text-2)', padding: '3px 5px', textAlign: 'right', borderBottom: '1px solid var(--border-strong)', whiteSpace: 'normal', lineHeight: 1.12, wordBreak: 'break-word', verticalAlign: 'bottom' };
  const selBg = 'rgba(' + CH_BLUE + ',0.06)';

  const numCell = (v, ci, bold) => {
    const x = Math.round(v * adj);
    const sel = ci === selIdx;
    return <td key={ci} className="tabular" style={{ ...cNum, fontWeight: bold ? 700 : 400, color: v === 0 ? 'var(--text-3)' : 'var(--text)', background: sel ? selBg : undefined }}>{fmtInt(x)}</td>;
  };
  const pctCell = (v, ci) => {
    const ct = colTot[ci];
    const p = ct ? v / ct * 100 : 0;
    const sel = ci === selIdx;
    const a = p / 100 * 0.55;
    return <td key={ci} className="tabular" style={{ ...cNum, color: v === 0 ? 'var(--text-3)' : 'var(--text)', background: v === 0 ? (sel ? selBg : undefined) : 'rgba(' + CH_BLUE + ',' + a.toFixed(3) + ')', borderLeft: sel ? '1px solid rgba(' + CH_BLUE + ',.4)' : undefined }}>{Math.round(p)}%</td>;
  };

  const sectionRow = (label) => (
    <tr><td colSpan={nF + 2} style={{ position: 'sticky', left: 0, background: 'rgba(37,111,219,0.1)', color: 'var(--primary-ink)', fontSize: 11.5, fontWeight: 700, padding: '6px 10px', letterSpacing: '.02em', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border-strong)' }}>{label}</td></tr>
  );

  return (
    <div style={{ height: 'calc(100dvh - 152px)', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
      {/* title + toolbar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>経路別実績一覧</h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, whiteSpace: 'nowrap' }}>
            全施設横断（{nF}施設）· {periodLabel}{isPY ? '（前年）' : ''} · {st.tax === 'incl' ? '税込' : '税抜'}表示 · 売上合計 <strong className="tabular" style={{ color: 'var(--text)' }}>{fmtYenC(grand * adj)}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'cur', label: '当年' }, { value: 'py', label: '前年' }]} />
          <button onClick={() => setHideZero(z => !z)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: hideZero ? 'var(--primary-weak)' : 'var(--surface)', color: hideZero ? 'var(--primary-ink)' : 'var(--text-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Icon name={hideZero ? 'EyeOff' : 'Eye'} size={14} />売上0の経路を隠す{hiddenN > 0 && hideZero ? `（${hiddenN}）` : ''}
          </button>
          <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
        </div>
      </div>

      {/* cross-tab */}
      <div style={wrap}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 1372 }}>
          <colgroup>
            <col style={{ width: 168 }} />
            {facs.map((f, i) => <col key={i} style={{ width: 74 }} />)}
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...cName, ...hArea, zIndex: 7, top: 0, height: 'auto', textAlign: 'left', borderRight: '1px solid var(--border-strong)' }}>経路 \ 施設</th>
              {areaGroups.map((g, gi) => <th key={gi} colSpan={g.span} style={hArea}>{g.area}</th>)}
              <th rowSpan={2} style={{ ...hArea, top: 0, zIndex: 6, borderLeft: '1px solid var(--border-strong)', textAlign: 'right' }}>合計</th>
            </tr>
            <tr>
              {facs.map((f, i) => <th key={i} title={f.short} style={{ ...hFac, background: i === selIdx ? 'rgba(' + CH_BLUE + ',0.12)' : 'var(--surface-2)', color: i === selIdx ? 'var(--primary-ink)' : 'var(--text-2)' }}>{f.short}</th>)}
            </tr>
          </thead>
          <tbody>
            {/* 売上 */}
            {sectionRow('売上' + (st.tax === 'incl' ? '（税込）' : '（税抜）'))}
            {routes.map((r, ri) => (
              <tr key={'r' + ri} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={cName}>{r.name}</td>
                {r.v.map((v, ci) => numCell(v, ci))}
                <td className="tabular" style={{ ...cNum, fontWeight: 700, background: 'var(--surface-2)', borderLeft: '1px solid var(--border-strong)', color: r.total === 0 ? 'var(--text-3)' : 'var(--text)' }}>{fmtInt(Math.round(r.total * adj))}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...cName, fontWeight: 700, background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)' }}>合計</td>
              {colTot.map((v, ci) => <td key={ci} className="tabular" style={{ ...cNum, fontWeight: 700, background: ci === selIdx ? 'rgba(' + CH_BLUE + ',0.1)' : 'var(--surface-2)', borderTop: '2px solid var(--border-strong)' }}>{fmtInt(Math.round(v * adj))}</td>)}
              <td className="tabular" style={{ ...cNum, fontWeight: 800, background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)', borderLeft: '1px solid var(--border-strong)' }}>{fmtInt(Math.round(grand * adj))}</td>
            </tr>

            {/* 構成比 */}
            {sectionRow('構成比（施設内シェア）')}
            {routes.map((r, ri) => (
              <tr key={'p' + ri} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={cName}>{r.name}</td>
                {r.v.map((v, ci) => pctCell(v, ci))}
                <td className="tabular" style={{ ...cNum, fontWeight: 700, background: 'var(--surface-2)', borderLeft: '1px solid var(--border-strong)', color: r.total === 0 ? 'var(--text-3)' : 'var(--text)' }}>{(r.total / grand * 100).toFixed(1)}%</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...cName, fontWeight: 700, background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)' }}>合計</td>
              {colTot.map((v, ci) => <td key={ci} className="tabular" style={{ ...cNum, fontWeight: 700, background: ci === selIdx ? 'rgba(' + CH_BLUE + ',0.1)' : 'var(--surface-2)', borderTop: '2px solid var(--border-strong)' }}>{v ? '100%' : '0%'}</td>)}
              <td className="tabular" style={{ ...cNum, fontWeight: 800, background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)', borderLeft: '1px solid var(--border-strong)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- 経路分析（年間）— 経路 × 月 クロス集計（選択施設 / 全施設） ---------- */
function ChannelsAnnual({ st }) {
  const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
  const [hideZero, setHideZero] = React.useState(true);
  const [view, setView] = React.useState('cur');
  const isPY = view === 'py';
  const year = isPY ? st.period.year - 1 : st.period.year;
  const routes = isPY ? CH_ROUTES_PY : CH_ROUTES;
  const yearRows = isPY ? OCC_YEAR_PY : OCC_YEAR;
  const isAll = st.facility === 'ALL';
  const facIdx = isAll ? null : CH_FACS.findIndex(f => f.key === st.facility);
  const facName = isAll ? '全施設' : (FACILITIES.find(f => f.id === st.facility)?.name || (facIdx >= 0 ? CH_FACS[facIdx].short : ''));
  const { rows: allRows, colTot, grand } = buildChannelAnnual(routes, facIdx, yearRows);
  const rows = hideZero ? allRows.filter(r => r.total > 0) : allRows;
  const hiddenN = allRows.length - rows.length;
  const months = Array.from({ length: 12 }, (_, m) => (m + 1) + '月');
  const nM = 12;

  const wrap = { flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' };
  const cName = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', textAlign: 'left', padding: '0 10px', fontSize: 11.5, height: 24, whiteSpace: 'nowrap', borderRight: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border)' };
  const cNum = { padding: '0 6px', fontSize: 11, height: 24, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' };
  const hTop = { position: 'sticky', top: 0, zIndex: 5, height: 28, boxSizing: 'border-box', background: 'var(--surface-2)', fontSize: 11.5, fontWeight: 700, color: 'var(--text)', padding: '0 8px', textAlign: 'center', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const hMon = { position: 'sticky', top: 27, zIndex: 4, height: 26, boxSizing: 'border-box', background: 'var(--surface-2)', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', padding: '0 6px', textAlign: 'right', borderBottom: '1px solid var(--border-strong)', whiteSpace: 'nowrap' };
  const isCur = (m) => !isPY && year === 2026 && m === 5; // 6月＝monthly一致列を軽く強調
  const curBg = 'rgba(' + CH_BLUE + ',0.06)';

  const sectionRow = (label) => (
    <tr><td colSpan={nM + 2} style={{ position: 'sticky', left: 0, background: 'rgba(37,111,219,0.1)', color: 'var(--primary-ink)', fontSize: 11.5, fontWeight: 700, padding: '6px 10px', letterSpacing: '.02em', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border-strong)' }}>{label}</td></tr>
  );

  return (
    <div style={{ height: 'calc(100dvh - 152px)', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>経路別実績一覧</h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, whiteSpace: 'nowrap' }}>
            {facName} · {year}年（月次）{isPY ? '（前年）' : ''} · {st.tax === 'incl' ? '税込' : '税抜'}表示 · 年間売上 <strong className="tabular" style={{ color: 'var(--text)' }}>{fmtYenC(grand * adj)}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'cur', label: '当年' }, { value: 'py', label: '前年' }]} />
          <button onClick={() => setHideZero(z => !z)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: hideZero ? 'var(--primary-weak)' : 'var(--surface)', color: hideZero ? 'var(--primary-ink)' : 'var(--text-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Icon name={hideZero ? 'EyeOff' : 'Eye'} size={14} />売上0の経路を隠す{hiddenN > 0 && hideZero ? `（${hiddenN}）` : ''}
          </button>
          <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
        </div>
      </div>

      <div style={wrap}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 1240 }}>
          <colgroup>
            <col style={{ width: 184 }} />
            {months.map((m, i) => <col key={i} style={{ width: 80 }} />)}
            <col style={{ width: 116 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...cName, ...hTop, zIndex: 7, top: 0, textAlign: 'left', borderRight: '1px solid var(--border-strong)' }}>経路 \ 月</th>
              <th colSpan={nM} style={hTop}>{facName} · {year}年</th>
              <th rowSpan={2} style={{ ...hTop, top: 0, zIndex: 6, borderLeft: '1px solid var(--border-strong)', textAlign: 'right' }}>合計</th>
            </tr>
            <tr>
              {months.map((m, i) => <th key={i} style={{ ...hMon, background: isCur(i) ? 'rgba(' + CH_BLUE + ',0.12)' : 'var(--surface-2)', color: isCur(i) ? 'var(--primary-ink)' : 'var(--text-2)' }}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {sectionRow('売上' + (st.tax === 'incl' ? '（税込）' : '（税抜）'))}
            {rows.map((r, ri) => (
              <tr key={'r' + ri} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={cName}>{r.name}</td>
                {r.v.map((v, m) => <td key={m} className="tabular" style={{ ...cNum, color: v === 0 ? 'var(--text-3)' : 'var(--text)', background: isCur(m) ? curBg : undefined }}>{fmtInt(Math.round(v * adj))}</td>)}
                <td className="tabular" style={{ ...cNum, fontWeight: 700, background: 'var(--surface-2)', borderLeft: '1px solid var(--border-strong)', color: r.total === 0 ? 'var(--text-3)' : 'var(--text)' }}>{fmtInt(Math.round(r.total * adj))}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...cName, fontWeight: 700, background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)' }}>合計</td>
              {colTot.map((v, m) => <td key={m} className="tabular" style={{ ...cNum, fontWeight: 700, background: isCur(m) ? 'rgba(' + CH_BLUE + ',0.1)' : 'var(--surface-2)', borderTop: '2px solid var(--border-strong)' }}>{fmtInt(Math.round(v * adj))}</td>)}
              <td className="tabular" style={{ ...cNum, fontWeight: 800, background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)', borderLeft: '1px solid var(--border-strong)' }}>{fmtInt(Math.round(grand * adj))}</td>
            </tr>

            {sectionRow('構成比（月内シェア）')}
            {rows.map((r, ri) => (
              <tr key={'p' + ri} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={cName}>{r.name}</td>
                {r.v.map((v, m) => {
                  const p = colTot[m] ? v / colTot[m] * 100 : 0;
                  return <td key={m} className="tabular" style={{ ...cNum, color: v === 0 ? 'var(--text-3)' : 'var(--text)', background: v === 0 ? (isCur(m) ? curBg : undefined) : 'rgba(' + CH_BLUE + ',' + (p / 100 * 0.55).toFixed(3) + ')' }}>{p.toFixed(p >= 10 ? 0 : 1)}%</td>;
                })}
                <td className="tabular" style={{ ...cNum, fontWeight: 700, background: 'var(--surface-2)', borderLeft: '1px solid var(--border-strong)', color: r.total === 0 ? 'var(--text-3)' : 'var(--text)' }}>{(r.total / grand * 100).toFixed(2)}%</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...cName, fontWeight: 700, background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)' }}>合計</td>
              {colTot.map((v, m) => <td key={m} className="tabular" style={{ ...cNum, fontWeight: 700, background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)' }}>{v ? '100%' : '0%'}</td>)}
              <td className="tabular" style={{ ...cNum, fontWeight: 800, background: 'var(--surface-2)', borderTop: '2px solid var(--border-strong)', borderLeft: '1px solid var(--border-strong)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- 国籍別分析 — 既存Excel「国籍別分析」忠実再現・国籍 × 月 クロス集計 ---------- */
const NAT_VIO = '37,111,219';

/* 単一指標の国籍×月マトリクス表（すべて表示モードでも再利用） */
function NatMatrixTable({ metricId, facScale, facName, year, adj, hideZero, sticky }) {
  const M = NAT_METRICS.find(m => m.id === metricId);
  const { rows: allRows, colTot, grand } = buildNatMatrix(metricId, facScale);
  const rowsZ = allRows.map(r => ({ ...r, active: r.rooms.some(x => x > 0) }));
  const rows = hideZero ? rowsZ.filter(r => r.active) : rowsZ;
  const months = Array.from({ length: 12 }, (_, m) => (m + 1) + '月');
  const nM = 12;

  const fmt = (v) => {
    if (v === 0) return M.fmt === 'pct2' ? '0.00%' : M.fmt === 'dec2' ? '0.00' : '0';
    if (M.fmt === 'yen') return fmtInt(Math.round(v * (M.tax ? adj : 1)));
    if (M.fmt === 'int') return fmtInt(v);
    if (M.fmt === 'dec2') return v.toFixed(2);
    if (M.fmt === 'pct2') return v.toFixed(2) + '%';
    return v;
  };
  const colMax = months.map((_, m) => Math.max(...rows.map(r => r.cells[m]), 0.0001));
  const alphaFor = (v, m) => {
    if (v === 0) return 0;
    if (metricId === 'rev' || metricId === 'rooms') return (v / (colTot[m] || 1)) * 0.55;
    return (v / colMax[m]) * 0.42;
  };

  const topOff = sticky ? 40 : 0; // すべて表示時はセクション見出し帯の高さ分ずらす
  const cName = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', textAlign: 'left', padding: '0 10px', fontSize: 11.5, height: 24, whiteSpace: 'nowrap', borderRight: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border)' };
  const cNum = { padding: '0 6px', fontSize: 11, height: 24, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' };
  const hTop = { position: 'sticky', top: topOff, zIndex: 5, height: 28, boxSizing: 'border-box', background: 'rgba(' + NAT_VIO + ',0.08)', fontSize: 11.5, fontWeight: 700, color: 'var(--text)', padding: '0 8px', textAlign: 'center', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const hMon = { position: 'sticky', top: topOff + 27, zIndex: 4, height: 26, boxSizing: 'border-box', background: 'rgba(' + NAT_VIO + ',0.07)', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', padding: '0 6px', textAlign: 'right', borderBottom: '1px solid var(--border-strong)', whiteSpace: 'nowrap' };
  const totCol = { ...cNum, fontWeight: 700, background: 'rgba(' + NAT_VIO + ',0.07)', borderLeft: '1px solid var(--border-strong)' };

  return (
    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 1240 }}>
      <colgroup>
        <col style={{ width: 184 }} />
        {months.map((m, i) => <col key={i} style={{ width: 80 }} />)}
        <col style={{ width: 116 }} />
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={2} style={{ ...cName, ...hTop, zIndex: 7, top: topOff, textAlign: 'left', borderRight: '1px solid var(--border-strong)' }}>{M.label}　国籍 \ 月</th>
          <th colSpan={nM} style={hTop}>{facName} · {year}年</th>
          <th rowSpan={2} style={{ ...hTop, top: topOff, zIndex: 6, borderLeft: '1px solid var(--border-strong)', textAlign: 'right' }}>合計</th>
        </tr>
        <tr>
          {months.map((m, i) => <th key={i} style={hMon}>{m}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
            <td style={cName}>{r.name}</td>
            {r.cells.map((v, m) => <td key={m} className="tabular" style={{ ...cNum, color: v === 0 ? 'var(--text-3)' : 'var(--text)', background: v === 0 ? undefined : 'rgba(' + NAT_VIO + ',' + alphaFor(v, m).toFixed(3) + ')' }}>{fmt(v)}</td>)}
            <td className="tabular" style={{ ...totCol, color: r.total === 0 ? 'var(--text-3)' : 'var(--text)' }}>{fmt(r.total)}</td>
          </tr>
        ))}
        <tr>
          <td style={{ ...cName, fontWeight: 700, background: 'rgba(' + NAT_VIO + ',0.07)', borderTop: '2px solid var(--border-strong)' }}>合計</td>
          {colTot.map((v, m) => <td key={m} className="tabular" style={{ ...cNum, fontWeight: 700, background: 'rgba(' + NAT_VIO + ',0.07)', borderTop: '2px solid var(--border-strong)' }}>{fmt(v)}</td>)}
          <td className="tabular" style={{ ...totCol, fontWeight: 800, borderTop: '2px solid var(--border-strong)' }}>{fmt(grand)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function NationalitiesScreen({ st }) {
  const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
  const { sel, setAll, pick, isOn, allOn } = useMultiMetric(['rev'], NAT_METRICS.map(m => m.id));
  const [hideZero, setHideZero] = React.useState(true);
  const shown = NAT_METRICS.filter(m => sel.includes(m.id));
  const multi = shown.length > 1;
  const isAll = st.facility === 'ALL';
  // 施設スケール（アクアパレス北谷=基準1.0、全施設は規模合算、他施設は売上シェアで近似）
  const baseFac = FACILITIES.find(f => f.id === 'F001');
  const selFac = isAll ? null : FACILITIES.find(f => f.id === st.facility);
  const facScale = isAll ? 6.2 : (selFac && baseFac ? Math.max(0.25, (selFac.rooms || 24) / (baseFac.rooms || 24)) : 1);
  const facName = isAll ? '全施設' : (selFac?.name || 'アクアパレス北谷');
  const year = st.period.year;

  const wrap = { flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)' };
  const tabBtn = (id, label) => (
    <button key={id} onClick={(e) => pick(id, e)} title="Ctrl/⌘+クリックで複数選択" style={{
      height: 30, padding: '0 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
      border: '1px solid ' + (isOn(id) ? 'rgba(' + NAT_VIO + ',0.5)' : 'var(--border)'),
      background: isOn(id) ? 'rgba(' + NAT_VIO + ',0.1)' : 'var(--surface)',
      color: isOn(id) ? 'var(--primary-ink)' : 'var(--text-2)',
    }}>{label}</button>
  );
  // すべて表示時のセクション見出し帯
  const sectionBar = (label) => (
    <div style={{ position: 'sticky', top: 0, zIndex: 8, height: 40, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '.02em', boxShadow: 'var(--shadow-card)' }}>
      <span style={{ opacity: .85, fontSize: 11.5, fontWeight: 600 }}>指標</span>{label}
    </div>
  );

  return (
    <div style={{ height: 'calc(100dvh - 152px)', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>国籍別分析</h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, whiteSpace: 'nowrap' }}>
            {facName} · {year}年（月次）· {st.tax === 'incl' ? '税込' : '税抜'}表示 · 指標：<strong style={{ color: 'var(--text)' }}>{allOn ? 'すべて（6指標）' : shown.map(m => m.label).join('・')}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setHideZero(z => !z)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 11px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: hideZero ? 'var(--primary-weak)' : 'var(--surface)', color: hideZero ? 'var(--primary-ink)' : 'var(--text-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Icon name={hideZero ? 'EyeOff' : 'Eye'} size={14} />実績0の国籍を隠す
          </button>
          <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
        </div>
      </div>

      {/* metric selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
        {NAT_METRICS.map(m => tabBtn(m.id, m.label))}
        <span style={{ width: 1, height: 20, background: 'var(--border-strong)', margin: '0 4px' }} />
        <button onClick={setAll} style={{
          height: 30, padding: '0 16px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px solid ' + (allOn ? 'var(--primary)' : 'rgba(' + NAT_VIO + ',0.4)'),
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
              <NatMatrixTable metricId={m.id} facScale={facScale} facName={facName} year={year} adj={adj} hideZero={hideZero} sticky />
            </div>
          ))}
        </div>
      ) : (
        <div style={wrap}>
          <NatMatrixTable metricId={shown[0].id} facScale={facScale} facName={facName} year={year} adj={adj} hideZero={hideZero} />
        </div>
      )}
    </div>
  );
}

/* ---------- generic roadmap placeholder ---------- */
const ROADMAP = {
  'stay-nights':   { icon: 'MoonStar', title: '泊数分布', desc: '1〜7泊以上の bucket 別に 予約数・販売室数・売上・ADR・宿泊人数 を切替表示。連泊率・平均泊数のインサイト行つき。', bullets: ['指標セグメントコントロール', 'bucket 分布チャート（モバイル横スクロール）', 'ADR算出不能 bucket は「—」'] },
  'room-types':    { icon: 'BedDouble', title: '部屋タイプ別分析', desc: '部屋タイプ別の売上・販売室数・ADR を横棒比較。予算マッピング未設定は warning。', bullets: ['正規化部屋タイプ × 予算タイプ', '2行省略 + tooltip', 'マッピング未設定 warning'] },
  'annual-sales':  { icon: 'Building2', title: '全施設年間売上', desc: '施設×月のヒートマップ、施設ランキング、エリア別セレクタ、年間予算達成率。', bullets: ['施設×月 heatmap（数値+tooltip）', 'エリア / 施設グループ', 'facility_user は自施設のみ'] },
  'booking-curve': { icon: 'TrendingUp', title: 'ブッキングカーブ', desc: 'リードタイム bucket 別の累計販売室数カーブ。前年 / 前回 snapshot と比較。', bullets: ['is_valid_lead_time=true の累計', '当月着地見込み', 'snapshot 不在時は unavailable state'] },
  'imports':       { icon: 'Upload', title: 'データ取込', desc: 'minpakuIN / ねっぱん / 手間いらず の raw を共通テンプレートへ変換。7ステップ ウィザード（source選択→アップロード→施設マッピング→preview→検証→commit確認→完了）。', bullets: ['PII（氏名・電話・住所・メール）は preview/ログ非表示', 'validation error は行番号・項目・原因・対応', 'commit前に 追加/更新/除外/warning 件数を確認'] },
  'validation/excel-diff': { icon: 'GitCompareArrows', title: 'Excel差分検証', desc: '既存コルディオ Excel と Web mart/API の数値差異を検証。tolerance（金額±1円・比率±0.01pt）で pass/warning/failed を判定。', bullets: ['sheet×metric×施設×期間 差分テーブル', 'API payload / mart row / 数式 drilldown', 'PII・raw値は非表示'] },
  'admin/masters': { icon: 'Database', title: 'マスタ管理', desc: '施設・PMS施設マッピング・部屋タイプ・経路・国籍・予算・客室在庫・手数料調整ルール。未マッピング/重複を明示。', bullets: ['source → normalized → budget マッピング', '客室在庫 未登録の強警告', '手数料調整（gross/net/tax）'] },
  'admin/users':   { icon: 'Users', title: 'ユーザー・権限', desc: 'ユーザー一覧・ロール・許可施設・最終サインイン・招待状態。', bullets: ['admin / operator / viewer / facility_user', '施設スコープ付与', '招待 / 失効'] },
  'settings':      { icon: 'Settings', title: '設定 / 監査', desc: 'システム状態・最新 mart refresh・最新 commit・snapshot 可用性・監査ログ。', bullets: ['監査ログ（user/action/target/time/result）', 'secret値・raw payload は非表示', 'mart / snapshot ステータス'] },
};
function RoadmapScreen({ route, role, st }) {
  const r = ROADMAP[route];
  if (!r) return <EmptyState icon="FileQuestion" title="画面が見つかりません" />;
  // permission gate demo
  const adminOnly = ['validation/excel-diff', 'admin/masters', 'admin/users'];
  const opOnly = ['imports'];
  if (adminOnly.includes(route) && role !== 'admin') return <PermissionDeniedState />;
  if (opOnly.includes(route) && !['admin', 'operator'].includes(role)) return <PermissionDeniedState />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name={r.icon} size={22} style={{ color: 'var(--text-2)' }} />{r.title}</h2></div>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-lg)', background: 'var(--primary-weak)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon name={r.icon} size={26} style={{ color: 'var(--primary-ink)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{r.title}</h3>
              <Badge tone="neutral" icon="Hammer">モック準備中</Badge>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.7, maxWidth: 680 }}>{r.desc}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {r.bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'var(--text)' }}>
                  <Icon name="Check" size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />{b}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>
        この画面は合意後に作り込みます。先に <strong style={{ color: 'var(--text-2)' }}>稼働分析</strong>・<strong style={{ color: 'var(--text-2)' }}>経路分析</strong>・<strong style={{ color: 'var(--text-2)' }}>国籍別分析</strong> が利用できます。
      </div>
    </div>
  );
}

Object.assign(window, { ChannelsScreen, NationalitiesScreen, RoadmapScreen });
