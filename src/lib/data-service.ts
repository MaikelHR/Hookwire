/* ============================================================
   Hookwire data service
   Misma superficie pública que el mock de la Fase 0: la UI consume
   SOLO estos hooks y tipos, así que cambiar el mock por la API real
   no tocó ningún componente.

   Transporte: TanStack Query con polling (refetchInterval). El
   polling es una decisión deliberada de la arquitectura: mientras
   el dashboard está abierto re-consulta /api/* cada pocos segundos
   en lugar de mantener websockets. Desde la Fase 2 el mismo ciclo
   incluye useTick, que dispara los reintentos vencidos de la cola.
   ============================================================ */
import { useEffect } from 'react';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_ATTEMPTS } from './retry-policy';
import { pushToast } from './toasts';

/* La política de reintentos vive en retry-policy.ts (módulo puro
   compartido con el drain del servidor); la UI la importa desde aquí
   para respetar la regla de consumir solo el data service. */
export { BACKOFF_SCHEDULE_S, MAX_ATTEMPTS } from './retry-policy';

// ---------- types (idénticos a la Fase 0) ----------
export type EndpointStatus = 'healthy' | 'failing' | 'disabled';
export type DeliveryStatus = 'pending' | 'delivered' | 'retrying' | 'failed' | 'dead';

export type JsonObject = Record<string, unknown>;

export interface Endpoint {
  id: string;
  name: string;
  url: string;
  status: EndpointStatus;
  successRate: number;
  lastDeliveryAt: number;
  secret: string;
  simulateFailure: boolean;
  createdAt: number;
}

export interface DeliveryAttempt {
  ts: number;
  statusCode: number;
  durationMs: number;
  body: string;
}

export interface Delivery {
  id: string;
  eventId: string;
  eventType: string;
  endpointId: string;
  status: DeliveryStatus;
  attempts: DeliveryAttempt[];
  maxAttempts: number;
  nextRetryAt: number | null;
  latencyMs: number | null;
  payload: JsonObject;
  signature: string;
  createdAt: number;
}

export interface EchoEntry {
  id: string;
  ts: number;
  eventType: string;
  verified: boolean;
  statusCode: number;
  attempt: number;
}

export interface Stats {
  published: number;
  successRate: number;
  p95: number;
  pendingRetries: number;
  chart: number[];
}

export interface DemoActions {
  sendTestEvent: (eventType?: string) => string;
  setFailureMode: (on: boolean) => void;
  replayDelivery: (id: string) => void;
}

// ---------- constants ----------
export const EVENT_TYPES: readonly string[] = ['user.created', 'payment.completed', 'ticket.assigned'];

const POLL_MS = 4000; // polling de lecturas del dashboard (decisión de arquitectura: 3-5 s)
const TICK_MS = 4000; // cadencia de POST /api/tick mientras la pestaña está visible

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: POLL_MS,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// ---------- transporte ----------
/* Error tipado del transporte: conserva el status y, si el servidor lo
   mandó (el 429 del rate limit), el Retry-After en segundos, para que
   las acciones puedan avisar al usuario en vez de solo loguear. */
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterS: number | null,
  ) {
    super(message);
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let retryAfterS: number | null = null;
    try {
      const body = (await res.json()) as { retryAfterS?: unknown };
      if (typeof body.retryAfterS === 'number') retryAfterS = body.retryAfterS;
    } catch {
      /* body sin JSON: el error queda solo con el status */
    }
    throw new ApiError(`${init?.method ?? 'GET'} ${url} failed with ${res.status}`, res.status, retryAfterS);
  }
  return (await res.json()) as T;
}

/* El rate limit es la única falla que el visitante debe ver explicada:
   un toast con cuándo reintentar. El resto sigue yendo a la consola. */
function reportActionError(action: string, err: unknown): void {
  if (err instanceof ApiError && err.status === 429) {
    pushToast(err.retryAfterS !== null ? `Rate limit reached. Try again in ${err.retryAfterS}s.` : 'Rate limit reached. Try again in a moment.');
    return;
  }
  console.error(`${action} failed:`, err);
}

