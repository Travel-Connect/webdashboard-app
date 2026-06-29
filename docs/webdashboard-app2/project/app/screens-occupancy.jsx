/* ============================================================
   screens-occupancy.jsx — 稼働分析
   月間: 1画面に収まる no-scroll レイアウト
     [KPI strip] + [トレンド + 合計/予算/前年サマリー] + [前半/後半 日次テーブル]
   年間: トレンド + 月次テーブル
   全施設: 施設別比較テーブル
   ============================================================ */

const FIT_H = 'calc(100dvh - 152px)';   // viewport - header - filterbar - main padding

/* ---------- value formatting ---------- */
function kval(type, v, adj) {
  if (v == null || isNaN(v)) return '—';
  if (type === 'pct') return v.toFixed(1) + '%';
  if (type === 'yen') return fmtYen(v * adj);
  return fmtInt(v);
}

/* ---------- compact KPI strip (9 metrics, one row) ---------- */
function OccKpiStrip({ comparison, tax, kpis }) {
  const adj = tax === 'excl' ? 1 / 1.1 : 1;
  const list = kpis || OCC_KPIS;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 8 }}>
      {list.map(k => {
        const primary = k.primary;
        const cmp = comparison === 'budget'
          ? { label: '予算', val: k.budpt != null ? k.budpt : k.bud, unit: k.budpt != null ? 'pt' : '%' }
          : { label: '前年', val: k.yoy, unit: k.type === 'pct' ? 'pt' : '%' };
        return (
          <div key={k.label} style={{
            background: primary ? 'var(--primary)' : 'var(--surface)',
            border: '1px solid ' + (primary ? 'var(--primary)' : 'var(--border)'),
            borderRadius: 'var(--r-md)', padding: '9px 11px', boxShadow: 'var(--shadow-card)',
            display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: primary ? 'rgba(255,255,255,.7)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</div>
            <div className="tabular" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, color: primary ? '#fff' : 'var(--text)', whiteSpace: 'nowrap' }}>
              {kval(k.type, k.value, adj)}{k.type === 'int' && k.unit && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 1, color: primary ? 'rgba(255,255,255,.65)' : 'var(--text-3)' }}>{k.unit}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10, color: primary ? 'rgba(255,255,255,.55)' : 'var(--text-3)' }}>{cmp.label}</span>
              {primary
                ? <DeltaInv value={cmp.val} unit={cmp.unit} />
                : <MetricDelta value={cmp.val} unit={cmp.unit} invert={k.invert} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function DeltaInv({ value, unit }) {
  if (value == null || isNaN(value)) return <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 11.5 }}>—</span>;
  const up = value > 0;
  return <span className="tabular" style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 11.5, fontWeight: 700, color: up ? '#86efac' : '#fca5a5' }}>
    <Icon name={up ? 'ArrowUp' : 'ArrowDown'} size={11} strokeWidth={2.5} />{(up ? '+' : '') + value.toFixed(1) + unit}</span>;
}

