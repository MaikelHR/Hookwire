import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { createPool } from './_lib/db.js';
import { getSessionId } from './_lib/session.js';
import { ensureDemoEndpoint, getBaseUrl } from './_lib/seed.js';
import { publishEvent } from '../src/lib/server/publish.js';
import { drainPendingDeliveries, type DrainResult } from '../src/lib/server/drain.js';

/* El id lo genera el CLIENTE y es la clave de idempotencia: si la red corta
   la respuesta y el cliente reintenta el mismo POST, el ON CONFLICT de la PK
   (session_id, id) convierte el duplicado en un 200 sin efectos. */
const eventSchema = z.object({
  id: z.string().trim().min(1).max(128),
  event_type: z.string().trim().min(1).max(128),
  payload: z.looseObject({}),
});

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'invalid body',
      details: parsed.error.issues.map((i) => `${i.path.map(String).join('.') || 'body'}: ${i.message}`),
    });
    return;
  }

  const sessionId = getSessionId(req);
  const { id, event_type, payload } = parsed.data;
  const pool = createPool();
  try {
    await ensureDemoEndpoint(pool, sessionId, getBaseUrl(req));

    /* La transacción de publicación vive en src/lib/server/publish.ts
       (compartida con el test de idempotencia concurrente). */
    const published = await publishEvent(pool, sessionId, { id, eventType: event_type, payload });

    if (published.duplicate) {
      const existing = await pool.query(
        `SELECT id, event_type, created_at FROM events WHERE session_id = $1 AND id = $2`,
        [sessionId, id],
      );
      res.status(200).json({ ok: true, duplicate: true, event: existing.rows[0] });
      return;
    }

    /* Drain inline: la misma request entrega lo que acaba de encolar. Si el
       drain falla, el evento YA quedó publicado; se reporta sin romper. */
    let drain: DrainResult | null = null;
    let drainError: string | null = null;
    try {
      drain = await drainPendingDeliveries(pool, { sessionId });
    } catch (err) {
      drainError = err instanceof Error ? err.message : String(err);
      console.error('drain error:', err);
    }

    res.status(201).json({
      ok: true,
      duplicate: false,
      eventId: id,
      deliveriesCreated: published.deliveriesCreated,
      drain,
      ...(drainError !== null ? { drainError } : {}),
    });
  } catch (err) {
    console.error('events error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  } finally {
    await pool.end();
  }
}
