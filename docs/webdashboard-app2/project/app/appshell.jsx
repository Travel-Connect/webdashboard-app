/* ============================================================
   appshell.jsx — HeaderFilterBar + AppShell (responsive)
   ============================================================ */

function TaxToggle({ value, onChange }) {
  return <Segmented size="sm" value={value} onChange={onChange}
    options={[{ value: 'incl', label: '税込' }, { value: 'excl', label: '税抜' }]} />;
}

function DataFreshnessBadge({ updated }) {
  return (
    <div title="データ最終更新" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
      <Icon name="RefreshCw" size={13} style={{ color: 'var(--accent)' }} />
      <span className="tabular">{updated}</span>
    </div>
  );
}

function UserMenu({ role, onRole, onNavigate }) {
  return (
    <Dropdown align="right" width={290} trigger={(open, t) => (
      <button onClick={t} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 8px 0 4px',
        background: open ? 'var(--surface-3)' : 'transparent', border: '1px solid ' + (open ? 'var(--border)' : 'transparent'),
        borderRadius: 'var(--r-md)', cursor: 'pointer',
      }}>
        <span style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>管</span>
        <span style={{ textAlign: 'left', lineHeight: 1.15 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>運用担当 A</span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)' }}>{ROLES[role].label}</span>
        </span>
        <Icon name="ChevronDown" size={14} style={{ color: 'var(--text-3)' }} />
      </button>
    )}>
      {(close) => (
        <div>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>運用担当 A</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>ops-a@example.co.jp</div>
          </div>
          <div style={{ padding: 8 }}>
            <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="FlaskConical" size={12} /> ロール切替（デモ用）
            </div>
            {Object.entries(ROLES).map(([k, v]) => (
              <MenuItem key={k} active={role === k} onClick={() => { onRole(k); close(); }}
                right={role === k ? <Icon name="Check" size={15} style={{ color: 'var(--primary)' }} /> : null}>
                <span>
                  <span style={{ display: 'block' }}>{v.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>{v.desc}</span>
                </span>
              </MenuItem>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', padding: 8 }}>
            <MenuItem icon="Settings" onClick={() => { onNavigate('settings'); close(); }}>設定 / 監査ログ</MenuItem>
            <MenuItem icon="LogOut" danger onClick={close}>サインアウト</MenuItem>
          </div>
        </div>
      )}
    </Dropdown>
  );
}

/* desktop filter row */
function HeaderFilterBar({ st, set, role, onNavigate, onValidation }) {
  const showAnnual = true;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', height: 'var(--filterbar-h)',
      borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'nowrap', overflowX: 'auto',
    }}>
      <FacilitySelector facility={st.facility} onChange={v => set({ facility: v })} role={role} />
      <PeriodSelector period={st.period} onChange={v => set({ period: v })} />
      <Segmented size="sm" value={st.range} onChange={v => set({ range: v })}
        options={[{ value: 'month', label: '月間' }, { value: 'year', label: '年間' }]} />
      <span style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />
      <TaxToggle value={st.tax} onChange={v => set({ tax: v })} />
      <ComparisonSelector value={st.comparison} onChange={v => set({ comparison: v })} date={st.cmpDate} onDate={v => set({ cmpDate: v })} />
      <div style={{ flex: 1 }} />
      <DataFreshnessBadge updated={st.period.year === 2026 && st.period.month === 6 ? PERIOD.updated : '—'} />
      <ValidationBadge count={3} onClick={onValidation} />
    </div>
  );
}

