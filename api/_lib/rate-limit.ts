import type { Pool } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { headerValue } from './http.js';

/* Rate limit por IP con ventana DESLIZANTE sobre Postgres: en vez de buckets
   fijos que se resetean en punto (y permiten ráfagas dobles en el borde), se
   cuentan los hits reales de los últimos windowS segundos. Cada request
   permitida deja una fila en rate_limit_hits; las denegadas NO insertan, así
   martillar la API durante el 429 no extiende el castigo.

   Todo ocurre en UNA query: el CTE cuenta la ventana, el INSERT condicional
   solo se ejecuta si hay cupo, y se devuelve el veredicto con el Retry-After
   calculado por Postgres (cuándo sale de la ventana el hit más viejo). Dos
   requests simultáneas pueden colarse ambas por la carrera entre el count y
   el insert; para una demo ese margen de error es irrelevante y evita
   serializar con locks. */

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterS: number;
}

interface VerdictRow {
  allowed: boolean;
  retry_after_s: number | null;
}

export async function checkRateLimit(
  pool: Pool,
  key: string,
  limit: number,
  windowS: number,
): Promise<RateLimitVerdict> {
  const result = await pool.query(
    `WITH recent AS (
       SELECT count(*)::int AS n, min(created_at) AS oldest
       FROM rate_limit_hits
       WHERE key = $1 AND created_at > now() - make_interval(secs => $2)
     ), ins AS (
       INSERT INTO rate_limit_hits (key)
       SELECT $1 WHERE (SELECT n FROM recent) < $3
       RETURNING 1
     )
     SELECT EXISTS (SELECT FROM ins) AS allowed,
            GREATEST(1, ceil($2 - EXTRACT(EPOCH FROM (now() - (SELECT oldest FROM recent)))))::int AS retry_after_s`,
    [key, windowS, limit],
  );
  const row = result.rows[0] as VerdictRow;
  return { allowed: row.allowed, retryAfterS: row.retry_after_s ?? windowS };
}

/* En Vercel el edge sobreescribe x-forwarded-for con la IP real del cliente
   (no es spoofeable con un header inventado); el primer valor de la lista es
   el cliente original. Fuera de Vercel (vercel dev) cae al socket. */
export function clientIp(req: VercelRequest): string {
  const forwarded = headerValue(req.headers['x-forwarded-for']);
  const first = forwarded?.split(',')[0]?.trim();
  if (first !== undefined && first !== '') return first;
  return req.socket.remoteAddress ?? 'unknown';
}

/* Responde el 429 con Retry-After en segundos (el estándar HTTP) y lo
   repite en el body para que la UI muestre el toast sin parsear headers. */
export function sendRateLimited(res: VercelResponse, verdict: RateLimitVerdict): void {
  res.setHeader('Retry-After', String(verdict.retryAfterS));
  res.status(429).json({ ok: false, error: 'rate limit exceeded', retryAfterS: verdict.retryAfterS });
}
