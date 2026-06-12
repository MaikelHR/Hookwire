import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPool } from './_lib/db.js';
import { getSessionId } from './_lib/session.js';
import { drainPendingDeliveries, type DrainResult } from '../src/lib/server/drain.js';

/* El "reloj" de la cola. No hay worker 24/7 (decisión de arquitectura,
   costo $0): mientras el dashboard está abierto llama aquí cada ~4 s y
   este handler ejecuta el mismo drain que usa POST /api/events, que
   reclama las deliveries vencidas de la sesión (retrying cuyo
   next_attempt_at ya pasó, o pending que un drain anterior no alcanzó).

   Es seguro ante llamadas concurrentes (dos pestañas abiertas): el claim
   FOR NO KEY UPDATE SKIP LOCKED garantiza que cada delivery la procesa
   exactamente un drain y el resto la salta; lo demuestra el test de
   integración de src/lib/server/drain.integration.test.ts. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  const sessionId = getSessionId(req);
  const pool = createPool();
  try {
    const drain: DrainResult = await drainPendingDeliveries(pool, { sessionId });
    res.status(200).json({ ok: true, drain });
  } catch (err) {
    console.error('tick error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  } finally {
    await pool.end();
  }
}
