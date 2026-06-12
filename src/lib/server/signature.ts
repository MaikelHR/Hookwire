/* ============================================================
   Firma y verificación de webhooks (módulo puro de servidor: solo
   node:crypto, sin red ni base de datos, testeable en aislamiento).

   Esquema estilo Stripe: el header X-Hookwire-Signature lleva
   "t=<unix>,v1=<hex64>" donde v1 = HMAC-SHA256(secret, "<t>.<body>").

   Por qué cada pieza:
   - HMAC y no un hash simple de secret+body: SHA-256 es Merkle-Damgard
     y hash(secret || body) permite ataques de length extension (un
     atacante extiende el body y recalcula el hash sin saber el secreto).
     La construcción anidada de HMAC lo impide.
   - El timestamp va DENTRO de lo firmado y no solo en el header: si
     fuera un header suelto, un atacante que capture una entrega podría
     re-enviarla más tarde cambiando t a uno fresco (replay). Firmado,
     cualquier t distinto invalida v1, y la tolerancia de 5 minutos
     acota la ventana en la que una captura sirve de algo.
   - Se firma y verifica el body CRUDO (los bytes del wire), nunca un
     JSON re-serializado: JSON no es canónico (orden de claves, espacios,
     escapes unicode, formato de números) y parse+stringify puede
     producir bytes distintos a los firmados, rompiendo la verificación
     de mensajes legítimos. Peor: verificar una re-serialización abre
     hueco entre "lo que verifiqué" y "lo que recibí".
   ============================================================ */
import { createHmac, timingSafeEqual } from 'node:crypto';

/* Ventana aceptada entre el t firmado y el reloj del receptor: absorbe
   skew de relojes y latencia, y deja inservible una captura vieja. */
export const SIGNATURE_TOLERANCE_S = 300;

export function signPayload(secret: string, body: string, unixSeconds: number): string {
  const mac = createHmac('sha256', secret).update(`${unixSeconds}.${body}`).digest('hex');
  return `t=${unixSeconds},v1=${mac}`;
}

/* Formato estricto: unix en decimal y exactamente 64 hex (32 bytes de
   SHA-256). Rechazar lo malformado aquí no filtra nada del secreto:
   todavía no se ha computado ningún MAC. */
const SIGNATURE_HEADER_RE = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/;

export function verifySignature(
  secret: string,
  rawBody: Buffer | string,
  signatureHeader: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_S,
): boolean {
  const match = SIGNATURE_HEADER_RE.exec(signatureHeader);
  const timestampStr = match?.[1];
  const receivedHex = match?.[2];
  if (timestampStr === undefined || receivedHex === undefined) return false;

  const timestamp = Number(timestampStr);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  /* Recalcular con la copia local del secreto y comparar en tiempo
     constante: un === de strings corta en el primer byte distinto y el
     tiempo de respuesta se vuelve un oráculo para forjar la firma byte
     a byte. timingSafeEqual recorre siempre los 32 bytes (la regex ya
     garantiza longitudes iguales, que es su precondición). */
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(receivedHex, 'hex'));
}
