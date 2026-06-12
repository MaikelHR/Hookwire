/* ============================================================
   Hookwire data service (Fase 1: API real)
   Misma superficie pública que el mock de la Fase 0: la UI consume
   SOLO estos hooks y tipos, así que cambiar el mock por la API real
   no tocó ningún componente.

   Transporte: TanStack Query con polling (refetchInterval). El
   polling es una decisión deliberada de la arquitectura: mientras
   el dashboard está abierto re-consulta /api/* cada pocos segundos
   en lugar de mantener websockets.
   ============================================================ */
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';

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
export const BACKOFF_S: readonly number[] = [10, 30, 90, 300, 300]; // segundos antes del intento 2..6 (Fase 2)
export const MAX_ATTEMPTS = 6;

const POLL_MS = 4000; // polling del dashboard (decisión de arquitectura: 3-5 s)

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
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed with ${res.status}`);
  return (await res.json()) as T;
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
  createdAt: string;
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
    verified: true, // la verificación real de firma en el receiver llega en la Fase 3
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

export function useStats(): Stats {
  const { data } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const body = await fetchJson<{ stats: Stats }>('/api/stats');
      return body.stats;
    },
  });
  return data ?? EMPTY_STATS;
}

export function useEndpoints(): Endpoint[] {
  const { data } = useQuery({
    queryKey: ['endpoints'],
    queryFn: async () => {
      const body = await fetchJson<{ endpoints: ApiEndpoint[] }>('/api/endpoints');
      return body.endpoints.map(mapEndpoint);
    },
  });
  return data ?? EMPTY_ENDPOINTS;
}

export function useDeliveries(): Delivery[] {
  const { data } = useQuery({
    queryKey: ['deliveries'],
    queryFn: async () => {
      const body = await fetchJson<{ deliveries: ApiDelivery[] }>('/api/deliveries');
      return body.deliveries.map(mapDelivery);
    },
  });
  return data ?? EMPTY_DELIVERIES;
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

export function useFailureMode(): boolean {
  return false; // el toggle de fallo se activa en la Fase 2
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
        .catch((err: unknown) => console.error('sendTestEvent failed:', err));
      return id;
    },
    setFailureMode: () => undefined, // Fase 2
    replayDelivery: () => undefined, // Fase 2
  };
}
