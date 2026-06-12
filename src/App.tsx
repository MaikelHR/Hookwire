import { useEffect, useState } from 'react';
import { useTick } from './lib/data-service';
import { Sidebar, type ViewId } from './components/Sidebar';
import { LiveDemoPanel } from './components/LiveDemoPanel';
import { DeliveryDrawer } from './components/DeliveryDrawer';
import { FirstVisitModal } from './components/FirstVisitModal';
import { OverviewView } from './views/OverviewView';
import { EndpointsView } from './views/EndpointsView';
import { EndpointDetailView } from './views/EndpointDetailView';
import { DeliveriesView } from './views/DeliveriesView';

const INTRO_KEY = 'hookwire_intro_seen';

export default function App() {
  // Hace avanzar la cola (reintentos vencidos) mientras el dashboard está abierto
  useTick();

  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  const [view, setView] = useState<ViewId>('overview');
  const [endpointId, setEndpointId] = useState<string | null>(null);
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(INTRO_KEY);
    } catch {
      return true;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', mode);
  }, [mode]);

  // Escape cierra el drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDeliveryId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dismissIntro = (): void => {
    setShowIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* storage no disponible: el modal simplemente reaparece */
    }
  };

  const goView = (v: ViewId): void => {
    setView(v);
    setEndpointId(null);
  };

  return (
    <div className="grid grid-cols-[208px_minmax(0,1fr)_348px] max-[1180px]:grid-cols-[64px_minmax(0,1fr)_320px] h-screen">
      <Sidebar view={view} onNavigate={goView} mode={mode} onToggleMode={() => setMode(mode === 'dark' ? 'light' : 'dark')} />

      <main className="overflow-y-auto pt-[26px] px-[30px] pb-[60px] min-w-0">
        {view === 'overview' ? (
          <OverviewView onOpenDelivery={setDeliveryId} />
        ) : view === 'endpoints' && endpointId !== null ? (
          <EndpointDetailView
            endpointId={endpointId}
            onBack={() => setEndpointId(null)}
            onOpenDelivery={setDeliveryId}
          />
        ) : view === 'endpoints' ? (
          <EndpointsView onOpenEndpoint={setEndpointId} />
        ) : (
          <DeliveriesView onOpenDelivery={setDeliveryId} />
        )}
      </main>

      <LiveDemoPanel />

      {deliveryId !== null ? <DeliveryDrawer deliveryId={deliveryId} onClose={() => setDeliveryId(null)} /> : null}
      {showIntro ? <FirstVisitModal onDismiss={dismissIntro} /> : null}
    </div>
  );
}
