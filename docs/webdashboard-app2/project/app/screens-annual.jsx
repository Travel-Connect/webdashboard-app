/* ============================================================
   screens-annual.jsx — 全施設年間売上
   標準ヘッダー + 4表（実績 / 予算 / 予算達成率 / 予算差）。
   施設×月クロス集計。エリア区分・合計列/行。他の分析画面とトンマナ統一（blue）。
   施設・年・税表示は上部ナビで切替。
   ============================================================ */

/* 配色（分析画面共通の blue トンマナ） */
const AF_GREEN = 'rgba(37,111,219,0.08)';    /* 見出しセル（淡い青） */
const AF_GREEN_D = 'rgba(37,111,219,0.14)';  /* エリア見出し */
const AF_LINE = 'var(--border)';             /* 罫線 */
const AF_LINE_STRONG = 'var(--border-strong)';
const AF_RED = 'var(--danger)';              /* 不足・マイナスの赤 */
const AF_ZEBRA = '#F7F9FC';

const yen = (v) => '¥' + new Intl.NumberFormat('ja-JP').format(Math.round(v));
const yen0 = (v) => v === 0 ? '¥0' : yen(v);

/* 列の幅（％）: 月ラベル + 15施設 + 合計 = 17列 */
const AF_COLW = (() => {
  const facW = 5.5, monthW = 6.0, totW = 8.4;
  return { facW, monthW, totW };
})();

/* セル基本 */
const afTd = { padding: '0 2px', height: 24, lineHeight: '24px', fontSize: 8.5, textAlign: 'right', whiteSpace: 'nowrap', borderRight: '1px solid ' + AF_LINE, borderBottom: '1px solid ' + AF_LINE, overflow: 'hidden', textOverflow: 'ellipsis' };
const afMonth = { ...afTd, textAlign: 'center', fontWeight: 600, background: '#fff', color: 'var(--text)', position: 'sticky', left: 0, zIndex: 2 };

/* エリア見出し色 */
function areaTint(area) {
  if (area === '北谷エリア') return 'rgba(37,99,235,0.07)';
  if (area === '北部エリア') return 'rgba(15,118,110,0.08)';
  if (area === '那覇エリア') return 'rgba(217,119,6,0.08)';
  return 'rgba(124,58,237,0.07)';
}

