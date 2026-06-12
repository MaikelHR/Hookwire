import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from './_lib/db.js';
import { getSessionId } from './_lib/session.js';

const CHART_BUCKETS = 12;
const BUCKET_MS = 5 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  const sql = getSql();
  const sessionId = getSessionId(req, res);
  try {
    const [publishedRows, statusRows, p95Rows, chartRows] = (await Promise.all([
      sql.query(`SELECT count(*)::int AS published FROM events WHERE session_id = $1`, [sessionId]),
      sql.query(`SELECT status, count(*)::int AS n FROM deliveries WHERE session_id = $1 GROUP BY status`, [
        sessionId,
      ]),
      /* P95 sobre la duración de los intentos exitosos (latencia del POST
         al endpoint, no incluye el tiempo en cola). */
      sql.query(
        `SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY a.duration_ms) AS p95
         FROM delivery_attempts a
         JOIN deliveries d ON d.id = a.delivery_id
         WHERE d.session_id = $1 AND a.response_status BETWEEN 200 AND 299`,
        [sessionId],
      ),
      sql.query(
        `SELECT created_at FROM deliveries
         WHERE session_id = $1 AND created_at > now() - interval '60 minutes'`,
        [sessionId],
      ),
    ])) as [
      Array<{ published: number }>,
      Array<{ status: string; n: number }>,
      Array<{ p95: number | null }>,
      Array<{ created_at: string }>,
    ];

    const byStatus = new Map(statusRows.map((r) => [r.status, r.n]));
    const delivered = byStatus.get('delivered') ?? 0;
    const failed = (byStatus.get('failed') ?? 0) + (byStatus.get('dead_lettered') ?? 0);
    const pendingRetries = (byStatus.get('pending') ?? 0) + (byStatus.get('retrying') ?? 0);
    const finished = delivered + failed;

    /* 12 buckets de 5 minutos, del más viejo al más nuevo, contando las
       deliveries creadas en cada tramo (la serie del area chart). */
    const chart = new Array<number>(CHART_BUCKETS).fill(0);
    const now = Date.now();
    for (const row of chartRows) {
      const age = now - Date.parse(row.created_at);
      const idx = CHART_BUCKETS - 1 - Math.min(CHART_BUCKETS - 1, Math.floor(age / BUCKET_MS));
      chart[idx] = (chart[idx] ?? 0) + 1;
    }

    res.status(200).json({
      ok: true,
      stats: {
        published: publishedRows[0]?.published ?? 0,
        successRate: finished > 0 ? (delivered / finished) * 100 : 100,
        p95: Math.round(p95Rows[0]?.p95 ?? 0),
        pendingRetries,
        chart,
      },
    });
  } catch (err) {
    console.error('stats error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}
