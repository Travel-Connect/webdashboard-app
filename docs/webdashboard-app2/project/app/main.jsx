/* ============================================================
   main.jsx — App root: routing, state, viewport, tweaks
   ============================================================ */
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "topLayout": "comfortable",
  "kpiDelta": "badge"
}/*EDITMODE-END*/;

const LS_KEY = 'stayBI.v1';
function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
}

function titleForRoute(route) {
  for (const g of NAV) for (const it of g.items) if (it.id === route) return it.label;
  return 'ダッシュボード';
}

function App() {
  const saved = loadState();
  const [route, setRoute] = useState(saved.route || 'dashboard');
  const [role, setRole] = useState(saved.role || 'admin');
  const [st, setSt] = useState({
    facility: saved.facility || 'F001',
    period: saved.period || { ...PERIOD },
    range: saved.range || 'month',
    tax: saved.tax || 'incl',
    comparison: saved.comparison || 'py',
    cmpDate: saved.cmpDate || '2026-06-14',
    viewport: window.innerWidth < 768 ? 'mobile' : 'desktop',
  });
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // viewport tracking
  useEffect(() => {
    const onR = () => setSt(s => {
      const v = window.innerWidth < 768 ? 'mobile' : 'desktop';
      return v === s.viewport ? s : { ...s, viewport: v };
    });
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  // persist
  useEffect(() => {
    const { viewport, ...persist } = st;
    localStorage.setItem(LS_KEY, JSON.stringify({ route, role, ...persist }));
  }, [route, role, st]);

  const set = (patch) => setSt(s => ({ ...s, ...patch }));

  // role guard: facility_user forced to own facility
  useEffect(() => {
    if (role === 'facility_user' && st.facility === 'ALL') set({ facility: 'F001' });
  }, [role]);

  function renderScreen() {
    switch (route) {
      case 'dashboard': return <TopDashboard st={st} role={role} onNavigate={setRoute} tweaks={tweaks} />;
      case 'occupancy': return <OccupancyScreen st={st} role={role} onNavigate={setRoute} />;
      case 'channels': return <ChannelsScreen st={st} />;
      case 'nationalities': return <NationalitiesScreen st={st} />;
      case 'stay-nights': return <StayNightsScreen st={st} />;
      case 'room-types': return <RoomTypesScreen st={st} />;
      case 'annual-sales': return <AnnualSalesScreen st={st} set={set} />;
      case 'booking-curve': return <BookingCurveScreen st={st} set={set} />;
      default: return <RoadmapScreen route={route} role={role} st={st} />;
    }
  }

  return (
    <>
      <AppShell st={st} set={set} role={role} onRole={setRole} route={route} onNavigate={setRoute} title={titleForRoute(route)}>
        {renderScreen()}
      </AppShell>

      <TweaksPanel>
        <TweakSection label="ダッシュボード トップ" />
        <TweakRadio label="カード一覧" value={tweaks.topLayout}
          options={[{ value: 'comfortable', label: 'ゆったり' }, { value: 'compact', label: 'コンパクト' }, { value: 'list', label: 'リスト' }]}
          onChange={v => setTweak('topLayout', v)} />
        <TweakRadio label="差分の見せ方" value={tweaks.kpiDelta}
          options={[{ value: 'badge', label: 'バッジ' }, { value: 'inline', label: 'インライン' }, { value: 'split', label: '分割' }]}
          onChange={v => setTweak('kpiDelta', v)} />
        <p style={{ margin: '10px 4px 0', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
          ※ ヘッダーの施設・期間・税表示・比較対象、左上のロール切替も試せます。
        </p>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
