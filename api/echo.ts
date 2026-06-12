import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from './_lib/db.js';
import { getSessionId } from './_lib/session.js';
import { headerValue } from './_lib/http.js';
import { verifySignature } from '../src/lib/server/signature.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* La verificación HMAC necesita los BYTES EXACTOS que viajaron por el wire,
   no el req.body parseado (re-serializar JSON puede producir bytes distintos
   y romper firmas legítimas). Los helpers de @vercel/node leen el body para
   construir req.body pero lo restauran en el stream del request (restoreBody
   re-cablea on('data')/on('end') a un PassThrough con los bytes originales),
   así que volver a leer el stream entrega el body crudo intacto. */
function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* El "Demo receiver" de la demo: el destino al que Hookwire entrega los
   webhooks de la sesión. POST verifica la firma y guarda lo recibido para
   que la consola echo del dashboard lo muestre; GET lo lista. La sesión se
   resuelve buscando la delivery del header X-Hookwire-Delivery: si no
   corresponde a una delivery real, el mensaje se rechaza (el endpoint es
   público). */
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
      const rawBody = await readRawBody(req);
      const rows = (await sql.query(
        `SELECT d.session_id, e.simulate_failure, e.secret
         FROM deliveries d
         JOIN endpoints e ON e.id = d.endpoint_id
         WHERE d.id = $1`,
        [deliveryId],
      )) as Array<{ session_id: string; simulate_failure: boolean; secret: string }>;
      const delivery = rows[0];
      if (!delivery) {
        res.status(404).json({ ok: false, error: 'unknown delivery' });
        return;
      }
      /* Modo fallo de la demo: el receiver se comporta como un endpoint
         caído y responde 500 sin procesar nada. El drain recibe este 500
         de verdad y programa el reintento con backoff; aquí no hay nada
         simulado por la UI. No se registra echo_message: la consola solo
         muestra webhooks aceptados, igual que un receptor real roto que
         no procesó el mensaje. */
      if (delivery.simulate_failure) {
        res.status(500).json({ ok: false, error: 'simulated failure (demo toggle is on)' });
        return;
      }
      /* Verificación con la copia local del secreto, como haría cualquier
         suscriptor real de Hookwire. Una firma inválida NO rechaza el
         mensaje: la demo lo registra con verified=false para que el badge
         rojo cuente la historia (responder 4xx solo dispararía reintentos
         igual de inválidos y la consola no mostraría nada). */
      const signatureHeader = headerValue(req.headers['x-hookwire-signature']) ?? '';
      const verified = verifySignature(delivery.secret, rawBody, signatureHeader);
      await sql.query(
        `INSERT INTO echo_messages (session_id, delivery_id, event_type, attempt, status_code, verified)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [delivery.session_id, deliveryId, eventType, attempt, 200, verified],
      );
      res.status(200).json({ ok: true, received: true, verified });
    } catch (err) {
      console.error('echo POST error:', err);
      res.status(500).json({ ok: false, error: 'internal error' });
    }
    return;
  }

  if (req.method === 'GET') {
    try {
      const sessionId = getSessionId(req, res);
      const rows = (await sql.query(
        `SELECT id, event_type, attempt, status_code, verified, received_at
         FROM echo_messages
         WHERE session_id = $1
         ORDER BY received_at DESC
         LIMIT 30`,
        [sessionId],
      )) as Array<{
        id: string;
        event_type: string;
        attempt: number;
        status_code: number;
        verified: boolean;
        received_at: string;
      }>;
      res.status(200).json({
        ok: true,
        messages: rows.map((r) => ({
          id: r.id,
          eventType: r.event_type,
          attempt: r.attempt,
          statusCode: r.status_code,
          verified: r.verified,
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