/* ---------- 1つのExcel表（実績 / 予算 / 達成率） ---------- */
function AfTable({ kind, rowLabel, adj, sticky }) {
  const isPct = kind === 'pct';
  const isDiff = kind === 'diff';
  // 値マトリクス（adj適用）
  const src = kind === 'budget' ? AF_BUDGET : AF_ACTUAL;
  const dataAdj = (m, f) => src[m][f] * adj;

  // 達成率 = 実績 / 予算
  const pctCell = (m, f) => AF_BUDGET[m][f] === 0 ? null : (AF_ACTUAL[m][f] / AF_BUDGET[m][f] * 100);

  // 合計
  const colTotActual = AF_FACS.map((_, f) => AF_ACTUAL.reduce((a, r) => a + r[f], 0));
  const colTotBudget = AF_FACS.map((_, f) => AF_BUDGET.reduce((a, r) => a + r[f], 0));
  const monthTotActual = AF_ACTUAL.map(r => r.reduce((a, b) => a + b, 0));
  const monthTotBudget = AF_BUDGET.map(r => r.reduce((a, b) => a + b, 0));
  const grandActual = colTotActual.reduce((a, b) => a + b, 0);
  const grandBudget = colTotBudget.reduce((a, b) => a + b, 0);

  const topOff = sticky ? 0 : undefined;
  const headBase = { background: AF_GREEN, fontSize: 10.5, fontWeight: 700, color: 'var(--text)', borderRight: '1px solid ' + AF_LINE, borderBottom: '1px solid ' + AF_LINE, padding: '3px 5px', textAlign: 'center', lineHeight: 1.18, verticalAlign: 'middle' };

  const fmtPct = (v) => v == null ? '—' : v.toFixed(1) + '%';
  const pctColor = (v) => v == null ? 'var(--text-3)' : (v < 100 ? AF_RED : 'var(--text)');
  // 予算差 = 実績 − 予算（マイナスは赤の括弧表示）
  const diffVal = (m, f) => (AF_ACTUAL[m][f] - AF_BUDGET[m][f]) * adj;
  const fmtDiff = (v) => { const r = Math.round(v); if (r === 0) return '0'; const s = new Intl.NumberFormat('ja-JP').format(Math.abs(r)); return r < 0 ? '(' + s + ')' : '+' + s; };
  const diffColor = (v) => { const r = Math.round(v); return r < 0 ? AF_RED : (r === 0 ? 'var(--text-3)' : 'var(--text)'); };
  const dTd = isDiff ? { fontSize: 8.5, padding: '0 2px' } : null;   // 予算差は括弧分幅を詰める

  return (
    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', borderTop: '1px solid ' + AF_LINE, borderLeft: '1px solid ' + AF_LINE }}>
      <colgroup>
        <col style={{ width: AF_COLW.monthW + '%' }} />
        {AF_FACS.map((_, i) => <col key={i} style={{ width: AF_COLW.facW + '%' }} />)}
        <col style={{ width: AF_COLW.totW + '%' }} />
      </colgroup>
      <thead>
        {/* エリア見出し行 */}
        <tr>
          <th rowSpan={2} style={{ ...headBase, position: 'sticky', left: 0, zIndex: 6, top: topOff, background: AF_GREEN, textAlign: 'center' }}>{rowLabel}</th>
          {AF_AREAS.map((a, ai) => (
            <th key={ai} colSpan={a.facs.length} style={{ ...headBase, background: AF_GREEN_D, top: topOff, position: sticky ? 'sticky' : undefined, zIndex: 4 }}>{a.area}</th>
          ))}
          <th rowSpan={2} style={{ ...headBase, background: AF_GREEN_D, top: topOff, position: sticky ? 'sticky' : undefined, zIndex: 5 }}>合計</th>
        </tr>
        {/* 施設名行 */}
        <tr>
          {AF_FACS.map((f, fi) => (
            <th key={fi} title={f} style={{ ...headBase, top: sticky ? 27 : undefined, position: sticky ? 'sticky' : undefined, zIndex: 3, fontWeight: 600, fontSize: 9, padding: '3px 3px', height: 38, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.12 }}>{f}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {AF_MONTHS.map((m, mi) => (
          <tr key={mi} style={{ background: mi % 2 ? AF_ZEBRA : '#fff' }}>
            <td style={{ ...afMonth, background: mi % 2 ? AF_ZEBRA : '#fff' }}>{m}</td>
            {AF_FACS.map((_, fi) => {
              if (isPct) {
                const v = pctCell(mi, fi);
                return <td key={fi} className="tabular" style={{ ...afTd, color: pctColor(v) }}>{fmtPct(v)}</td>;
              }
              if (isDiff) {
                const v = diffVal(mi, fi);
                return <td key={fi} className="tabular" style={{ ...afTd, ...dTd, color: diffColor(v) }}>{fmtDiff(v)}</td>;
              }
              const v = dataAdj(mi, fi);
              return <td key={fi} className="tabular" style={{ ...afTd, color: v === 0 ? 'var(--text-3)' : 'var(--text)' }}>{yen0(v)}</td>;
            })}
            {/* 合計列 */}
            {isPct
              ? <td className="tabular" style={{ ...afTd, fontWeight: 700, background: AF_GREEN, color: pctColor(monthTotBudget[mi] ? monthTotActual[mi] / monthTotBudget[mi] * 100 : null) }}>{fmtPct(monthTotBudget[mi] ? monthTotActual[mi] / monthTotBudget[mi] * 100 : null)}</td>
              : isDiff
              ? <td className="tabular" style={{ ...afTd, ...dTd, fontWeight: 700, background: AF_GREEN, color: diffColor((monthTotActual[mi] - monthTotBudget[mi]) * adj) }}>{fmtDiff((monthTotActual[mi] - monthTotBudget[mi]) * adj)}</td>
              : <td className="tabular" style={{ ...afTd, fontWeight: 700, background: AF_GREEN }}>{yen0((kind === 'budget' ? monthTotBudget[mi] : monthTotActual[mi]) * adj)}</td>}
          </tr>
        ))}
        {/* 合計行 */}
        <tr style={{ background: AF_GREEN }}>
          <td style={{ ...afMonth, background: AF_GREEN, fontWeight: 700, borderTop: '2px solid ' + AF_LINE_STRONG }}>合計</td>
          {AF_FACS.map((_, fi) => {
            if (isPct) {
              const v = colTotBudget[fi] ? colTotActual[fi] / colTotBudget[fi] * 100 : null;
              return <td key={fi} className="tabular" style={{ ...afTd, fontWeight: 700, borderTop: '2px solid ' + AF_LINE_STRONG, color: pctColor(v) }}>{fmtPct(v)}</td>;
            }
            if (isDiff) {
              const v = (colTotActual[fi] - colTotBudget[fi]) * adj;
              return <td key={fi} className="tabular" style={{ ...afTd, ...dTd, fontWeight: 700, borderTop: '2px solid ' + AF_LINE_STRONG, color: diffColor(v) }}>{fmtDiff(v)}</td>;
            }
            const v = (kind === 'budget' ? colTotBudget[fi] : colTotActual[fi]) * adj;
            return <td key={fi} className="tabular" style={{ ...afTd, fontWeight: 700, borderTop: '2px solid ' + AF_LINE_STRONG, color: v === 0 ? 'var(--text-3)' : 'var(--text)' }}>{yen0(v)}</td>;
          })}
          {isPct
            ? <td className="tabular" style={{ ...afTd, fontWeight: 800, borderTop: '2px solid ' + AF_LINE_STRONG, background: AF_GREEN_D, color: pctColor(grandActual / grandBudget * 100) }}>{fmtPct(grandActual / grandBudget * 100)}</td>
            : isDiff
            ? <td className="tabular" style={{ ...afTd, ...dTd, fontWeight: 800, borderTop: '2px solid ' + AF_LINE_STRONG, background: AF_GREEN_D, color: diffColor((grandActual - grandBudget) * adj) }}>{fmtDiff((grandActual - grandBudget) * adj)}</td>
            : <td className="tabular" style={{ ...afTd, fontWeight: 800, borderTop: '2px solid ' + AF_LINE_STRONG, background: AF_GREEN_D }}>{yen((kind === 'budget' ? grandBudget : grandActual) * adj)}</td>}
        </tr>
      </tbody>
    </table>
  );
}

/* 指標定義 */
const AF_METRICS = [
  { id: 'actual', label: '実績' },
  { id: 'budget', label: '予算' },
  { id: 'pct', label: '予算達成率' },
  { id: 'diff', label: '予算差' },
];
const AF_VIO = '37,111,219';

/* ---------- 全施設年間売上 画面 ---------- */
function AnnualSalesScreen({ st, set }) {
  const adj = st.tax === 'excl' ? 1 / 1.1 : 1;
  const year = st.period.year;
  const hasData = year === 2026;
  const facName = '全施設';
  const { sel, setAll, pick, isOn, allOn } = useMultiMetric(['actual'], AF_METRICS.map(m => m.id));
  const shown = AF_METRICS.filter(m => sel.includes(m.id));
  const multi = shown.length > 1;

  const card = { border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' };
  const tableScroll = { overflowX: 'auto', overflowY: 'visible' };
  const cap = (txt, sub) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>{txt}</h3>
      {sub && <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
    </div>
  );
  const tabBtn = (id, label) => (
    <button key={id} onClick={(e) => pick(id, e)} title="Ctrl/⌘+クリックで複数選択" style={{
      height: 32, padding: '0 15px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
      border: '1px solid ' + (isOn(id) ? 'rgba(' + AF_VIO + ',0.5)' : 'var(--border)'),
      background: isOn(id) ? 'rgba(' + AF_VIO + ',0.1)' : 'var(--surface)',
      color: isOn(id) ? 'var(--primary-ink)' : 'var(--text-2)',
    }}>{label}</button>
  );
  /* 1指標のテーブルカード */
  const tax = st.tax === 'incl' ? '税込' : '税抜';
  const tableCard = (id) => {
    const meta = {
      actual: ['実績', '客室販売金額（' + tax + '）· ' + year + '年', 'actual', adj],
      budget: ['予算', '客室販売金額（' + tax + '）· ' + year + '年', 'budget', adj],
      pct: ['予算達成率', '実績 ÷ 予算 ・ 100%未満は赤字', 'pct', 1],
      diff: ['予算差', '実績 − 予算（' + tax + '・円）・ マイナスは赤の括弧表示', 'diff', adj],
    }[id];
    return (
      <div style={card} key={id}>
        {cap(meta[0], meta[1])}
        <div style={tableScroll}><AfTable kind={meta[2]} rowLabel={meta[0]} adj={meta[3]} /></div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>全施設年間売上</h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, whiteSpace: 'nowrap' }}>
            {facName} · {year}年（月次）· {st.tax === 'incl' ? '税込' : '税抜'}表示 · 対象項目：<strong style={{ color: 'var(--text)' }}>客室販売金額</strong> · 指標：<strong style={{ color: 'var(--text)' }}>{allOn ? 'すべて（4表）' : shown.map(m => m.label).join('・')}</strong>
          </div>
        </div>
        <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
      </div>

      {/* 指標セレクタ */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {AF_METRICS.map(m => tabBtn(m.id, m.label))}
        <span style={{ width: 1, height: 20, background: 'var(--border-strong)', margin: '0 4px' }} />
        <button onClick={setAll} style={{
          height: 32, padding: '0 16px', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px solid ' + (allOn ? 'var(--primary)' : 'rgba(' + AF_VIO + ',0.4)'),
          background: allOn ? 'var(--primary)' : 'var(--surface)',
          color: allOn ? '#fff' : 'var(--primary-ink)',
        }}><Icon name="Rows3" size={14} />すべて表示</button>
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4, whiteSpace: 'nowrap' }}>Ctrl/⌘+クリックで複数選択</span>
      </div>

      {!hasData && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--warning)', background: 'var(--warning-weak)', border: '1px solid #F1D9B5', borderRadius: 'var(--r-md)', padding: '8px 12px' }}>
          <Icon name="Info" size={14} />{year}年の確定データは未取込のため、2026年の実績を表示しています。
        </div>
      )}

      {/* テーブル（選択された指標） */}
      {shown.map(m => tableCard(m.id))}
    </div>
  );
}

Object.assign(window, { AnnualSalesScreen });
