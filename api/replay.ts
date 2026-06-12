import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { createPool } from './_lib/db.js';
import { getSessionId } from './_lib/session.js';
import { checkRateLimit, clientIp, sendRateLimited } from './_lib/rate-limit.js';
import { drainPendingDeliveries, type DrainResult } from '../src/lib/server/drain.js';

const replaySchema = z.object({ deliveryId: z.uuid() });

/* Cada replay dispara un POST real al endpoint suscrito; mismo presupuesto
   de escritura que los eventos pero con su propia cuenta. */
const REPLAY_LIMIT = 60;
const REPLAY_WINDOW_S = 5 * 60;

/* Replay manual desde el drawer: revive una delivery que ya terminó
   (típicamente dead_lettered cuando el endpoint se recupera; también
   re-envía una delivered o adelanta una retrying). Vuelve a 'pending'
   con next_attempt_at NULL, es decir elegible ya, y el drain inline de
   abajo intenta entregarla en esta misma request.

   attempt_count NO se resetea: delivery_attempts exige números de
   intento únicos y el timeline debe contar la historia real. Si el
   endpoint sigue roto, la política devuelve el intento extra directo a
   dead letter en vez de inventar más esperas. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  const parsed = replaySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid body: deliveryId (uuid) is required' });
    return;
  }
  const sessionId = getSessionId(req, res);
  const pool = createPool();
  try {
    const verdict = await checkRateLimit(pool, `replay:${clientIp(req)}`, REPLAY_LIMIT, REPLAY_WINDOW_S);
    if (!verdict.allowed) {
      sendRateLimited(res, verdict);
      return;
    }

    const requeued = await pool.query(
      `UPDATE deliveries
       SET status = 'pending', next_attempt_at = NULL, updated_at = now()
       WHERE id = $1 AND session_id = $2 AND status <> 'pending'
       RETURNING id`,
      [parsed.data.deliveryId, sessionId],
    );
    if (requeued.rows.length === 0) {
      res.status(404).json({ ok: false, error: 'delivery not found or already queued' });
      return;
    }

    let drain: DrainResult | null = null;
    let drainError: string | null = null;
    try {
      drain = await drainPendingDeliveries(pool, { sessionId });
    } catch (err) {
      drainError = err instanceof Error ? err.message : String(err);
      console.error('replay drain error:', err);
    }

    res.status(200).json({ ok: true, drain, ...(drainError !== null ? { drainError } : {}) });
  } catch (err) {
    console.error('replay error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  } finally {
    await pool.end();
  }
}
