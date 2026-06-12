/* ============================================================
   Test de integración de la idempotencia de publicación contra
   Postgres REAL (Neon), el caso que solo existe con la base de
   datos de verdad: dos requests con el MISMO event_id llegando a
   la vez (cliente que reintenta porque la red le cortó la
   respuesta, doble click, etc.).

   La garantía bajo prueba: la PK compuesta (session_id, id) más
   ON CONFLICT DO NOTHING hacen que exactamente UNA transacción
   inserte el evento y cree deliveries; la otra ve el conflicto
   (espera el COMMIT de la primera si aún está en vuelo) y termina
   como duplicado sin efectos. Sin esto, un reintento de red
   duplicaría el webhook hacia todos los suscriptores.

   Misma convención que drain.integration.test.ts: DATABASE_URL
   sale de .env y sin él el describe entero se salta.
   ============================================================ */
import { randomUUID } from 'node:crypto';
import ws from 'ws';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publishEvent } from './publish';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_PREFIX = `vitest-publish-${Date.now()}-`;

describe.skipIf(!DATABASE_URL)('publicación idempotente (Postgres real)', () => {
  let db: Pool;

  beforeAll(() => {
    db = new Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    /* deliveries y attempts caen por ON DELETE CASCADE */
    await db.query(`DELETE FROM endpoints WHERE session_id LIKE $1`, [`${SESSION_PREFIX}%`]);
    await db.query(`DELETE FROM events WHERE session_id LIKE $1`, [`${SESSION_PREFIX}%`]);
    await db.end();
  });

  it(
    'el mismo event_id publicado dos veces en paralelo crea un solo evento y un solo set de deliveries',
    async () => {
      const sessionId = `${SESSION_PREFIX}concurrent`;
      await db.query(
        `INSERT INTO endpoints (session_id, name, url, secret)
         VALUES ($1, 'vitest receiver', 'http://127.0.0.1:9/never-called', 'whsec_vitest')`,
        [sessionId],
      );

      const eventId = `evt_${randomUUID()}`;
      const input = { id: eventId, eventType: 'vitest.duplicate', payload: { n: 1 } };

      /* Dos pools = dos conexiones, como dos invocaciones serverless
         procesando el mismo POST reintentado por el cliente. */
      const poolA = new Pool({ connectionString: DATABASE_URL });
      const poolB = new Pool({ connectionString: DATABASE_URL });
      let results: [Awaited<ReturnType<typeof publishEvent>>, Awaited<ReturnType<typeof publishEvent>>];
      try {
        results = await Promise.all([
          publishEvent(poolA, sessionId, input),
          publishEvent(poolB, sessionId, input),
        ]);
      } finally {
        await poolA.end();
        await poolB.end();
      }

      /* Exactamente una ganó la inserción; la otra terminó duplicada y
         sin crear trabajo. */
      const winners = results.filter((r) => !r.duplicate);
      const duplicates = results.filter((r) => r.duplicate);
      expect(winners).toHaveLength(1);
      expect(duplicates).toHaveLength(1);
      expect(winners[0]?.deliveriesCreated).toBe(1);
      expect(duplicates[0]?.deliveriesCreated).toBe(0);

      /* El estado en la base de datos confirma lo que reportaron. */
      const audit = (
        await db.query<{ events: number; deliveries: number }>(
          `SELECT (SELECT count(*)::int FROM events WHERE session_id = $1 AND id = $2) AS events,
                  (SELECT count(*)::int FROM deliveries WHERE session_id = $1 AND event_id = $2) AS deliveries`,
          [sessionId, eventId],
        )
      ).rows[0];
      expect(audit).toMatchObject({ events: 1, deliveries: 1 });
    },
    60_000,
  );

  it('un reintento posterior del mismo event_id tampoco re-encola nada', async () => {
    const sessionId = `${SESSION_PREFIX}retry`;
    await db.query(
      `INSERT INTO endpoints (session_id, name, url, secret)
       VALUES ($1, 'vitest receiver', 'http://127.0.0.1:9/never-called', 'whsec_vitest')`,
      [sessionId],
    );
    const input = { id: `evt_${randomUUID()}`, eventType: 'vitest.retry', payload: {} };

    const first = await publishEvent(db, sessionId, input);
    const second = await publishEvent(db, sessionId, input);

    expect(first).toMatchObject({ duplicate: false, deliveriesCreated: 1 });
    expect(second).toMatchObject({ duplicate: true, deliveriesCreated: 0 });
  });
});