// Formas que devuelve /api/* (fechas ISO, status de la base de datos)
interface ApiEndpoint {
  id: string;
  name: string;
  url: string;
  status: EndpointStatus;
  successRate: number;
  lastDeliveryAt: string | null;
  secret: string;
  simulateFailure: boolean;
  createdAt: string;
}

/* Copia cliente de DrainResult (src/lib/server/drain.ts no se importa
   desde el cliente: arrastra node:crypto y el driver de Neon). */
interface ApiDrainResult {
  processed: number;
  delivered: number;
  retrying: number;
  deadLettered: number;
}

interface ApiAttempt {
  ts: string;
  statusCode: number;
  durationMs: number;
  body: string;
}

interface ApiDelivery {
  id: string;
  eventId: string;
  eventType: string;
  endpointId: string;
  status: 'pending' | 'delivered' | 'retrying' | 'failed' | 'dead_lettered';
  attempts: ApiAttempt[];
  nextAttemptAt: string | null;
  latencyMs: number | null;
  payload: JsonObject;
  signature: string | null;
  createdAt: string;
}

interface ApiEchoMessage {
  id: string;
  eventType: string;
  attempt: number;
  statusCode: number;
  verified: boolean;
  receivedAt: string;
}

function mapEndpoint(e: ApiEndpoint): Endpoint {
  return {
    id: e.id,
    name: e.name,
    url: e.url,
    status: e.status,
    successRate: e.successRate,
    lastDeliveryAt: e.lastDeliveryAt !== null ? Date.parse(e.lastDeliveryAt) : 0,
    secret: e.secret,
    simulateFailure: e.simulateFailure,
    createdAt: Date.parse(e.createdAt),
  };
}

function mapDelivery(d: ApiDelivery): Delivery {
  return {
    id: d.id,
    eventId: d.eventId,
    eventType: d.eventType,
    endpointId: d.endpointId,
    status: d.status === 'dead_lettered' ? 'dead' : d.status,
    attempts: d.attempts.map((a) => ({
      ts: Date.parse(a.ts),
      statusCode: a.statusCode,
      durationMs: a.durationMs,
      body: a.body,
    })),
    maxAttempts: MAX_ATTEMPTS,
    nextRetryAt: d.nextAttemptAt !== null ? Date.parse(d.nextAttemptAt) : null,
    latencyMs: d.latencyMs !== null ? Math.round(d.latencyMs) : null,
    payload: d.payload,
    signature: d.signature ?? '',
    createdAt: Date.parse(d.createdAt),
  };
}

function mapEcho(m: ApiEchoMessage): EchoEntry {
  return {
    id: m.id,
    ts: Date.parse(m.receivedAt),
    eventType: m.eventType,
    verified: m.verified,
    statusCode: m.statusCode,
    attempt: m.attempt,
  };
}

// ---------- payload de ejemplo del botón "Send test event" ----------
const NAMES = ['Ada Park', 'Tomás Rivera', 'Mina Okafor', 'Jules Bernard', 'Sofía Quintero', 'Ravi Patel'] as const;
const SUBJECTS = [
  'Cannot reset password',
  'Invoice mismatch on #4821',
  'Webhook retries flooding logs',
  'Upgrade to Team plan',
  'API key rotation help',
] as const;

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const rint = (a: number, b: number): number => Math.round(rand(a, b));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

function hex(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return s;
}