/* ---------- daily matrix tables (当年 / 比較 / 前年) ---------- */
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const START_DOW = 1; // 2026-06-01 = Monday
const mTh  = { padding: '4px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', borderBottom: '1px solid var(--border-strong)', whiteSpace: 'nowrap', background: 'var(--surface-2)', textAlign: 'right', position: 'sticky', top: 0, zIndex: 1 };
const mTd  = { padding: '0 6px', fontSize: 11, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', height: 17, lineHeight: '17px', textAlign: 'right' };
const mTdF = { padding: '0 6px', fontSize: 11, whiteSpace: 'nowrap', height: 18, lineHeight: '18px', textAlign: 'right', fontWeight: 700, background: 'var(--surface-2)' };

function DayCell({ d, td }) {
  const wd = (START_DOW + d - 1) % 7;
  return (
    <td style={{ ...(td || mTd), textAlign: 'left', fontWeight: 600 }}>
      <span className="tabular">{('0' + d).slice(-2)}</span>
      <span style={{ fontSize: 9.5, marginLeft: 2, color: wd === 0 ? 'var(--danger)' : wd === 6 ? 'var(--primary)' : 'var(--text-3)' }}>{DOW[wd]}</span>
    </td>
  );
}

/* actuals table (当年 or 前年) — daily or monthly */
function ActualMatrix({ rows, total, totalLabel, budget, tax, monthMode, rowH }) {
  const adj = tax === 'excl' ? 1 / 1.1 : 1;
  const td = rowH ? { ...mTd, height: rowH, lineHeight: rowH + 'px' } : mTd;
  return (
    <table style={{ width: '100%', minWidth: monthMode ? 452 : undefined, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: monthMode ? 48 : 34 }} /><col style={{ width: monthMode ? 42 : 38 }} /><col style={{ width: monthMode ? 36 : 32 }} />
        <col style={{ width: monthMode ? 48 : 44 }} /><col style={{ width: monthMode ? 44 : 38 }} /><col style={{ width: 40 }} />
        <col style={monthMode ? { width: 70 } : undefined} /><col style={monthMode ? { width: 56 } : undefined} /><col style={monthMode ? { width: 56 } : undefined} />
      </colgroup>
      <thead><tr>
        <th style={{ ...mTh, textAlign: 'left' }}>{monthMode ? '月' : '日'}</th>
        <th style={mTh}>室</th><th style={mTh}>残</th><th style={mTh}>稼働率</th>
        <th style={mTh}>人</th><th style={mTh}>平均</th><th style={mTh}>売上</th><th style={mTh}>室単価</th><th style={mTh}>RevPAR</th>
      </tr></thead>
      <tbody>
        {rows.map(r => {
          const full = r.occ >= 100;
          return (
            <tr key={r.d || r.m} style={{ background: full ? 'var(--accent-weak)' : 'transparent' }}>
              {monthMode
                ? <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.m}</td>
                : <DayCell d={r.d} td={td} />}
              <td style={td} className="tabular">{r.sold}</td>
              <td style={{ ...td, color: r.rem === 0 ? 'var(--accent)' : 'var(--text-3)' }} className="tabular">{r.rem}</td>
              <td style={{ ...td, color: full ? 'var(--accent)' : 'var(--text)', fontWeight: full ? 700 : 400 }} className="tabular">{r.occ.toFixed(1)}%</td>
              <td style={td} className="tabular">{fmtInt(r.guests)}</td>
              <td style={{ ...td, color: 'var(--text-2)' }} className="tabular">{r.ppr != null ? r.ppr.toFixed(2) : '—'}</td>
              <td style={td} className="tabular">{fmtInt(r.rev * adj)}</td>
              <td style={{ ...td, color: 'var(--text-2)' }} className="tabular">{fmtInt(r.adr * adj)}</td>
              <td style={{ ...td, color: 'var(--text-2)' }} className="tabular">{fmtInt(r.revpar * adj)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td style={{ ...mTdF, textAlign: 'left', borderTop: '2px solid var(--border-strong)' }}>{totalLabel}</td>
          <td style={{ ...mTdF, borderTop: '2px solid var(--border-strong)' }} className="tabular">{fmtInt(total.sold)}</td>
          <td style={{ ...mTdF, borderTop: '2px solid var(--border-strong)' }} className="tabular">{fmtInt(total.rem)}</td>
          <td style={{ ...mTdF, borderTop: '2px solid var(--border-strong)' }} className="tabular">{total.occ.toFixed(1)}%</td>
          <td style={{ ...mTdF, borderTop: '2px solid var(--border-strong)' }} className="tabular">{fmtInt(total.guests)}</td>
          <td style={{ ...mTdF, borderTop: '2px solid var(--border-strong)' }} className="tabular">{total.ppr != null ? total.ppr.toFixed(2) : '—'}</td>
          <td style={{ ...mTdF, borderTop: '2px solid var(--border-strong)' }} className="tabular">{fmtInt(total.rev * adj)}</td>
          <td style={{ ...mTdF, borderTop: '2px solid var(--border-strong)' }} className="tabular">{fmtInt(total.adr * adj)}</td>
          <td style={{ ...mTdF, borderTop: '2px solid var(--border-strong)' }} className="tabular">{fmtInt(total.revpar * adj)}</td>
        </tr>
        {budget && (
          <tr>
            <td style={{ ...mTdF, textAlign: 'left', color: 'var(--text-2)' }}>予算</td>
            <td style={{ ...mTdF, color: 'var(--text-2)' }} className="tabular">{fmtInt(budget.sold)}</td>
            <td style={{ ...mTdF, color: 'var(--text-2)' }} className="tabular">{fmtInt(budget.rem)}</td>
            <td style={{ ...mTdF, color: 'var(--text-2)' }} className="tabular">{budget.occ.toFixed(1)}%</td>
            <td style={{ ...mTdF, color: 'var(--text-2)' }} className="tabular">{fmtInt(budget.guests)}</td>
            <td style={{ ...mTdF, color: 'var(--text-2)' }} className="tabular">{budget.ppr != null ? budget.ppr.toFixed(2) : '—'}</td>
            <td style={{ ...mTdF, color: 'var(--text-2)' }} className="tabular">{fmtInt(budget.rev * adj)}</td>
            <td style={{ ...mTdF, color: 'var(--text-2)' }} className="tabular">{fmtInt(budget.adr * adj)}</td>
            <td style={{ ...mTdF, color: 'var(--text-2)' }} className="tabular">{fmtInt(budget.revpar * adj)}</td>
          </tr>
        )}
      </tfoot>
    </table>
  );
}

/* delta cell */
function dCell(v, fmt, suffix, td) {
  const base = td || mTd;
  if (v == null || v === 0) return <td style={{ ...base, color: 'var(--text-3)' }} className="tabular">+0{suffix || ''}</td>;
  const pos = v > 0;
  return <td style={{ ...base, color: pos ? 'var(--positive)' : 'var(--danger)', fontWeight: 600 }} className="tabular">{(pos ? '+' : '') + (fmt ? fmt(v) : v) + (suffix || '')}</td>;
}
/* comparison (比較日付比) table — daily or monthly */
function CompareMatrix({ tax, rows, cmp, total, footLabel, monthMode, rowH, highlight = true }) {
  const adj = tax === 'excl' ? 1 / 1.1 : 1;
  const R = rows || OCC_DAILY;
  const C = cmp || OCC_CMP;
  const T = total || OCC_CMP_TOTAL;
  const fl = footLabel || '月間漸増';
  const td = rowH ? { ...mTd, height: rowH, lineHeight: rowH + 'px' } : mTd;
  return (
    <table style={{ width: '100%', minWidth: monthMode ? 446 : undefined, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: monthMode ? 48 : 34 }} /><col style={{ width: monthMode ? 42 : 36 }} /><col style={{ width: monthMode ? 52 : 44 }} />
        <col style={{ width: monthMode ? 46 : 36 }} /><col style={{ width: 40 }} /><col style={monthMode ? { width: 82 } : undefined} /><col style={monthMode ? { width: 58 } : undefined} /><col style={monthMode ? { width: 58 } : undefined} />
      </colgroup>
      <thead><tr>
        <th style={{ ...mTh, textAlign: 'left' }}>{monthMode ? '月' : '日'}</th>
        <th style={mTh}>室</th><th style={mTh}>稼働率</th><th style={mTh}>人</th>
        <th style={mTh}>平均</th><th style={mTh}>売上</th><th style={mTh}>室単価</th><th style={mTh}>RevPAR</th>
      </tr></thead>
      <tbody>
        {R.map(r => {
          const key = monthMode ? r.m : r.d;
          const c = C[key] || {};
          const changed = C[key];
          return (
            <tr key={key} style={{ background: changed && highlight ? 'var(--warning-weak)' : 'transparent' }}>
              {monthMode
                ? <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.m}</td>
                : <DayCell d={r.d} td={td} />}
              {dCell(c.sold, null, '', td)}
              {dCell(c.occ, v => v.toFixed(1), '%', td)}
              {dCell(c.guests, null, '', td)}
              {dCell(c.ppr, v => v.toFixed(2), '', td)}
              {dCell(c.rev && c.rev * adj, v => fmtInt(v), '', td)}
              {dCell(c.adr && c.adr * adj, v => fmtInt(v), '', td)}
              {dCell(c.revpar && c.revpar * adj, v => fmtInt(v), '', td)}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td style={{ ...mTdF, textAlign: 'left', borderTop: '2px solid var(--border-strong)' }}>{fl}</td>
          <td style={{ ...mTdF, color: T.sold < 0 ? 'var(--danger)' : T.sold > 0 ? 'var(--positive)' : 'var(--text-3)', borderTop: '2px solid var(--border-strong)' }} className="tabular">{(T.sold > 0 ? '+' : '') + T.sold}</td>
          <td style={{ ...mTdF, color: 'var(--text-3)', borderTop: '2px solid var(--border-strong)' }} className="tabular">{(T.occ > 0 ? '+' : '') + (T.occ || 0) + '%'}</td>
          <td style={{ ...mTdF, color: T.guests < 0 ? 'var(--danger)' : T.guests > 0 ? 'var(--positive)' : 'var(--text-3)', borderTop: '2px solid var(--border-strong)' }} className="tabular">{(T.guests > 0 ? '+' : '') + T.guests}</td>
          <td style={{ ...mTdF, color: (T.ppr || 0) < 0 ? 'var(--danger)' : (T.ppr || 0) > 0 ? 'var(--positive)' : 'var(--text-3)', borderTop: '2px solid var(--border-strong)' }} className="tabular">{(T.ppr > 0 ? '+' : '') + (T.ppr != null ? T.ppr.toFixed(2) : '0.00')}</td>
          <td style={{ ...mTdF, color: T.rev < 0 ? 'var(--danger)' : T.rev > 0 ? 'var(--positive)' : 'var(--text-3)', borderTop: '2px solid var(--border-strong)' }} className="tabular">{(T.rev > 0 ? '+' : '') + fmtInt(T.rev * adj)}</td>
          <td style={{ ...mTdF, color: T.adr < 0 ? 'var(--danger)' : T.adr > 0 ? 'var(--positive)' : 'var(--text-3)', borderTop: '2px solid var(--border-strong)' }} className="tabular">{(T.adr > 0 ? '+' : '') + fmtInt(T.adr * adj)}</td>
          <td style={{ ...mTdF, color: T.revpar < 0 ? 'var(--danger)' : T.revpar > 0 ? 'var(--positive)' : 'var(--text-3)', borderTop: '2px solid var(--border-strong)' }} className="tabular">{(T.revpar > 0 ? '+' : '') + fmtInt(T.revpar * adj)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/* ---------- panel-lite (compact header, used inside fit layout) ---------- */
function MiniPanel({ title, sub, right, children, style, bodyStyle }) {
  return (
    <section style={Object.assign({ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }, style)}>
      {(title || right) && (
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            {title && <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{title}</h3>}
            {sub && <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>{sub}</p>}
          </div>
          {right}
        </header>
      )}
      <div style={Object.assign({ padding: 12, minHeight: 0, flex: 1 }, bodyStyle)}>{children}</div>
    </section>
  );
}

/* ---------- column wrapper for the 3-up band ---------- */
function MatrixCol({ title, sub, accent, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '7px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, borderTop: '2px solid ' + accent, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{title}</h3>
        {sub && <span style={{ fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </section>
  );
}

/* ---------- comparison-mode selector (3 patterns) ---------- */
const CMP_MODES = [
  { id: 'py',   label: '前年実績', icon: 'CalendarClock' },
  { id: 'pytd', label: '前年同期', icon: 'CalendarRange' },
  { id: 'date', label: '指定日付', icon: 'CalendarSearch' },
];
function CompareModeSelector({ mode, onMode, date, onDate }) {
  const cur = CMP_MODES.find(m => m.id === mode) || CMP_MODES[0];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <Dropdown width={210} align="right" trigger={(open, t) => <FilterButton icon="GitCompareArrows" label="比較基準:" value={cur.label} open={open} onClick={t} />}>
        {(close) => (
          <div style={{ padding: 6 }}>
            {CMP_MODES.map(m => (
              <MenuItem key={m.id} active={mode === m.id} icon={m.icon}
                onClick={() => { onMode(m.id); close(); }}
                right={m.id === 'pytd' ? <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>未確定</span> : null}>{m.label}</MenuItem>
            ))}
          </div>
        )}
      </Dropdown>
      {mode === 'date' && (
        <input type="date" value={date} max="2026-06-30" onChange={e => onDate(e.target.value)}
          style={{ height: 34, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface)' }} />
      )}
    </div>
  );
}

/* 前年同期（現状データでは未確定） placeholder column body */
function UnconfirmedPanel() {
  return (
    <div style={{ height: '100%', minHeight: 160, display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center' }}>
      <div>
        <Icon name="CalendarClock" size={24} style={{ color: 'var(--text-3)' }} />
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10 }}>前年同期は未確定です</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5, lineHeight: 1.5 }}>現状のデータでは前年同期の<br />確定値を取得できません</div>
      </div>
    </div>
  );
}

function fmtDateLabel(iso) {
  const p = (iso || '').split('-');
  return p.length === 3 ? `${p[0]}/${+p[1]}/${+p[2]}` : iso;
}

/* resolve middle(比較) + right(実績) columns from the selected comparison mode */
function resolveCompare(mode, annual, st, date) {
  const py = st.period.year - 1;
  const foot = annual ? '年間差分' : '月間差分';
  if (mode === 'pytd') return { unconfirmed: true, midTitle: '前年同期比', rightTitle: '前年同期' };
  if (mode === 'budget') return {
    midTitle: '予算差', midSub: '当年 − 予算', footLabel: foot, highlight: false,
    cmp: OCC_YEAR_BUD_DIFF, cmpTotal: OCC_YEAR_BUD_DIFF_TOTAL,
    rightTitle: '予算', rightSub: st.period.year + '年 計画',
    base: OCC_YEAR_BUD, baseTotal: OCC_YEAR_BUDGET,
  };
  if (mode === 'date') {
    const lbl = fmtDateLabel(date);
    return {
      midTitle: '指定日付比', midSub: lbl + ' 時点との差分', footLabel: foot, highlight: true,
      cmp: annual ? OCC_YEAR_SNAP_DIFF : OCC_SNAP_DIFF,
      cmpTotal: annual ? OCC_YEAR_SNAP_DIFF_TOTAL : OCC_SNAP_DIFF_TOTAL,
      rightTitle: '指定日付実績', rightSub: lbl + ' 時点',
      base: annual ? OCC_YEAR_SNAP : OCC_SNAP,
      baseTotal: annual ? OCC_YEAR_SNAP_TOTAL : OCC_SNAP_TOTAL,
    };
  }
  return {
    midTitle: '前年実績比', midSub: (annual ? py + '年' : py + '年' + st.period.month + '月') + ' との差分', footLabel: foot, highlight: false,
    cmp: annual ? OCC_YEAR_PY_DIFF : OCC_PY_DIFF,
    cmpTotal: annual ? OCC_YEAR_PY_DIFF_TOTAL : OCC_PY_DIFF_TOTAL,
    rightTitle: '前年実績', rightSub: annual ? py + '年' : py + '年' + st.period.month + '月',
    base: annual ? OCC_YEAR_PY : OCC_PY,
    baseTotal: annual ? OCC_YEAR_PY_TOTAL : OCC_PY_TOTAL,
  };
}

/* ---------- the comparison band (middle 比較 + right 実績) ---------- */
function CompareBand({ st, annual, cmp, rowH, monthMode }) {
  const C = resolveCompare(cmp.mode, annual, st, cmp.date);
  if (C.unconfirmed) return (
    <>
      <MatrixCol title={C.midTitle} sub="—" accent="var(--c-amber)"><UnconfirmedPanel /></MatrixCol>
      <MatrixCol title={C.rightTitle} sub="—" accent="var(--c-gray)"><UnconfirmedPanel /></MatrixCol>
    </>
  );
  return (
    <>
      <MatrixCol title={C.midTitle} sub={C.midSub} accent="var(--c-amber)">
        <CompareMatrix tax={st.tax} cmp={C.cmp} total={C.cmpTotal} footLabel={C.footLabel} highlight={C.highlight} rows={annual ? OCC_YEAR : OCC_DAILY} monthMode={monthMode} rowH={rowH} />
      </MatrixCol>
      <MatrixCol title={C.rightTitle} sub={C.rightSub} accent="var(--c-gray)">
        <ActualMatrix rows={C.base} total={C.baseTotal} totalLabel="合計" tax={st.tax} monthMode={monthMode} rowH={rowH} />
      </MatrixCol>
    </>
  );
}

/* ---------- MONTHLY (no-scroll fit) — 当年 / 比較 / 実績 ---------- */
function MonthlyFit({ st, facName, cmp }) {
  const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
  return (
    <div style={{ height: FIT_H, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
      {/* title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap' }}>稼働分析</h2>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{facName} · {st.period.label} · 室数 {FACILITIES.find(f => f.id === st.facility)?.rooms} · 月間（日次）</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
            <Icon name="Target" size={13} style={{ color: 'var(--warning)' }} />予算まで残り <strong className="tabular" style={{ color: 'var(--text)' }}>{fmtYen(OCC_INSIGHT.budgetGap * adj)}</strong>
            <span style={{ color: 'var(--text-3)' }}>·</span>達成率 <strong className="tabular" style={{ color: 'var(--text)' }}>{OCC_INSIGHT.budgetRate.toFixed(1)}%</strong>
            <span style={{ color: 'var(--text-3)' }}>·</span>前年比 <strong className="tabular" style={{ color: 'var(--text)' }}>{OCC_INSIGHT.yoyRevRate.toFixed(0)}%</strong>
          </span>
          <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ flexShrink: 0 }}><OccKpiStrip comparison={st.comparison} tax={st.tax} /></div>

      {/* 3-up daily matrix band */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.86fr 1fr', gap: 10, flex: 1, minHeight: 0 }}>
        <MatrixCol title="当年実績" sub={st.period.label} accent="var(--c-blue)">
          <ActualMatrix rows={OCC_DAILY} total={OCC_TOTAL} totalLabel="合計" budget={OCC_BUDGET} tax={st.tax} />
        </MatrixCol>
        <CompareBand st={st} annual={false} cmp={cmp} />
      </div>
    </div>
  );
}

/* ---------- shared full tables (annual / all) ---------- */
function ScrollTable({ children, minWidth = 720 }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth, borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
    </div>
  );
}
const thStyle = { position: 'sticky', top: 0, background: 'var(--surface-2)', textAlign: 'right', padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', zIndex: 2 };
const tdStyle = { textAlign: 'right', padding: '9px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };

/* ---------- ANNUAL ---------- */
function AnnualOcc({ st, facName, cmp }) {
  const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
  const ins = OCC_YEAR_INSIGHT;
  return (
    <div style={{ height: FIT_H, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
      {/* title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap' }}>稼働分析</h2>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{facName} · {st.period.year}年 · 室数 {FACILITIES.find(f => f.id === st.facility)?.rooms} · 年間（月次）</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
            <Icon name="Target" size={13} style={{ color: 'var(--warning)' }} />目標まで残り <strong className="tabular" style={{ color: 'var(--text)' }}>{fmtYen(ins.budgetGap * adj)}</strong>
            <span style={{ color: 'var(--text-3)' }}>·</span>達成率 <strong className="tabular" style={{ color: 'var(--text)' }}>{ins.budgetRate.toFixed(1)}%</strong>
            <span style={{ color: 'var(--text-3)' }}>·</span>前年比 <strong className="tabular" style={{ color: 'var(--text)' }}>{ins.yoyRevRate.toFixed(0)}%</strong>
          </span>
          <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
        </div>
      </div>

      {/* KPI strip (annual totals) */}
      <div style={{ flexShrink: 0 }}><OccKpiStrip comparison={st.comparison} tax={st.tax} kpis={OCC_YEAR_KPIS} /></div>

      {/* 3-up monthly matrix band */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, flex: 1, minHeight: 0 }}>
        <MatrixCol title="当年実績" sub={st.period.year + '年'} accent="var(--c-blue)">
          <ActualMatrix rows={OCC_YEAR} total={OCC_YEAR_TOTAL} totalLabel="合計" budget={OCC_YEAR_BUDGET} tax={st.tax} monthMode rowH={26} />
        </MatrixCol>
        <CompareBand st={st} annual={true} cmp={cmp} monthMode rowH={26} />
      </div>
    </div>
  );
}

/* ---------- ALL facilities comparison ---------- */
function AllFacilitiesOcc({ st, onNavigate }) {
  const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
  const tot = OCC_TABLE.reduce((a, r) => ({ sold: a.sold + (r.sold || 0), sellable: a.sellable + (r.sellable || 0), rev: a.rev + (r.rev || 0) }), { sold: 0, sellable: 0, rev: 0 });
  const occAll = tot.sellable ? tot.sold / tot.sellable * 100 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>稼働分析</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>全施設 · {st.period.label} · 施設別比較</span>
      </div>
      <AlertStrip alerts={[OCC_ALERTS[0]]} onNavigate={onNavigate} />
      <div style={{ display: 'grid', gridTemplateColumns: st.viewport === 'mobile' ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
        {[['全施設売上', fmtYenC(tot.rev * adj)], ['全体稼働率', occAll.toFixed(1) + '%'], ['販売室数', fmtInt(tot.sold) + '室'], ['対象施設', OCC_TABLE.filter(r => r.warn !== 'sellable').length + ' / ' + OCC_TABLE.length]].map(([l, v]) => (
          <div key={l} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '12px 14px', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 600 }}>{l}</div>
            <div className="tabular" style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>
      <Panel title="施設別 稼働指標" sub={`${OCC_TABLE.length} 施設`} pad={false}>
        <div style={{ padding: 18 }}>
          <ScrollTable minWidth={880}>
            <thead><tr>
              <th style={{ ...thStyle, textAlign: 'left', left: 0, zIndex: 3 }}>施設</th>
              <th style={thStyle}>販売室数</th><th style={thStyle}>販売可能</th><th style={thStyle}>稼働率</th>
              <th style={thStyle}>ADR</th><th style={thStyle}>RevPAR</th><th style={thStyle}>売上</th>
              <th style={thStyle}>前年差</th><th style={thStyle}>予算差</th><th style={{ ...thStyle, textAlign: 'left' }}>状態</th>
            </tr></thead>
            <tbody>{OCC_TABLE.map(r => {
              const f = FACILITIES.find(x => x.id === r.id);
              const missing = r.warn === 'sellable';
              return (
                <tr key={r.id}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...tdStyle, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface)', maxWidth: 220 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.short}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.area}</div>
                  </td>
                  {missing ? (
                    <td colSpan={6} style={{ ...tdStyle, textAlign: 'left', color: 'var(--text-3)' }}>
                      <Icon name="MinusCircle" size={13} style={{ verticalAlign: -2, marginRight: 5 }} />販売可能室数の登録待ち — 指標を算出できません
                    </td>
                  ) : (
                    <>
                      <td style={tdStyle} className="tabular">{fmtInt(r.sold)}</td>
                      <td style={tdStyle} className="tabular">{fmtInt(r.sellable)}</td>
                      <td style={tdStyle}><BarCell pct={r.occ} color={r.occ >= 90 ? 'var(--accent)' : 'var(--primary)'} label={r.occ.toFixed(1) + '%'} /></td>
                      <td style={tdStyle} className="tabular">{fmtYen(r.adr * adj)}</td>
                      <td style={tdStyle} className="tabular">{fmtYen(r.revpar * adj)}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }} className="tabular">{fmtYenC(r.rev * adj)}</td>
                    </>
                  )}
                  <td style={tdStyle}><MetricDelta value={r.yoy} unit="%" /></td>
                  <td style={tdStyle}><MetricDelta value={r.bud} unit="%" /></td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    {r.warn === 'sellable' ? <Badge tone="danger" icon="TriangleAlert">在庫未登録</Badge>
                      : r.warn === 'budget' ? <Badge tone="warning" icon="FileWarning">予算未登録</Badge>
                      : <Badge tone="positive" dot>正常</Badge>}
                  </td>
                </tr>
              );
            })}</tbody>
          </ScrollTable>
        </div>
      </Panel>
    </div>
  );
}

/* ---------- MOBILE monthly (stacked tables, scrolls) ---------- */
function MonthlyMobile({ st, facName, cmp }) {
  const [view, setView] = React.useState('cur');
  const annual = st.range === 'year';
  const kpis = annual ? OCC_YEAR_KPIS : OCC_KPIS;
  const cur = annual ? OCC_YEAR : OCC_DAILY;
  const curTotal = annual ? OCC_YEAR_TOTAL : OCC_TOTAL;
  const bud = annual ? OCC_YEAR_BUDGET : OCC_BUDGET;
  const C = resolveCompare(cmp.mode, annual, st, cmp.date);
  const cmpRows = annual ? OCC_YEAR : OCC_DAILY;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>稼働分析</h2>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{facName} · {annual ? st.period.year + '年（月次）' : st.period.label}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {kpis.map(k => {
          const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
          return (
            <div key={k.label} style={{ background: k.primary ? 'var(--primary)' : 'var(--surface)', border: '1px solid ' + (k.primary ? 'var(--primary)' : 'var(--border)'), borderRadius: 'var(--r-md)', padding: '9px 10px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: k.primary ? 'rgba(255,255,255,.7)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</div>
              <div className="tabular" style={{ fontSize: 16, fontWeight: 800, color: k.primary ? '#fff' : 'var(--text)', marginTop: 3 }}>{kval(k.type, k.value, adj)}{k.type === 'int' && k.unit ? k.unit : ''}</div>
            </div>
          );
        })}
      </div>
      <Segmented value={view} onChange={setView} options={[{ value: 'cur', label: '当年' }, { value: 'cmp', label: C.midTitle }, { value: 'py', label: C.rightTitle }]} />
      <Panel title={view === 'cur' ? '当年実績' : view === 'cmp' ? C.midTitle : C.rightTitle} sub={view === 'cmp' ? C.midSub : view === 'py' ? C.rightSub : undefined} pad={false}>
        <div style={{ padding: 12, overflowX: 'auto' }}>
          {view === 'cur' && <ActualMatrix rows={cur} total={curTotal} totalLabel="合計" budget={bud} tax={st.tax} monthMode={annual} rowH={annual ? 26 : undefined} />}
          {view !== 'cur' && C.unconfirmed && <UnconfirmedPanel />}
          {view === 'cmp' && !C.unconfirmed && <CompareMatrix rows={cmpRows} cmp={C.cmp} total={C.cmpTotal} footLabel={C.footLabel} highlight={C.highlight} tax={st.tax} monthMode={annual} rowH={annual ? 26 : undefined} />}
          {view === 'py' && !C.unconfirmed && <ActualMatrix rows={C.base} total={C.baseTotal} totalLabel="合計" tax={st.tax} monthMode={annual} rowH={annual ? 26 : undefined} />}
        </div>
      </Panel>
    </div>
  );
}

/* ---------- dispatcher ---------- */
function OccupancyScreen({ st, role, onNavigate }) {
  const isAll = st.facility === 'ALL';
  const annual = st.range === 'year';
  const mobile = st.viewport === 'mobile';
  const facName = isAll ? '全施設' : FACILITIES.find(f => f.id === st.facility)?.name;
  // 比較基準はヘッダーの「比較」から取得。予算バンドは年間タブのみ対応（月次予算は前年実績にフォールバック）
  const raw = st.comparison;
  let mode = (raw === 'pytd' || raw === 'date') ? raw : 'py';
  if (raw === 'budget') mode = annual ? 'budget' : 'py';
  const cmp = { mode, date: st.cmpDate || '2026-06-14' };

  if (isAll) return <AllFacilitiesOcc st={st} onNavigate={onNavigate} />;
  if (mobile) return <MonthlyMobile st={st} facName={facName} cmp={cmp} />;
  if (annual) return <AnnualOcc st={st} facName={facName} cmp={cmp} />;
  return <MonthlyFit st={st} facName={facName} cmp={cmp} />;
}

Object.assign(window, { OccupancyScreen, ScrollTable, thStyle, tdStyle });
