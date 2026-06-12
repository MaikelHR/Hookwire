import type { Pool } from '@neondatabase/serverless';

/* Expiración de sesiones sin cron externo (costo $0): corre al inicio de
   cada POST /api/tick, que el dashboard ya dispara cada ~4 s. Borra por
   created_at y deja que la cascada de FKs haga el resto:
   events -> deliveries -> delivery_attempts / echo_messages, y
   endpoints -> deliveries. La cookie de sesión caduca a las mismas 24h
   (api/_lib/session.ts), así que nunca se borran datos de una cookie viva.

   Es un DELETE barato: con los índices por created_at (migración 004) y
   normalmente cero filas vencidas, cuesta ~1 ms por tick. Los contadores
   del rate limit solo importan dentro de su ventana de minutos; 1 hora de
   retención es de sobra. */

export interface CleanupResult {
  events: number;
  endpoints: number;
  rateLimitHits: number;
}

export async function cleanupExpired(pool: Pool): Promise<CleanupResult> {
  const result = await pool.query(
    `WITH del_events AS (
       DELETE FROM events WHERE created_at < now() - interval '24 hours' RETURNING 1
     ), del_endpoints AS (
       DELETE FROM endpoints WHERE created_at < now() - interval '24 hours' RETURNING 1
     ), del_hits AS (
       DELETE FROM rate_limit_hits WHERE created_at < now() - interval '1 hour' RETURNING 1
     )
     SELECT (SELECT count(*) FROM del_events)::int AS events,
            (SELECT count(*) FROM del_endpoints)::int AS endpoints,
            (SELECT count(*) FROM del_hits)::int AS rate_limit_hits`,
  );
  const row = result.rows[0] as { events: number; endpoints: number; rate_limit_hits: number };
  return { events: row.events, endpoints: row.endpoints, rateLimitHits: row.rate_limit_hits };
}
