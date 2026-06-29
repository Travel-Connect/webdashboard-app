/* ============================================================
   ui.jsx — primitives: MetricDelta, badges, KPI cards, tabs,
   states. All style-token driven.
   ============================================================ */

/* ---------- MetricDelta ---------- */
function MetricDelta({ value, unit = '%', size = 'sm', invert = false, muted }) {
  if (value == null || isNaN(value)) {
    return <span style={{ color: 'var(--text-3)', fontSize: size === 'sm' ? 12 : 13 }}>—</span>;
  }
  const pos = invert ? value < 0 : value > 0;
  const neg = invert ? value > 0 : value < 0;
  const zero = Math.abs(value) < 0.05;
  const color = zero ? 'var(--text-2)' : pos ? 'var(--positive)' : 'var(--danger)';
  const arrow = zero ? 'Minus' : value > 0 ? 'ArrowUp' : 'ArrowDown';
  const txt = (value > 0 ? '+' : '') + (unit === '%' ? value.toFixed(1) : value.toFixed(unit === '泊' ? 1 : 1)) + unit;
  return (
    <span className="tabular" style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      color: muted ? 'var(--text-2)' : color, fontSize: size === 'sm' ? 12 : 13, fontWeight: 600,
    }}>
      <Icon name={arrow} size={size === 'sm' ? 12 : 14} strokeWidth={2.5} />{txt}
    </span>
  );
}

/* ---------- Badge / Pill ---------- */
const TONES = {
  neutral:  ['var(--surface-3)', 'var(--text-2)'],
  primary:  ['var(--primary-weak)', 'var(--primary-ink)'],
  accent:   ['var(--accent-weak)', 'var(--accent)'],
  warning:  ['var(--warning-weak)', 'var(--warning)'],
  danger:   ['var(--danger-weak)', 'var(--danger)'],
  positive: ['var(--positive-weak)', 'var(--positive)'],
};
function Badge({ tone = 'neutral', icon, children, dot, style }) {
  const [bg, fg] = TONES[tone] || TONES.neutral;
  return (
    <span style={Object.assign({
      display: 'inline-flex', alignItems: 'center', gap: 5, background: bg, color: fg,
      fontSize: 12, fontWeight: 600, padding: dot ? '3px 9px 3px 8px' : '3px 9px',
      borderRadius: 999, lineHeight: 1.3, whiteSpace: 'nowrap',
    }, style)}>
      {dot && <i style={{ width: 6, height: 6, borderRadius: 8, background: fg }} />}
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

/* ---------- Validation badge (header) ---------- */
function ValidationBadge({ count = 0, onClick }) {
  const tone = count === 0 ? 'positive' : 'warning';
  return (
    <button onClick={onClick} title="検証ワーニング" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)',
      background: 'var(--surface)', borderRadius: 'var(--r-md)', padding: '5px 10px', color: 'var(--text)',
      fontSize: 13, fontWeight: 600,
    }}>
      <Icon name={count === 0 ? 'ShieldCheck' : 'TriangleAlert'} size={15}
        style={{ color: count === 0 ? 'var(--positive)' : 'var(--warning)' }} />
      {count === 0 ? '検証OK' : `警告 ${count}`}
    </button>
  );
}

