import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

/* Health check: verifica que la función puede hablar con Neon.
   Usamos el driver HTTP de @neondatabase/serverless: cada query es un
   request HTTP sin estado, ideal para funciones serverless (no hay pool
   TCP que agotar ni conexión que mantener entre cold starts). */
export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    res.status(500).json({ ok: false, db: false, error: 'DATABASE_URL is not configured' });
    return;
  }
  try {
    const sql = neon(url);
    await sql`SELECT 1`;
    res.status(200).json({ ok: true, db: true });
  } catch (err) {
    console.error('health check db error:', err);
    res.status(500).json({ ok: false, db: false });
  }
}
