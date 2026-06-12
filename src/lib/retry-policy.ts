/* ============================================================
   Política de reintentos de Hookwire.

   Módulo puro a propósito: sin red, sin base de datos, sin reloj.
   El drain del servidor lo usa para decidir el destino de cada
   intento, la UI lo usa para anotar el timeline del drawer y
   Vitest lo testea aislado. Es la única fuente del schedule: si
   el backoff cambia algún día, cambia solo aquí.
   ============================================================ */

/* Espera en segundos antes del reintento que sigue al intento N
   (índice N-1): tras fallar el intento 1 se espera 10s, tras el 2,
   30s, y así. Schedule aprobado en el handoff de diseño; el README
   lo cita como contrato de la cola. */
export const BACKOFF_SCHEDULE_S = [10, 30, 90, 300, 300] as const;

/* Intentos totales: el inicial más los 5 reintentos del schedule.
   Al fallar el sexto, la delivery pasa a dead letter y la cola no
   vuelve a tocarla (solo el replay manual la revive). */
export const MAX_ATTEMPTS = BACKOFF_SCHEDULE_S.length + 1;

export type AttemptOutcome =
  | { status: 'delivered' }
  | { status: 'retrying'; retryDelayS: number }
  | { status: 'dead_lettered' };

/* Solo 2xx cuenta como entregado. Todo lo demás reintenta, incluidos
   los 4xx: para un emisor de webhooks un 404 puede ser un deploy a
   medias del receptor, tan transitorio como un 500. NULL significa
   que no hubo respuesta (timeout o error de red). */
export function isSuccess(responseStatus: number | null): boolean {
  return responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
}

/* Decide el destino de una delivery después del intento attemptNumber
   (1-based). El delay se indexa por número de intento y no se inventa
   fuera del schedule: un replay manual posterior al dead letter (los
   intentos 7 en adelante) que vuelve a fallar regresa directo a dead
   letter. */
export function resolveAttemptOutcome(responseStatus: number | null, attemptNumber: number): AttemptOutcome {
  if (isSuccess(responseStatus)) return { status: 'delivered' };
  const retryDelayS = attemptNumber >= MAX_ATTEMPTS ? undefined : BACKOFF_SCHEDULE_S[attemptNumber - 1];
  if (retryDelayS === undefined) return { status: 'dead_lettered' };
  return { status: 'retrying', retryDelayS };
}
