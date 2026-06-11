/* ============================================================
   Hookwire — data service (mock, Fase 0)
   Port directo de design_handoff_hookwire_dashboard/js/data-service.js.

   - Todo el estado + lógica de simulación vive aquí.
   - La UI lo consume SOLO a través de los hooks exportados:
       useStats, useEndpoints, useDeliveries, useEcho,
       useFailureMode, useDemoActions
   - En fases siguientes este módulo se cambia por la API REST real
     (/api/*) sin tocar ningún componente.
   ============================================================ */
import { useSyncExternalStore } from 'react';

// ---------- types ----------
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
export const BACKOFF_S: readonly number[] = [10, 30, 90, 300, 300]; // segundos antes del intento 2..6
export const MAX_ATTEMPTS = 6;

const now = (): number => Date.now();
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const rint = (a: number, b: number): number => Math.round(rand(a, b));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

let idCounter = 1000;
function uid(prefix: string): string {
  return prefix + '_' + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6);
}

function hex(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return s;
}

// ---------- payloads ----------
const NAMES = ['Ada Park', 'Tomás Rivera', 'Mina Okafor', 'Jules Bernard', 'Sofía Quintero', 'Ravi Patel'] as const;
const SUBJECTS = [
  'Cannot reset password',
  'Invoice mismatch on #4821',
  'Webhook retries flooding logs',
  'Upgrade to Team plan',
  'API key rotation help',
] as const;

