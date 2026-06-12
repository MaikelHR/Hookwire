/* ============================================================
   Drain de la cola de deliveries (código de servidor, lo importan
   solo las functions de /api; el cliente nunca lo toca).

   Función reutilizable a propósito: POST /api/events la ejecuta
   inline tras publicar, y POST /api/tick (Fase 2) la reusará tal
   cual para disparar reintentos vencidos.

   Patrón de claim: SELECT ... FOR UPDATE SKIP LOCKED dentro de una
   transacción. El lock de fila funciona como "lease" del trabajo:
   - Otro worker que ejecute el mismo SELECT se salta las filas
     bloqueadas (SKIP LOCKED) en lugar de quedarse esperando, así
     dos drains concurrentes nunca procesan la misma delivery.
   - Si el proceso muere a mitad del intento, la transacción hace
     ROLLBACK y la fila vuelve a quedar visible para el siguiente
     drain: entrega "al menos una vez", la garantía de un webhook.
   ============================================================ */
import { createHmac } from 'node:crypto';
import type { Pool, PoolClient } from '@neondatabase/serverless';

const USER_AGENT = 'Hookwire/1.4 (+https://hookwire.dev)';
const HTTP_TIMEOUT_MS = 5000;
const SNIPPET_MAX = 200;

type JsonObject = Record<string, unknown>;

interface ClaimedRow {
  id: string;
  session_id: string;
  attempt_count: number;
  url: string;
  secret: string;
  event_type: string;
  payload: JsonObject;
}

export interface DrainOptions {
  /* Limitar el drain a una sesión (lo usa /api/events); sin él procesa
     cualquier delivery pendiente (lo usará /api/tick). */
  sessionId?: string;
  maxDeliveries?: number;
}

export interface DrainResult {
  processed: number;
  delivered: number;
  retrying: number;
}

/* Firma estilo Stripe: HMAC SHA-256 de "<timestamp>.<body>" con el secreto
   del endpoint, enviada como "t=<unix>,v1=<hex64>". El receptor recalcula
   el HMAC con su copia del secreto y compara; incluir el timestamp en lo
   firmado evita que un tercero re-envíe (replay) una entrega vieja. */
export function signPayload(secret: string, body: string, unixSeconds: number): string {
  const mac = createHmac('sha256', secret).update(`${unixSeconds}.${body}`).digest('hex');
  return `t=${unixSeconds},v1=${mac}`;
}

/* Fase 1: el claim solo toma deliveries 'pending' (los retries con backoff
   llegan en la Fase 2). El JOIN trae todo lo necesario para el intento;
   FOR UPDATE OF d bloquea únicamente la fila de deliveries. */
const CLAIM_SQL = `
  SELECT d.id, d.session_id, d.attempt_count,
         e.url, e.secret,
         ev.event_type, ev.payload
  FROM deliveries d
  JOIN endpoints e ON e.id = d.endpoint_id
  JOIN events ev ON ev.session_id = d.session_id AND ev.id = d.event_id
  WHERE d.status = 'pending'
    AND ($1::text IS NULL OR d.session_id = $1)
  ORDER BY d.created_at
  FOR UPDATE OF d SKIP LOCKED
  LIMIT 1`;

async function attemptDelivery(client: PoolClient, row: ClaimedRow): Promise<'delivered' | 'retrying'> {
  const attemptNumber = row.attempt_count + 1;
  const body = JSON.stringify(row.payload);
  const signature = signPayload(row.secret, body, Math.floor(Date.now() / 1000));

  const started = Date.now();
  let responseStatus: number | null = null;
  let snippet: string | null = null;
  let errorText: string | null = null;
  try {
    const res = await fetch(row.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Hookwire-Event': row.event_type,
        'X-Hookwire-Delivery': row.id,
        'X-Hookwire-Attempt': String(attemptNumber),
        'X-Hookwire-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    responseStatus = res.status;
    snippet = (await res.text()).slice(0, SNIPPET_MAX);
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
  }
  const durationMs = Date.now() - started;

  const ok = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
  const status = ok ? 'delivered' : 'retrying';

  await client.query(
    `INSERT INTO delivery_attempts (delivery_id, attempt_number, response_status, response_body_snippet, duration_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.id, attemptNumber, responseStatus, snippet, durationMs, errorText],
  );
  /* next_attempt_at queda NULL adrede: en Fase 1 no se reintenta; la Fase 2
     calculará aquí el backoff (10s/30s/90s/5m/5m) y el dead-letter. */
  await client.query(
    `UPDATE deliveries SET status = $2, attempt_count = $3, signature = $4, updated_at = now() WHERE id = $1`,
    [row.id, status, attemptNumber, signature],
  );
  return status;
}

export async function drainPendingDeliveries(pool: Pool, options: DrainOptions = {}): Promise<DrainResult> {
  const sessionId: string | null = options.sessionId ?? null;
  const maxDeliveries = options.maxDeliveries ?? 25;
  const result: DrainResult = { processed: 0, delivered: 0, retrying: 0 };

  const client = await pool.connect();
  try {
    while (result.processed < maxDeliveries) {
      await client.query('BEGIN');
      try {
        const { rows } = await client.query<ClaimedRow>(CLAIM_SQL, [sessionId]);
        const row = rows[0];
        if (!row) {
          await client.query('COMMIT');
          break;
        }
        const status = await attemptDelivery(client, row);
        await client.query('COMMIT');
        result.processed++;
        result[status]++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return result;
}