/* ---------- Import status badge ---------- */
const IMPORT_STATUS = {
  uploaded:   ['neutral', '受領', 'Inbox'],
  parsing:    ['primary', '解析中', 'Loader'],
  parsed:     ['primary', '解析済', 'FileCheck2'],
  validation_failed: ['danger', '検証NG', 'FileX2'],
  validated:  ['accent', '検証済', 'FileCheck2'],
  committing: ['primary', '反映中', 'Loader'],
  committed:  ['positive', '反映済', 'CheckCircle2'],
  failed:     ['danger', '失敗', 'XCircle'],
  cancelled:  ['neutral', '取消', 'Ban'],
};
function ImportStatusBadge({ status }) {
  const [tone, label, icon] = IMPORT_STATUS[status] || IMPORT_STATUS.uploaded;
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

/* ---------- Tabs (underline) ---------- */
function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
      {tabs.map(t => {
        const active = t.value === value;
        return (
          <button key={t.value} role="tab" aria-selected={active} onClick={() => onChange(t.value)}
            style={{
              border: 'none', background: 'none', padding: '10px 14px 11px', fontSize: 14,
              fontWeight: active ? 700 : 500, color: active ? 'var(--text)' : 'var(--text-2)',
              borderBottom: '2px solid ' + (active ? 'var(--primary)' : 'transparent'),
              marginBottom: -1, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Segmented control ---------- */
function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div style={{
      display: 'inline-flex', background: 'var(--surface-3)', borderRadius: 'var(--r-md)', padding: 2, gap: 2,
    }}>
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const active = v === value;
        return (
          <button key={v} onClick={() => onChange(v)} style={{
            border: 'none', borderRadius: 'var(--r-sm)', padding: size === 'sm' ? '4px 10px' : '6px 14px',
            fontSize: size === 'sm' ? 12 : 13, fontWeight: 600, whiteSpace: 'nowrap',
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--text)' : 'var(--text-2)',
            boxShadow: active ? 'var(--shadow-card)' : 'none',
          }}>{label}</button>
        );
      })}
    </div>
  );
}

/* ---------- Card shell ---------- */
function Panel({ title, sub, actions, children, pad = true, style }) {
  return (
    <section style={Object.assign({
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--shadow-card)', overflow: 'hidden',
    }, style)}>
      {(title || actions) && (
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ minWidth: 0 }}>
            {title && <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>}
            {sub && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-2)' }}>{sub}</p>}
          </div>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
        </header>
      )}
      <div style={pad ? { padding: 18 } : undefined}>{children}</div>
    </section>
  );
}

/* ---------- States ---------- */
function EmptyState({ icon = 'Inbox', title, body, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-2)' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 'var(--r-lg)', background: 'var(--surface-3)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      }}><Icon name={icon} size={22} style={{ color: 'var(--text-3)' }} /></div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      {body && <div style={{ fontSize: 13, marginTop: 6, maxWidth: 420, marginInline: 'auto', lineHeight: 1.6 }}>{body}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
function LoadingSkeleton({ rows = 4, height = 16 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel" style={{ height, width: (90 - i * 8) + '%', borderRadius: 6 }} />
      ))}
    </div>
  );
}
function PermissionDeniedState({ children }) {
  return <EmptyState icon="Lock" title="アクセス権限がありません"
    body={children || 'この画面は現在のロールでは表示できません。管理者に施設・権限の付与を依頼してください。'} />;
}

/* ---------- Button ---------- */
function Btn({ variant = 'default', icon, iconRight, children, onClick, disabled, size = 'md', tone, style }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    fontSize: size === 'sm' ? 13 : 14, fontWeight: 600, borderRadius: 'var(--r-md)',
    padding: size === 'sm' ? '6px 11px' : '8px 14px', whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .55 : 1, transition: 'background .12s, border-color .12s',
  };
  const variants = {
    primary: { background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)' },
    default: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    ghost:   { background: 'transparent', color: 'var(--text-2)', border: '1px solid transparent' },
    danger:  { background: 'var(--danger)', color: '#fff', border: '1px solid var(--danger)' },
    accent:  { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' },
  };
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      style={Object.assign({}, base, variants[variant], style)}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

/* ---------- useMultiMetric: 指標の複数選択（Ctrl/⌘+クリックで追加トグル） ---------- */
function useMultiMetric(defaultIds, allIds) {
  const [sel, setSel] = React.useState(defaultIds);
  const pick = (id, e) => {
    const multi = e && (e.ctrlKey || e.metaKey);
    if (multi) {
      setSel(prev => prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id]);
    } else {
      setSel([id]);
    }
  };
  const setAll = () => setSel(allIds.slice());
  const isOn = (id) => sel.includes(id);
  const allOn = allIds.length > 0 && allIds.every(id => sel.includes(id));
  return { sel, setSel, pick, setAll, isOn, allOn };
}

Object.assign(window, {
  MetricDelta, Badge, ValidationBadge, ImportStatusBadge, Tabs, Segmented,
  Panel, EmptyState, LoadingSkeleton, PermissionDeniedState, Btn, useMultiMetric,
});