function makePayload(eventType: string): JsonObject {
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

function makeSignature(ts: number): string {
  return 't=' + Math.floor(ts / 1000) + ',v1=' + hex(64);
}

// ---------- store ----------
interface StoreState {
  endpoints: Endpoint[];
  deliveries: Delivery[]; // newest first
  echo: EchoEntry[]; // newest first, inbox del demo receiver
  failureMode: boolean;
  chart: number[]; // 12 buckets x 5 min
  base: { published: number; delivered: number; failedFinal: number };
  latencies: number[];
}

const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const state: StoreState = {
  endpoints: [],
  deliveries: [],
  echo: [],
  failureMode: false,
  chart: [],
  base: { published: 12847, delivered: 12480, failedFinal: 67 },
  latencies: [],
};

// ---------- seed ----------
function makeDelivery(eventType: string, endpointId: string, createdAt: number): Delivery {
  return {
    id: uid('dlv'),
    eventId: 'evt_' + hex(14),
    eventType,
    endpointId,
    status: 'pending',
    attempts: [],
    maxAttempts: MAX_ATTEMPTS,
    nextRetryAt: null,
    latencyMs: null,
    payload: makePayload(eventType),
    signature: makeSignature(createdAt),
    createdAt,
  };
}

function makeAttempt(ts: number, statusCode: number, durationMs: number): DeliveryAttempt {
  const ok = statusCode >= 200 && statusCode < 300;
  return {
    ts,
    statusCode,
    durationMs,
    body: ok
      ? '{"ok":true,"received":true}'
      : statusCode === 503
        ? '{"error":"Service Unavailable"}'
        : '{"error":"Internal Server Error"}',
  };
}

function seed(): void {
  const t = now();
  state.endpoints = [
    { id: 'ep_demo', name: 'Demo receiver (echo)', url: 'https://demo.hookwire.dev/echo', status: 'healthy', successRate: 100, lastDeliveryAt: t - 6 * 60000, secret: 'whsec_' + hex(32), createdAt: t - 86400000 * 4 },
    { id: 'ep_billing', name: 'Billing service', url: 'https://api.acme-billing.com/hooks/hookwire', status: 'healthy', successRate: 99.2, lastDeliveryAt: t - 2 * 60000, secret: 'whsec_' + hex(32), createdAt: t - 86400000 * 31 },
    { id: 'ep_crm', name: 'Legacy CRM sync', url: 'https://crm.internal.example/webhook', status: 'failing', successRate: 62.4, lastDeliveryAt: t - 14 * 60000, secret: 'whsec_' + hex(32), createdAt: t - 86400000 * 9 },
    { id: 'ep_mirror', name: 'Staging mirror', url: 'https://staging.acme.dev/hooks/inbound', status: 'disabled', successRate: 97.8, lastDeliveryAt: t - 86400000 * 2, secret: 'whsec_' + hex(32), createdAt: t - 86400000 * 18 },
  ];

  // historial (~21 deliveries en la última hora)
  const rows: Delivery[] = [];
  for (let i = 0; i < 21; i++) {
    const ageMin = 2 + i * rand(2.4, 4.2);
    const created = t - ageMin * 60000;
    const evt = pick(EVENT_TYPES);
    const ep = pick(['ep_demo', 'ep_billing', 'ep_billing', 'ep_crm'] as const);
    let status: DeliveryStatus = 'delivered';
    if (ep === 'ep_crm') status = pick(['delivered', 'failed', 'dead', 'dead'] as const);
    const d = makeDelivery(evt, ep, created);
    if (status === 'delivered') {
      const dur = rint(58, 240);
      d.attempts.push(makeAttempt(created + dur, 200, dur));
      d.status = 'delivered';
      d.latencyMs = dur;
      state.latencies.push(dur);
    } else {
      const nAtt = status === 'dead' ? MAX_ATTEMPTS : rint(2, 4);
      let at = created;
      for (let k = 0; k < nAtt; k++) {
        const dur2 = rint(900, 3000); // los timeouts/errores son lentos
        d.attempts.push(makeAttempt(at + dur2, pick([500, 502, 503] as const), dur2));
        at += (BACKOFF_S[Math.min(k, BACKOFF_S.length - 1)] ?? 300) * 1000;
      }
      d.status = status === 'dead' ? 'dead' : 'failed';
    }
    rows.push(d);
  }

  // una delivery viva en retry contra el endpoint que falla
  const live = makeDelivery('payment.completed', 'ep_crm', t - 52000);
  live.attempts.push(makeAttempt(t - 50000, 503, 2104));
  live.attempts.push(makeAttempt(t - 20000, 500, 1873));
  live.status = 'retrying';
  live.nextRetryAt = t + 70000; // backoff de 90s tras el intento 2
  rows.unshift(live);

  rows.sort((a, b) => b.createdAt - a.createdAt);
  state.deliveries = rows;

  // chart: 12 buckets de 5 minutos
  state.chart = [];
  for (let i = 0; i < 12; i++) state.chart.push(rint(16, 44));

  // latencias base
  for (let i = 0; i < 40; i++) state.latencies.push(rint(60, 420));
}

// ---------- simulación ----------
function endpointById(id: string): Endpoint | undefined {
  return state.endpoints.find((e) => e.id === id);
}

function attemptShouldFail(delivery: Delivery): boolean {
  const ep = endpointById(delivery.endpointId);
  if (!ep) return true;
  if (ep.id === 'ep_demo') return state.failureMode;
  return ep.status === 'failing';
}

function performAttempt(delivery: Delivery): void {
  const t = now();
  const fail = attemptShouldFail(delivery);
  const dur = fail ? rint(700, 2400) : rint(45, 210);
  const code = fail ? pick([500, 500, 503] as const) : 200;
  delivery.attempts.push(makeAttempt(t, code, dur));

  const ep = endpointById(delivery.endpointId);
  const isDemo = delivery.endpointId === 'ep_demo';

  if (isDemo) {
    state.echo.unshift({
      id: uid('echo'),
      ts: t,
      eventType: delivery.eventType,
      verified: !fail,
      statusCode: code,
      attempt: delivery.attempts.length,
    });
    if (state.echo.length > 30) state.echo.length = 30;
  }

  if (!fail) {
    delivery.status = 'delivered';
    delivery.nextRetryAt = null;
    delivery.latencyMs = t - delivery.createdAt;
    state.latencies.push(dur);
    if (state.latencies.length > 200) state.latencies.shift();
    state.base.delivered++;
    if (ep) ep.lastDeliveryAt = t;
    bumpChart();
  } else if (delivery.attempts.length >= delivery.maxAttempts) {
    delivery.status = 'dead';
    delivery.nextRetryAt = null;
    state.base.failedFinal++;
  } else {
    delivery.status = 'retrying';
    const backoff = BACKOFF_S[delivery.attempts.length - 1] ?? 300;
    delivery.nextRetryAt = t + backoff * 1000;
  }
  emit();
}

function bumpChart(): void {
  const last = state.chart.length - 1;
  state.chart[last] = (state.chart[last] ?? 0) + 1;
}

// ticker: dispara retries vencidos + refresca los countdowns
setInterval(() => {
  const t = now();
  let dirty = false;
  state.deliveries.forEach((d) => {
    if (d.status === 'retrying' && d.nextRetryAt !== null && d.nextRetryAt <= t) {
      performAttempt(d); // ya hace emit()
    } else if (d.status === 'retrying' || d.status === 'pending') {
      dirty = true; // los countdowns necesitan re-render
    }
  });
  if (dirty) emit();
}, 500);

// ---------- actions ----------
function sendTestEvent(eventType?: string): string {
  const t = now();
  const d = makeDelivery(eventType ?? pick(EVENT_TYPES), 'ep_demo', t);
  state.deliveries.unshift(d);
  state.base.published++;
  bumpChart();
  emit();
  setTimeout(() => performAttempt(d), rint(450, 900));
  return d.id;
}

function setFailureMode(on: boolean): void {
  state.failureMode = on;
  const ep = endpointById('ep_demo');
  if (ep) ep.status = on ? 'failing' : 'healthy';
  // al recuperarse: adelanta el próximo retry para que la recuperación se vea rápido
  if (!on) {
    const t = now();
    state.deliveries.forEach((d) => {
      if (d.endpointId === 'ep_demo' && d.status === 'retrying') {
        d.nextRetryAt = Math.min(d.nextRetryAt ?? t + 2500, t + 2500);
      }
    });
  }
  emit();
}

function replayDelivery(id: string): void {
  const d = state.deliveries.find((x) => x.id === id);
  if (!d) return;
  d.status = 'pending';
  d.nextRetryAt = null;
  emit();
  setTimeout(() => performAttempt(d), rint(450, 900));
}

// ---------- derived ----------
function computeStats(): Stats {
  const pending = state.deliveries.filter((d) => d.status === 'retrying' || d.status === 'pending').length;
  const total = state.base.delivered + state.base.failedFinal;
  const lat = state.latencies.slice().sort((a, b) => a - b);
  const p95 = lat.length > 0 ? (lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] ?? 0) : 0;
  return {
    published: state.base.published,
    successRate: total > 0 ? (state.base.delivered / total) * 100 : 100,
    p95,
    pendingRetries: pending,
    chart: state.chart.slice(),
  };
}

// ---------- hooks (única API que la UI puede usar) ----------
/* El store es un objeto plano que muta y emite; el hook se suscribe vía
   useSyncExternalStore a un contador de versión, así cada emit() fuerza
   re-render y los componentes leen el estado fresco durante el render. */
function useStoreVersion(): void {
  useSyncExternalStore(subscribe, () => version);
}

export function useStats(): Stats {
  useStoreVersion();
  return computeStats();
}

export function useEndpoints(): Endpoint[] {
  useStoreVersion();
  return state.endpoints;
}

export function useDeliveries(): Delivery[] {
  useStoreVersion();
  return state.deliveries;
}

export function useEcho(): EchoEntry[] {
  useStoreVersion();
  return state.echo;
}

export function useFailureMode(): boolean {
  useStoreVersion();
  return state.failureMode;
}

export function useDemoActions(): DemoActions {
  return { sendTestEvent, setFailureMode, replayDelivery };
}

seed();
