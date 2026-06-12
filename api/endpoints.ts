import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from './_lib/db.js';
import { getSessionId } from './_lib/session.js';
import { ensureDemoEndpoint, getBaseUrl } from './_lib/seed.js';

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
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  const sql = getSql();
  const sessionId = getSessionId(req);
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
        /* simulate_failure marca al endpoint como Failing en la UI; el toggle
           que lo activa llega en la Fase 2. */
        status: r.disabled ? 'disabled' : r.simulate_failure ? 'failing' : 'healthy',
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