/* mobile filter bottom sheet */
function FilterSheet({ st, set, role, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(23,32,51,.4)' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--surface)',
        borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: '8px 18px 24px', boxShadow: 'var(--shadow-pop)',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 4, background: 'var(--border-strong)', margin: '8px auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>表示条件</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-2)' }}><Icon name="X" size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="施設"><FacilitySelector facility={st.facility} onChange={v => set({ facility: v })} role={role} /></Field>
          <Field label="期間"><PeriodSelector period={st.period} onChange={v => set({ period: v })} /></Field>
          <Field label="集計"><Segmented value={st.range} onChange={v => set({ range: v })} options={[{ value: 'month', label: '月間' }, { value: 'year', label: '年間' }]} /></Field>
          <Field label="税表示"><TaxToggle value={st.tax} onChange={v => set({ tax: v })} /></Field>
          <Field label="比較対象"><ComparisonSelector value={st.comparison} onChange={v => set({ comparison: v })} date={st.cmpDate} onDate={v => set({ cmpDate: v })} /></Field>
        </div>
        <Btn variant="primary" onClick={onClose} style={{ width: '100%', marginTop: 20 }}>適用</Btn>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-2)' }}>{label}</span>
      {children}
    </div>
  );
}

/* ---------- AppShell ---------- */
function AppShell({ st, set, role, onRole, route, onNavigate, title, children }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);
  const isMobile = st.viewport === 'mobile';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* sidebar */}
      {!isMobile && <SidebarNav route={route} onNavigate={onNavigate} role={role} collapsed={collapsed} />}
      {isMobile && drawer && <>
        <div onClick={() => setDrawer(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(23,32,51,.4)', zIndex: 79 }} />
        <SidebarNav route={route} onNavigate={onNavigate} role={role} mobile onClose={() => setDrawer(false)} />
      </>}

      {/* main column */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 40, height: 'var(--header-h)', background: 'var(--surface)',
          borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
        }}>
          {isMobile ? (
            <button onClick={() => setDrawer(true)} style={{ border: 'none', background: 'none', color: 'var(--text)' }}><Icon name="Menu" size={22} /></button>
          ) : (
            <button onClick={() => setCollapsed(c => !c)} title="ナビを折りたたむ" style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 'var(--r-md)', width: 32, height: 32, display: 'grid', placeItems: 'center', color: 'var(--text-2)' }}>
              <Icon name={collapsed ? 'PanelLeftOpen' : 'PanelLeftClose'} size={17} />
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          <div style={{ flex: 1 }} />
          {isMobile && <button onClick={() => setSheet(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 'var(--r-md)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            <Icon name="SlidersHorizontal" size={15} />条件
          </button>}
          <UserMenu role={role} onRole={onRole} onNavigate={onNavigate} />
        </header>

        {/* desktop filter bar */}
        {!isMobile && <div style={{ position: 'sticky', top: 'var(--header-h)', zIndex: 39 }}>
          <HeaderFilterBar st={st} set={set} role={role} onNavigate={onNavigate} onValidation={() => onNavigate('validation/excel-diff')} />
        </div>}

        {/* mobile filter summary strip */}
        {isMobile && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          <Badge tone="neutral" icon="Building2">{st.facility === 'ALL' ? '全施設' : FACILITIES.find(f => f.id === st.facility)?.short}</Badge>
          <Badge tone="neutral" icon="Calendar">{st.period.label}</Badge>
          <Badge tone="neutral">{st.range === 'month' ? '月間' : '年間'}</Badge>
          <Badge tone="neutral">{st.tax === 'incl' ? '税込' : '税抜'}</Badge>
        </div>}

        {/* content */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : (route === 'occupancy' || route === 'channels' || route === 'nationalities' || route === 'stay-nights' || route === 'room-types' || route === 'annual-sales' || route === 'booking-curve' ? '20px 18px' : '22px 26px'), maxWidth: (route === 'occupancy' || route === 'channels' || route === 'nationalities' || route === 'stay-nights' || route === 'room-types' || route === 'annual-sales' || route === 'booking-curve') ? 'none' : 1480, width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>

      {isMobile && sheet && <FilterSheet st={st} set={set} role={role} onClose={() => setSheet(false)} />}
    </div>
  );
}

Object.assign(window, { AppShell, HeaderFilterBar, TaxToggle, DataFreshnessBadge, UserMenu });
