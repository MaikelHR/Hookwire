import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getSql } from './_lib/db.js';
import { getSessionId } from './_lib/session.js';
import { ensureDemoEndpoint, getBaseUrl } from './_lib/seed.js';

/* El único campo editable desde la UI es el toggle de la demo. El WHERE
   por session_id evita que una sesión toque endpoints de otra. */
const patchSchema = z.object({
  id: z.uuid(),
  simulateFailure: z.boolean(),
});

interface EndpointRow {
  id: string;
  name: string;
  url: string;
  secret: string;
  disabled: boolean;
  simulate_failure: boolean;
  created_at: string;
  total_attempts: number;
  ok_attempts: number;
  last_ok_at: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const sql = getSql();
  const sessionId = getSessionId(req);

  if (req.method === 'PATCH') {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'invalid body: id (uuid) and simulateFailure (boolean) are required' });
      return;
    }
    try {
      const rows = (await sql.query(
        `UPDATE endpoints SET simulate_failure = $3 WHERE id = $1 AND session_id = $2 RETURNING id`,
        [parsed.data.id, sessionId, parsed.data.simulateFailure],
      )) as Array<{ id: string }>;
      if (rows.length === 0) {
        res.status(404).json({ ok: false, error: 'endpoint not found' });
        return;
      }
      res.status(200).json({ ok: true, simulateFailure: parsed.data.simulateFailure });
    } catch (err) {
      console.error('endpoints PATCH error:', err);
      res.status(500).json({ ok: false, error: 'internal error' });
    }
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  try {
    /* Sembrar aquí garantiza que el primer load del dashboard ya tenga el
       Demo receiver, antes incluso de publicar el primer evento. */
    await ensureDemoEndpoint(sql, sessionId, getBaseUrl(req));

    const rows = (await sql.query(
      `SELECT e.id, e.name, e.url, e.secret, e.disabled, e.simulate_failure, e.created_at,
              COALESCE(stats.total_attempts, 0) AS total_attempts,
              COALESCE(stats.ok_attempts, 0) AS ok_attempts,
              stats.last_ok_at
       FROM endpoints e
       LEFT JOIN LATERAL (
         SELECT count(a.id)::int AS total_attempts,
                (count(a.id) FILTER (WHERE a.response_status BETWEEN 200 AND 299))::int AS ok_attempts,
                max(a.created_at) FILTER (WHERE a.response_status BETWEEN 200 AND 299) AS last_ok_at
         FROM deliveries d
         JOIN delivery_attempts a ON a.delivery_id = d.id
         WHERE d.endpoint_id = e.id
       ) stats ON TRUE
       WHERE e.session_id = $1
       ORDER BY e.created_at`,
      [sessionId],
    )) as EndpointRow[];

    res.status(200).json({
      ok: true,
      endpoints: rows.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        status: r.disabled ? 'disabled' : r.simulate_failure ? 'failing' : 'healthy',
        simulateFailure: r.simulate_failure,
        successRate: r.total_attempts > 0 ? (r.ok_attempts / r.total_attempts) * 100 : 100,
        lastDeliveryAt: r.last_ok_at,
        secret: r.secret,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('endpoints error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}