function makeSamplePayload(eventType: string): JsonObject {
  const base: JsonObject = {
    id: 'evt_' + hex(14),
    type: eventType,
    created: new Date().toISOString(),
    livemode: false,
  };
  if (eventType === 'user.created') {
    const name = pick(NAMES);
    base.data = {
      user: {
        id: 'usr_' + hex(10),
        email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
        name,
        plan: pick(['free', 'pro', 'team'] as const),
      },
    };
  } else if (eventType === 'payment.completed') {
    base.data = {
      payment: {
        id: 'pay_' + hex(10),
        amount: rint(900, 24900),
        currency: 'usd',
        method: pick(['card', 'sepa_debit', 'ach'] as const),
        customer: 'cus_' + hex(8),
      },
    };
  } else {
    base.data = {
      ticket: {
        id: 'tkt_' + hex(8),
        subject: pick(SUBJECTS),
        assignee: pick(NAMES),
        priority: pick(['low', 'normal', 'high', 'urgent'] as const),
      },
    };
  }
  return base;
}

// ---------- hooks (única API que la UI puede usar) ----------
const EMPTY_STATS: Stats = {
  published: 0,
  successRate: 100,
  p95: 0,
  pendingRetries: 0,
  chart: new Array<number>(12).fill(0),
};
const EMPTY_ENDPOINTS: Endpoint[] = [];
const EMPTY_DELIVERIES: Delivery[] = [];
const EMPTY_ECHO: EchoEntry[] = [];

/* Opciones compartidas entre el hook de datos y useFirstLoad: usar la
   misma queryKey hace que ambos observen exactamente la misma query del
   cache (TanStack dedupe: no hay fetch duplicado). */
const statsOptions = {
  queryKey: ['stats'],
  queryFn: async (): Promise<Stats> => {
    const body = await fetchJson<{ stats: Stats }>('/api/stats');
    return body.stats;
  },
} as const;

const endpointsOptions = {
  queryKey: ['endpoints'],
  queryFn: async (): Promise<Endpoint[]> => {
    const body = await fetchJson<{ endpoints: ApiEndpoint[] }>('/api/endpoints');
    return body.endpoints.map(mapEndpoint);
  },
} as const;

const deliveriesOptions = {
  queryKey: ['deliveries'],
  queryFn: async (): Promise<Delivery[]> => {
    const body = await fetchJson<{ deliveries: ApiDelivery[] }>('/api/deliveries');
    return body.deliveries.map(mapDelivery);
  },
} as const;

export function useStats(): Stats {
  const { data } = useQuery(statsOptions);
  return data ?? EMPTY_STATS;
}

export function useEndpoints(): Endpoint[] {
  const { data } = useQuery(endpointsOptions);
  return data ?? EMPTY_ENDPOINTS;
}

export function useDeliveries(): Delivery[] {
  const { data } = useQuery(deliveriesOptions);
  return data ?? EMPTY_DELIVERIES;
}

/* Skeleton de primera carga REAL: true mientras alguna de las queries que
   alimentan las vistas espera su primer resultado. Sustituye al useFakeLoad
   del mock de la Fase 0 (un setTimeout que fingía cargar). */
export function useFirstLoad(): boolean {
  const stats = useQuery(statsOptions);
  const endpoints = useQuery(endpointsOptions);
  const deliveries = useQuery(deliveriesOptions);
  return stats.isPending || endpoints.isPending || deliveries.isPending;
}

export function useEcho(): EchoEntry[] {
  const { data } = useQuery({
    queryKey: ['echo'],
    queryFn: async () => {
      const body = await fetchJson<{ messages: ApiEchoMessage[] }>('/api/echo');
      return body.messages.map(mapEcho);
    },
  });
  return data ?? EMPTY_ECHO;
}

/* ON si algún endpoint de la sesión está en modo fallo (la demo tiene
   uno). Deriva del mismo cache de useEndpoints: una sola fuente. */
export function useFailureMode(): boolean {
  const endpoints = useEndpoints();
  return endpoints.some((e) => e.simulateFailure);
}

