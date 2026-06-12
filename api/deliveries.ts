import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from './_lib/db';
import { getSessionId } from './_lib/session';

interface DeliveryRow {
  id: string;
  event_id: string;
  endpoint_id: string;
  status: string;
  next_attempt_at: string | null;
  signature: string | null;
  created_at: string;
  event_type: string;
  payload: Record<string, unknown>;
  latency_ms: number | null;
  attempts: Array<{ ts: string; statusCode: number; durationMs: number; body: string }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  const sql = getSql();
  const sessionId = getSessionId(req);
  try {
    /* Última hora, igual que anuncia la UI ("attempts · last hour"). El
       json_agg arma el timeline de intentos en la misma query; la latencia
       de una delivered es desde su creación hasta el intento exitoso. */
    const rows = (await sql.query(
      `SELECT d.id, d.event_id, d.endpoint_id, d.status, d.next_attempt_at, d.signature, d.created_at,
              ev.event_type, ev.payload,
              CASE WHEN d.status = 'delivered' THEN (
                SELECT EXTRACT(EPOCH FROM (max(a2.created_at) - d.created_at)) * 1000
                FROM delivery_attempts a2
                WHERE a2.delivery_id = d.id AND a2.response_status BETWEEN 200 AND 299
              )::float8 END AS latency_ms,
              COALESCE(att.attempts, '[]'::json) AS attempts
       FROM deliveries d
       JOIN events ev ON ev.session_id = d.session_id AND ev.id = d.event_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'ts', a.created_at,
                  'statusCode', COALESCE(a.response_status, 0),
                  'durationMs', COALESCE(a.duration_ms, 0),
                  'body', COALESCE(a.response_body_snippet, a.error, '')
                ) ORDER BY a.attempt_number) AS attempts
         FROM delivery_attempts a
         WHERE a.delivery_id = d.id
       ) att ON TRUE
       WHERE d.session_id = $1 AND d.created_at > now() - interval '60 minutes'
       ORDER BY d.created_at DESC
       LIMIT 100`,
      [sessionId],
    )) as DeliveryRow[];

    res.status(200).json({
      ok: true,
      deliveries: rows.map((r) => ({
        id: r.id,
        eventId: r.event_id,
        eventType: r.event_type,
        endpointId: r.endpoint_id,
        status: r.status,
        attempts: r.attempts,
        nextAttemptAt: r.next_attempt_at,
        latencyMs: r.latency_ms,
        payload: r.payload,
        signature: r.signature,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('deliveries error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}
