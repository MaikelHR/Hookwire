import { createHash, randomBytes } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { headerValue } from './http.js';

/* Acepta tanto el cliente HTTP de neon() como Pool: solo necesitamos query
   con placeholders y no usamos el resultado. */
interface Queryable {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

/* Id determinístico por sesión: sembrar es idempotente aunque dos requests
   lo intenten a la vez (la PK convierte la carrera en un upsert en vez de
   dejar dos endpoints demo duplicados). */
function demoEndpointId(sessionId: string): string {
  const h = createHash('sha256').update(`hookwire-demo-endpoint:${sessionId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/* URL base pública del deploy. Se prefiere el dominio estable de producción
   (variable de sistema de Vercel) para que la URL sembrada no cambie entre
   deploys; fuera de Vercel cae al host del request (vercel dev, local). */
export function getBaseUrl(req: VercelRequest): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const proto = headerValue(req.headers['x-forwarded-proto']) ?? 'http';
  const host = headerValue(req.headers['x-forwarded-host']) ?? req.headers.host ?? 'localhost:3000';
  return `${proto}://${host}`;
}

/* Garantiza que la sesión tenga el endpoint "Demo receiver (echo)" apuntando
   al /api/echo de este mismo deploy. Si ya existe solo corrige la URL (por
   si se sembró desde otro entorno); el secret se conserva. */
export async function ensureDemoEndpoint(db: Queryable, sessionId: string, baseUrl: string): Promise<void> {
  const id = demoEndpointId(sessionId);
  const url = `${baseUrl}/api/echo`;
  const secret = 'whsec_' + randomBytes(16).toString('hex');
  await db.query(
    `INSERT INTO endpoints (id, session_id, name, url, secret)
     VALUES ($1, $2, 'Demo receiver (echo)', $3, $4)
     ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url`,
    [id, sessionId, url, secret],
  );
}
