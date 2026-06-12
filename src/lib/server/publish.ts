/* ============================================================
   Publicación de un evento (código de servidor, lo importa
   POST /api/events; extraído a módulo para testear la garantía
   de idempotencia contra Postgres real).

   Evento + deliveries en una sola transacción: o se publica completo
   (con su trabajo encolado) o no se publica nada.

   La idempotencia la da la PK compuesta (session_id, id) con el id
   generado por el CLIENTE: si la red corta la respuesta y el cliente
   reintenta el mismo POST, el ON CONFLICT convierte el duplicado en un
   no-op. Funciona también bajo concurrencia: dos transacciones que
   insertan la misma PK a la vez no fallan ni duplican, la segunda
   espera el COMMIT de la primera y su ON CONFLICT DO NOTHING devuelve
   cero filas, así que tampoco crea deliveries.
   ============================================================ */
import type { Pool } from '@neondatabase/serverless';

export interface PublishEventInput {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface PublishEventResult {
  duplicate: boolean;
  deliveriesCreated: number;
}

export async function publishEvent(
  pool: Pool,
  sessionId: string,
  input: PublishEventInput,
): Promise<PublishEventResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const inserted = await client.query(
        `INSERT INTO events (id, session_id, event_type, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (session_id, id) DO NOTHING
         RETURNING id`,
        [input.id, sessionId, input.eventType, JSON.stringify(input.payload)],
      );
      if (inserted.rows.length === 0) {
        await client.query('COMMIT');
        return { duplicate: true, deliveriesCreated: 0 };
      }
      const deliveries = await client.query(
        `INSERT INTO deliveries (session_id, event_id, endpoint_id)
         SELECT $1, $2, id FROM endpoints
         WHERE session_id = $1 AND disabled = FALSE
         RETURNING id`,
        [sessionId, input.id],
      );
      await client.query('COMMIT');
      return { duplicate: false, deliveriesCreated: deliveries.rows.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}