/* El "reloj" de la cola: mientras el dashboard está abierto dispara
   POST /api/tick cada TICK_MS para que los reintentos vencidos avancen
   (no hay worker 24/7; el dashboard es quien hace avanzar la cola).
   Dos cuidados con el free tier de Vercel:
   - visibilitychange detiene el interval cuando la pestaña se oculta y
     al volver dispara un tick inmediato (procesa lo vencido de golpe)
     antes de reanudar la cadencia.
   - solo llama a la API si el cache de deliveries muestra trabajo vivo
     (pending o retrying); con la cola en reposo no gasta invocaciones.
     El cache se refresca cada POLL_MS, así que el primer tick tras
     publicar llega a más tardar un poll después.
   Que dos pestañas tickeen a la vez es inofensivo: el claim del drain
   usa SKIP LOCKED y cada delivery la procesa exactamente una. */
export function useTick(): void {
  const qc = useQueryClient();

  useEffect(() => {
    let inFlight = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = async (): Promise<void> => {
      if (inFlight) return;
      const deliveries = qc.getQueryData<Delivery[]>(['deliveries']);
      const hasWork = deliveries?.some((d) => d.status === 'pending' || d.status === 'retrying') ?? false;
      if (!hasWork) return;
      inFlight = true;
      try {
        const body = await fetchJson<{ drain: ApiDrainResult }>('/api/tick', { method: 'POST' });
        if (body.drain.processed > 0) {
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['deliveries'] }),
            qc.invalidateQueries({ queryKey: ['stats'] }),
            qc.invalidateQueries({ queryKey: ['echo'] }),
            qc.invalidateQueries({ queryKey: ['endpoints'] }),
          ]);
        }
      } catch (err) {
        console.error('tick failed:', err);
      } finally {
        inFlight = false;
      }
    };

    const start = (): void => {
      if (interval === null) interval = setInterval(() => void tick(), TICK_MS);
    };
    const stop = (): void => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = (): void => {
      if (document.hidden) {
        stop();
      } else {
        void tick();
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [qc]);
}

export function useDemoActions(): DemoActions {
  const qc = useQueryClient();

  const refreshAll = (): void => {
    void qc.invalidateQueries({ queryKey: ['deliveries'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
    void qc.invalidateQueries({ queryKey: ['echo'] });
    void qc.invalidateQueries({ queryKey: ['endpoints'] });
  };

  return {
    /* El id del evento se genera en el CLIENTE: es la clave de idempotencia
       que el servidor respeta con el unique (session_id, id). Devuelve el id
       de inmediato y refresca las queries cuando el POST (que ya hizo el
       drain inline) responde. */
    sendTestEvent: (eventType?: string): string => {
      const type = eventType ?? EVENT_TYPES[0] ?? 'user.created';
      const id = 'evt_' + crypto.randomUUID();
      void fetchJson('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, event_type: type, payload: makeSamplePayload(type) }),
      })
        .then(refreshAll)
        .catch((err: unknown) => reportActionError('sendTestEvent', err));
      return id;
    },
    /* Persiste simulate_failure en el endpoint demo. Update optimista:
       el toggle responde al instante con el valor deseado y el PATCH
       más la invalidación confirman (o revierten) el estado real. */
    setFailureMode: (on: boolean): void => {
      const target = qc.getQueryData<Endpoint[]>(['endpoints'])?.[0];
      if (!target) return;
      qc.setQueryData<Endpoint[]>(['endpoints'], (list) =>
        (list ?? []).map((e) =>
          e.id === target.id ? { ...e, simulateFailure: on, status: on ? 'failing' : 'healthy' } : e,
        ),
      );
      void fetchJson('/api/endpoints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id, simulateFailure: on }),
      })
        .catch((err: unknown) => console.error('setFailureMode failed:', err))
        .finally(() => void qc.invalidateQueries({ queryKey: ['endpoints'] }));
    },
    /* Re-encola la delivery (el caso estrella: revivir una dead-lettered
       cuando el endpoint se recupera) y el servidor la drena inline. */
    replayDelivery: (id: string): void => {
      void fetchJson('/api/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryId: id }),
      })
        .then(refreshAll)
        .catch((err: unknown) => reportActionError('replayDelivery', err));
    },
  };
}
