/* ============================================================
   shell.jsx — AppShell, SidebarNav, HeaderFilterBar, dropdowns
   Role-aware navigation + responsive (drawer / bottom sheet).
   ============================================================ */

const ROLES = {
  admin:        { label: '管理者', desc: '全施設・取込・commit・マスタ・権限・差分検証' },
  operator:     { label: '取込オペレーター', desc: '付与施設の取込・検証・commit' },
  viewer:       { label: '閲覧者', desc: '付与/全施設の閲覧のみ' },
  facility_user:{ label: '施設ユーザー', desc: '自施設のダッシュボード閲覧のみ' },
};

/* nav: roles = who can see it */
const NAV = [
  { section: '分析', items: [
    { id: 'dashboard',     label: 'ダッシュボード',     icon: 'LayoutDashboard', roles: ['admin','operator','viewer','facility_user'] },
    { id: 'occupancy',     label: '稼働分析',           icon: 'Percent',         roles: ['admin','operator','viewer','facility_user'] },
    { id: 'channels',      label: '経路分析',           icon: 'Route',           roles: ['admin','operator','viewer','facility_user'] },
    { id: 'nationalities', label: '国籍別分析',         icon: 'Globe',           roles: ['admin','operator','viewer','facility_user'] },
    { id: 'stay-nights',   label: '泊数分布',           icon: 'MoonStar',        roles: ['admin','operator','viewer','facility_user'] },
    { id: 'room-types',    label: '部屋タイプ別分析',   icon: 'BedDouble',       roles: ['admin','operator','viewer','facility_user'] },
    { id: 'annual-sales',  label: '全施設年間売上',     icon: 'Building2',       roles: ['admin','operator','viewer'], ownOnly: 'facility_user' },
    { id: 'booking-curve', label: 'ブッキングカーブ',   icon: 'TrendingUp',      roles: ['admin','operator','viewer','facility_user'] },
  ]},
  { section: '運用', items: [
    { id: 'imports',            label: 'データ取込',     icon: 'Upload',     roles: ['admin','operator'] },
    { id: 'validation/excel-diff', label: 'Excel差分検証', icon: 'GitCompareArrows', roles: ['admin'] },
  ]},
  { section: '管理', items: [
    { id: 'admin/masters', label: 'マスタ管理',       icon: 'Database',  roles: ['admin'] },
    { id: 'admin/users',   label: 'ユーザー・権限',   icon: 'Users',     roles: ['admin'] },
    { id: 'settings',      label: '設定',             icon: 'Settings',  roles: ['admin','operator','viewer','facility_user'] },
  ]},
];

function navVisibleForRole(role) {
  return NAV.map(g => ({
    section: g.section,
    items: g.items.filter(it => it.roles.includes(role) || it.ownOnly === role),
  })).filter(g => g.items.length);
}

/* ---------- Generic dropdown (portal-based so it never clips inside scroll/overflow containers) ---------- */
function Dropdown({ trigger, children, align = 'left', width = 260 }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const menuRef = React.useRef(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0, maxH: 600 });

  const place = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = align === 'right' ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const top = r.bottom + 6;
    setPos({ top, left, maxH: Math.max(160, window.innerHeight - top - 12) });
  }, [align, width]);

  React.useLayoutEffect(() => { if (open) place(); }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {trigger(open, () => setOpen(o => !o))}
      {open && ReactDOM.createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 1000,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-pop)', overflow: 'hidden', overflowY: 'auto', maxHeight: pos.maxH,
        }}>
          {children(() => setOpen(false))}
        </div>,
        document.body
      )}
    </div>
  );
}

function FilterButton({ icon, label, value, open, onClick, strong }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 10px',
      background: open ? 'var(--surface-3)' : 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)', color: 'var(--text)', fontSize: 13, fontWeight: 500, maxWidth: 240,
    }}>
      {icon && <Icon name={icon} size={15} style={{ color: 'var(--text-2)', flexShrink: 0 }} />}
      {label && <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>}
      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      <Icon name="ChevronDown" size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </button>
  );
}

