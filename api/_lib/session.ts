import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/* Sesión anónima por visitante (Fase 4). La primera petición no trae cookie:
   se genera un UUID, se devuelve en Set-Cookie y TODAS las queries filtran
   por él, así cada navegador ve solo sus propios datos sin login.

   - httpOnly: el JS del cliente no necesita leerla (todo pasa por /api) y
     así un XSS no puede robarla.
   - SameSite=Lax: la UI y la API comparten origen; ningún tercero puede
     disparar requests autenticadas desde otro sitio.
   - Secure: solo viaja por https (los navegadores tratan localhost como
     contexto seguro, así que vercel dev en http://localhost también funciona).
   - Max-Age 24h SIN renovar en cada request: la cookie muere a las 24h de
     la PRIMERA visita, alineada con el cleanup que borra los datos por
     created_at (api/_lib/cleanup.ts). El visitante simplemente estrena
     sesión vacía, como un primer load.

   Solo se acepta un UUID bien formado: una cookie manipulada no inyecta
   session_id arbitrarios en la base (y adivinar el UUID aleatorio de otra
   sesión no es viable). */
const COOKIE_NAME = 'hookwire_session';
const MAX_AGE_S = 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getSessionId(req: VercelRequest, res: VercelResponse): string {
  const existing = req.cookies[COOKIE_NAME];
  if (existing !== undefined && UUID_RE.test(existing)) return existing;

  const sessionId = randomUUID();
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax; Secure`,
  );
  return sessionId;
}
