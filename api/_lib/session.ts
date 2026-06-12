import type { VercelRequest } from '@vercel/node';

/* Fase 1: una única sesión compartida por todos los visitantes. En la Fase 4
   esto leerá (o creará) la cookie anónima del visitante. Todo el resto del
   código ya recibe session_id como parámetro, así que ese cambio queda
   contenido en esta función. */
export function getSessionId(_req: VercelRequest): string {
  return 'demo';
}
