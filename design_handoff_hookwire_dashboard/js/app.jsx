/* Hookwire — app shell: sidebar, routing, theme, tweaks */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "direction": "graphite",
  "accent": "#b07ce8",
  "density": "comfy",
  "speed": "real"
}/*EDITMODE-END*/;

const NAV = [
  { id: 'overview', label: 'Overview', glyph: '◈' },
  { id: 'endpoints', label: 'Endpoints', glyph: '⇄' },
  { id: 'deliveries', label: 'Deliveries', glyph: '⚡' }
];

function HookwireApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [mode, setMode] = React.useState('dark');
  const [view, setView] = React.useState('overview');
  const [endpointId, setEndpointId] = React.useState(null);
  const [deliveryId, setDeliveryId] = React.useState(null);
  const [showIntro, setShowIntro] = React.useState(() => {
    try { return !localStorage.getItem('hookwire_intro_seen'); } catch (e) { return true; }
  });

  const { setSpeed } = HookwireData.useDemoActions();

  // apply tweaks to the document
  React.useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-dir', t.direction);
    el.setAttribute('data-mode', mode);
    el.setAttribute('data-density', t.density);
    el.style.setProperty('--accent', t.accent);
  }, [t.direction, t.density, t.accent, mode]);

  React.useEffect(() => {
    setSpeed(t.speed === 'fast' ? 6 : 1);
  }, [t.speed]);

  // esc closes drawer
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setDeliveryId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dismissIntro = () => {
    setShowIntro(false);
    try { localStorage.setItem('hookwire_intro_seen', '1'); } catch (e) {}
  };

  const goView = (v) => { setView(v); setEndpointId(null); };

  return (
    <div className="hw-app">
      <nav className="hw-side">
        <div className="hw-logo">
          <span className="hw-logo-mark">⚓︎</span>
          <span className="hw-logo-word">hookwire<span className="cursor">_</span></span>
        </div>
        {NAV.map((n) => (
          <button key={n.id}
            className={'hw-nav-item' + (view === n.id ? ' active' : '')}
            onClick={() => goView(n.id)}>
            <span className="glyph">{n.glyph}</span>
            <span className="hw-nav-label">{n.label}</span>
          </button>
        ))}
        <div className="hw-side-foot">
          <button className="hw-mode-btn" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
            {mode === 'dark' ? '☀ light mode' : '◗ dark mode'}
          </button>
          <span className="hw-side-note">v1.4.0 · portfolio demo</span>
        </div>
      </nav>

      <main className="hw-main">
        {view === 'overview' ? (
          <OverviewView onOpenDelivery={setDeliveryId}></OverviewView>
        ) : view === 'endpoints' && endpointId ? (
          <EndpointDetailView endpointId={endpointId} onBack={() => setEndpointId(null)} onOpenDelivery={setDeliveryId}></EndpointDetailView>
        ) : view === 'endpoints' ? (
          <EndpointsView onOpenEndpoint={setEndpointId}></EndpointsView>
        ) : (
          <DeliveriesView onOpenDelivery={setDeliveryId}></DeliveriesView>
        )}
      </main>

      <LiveDemoPanel></LiveDemoPanel>

      {deliveryId ? <DeliveryDrawer deliveryId={deliveryId} onClose={() => setDeliveryId(null)}></DeliveryDrawer> : null}
      {showIntro ? <FirstVisitModal onDismiss={dismissIntro}></FirstVisitModal> : null}

      <TweaksPanel>
        <TweakSection label="Visual direction"></TweakSection>
        <TweakRadio label="Direction" value={t.direction}
          options={['graphite', 'phosphor', 'carbon']}
          onChange={(v) => setTweak('direction', v)}></TweakRadio>
        <TweakColor label="Accent" value={t.accent}
          options={['#2ec27e', '#4f9cf9', '#d9a514', '#b07ce8']}
          onChange={(v) => setTweak('accent', v)}></TweakColor>
        <TweakSection label="Layout"></TweakSection>
        <TweakRadio label="Density" value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)}></TweakRadio>
        <TweakSection label="Simulation"></TweakSection>
        <TweakRadio label="Retry backoff" value={t.speed}
          options={['real', 'fast']}
          onChange={(v) => setTweak('speed', v)}></TweakRadio>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<HookwireApp></HookwireApp>);
