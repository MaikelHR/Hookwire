import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from './_lib/db.js';
import { getSessionId } from './_lib/session.js';
import { headerValue } from './_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* El "Demo receiver" de la demo: el destino al que Hookwire entrega los
   webhooks de la sesión. POST guarda lo recibido para que la consola echo
   del dashboard lo muestre; GET lo lista. La sesión se resuelve buscando la
   delivery del header X-Hookwire-Delivery: si no corresponde a una delivery
   real, el mensaje se rechaza (el endpoint es público). */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const sql = getSql();

  if (req.method === 'POST') {
    const deliveryId = headerValue(req.headers['x-hookwire-delivery']);
    const eventType = headerValue(req.headers['x-hookwire-event']) ?? 'unknown';
    const attempt = Number(headerValue(req.headers['x-hookwire-attempt'])) || 1;
    if (!deliveryId || !UUID_RE.test(deliveryId)) {
      res.status(400).json({ ok: false, error: 'missing or invalid X-Hookwire-Delivery header' });
      return;
    }
    try {
      const rows = (await sql.query('SELECT session_id FROM deliveries WHERE id = $1', [deliveryId])) as Array<{
        session_id: string;
      }>;
      const delivery = rows[0];
      if (!delivery) {
        res.status(404).json({ ok: false, error: 'unknown delivery' });
        return;
      }
      await sql.query(
        `INSERT INTO echo_messages (session_id, delivery_id, event_type, attempt, status_code)
         VALUES ($1, $2, $3, $4, $5)`,
        [delivery.session_id, deliveryId, eventType, attempt, 200],
      );
      res.status(200).json({ ok: true, received: true });
    } catch (err) {
      console.error('echo POST error:', err);
      res.status(500).json({ ok: false, error: 'internal error' });
    }
    return;
  }

  if (req.method === 'GET') {
    try {
      const sessionId = getSessionId(req);
      const rows = (await sql.query(
        `SELECT id, event_type, attempt, status_code, received_at
         FROM echo_messages
         WHERE session_id = $1
         ORDER BY received_at DESC
         LIMIT 30`,
        [sessionId],
      )) as Array<{ id: string; event_type: string; attempt: number; status_code: number; received_at: string }>;
      res.status(200).json({
        ok: true,
        messages: rows.map((r) => ({
          id: r.id,
          eventType: r.event_type,
          attempt: r.attempt,
          statusCode: r.status_code,
          receivedAt: r.received_at,
        })),
      });
    } catch (err) {
      console.error('echo GET error:', err);
      res.status(500).json({ ok: false, error: 'internal error' });
    }
    return;
  }

  res.status(405).json({ ok: false, error: 'method not allowed' });
}
