/* ============================================================
   Tests de integración del drain contra Postgres REAL (Neon).

   La política pura se testea sin red en retry-policy.test.ts; aquí
   se prueban las garantías que solo existen con la base de datos:
   - el claim FOR NO KEY UPDATE SKIP LOCKED reparte el trabajo entre
     drains concurrentes sin procesar dos veces la misma delivery,
   - el backoff persiste y el claim respeta next_attempt_at,
   - el sexto fallo termina en dead letter y la cola lo suelta.

   El "endpoint suscrito" es un servidor HTTP local del propio test
   (sin red externa); la DATABASE_URL sale del mismo .env que usa
   npm run db:migrate. Sin .env, el describe entero se salta.
   ============================================================ */
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import ws from 'ws';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drainPendingDeliveries } from './drain';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_PREFIX = `vitest-${Date.now()}-`;

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error('expected at least one row');
  return row;
}

describe.skipIf(!DATABASE_URL)('drain integration (Postgres real)', () => {
  let db: Pool;
  let server: Server;
  let receiverUrl: string;
  /* Status que devuelve el receiver fake; cada test lo ajusta. */
  let respondWith = 200;
  let receiverHits = 0;

  beforeAll(async () => {
    db = new Pool({ connectionString: DATABASE_URL });
    server = createServer((_req, res) => {
      receiverHits++;
      res.statusCode = respondWith;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: respondWith < 300 }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address() as AddressInfo;
    receiverUrl = `http://127.0.0.1:${addr.port}/hook`;
  });

  afterAll(async () => {
    /* deliveries, attempts y echo_messages caen por ON DELETE CASCADE */
    await db.query(`DELETE FROM endpoints WHERE session_id LIKE $1`, [`${SESSION_PREFIX}%`]);
    await db.query(`DELETE FROM events WHERE session_id LIKE $1`, [`${SESSION_PREFIX}%`]);
    await db.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /* Un endpoint apuntando al receiver local y n deliveries pending
     (una por evento), como las deja POST /api/events antes del drain. */
  async function seedDeliveries(sessionId: string, n: number): Promise<string[]> {
    const ep = await db.query<{ id: string }>(
      `INSERT INTO endpoints (session_id, name, url, secret) VALUES ($1, 'vitest receiver', $2, 'whsec_vitest')
       RETURNING id`,
      [sessionId, receiverUrl],
    );
    const endpointId = firstRow(ep.rows).id;
    const deliveryIds: string[] = [];
    for (let i = 0; i < n; i++) {
      const eventId = `evt_${randomUUID()}`;
      await db.query(
        `INSERT INTO events (id, session_id, event_type, payload) VALUES ($1, $2, 'vitest.case', '{}'::jsonb)`,
        [eventId, sessionId],
      );
      const d = await db.query<{ id: string }>(
        `INSERT INTO deliveries (session_id, event_id, endpoint_id) VALUES ($1, $2, $3) RETURNING id`,
        [sessionId, eventId, endpointId],
      );
      deliveryIds.push(firstRow(d.rows).id);
    }
    return deliveryIds;
  }

  it(
    'dos drains concurrentes nunca procesan la misma delivery (SKIP LOCKED)',
    async () => {
      const sessionId = `${SESSION_PREFIX}concurrency`;
      respondWith = 200;
      receiverHits = 0;
      await seedDeliveries(sessionId, 6);

      /* Dos pools = dos conexiones, como dos invocaciones serverless
         pisándose (dos pestañas llamando a /api/tick a la vez). */
      const poolA = new Pool({ connectionString: DATABASE_URL });
      const poolB = new Pool({ connectionString: DATABASE_URL });
      try {
        const [a, b] = await Promise.all([
          drainPendingDeliveries(poolA, { sessionId }),
          drainPendingDeliveries(poolB, { sessionId }),
        ]);

        /* Entre ambos procesaron todo, sin duplicar: si un drain hubiera
           reclamado una fila ya tomada habría intentos de más. */
        expect(a.processed + b.processed).toBe(6);
        expect(a.delivered + b.delivered).toBe(6);
        expect(receiverHits).toBe(6);

        const audit = firstRow(
          (
            await db.query<{ attempts: number; distinct_deliveries: number; delivered: number }>(
              `SELECT count(a.id)::int AS attempts,
                      count(DISTINCT a.delivery_id)::int AS distinct_deliveries,
                      count(DISTINCT d.id) FILTER (WHERE d.status = 'delivered' AND d.attempt_count = 1)::int AS delivered
               FROM deliveries d
               LEFT JOIN delivery_attempts a ON a.delivery_id = d.id
               WHERE d.session_id = $1`,
              [sessionId],
            )
          ).rows,
        );
        expect(audit.attempts).toBe(6);
        expect(audit.distinct_deliveries).toBe(6);
        expect(audit.delivered).toBe(6);
      } finally {
        await poolA.end();
        await poolB.end();
      }
    },
    60_000,
  );

  it(
    'un fallo programa el retry del schedule y el claim no lo toma antes de tiempo',
    async () => {
      const sessionId = `${SESSION_PREFIX}backoff`;
      respondWith = 500;
      const [deliveryId] = await seedDeliveries(sessionId, 1);

      const first = await drainPendingDeliveries(db, { sessionId });
      expect(first).toMatchObject({ processed: 1, retrying: 1, delivered: 0, deadLettered: 0 });

      /* Tras el primer fallo: retrying, un intento y next_attempt_at unos
         10 s en el futuro (medido contra el now() de Postgres; el margen
         inferior absorbe los RTTs entre el UPDATE y este SELECT). */
      const afterFail = firstRow(
        (
          await db.query<{ status: string; attempt_count: number; wait_s: number }>(
            `SELECT status, attempt_count, EXTRACT(EPOCH FROM (next_attempt_at - now()))::float8 AS wait_s
             FROM deliveries WHERE id = $1`,
            [deliveryId],
          )
        ).rows,
      );
      expect(afterFail.status).toBe('retrying');
      expect(afterFail.attempt_count).toBe(1);
      expect(afterFail.wait_s).toBeGreaterThan(4);
      expect(afterFail.wait_s).toBeLessThanOrEqual(10);

      /* Sin vencer todavía: el claim no debe encontrar nada. */
      const early = await drainPendingDeliveries(db, { sessionId });
      expect(early.processed).toBe(0);

      /* Vencerla a mano en vez de dormir 10 s; el endpoint ya respondió
         bien, así que el siguiente drain la entrega en el intento 2. */
      await db.query(`UPDATE deliveries SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, [
        deliveryId,
      ]);
      respondWith = 200;
      const second = await drainPendingDeliveries(db, { sessionId });
      expect(second).toMatchObject({ processed: 1, delivered: 1 });

      const recovered = firstRow(
        (
          await db.query<{ status: string; attempt_count: number; next_attempt_at: string | null }>(
            `SELECT status, attempt_count, next_attempt_at FROM deliveries WHERE id = $1`,
            [deliveryId],
          )
        ).rows,
      );
      expect(recovered).toMatchObject({ status: 'delivered', attempt_count: 2, next_attempt_at: null });
    },
    60_000,
  );

  it(
    'el sexto fallo consecutivo pasa a dead letter y la cola lo suelta',
    async () => {
      const sessionId = `${SESSION_PREFIX}deadletter`;
      respondWith = 500;
      const [deliveryId] = await seedDeliveries(sessionId, 1);

      /* Seis intentos fallidos seguidos, venciendo el backoff a mano
         entre cada uno (el schedule real tardaría 12 minutos). */
      for (let attempt = 1; attempt <= 6; attempt++) {
        const result = await drainPendingDeliveries(db, { sessionId });
        expect(result.processed).toBe(1);
        await db.query(
          `UPDATE deliveries SET next_attempt_at = now() - interval '1 second'
           WHERE id = $1 AND status = 'retrying'`,
          [deliveryId],
        );
      }

      const dead = firstRow(
        (
          await db.query<{ status: string; attempt_count: number; next_attempt_at: string | null; attempts: number }>(
            `SELECT d.status, d.attempt_count, d.next_attempt_at,
                    (SELECT count(*)::int FROM delivery_attempts a WHERE a.delivery_id = d.id) AS attempts
             FROM deliveries d WHERE d.id = $1`,
            [deliveryId],
          )
        ).rows,
      );
      expect(dead).toMatchObject({ status: 'dead_lettered', attempt_count: 6, next_attempt_at: null, attempts: 6 });

      /* Dead letter es terminal: aunque "venza", el claim ya no la ve. */
      const after = await drainPendingDeliveries(db, { sessionId });
      expect(after.processed).toBe(0);
    },
    120_000,
  );
});