function MenuItem({ active, onClick, icon, children, right, danger }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
      padding: '9px 12px', border: 'none', background: active ? 'var(--primary-weak)' : 'transparent',
      color: danger ? 'var(--danger)' : active ? 'var(--primary-ink)' : 'var(--text)', fontSize: 13.5,
      fontWeight: active ? 600 : 500, cursor: 'pointer',
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-3)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      {icon && <Icon name={icon} size={15} style={{ color: 'var(--text-2)', flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      {right}
    </button>
  );
}

/* ---------- Facility selector ---------- */
function FacilitySelector({ facility, onChange, role, allowAll = true }) {
  const cur = facility === 'ALL' ? '全施設' : (FACILITIES.find(f => f.id === facility)?.short || '');
  const byArea = {};
  FACILITIES.forEach(f => { (byArea[f.area] = byArea[f.area] || []).push(f); });
  return (
    <Dropdown width={280} trigger={(open, t) => <FilterButton icon="Building2" value={cur} open={open} onClick={t} />}>
      {(close) => (
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 6 }}>
          {allowAll && role !== 'facility_user' && (
            <MenuItem active={facility === 'ALL'} icon="LayoutGrid"
              onClick={() => { onChange('ALL'); close(); }}>全施設</MenuItem>
          )}
          {Object.entries(byArea).map(([area, list]) => (
            <div key={area}>
              <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.04em' }}>{area}</div>
              {list.map(f => (
                <MenuItem key={f.id} active={facility === f.id} onClick={() => { onChange(f.id); close(); }}
                  right={<span style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.rooms}室</span>}>{f.short}</MenuItem>
              ))}
            </div>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

/* ---------- Period selector ---------- */
function PeriodSelector({ period, onChange }) {
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  return (
    <Dropdown width={240} trigger={(open, t) => <FilterButton icon="Calendar" value={period.label} open={open} onClick={t} />}>
      {(close) => (
        <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={() => onChange({ ...period, year: period.year - 1, label: `${period.year - 1}年${period.month}月` })}
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 6, width: 28, height: 28, display: 'grid', placeItems: 'center' }}><Icon name="ChevronLeft" size={15} /></button>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{period.year}年</span>
            <button onClick={() => onChange({ ...period, year: period.year + 1, label: `${period.year + 1}年${period.month}月` })}
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 6, width: 28, height: 28, display: 'grid', placeItems: 'center' }}><Icon name="ChevronRight" size={15} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {months.map((m, i) => {
              const active = period.month === i + 1;
              return <button key={m} onClick={() => { onChange({ ...period, month: i + 1, label: `${period.year}年${m}` }); close(); }}
                style={{ padding: '8px 0', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid ' + (active ? 'var(--primary)' : 'var(--border)'),
                  background: active ? 'var(--primary)' : 'var(--surface)', color: active ? '#fff' : 'var(--text)' }}>{m}</button>;
            })}
          </div>
        </div>
      )}
    </Dropdown>
  );
}

/* ---------- Comparison selector (稼働分析の比較基準 + 予算) ---------- */
const COMPARISONS = [
  { id: 'py',     label: '前年実績', icon: 'CalendarClock' },
  { id: 'pytd',   label: '前年同期', icon: 'CalendarRange', note: '未確定' },
  { id: 'date',   label: '指定日付', icon: 'CalendarSearch' },
  { id: 'budget', label: '予算',     icon: 'Target' },
];
function ComparisonSelector({ value, onChange, date, onDate }) {
  const v = value === 'yoy' ? 'py' : value;
  const cur = COMPARISONS.find(c => c.id === v) || COMPARISONS[0];
  return (
    <Dropdown width={224} trigger={(open, t) => <FilterButton label="比較:" value={cur.label} open={open} onClick={t} />}>
      {(close) => (
        <div style={{ padding: 6 }}>
          {COMPARISONS.map(c => (
            <MenuItem key={c.id} active={v === c.id} icon={c.icon} onClick={() => { onChange(c.id); if (c.id !== 'date') close(); }}
              right={c.note ? <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>{c.note}</span> : null}>{c.label}</MenuItem>
          ))}
          {v === 'date' && (
            <div style={{ padding: '8px 10px 4px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>比較する日付</div>
              <input type="date" value={date || '2026-06-14'} max="2026-06-30" onChange={e => onDate && onDate(e.target.value)}
                style={{ width: '100%', height: 32, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0 9px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box' }} />
            </div>
          )}
        </div>
      )}
    </Dropdown>
  );
}

/* ---------- Sidebar ---------- */
function SidebarNav({ route, onNavigate, role, collapsed, mobile, onClose }) {
  const groups = navVisibleForRole(role);
  const width = collapsed && !mobile ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)';
  return (
    <aside style={{
      width, flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', height: '100%',
      position: mobile ? 'fixed' : 'sticky', top: 0, left: 0, zIndex: mobile ? 80 : 1,
      boxShadow: mobile ? 'var(--shadow-pop)' : 'none', transition: 'width .16s',
    }}>
      <div style={{ height: 'var(--header-h)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--text)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 800, fontSize: 13, letterSpacing: '-.03em' }}>島</div>
        {(!collapsed || mobile) && <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.1, whiteSpace: 'nowrap' }}>宿泊BI レポート</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Stay Analytics</div>
        </div>}
        {mobile && <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--text-2)' }}><Icon name="X" size={20} /></button>}
      </div>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {groups.map(g => (
          <div key={g.section} style={{ marginBottom: 14 }}>
            {(!collapsed || mobile) && <div style={{ padding: '4px 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em' }}>{g.section}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {g.items.map(it => {
                const active = route === it.id;
                return (
                  <button key={it.id} onClick={() => { onNavigate(it.id); if (mobile) onClose(); }} title={collapsed ? it.label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, padding: collapsed && !mobile ? '9px 0' : '9px 10px',
                      justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
                      borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                      background: active ? 'var(--primary-weak)' : 'transparent',
                      color: active ? 'var(--primary-ink)' : 'var(--text)', fontSize: 13.5, fontWeight: active ? 600 : 500,
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-3)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                    {active && <i style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 3, background: 'var(--primary)' }} />}
                    <Icon name={it.icon} size={17} style={{ color: active ? 'var(--primary)' : 'var(--text-2)', flexShrink: 0 }} />
                    {(!collapsed || mobile) && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}{it.ownOnly === role && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>(自施設)</span>}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

Object.assign(window, {
  ROLES, NAV, navVisibleForRole, Dropdown, FilterButton, MenuItem,
  FacilitySelector, PeriodSelector, ComparisonSelector, COMPARISONS, SidebarNav,
});
