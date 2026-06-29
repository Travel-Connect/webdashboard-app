/* ============================================================
   screens-dashboard.jsx — Top dashboard (7 indicator overview)
   Variants: topLayout (comfortable|compact|list), kpiDelta (badge|inline|split)
   ============================================================ */

const STATUS_META = {
  ok:     { tone: 'positive', label: '正常', dot: 'var(--positive)' },
  warn:   { tone: 'warning',  label: '要確認', dot: 'var(--warning)' },
  danger: { tone: 'danger',   label: '異常', dot: 'var(--danger)' },
};

function DeltaBlock({ k, mode }) {
  const yoyUnit = k.yoyUnit || '%';
  const budUnit = k.budpt != null ? 'pt' : '%';
  const budVal = k.budpt != null ? k.budpt : k.bud;
  const hasBud = budVal != null;
  if (mode === 'badge') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Badge tone={k.yoy >= 0 ? 'positive' : 'danger'}>前年 {(k.yoy > 0 ? '+' : '') + k.yoy + yoyUnit}</Badge>
        {hasBud && <Badge tone={budVal >= 0 ? 'primary' : 'warning'}>予算 {(budVal > 0 ? '+' : '') + budVal.toFixed(1) + budUnit}</Badge>}
      </div>
    );
  }
  if (mode === 'split') {
    return (
      <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--border)', marginTop: 4 }}>
        <div style={{ flex: 1, padding: '10px 0 2px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>前年比</div>
          <MetricDelta value={k.yoy} unit={yoyUnit} size="md" />
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div style={{ flex: 1, padding: '10px 0 2px', paddingLeft: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>予算差</div>
          {hasBud ? <MetricDelta value={budVal} unit={budUnit} size="md" /> : <span style={{ color: 'var(--text-3)', fontSize: 13 }}>—</span>}
        </div>
      </div>
    );
  }
  // inline
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
      <span style={{ color: 'var(--text-2)' }}>前年 <MetricDelta value={k.yoy} unit={yoyUnit} /></span>
      <span style={{ color: 'var(--text-2)' }}>予算 {hasBud ? <MetricDelta value={budVal} unit={budUnit} /> : <span style={{ color: 'var(--text-3)' }}>—</span>}</span>
    </div>
  );
}

function OverviewCard({ k, layout, deltaMode, onClick }) {
  const sm = STATUS_META[k.status];
  const list = layout === 'list';
  const compact = layout === 'compact';
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-card)', padding: compact ? 14 : 18,
      display: 'flex', flexDirection: list ? 'row' : 'column', alignItems: list ? 'center' : 'stretch',
      gap: list ? 18 : (compact ? 10 : 12), width: '100%', transition: 'border-color .12s, box-shadow .12s', position: 'relative',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'var(--shadow-pop)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}>
      {/* head */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: list ? '0 0 220px' : 'none' }}>
        <span style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name={k.icon} size={18} style={{ color: 'var(--text)' }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.title}</div>
          {!list && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{k.sub}</div>}
        </div>
        {!list && <span title={sm.label} style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: 8, background: sm.dot, flexShrink: 0 }} />}
      </div>

      {/* value */}
      <div style={{ flex: list ? '0 0 150px' : 'none' }}>
        <div className="tabular" style={{ fontSize: compact ? 24 : 28, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1, color: 'var(--text)' }}>{k.main}</div>
        {list && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{k.sub}</div>}
      </div>

      {/* deltas */}
      <div style={{ flex: list ? 1 : 'none' }}>
        <DeltaBlock k={k} mode={deltaMode} />
      </div>

      {/* note */}
      {!compact && <div style={{
        fontSize: 11.5, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6,
        borderTop: list ? 'none' : (deltaMode === 'split' ? 'none' : '1px solid var(--border)'),
        paddingTop: list ? 0 : (deltaMode === 'split' ? 0 : 10), flex: list ? '0 0 240px' : 'none',
      }}>
        {k.status !== 'ok' && <Icon name="AlertCircle" size={13} style={{ color: sm.dot, flexShrink: 0 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: list ? 'nowrap' : 'normal' }}>{k.note}</span>
      </div>}

      {list && <span title={sm.label} style={{ width: 8, height: 8, borderRadius: 8, background: sm.dot, flexShrink: 0 }} />}
      {list && <Icon name="ChevronRight" size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
    </button>
  );
}

function AlertStrip({ alerts, onNavigate }) {
  if (!alerts.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {alerts.map((a, i) => {
        const [bg, fg] = ({ danger: ['var(--danger-weak)', 'var(--danger)'], warning: ['var(--warning-weak)', 'var(--warning)'] })[a.level];
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 14px', borderRadius: 'var(--r-md)',
            background: bg, border: '1px solid ' + fg + '33',
          }}>
            <Icon name={a.icon} size={17} style={{ color: fg, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{a.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 1, lineHeight: 1.5 }}>{a.body}</div>
            </div>
            <button onClick={() => onNavigate(a.route)} style={{
              flexShrink: 0, border: '1px solid ' + fg + '55', background: 'var(--surface)', color: fg,
              borderRadius: 'var(--r-md)', padding: '5px 11px', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>{a.cta}<Icon name="ArrowRight" size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}

function TopDashboard({ st, role, onNavigate, tweaks }) {
  const layout = tweaks.topLayout;
  const deltaMode = tweaks.kpiDelta;
  const facLabel = st.facility === 'ALL' ? '全施設' : FACILITIES.find(f => f.id === st.facility)?.name;
  const cards = KPI_OVERVIEW.filter(k => !(role === 'facility_user' && k.key === 'annual-sales' && st.facility === 'ALL'));

  const cols = layout === 'list' ? '1fr' : layout === 'compact'
    ? 'repeat(auto-fill, minmax(220px, 1fr))'
    : 'repeat(auto-fill, minmax(290px, 1fr))';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* page intro */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 13, marginBottom: 4 }}>
            <Icon name="Building2" size={15} /><span style={{ fontWeight: 600, color: 'var(--text)' }}>{facLabel}</span>
            <span style={{ color: 'var(--text-3)' }}>·</span><span>{st.period.label}</span>
            <Badge tone="neutral" style={{ marginLeft: 4 }}>{st.tax === 'incl' ? '税込' : '税抜'}</Badge>
          </div>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-.01em' }}>指標サマリー</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn variant="default" icon="FileDown" size="sm">エクスポート</Btn>
          <Btn variant="default" icon="Maximize2" size="sm" onClick={() => onNavigate('occupancy')}>詳細分析へ</Btn>
        </div>
      </div>

      {/* alerts */}
      <AlertStrip alerts={OCC_ALERTS} onNavigate={onNavigate} />

      {/* cards */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14 }}>
        {cards.map(k => (
          <OverviewCard key={k.key} k={k} layout={layout} deltaMode={deltaMode} onClick={() => onNavigate(k.route)} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { TopDashboard, OverviewCard, AlertStrip, STATUS_META });
