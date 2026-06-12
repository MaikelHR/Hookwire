# Hookwire

Servicio de entrega de webhooks construido como proyecto de portafolio. Las apps publican
eventos vía `POST /api/events` y Hookwire garantiza la entrega a los endpoints suscritos
con reintentos, backoff exponencial, firma HMAC y dead-letter queue. Es una demo pública
autocontenida: un reclutador entra, manda un evento de prueba, ve la entrega en vivo,
simula un fallo y observa los reintentos, todo en menos de un minuto y sin configurar nada.

## Arquitectura (decisiones firmes, costo $0, no re-discutir)

- **Frontend:** React + TypeScript estricto + Tailwind (Vite). El diseño de referencia
  high-fidelity vive en `design_handoff_hookwire_dashboard/` (leer su README primero).
  Configuración aprobada: dirección visual **graphite**, accent **#b07ce8**, density
  **comfy** (row padding 12px). Las variantes `phosphor`/`carbon` del CSS se ignoran y
  `tweaks-panel.jsx` NO se porta.
- **Capa de datos del frontend:** TODA la data pasa por `src/lib/data-service.ts` y sus
  hooks tipados (`useStats`, `useEndpoints`, `useDeliveries`, `useEcho`, `useFailureMode`,
  `useTick`, `useDemoActions`). La UI nunca toca el transporte directamente. Desde la
  Fase 1 consume la API real con TanStack Query (polling `refetchInterval` 4 s); el
  cambio de mock a API real no tocó ningún componente, como estaba previsto.
- **Backend:** Vercel Functions (Node + TypeScript) en `/api`. NO hay worker 24/7.
- **Base de datos:** Neon Postgres (free tier). Patrón de cola sobre Postgres con
  `SELECT ... FOR NO KEY UPDATE SKIP LOCKED` (NO KEY UPDATE y no FOR UPDATE: las FKs
  que referencian deliveries toman FOR KEY SHARE al insertar, y FOR UPDATE las
  bloquearía generando interbloqueo con el propio echo receiver durante el drain).
- **Procesamiento:** al publicar un evento, la misma request ejecuta un "drain" inline.
  Además `POST /api/tick` dispara los reintentos vencidos: `useTick` lo llama cada 4 s
  mientras la pestaña está visible (visibilitychange pausa el interval) y solo si el
  cache muestra deliveries pending o retrying, para no quemar invocaciones del free
  tier. El polling es una decisión deliberada (no websockets).
- **Reintentos:** backoff `10s, 30s, 90s, 5m, 5m`; máximo **6 intentos** y la delivery
  pasa a dead-letter. La política vive en `src/lib/retry-policy.ts` (módulo puro
  compartido por el drain del server y la UI: `BACKOFF_SCHEDULE_S`, `MAX_ATTEMPTS`,
  `resolveAttemptOutcome`); el README la citará como contrato de la cola.
- **Firma:** header `X-Hookwire-Signature` con HMAC SHA-256 (secreto por endpoint),
  formato `t=<unix>,v1=<hex64>` donde v1 firma `"<t>.<raw_body>"`. Firma y
  verificación viven en `src/lib/server/signature.ts` (módulo puro:
  `signPayload`, `verifySignature` con `crypto.timingSafeEqual` y tolerancia
  de 5 min en el timestamp).
- **Idempotencia:** `event_id` generado por el cliente + unique constraint
  `(session_id, id)` en `events`.
- **Demo multi-visitante:** sesión anónima por cookie, datos aislados por `session_id`,
  expiración a 24h, rate limit por IP en `/api/events`.
- **Driver de DB:** `@neondatabase/serverless`. Hace queries por HTTP sin estado, ideal
  para funciones serverless (no se agota un pool TCP con cada cold start).
- **Secretos:** `DATABASE_URL` solo se lee en `/api` y en el script de migraciones.
  Nunca llega al cliente (Vite solo expone variables con prefijo `VITE_`).

## Esquema de base de datos

Migraciones SQL versionadas en `/migrations`, aplicadas con `npm run db:migrate`
(el runner registra lo aplicado en `schema_migrations`).

- **endpoints**: destinos suscritos de una sesión.
  `id UUID PK`, `session_id TEXT NOT NULL`, `name`, `url`, `secret` (firma HMAC),
  `disabled BOOL`, `simulate_failure BOOL` (toggle de la demo), `created_at`.
  Índice por `session_id`.
- **events**: eventos publicados por el cliente.
  `id TEXT` (lo genera el CLIENTE: clave de idempotencia), `session_id TEXT NOT NULL`,
  `event_type`, `payload JSONB`, `created_at`. **PK compuesta `(session_id, id)`**
  (equivale al UNIQUE requerido; es compuesta porque ids de clientes distintos pueden
  colisionar entre sesiones sin ser conflicto real).
- **deliveries**: la unidad de trabajo de la cola, una fila por (evento x endpoint).
  `id UUID PK`, `session_id`, `event_id` + FK compuesta `(session_id, event_id)` hacia
  events, `endpoint_id FK`, `status` CHECK
  (`pending|delivered|retrying|failed|dead_lettered`), `attempt_count`,
  `next_attempt_at`, `created_at`, `updated_at`.
  Índice parcial `(next_attempt_at) WHERE status IN ('pending','retrying')` para el
  drain de la cola; índices por sesión y por endpoint.
- **delivery_attempts**: historial de cada intento HTTP (timeline del drawer).
  `id UUID PK`, `delivery_id FK`, `attempt_number`, `response_status` (NULL si no hubo
  respuesta), `response_body_snippet`, `duration_ms`, `error`, `created_at`.
  `UNIQUE (delivery_id, attempt_number)`.

## Fases del proyecto

- **Fase 0: Scaffold + UI + fundaciones (COMPLETADA)**
  Vite + React + TS estricto + Tailwind + ESLint; UI pixel-perfect recreada del handoff
  con data-service mock; `/api/health` con `SELECT 1` contra Neon; migración inicial
  (4 tablas); CLAUDE.md; deploy a Vercel (hookwire.vercel.app).
- **Fase 1: Núcleo de entrega end-to-end (COMPLETADA)**
  Existe el camino feliz completo en producción: `POST /api/events` (zod, idempotencia
  por id de cliente, deliveries por endpoint activo) con drain inline reutilizable
  (`src/lib/server/drain.ts`: claim FOR NO KEY UPDATE SKIP LOCKED, firma HMAC, timeout
  5 s, registro en delivery_attempts), echo receiver real (`/api/echo` + tabla
  echo_messages), APIs de lectura (`/api/endpoints`, `/api/deliveries`, `/api/stats`)
  y frontend consumiendo la API real vía TanStack Query. Sesión fija 'demo'
  parametrizada; sin reintentos aún (next_attempt_at queda NULL).
- **Fase 2: Cola y reintentos (COMPLETADA)**
  La política de reintentos es `src/lib/retry-policy.ts` y el drain la aplica: el claim
  toma pending y retrying vencidas comparando `next_attempt_at` con el `now()` de
  Postgres (la misma fuente de tiempo que lo escribió al fallar) y cada fallo programa
  el siguiente paso del schedule o el dead-letter al sexto intento. `POST /api/tick`
  reusa el drain (seguro entre pestañas por SKIP LOCKED, demostrado en
  `src/lib/server/drain.integration.test.ts`); `POST /api/replay` re-encola una
  delivery terminada sin resetear `attempt_count` (el historial es real y los intentos
  posteriores al dead-letter que fallan vuelven directo a dead-letter). El toggle
  "Simulate endpoint failure" persiste vía PATCH `/api/endpoints` con `z.guid()`, no
  `z.uuid()` (el id del endpoint demo es un SHA-256 truncado sin nibbles RFC 4122), y
  `/api/echo` responde 500 real con el toggle activo, sin registrar echo_message. UI:
  countdown en vivo, contador de intentos, timeline con backoff y pill Dead-lettered
  (componentes del handoff que ya existían, ahora con datos reales). Tests Vitest:
  política pura sin red ni DB, e integración contra Neon (concurrencia, backoff
  persistido, dead-letter terminal).
- **Fase 3: Verificación de firma (COMPLETADA)**
  La firma se extrajo de drain.ts al módulo puro `src/lib/server/signature.ts` y el
  echo receiver la verifica de verdad: relee el body CRUDO del stream del request
  (los helpers de `@vercel/node` lo restauran tras construir `req.body`; verificar
  una re-serialización rompería firmas legítimas porque JSON no es canónico),
  recalcula el HMAC con su copia del secreto, compara con `crypto.timingSafeEqual`
  (sin oráculo de timing) y exige `|now - t| <= 5 min` (anti-replay). El veredicto
  persiste en `echo_messages.verified` (migración 003, `DEFAULT FALSE` fail-closed)
  y el badge "Signature verified" del echo console es real (verde/rojo). Una firma
  inválida se registra con verified=false en vez de rechazarse: decisión de demo
  para que el badge rojo cuente la historia. La publicación se extrajo a
  `src/lib/server/publish.ts` y un test de integración prueba la idempotencia
  concurrente (mismo event_id dos veces en Promise.all con dos pools: un solo
  evento, un solo set de deliveries). Tests puros de la firma: secreto alterado,
  body manipulado, JSON equivalente con bytes distintos, timestamp fuera de
  ventana y header malformado, todos verified=false.
- **Fase 4: Multi-visitante y pulido (COMPLETADA, proyecto v1 completo)**
  `getSessionId` crea una cookie httpOnly + SameSite=Lax + Secure con UUID en la
  primera petición (Max-Age 24h SIN renovar: muere junto con los datos); como todo
  el código ya recibía session_id, el cambio quedó contenido en `api/_lib/session.ts`.
  Cada sesión recibe su Demo receiver con secreto propio (el seed on-demand ya era
  idempotente). Expiración: `api/_lib/cleanup.ts` corre al inicio de cada
  `POST /api/tick` (DELETE por created_at a 24h, cascada de FKs, sin cron externo).
  Rate limit por IP con ventana deslizante sobre Postgres (`api/_lib/rate-limit.ts`,
  una sola query con CTE que cuenta la ventana e inserta el hit solo si hay cupo):
  30 eventos/5min en `/api/events`, 60/5min en `/api/replay`, 429 con Retry-After
  en header y body; la UI lo muestra como toast (`src/lib/toasts.ts`, el data
  service captura el ApiError 429). `useFirstLoad` (queries reales compartiendo
  queryKey) reemplazó al useFakeLoad del mock, eliminado. k6 en `/load-test`
  (smoke 10 VUs p95 217ms; delivery-flow p95 339ms con drain inline; burst que
  demuestra el 429 exacto a los 30 de la ventana), resultados commiteados.
  README público en inglés con Mermaid, design decisions y tabla k6.

## Reglas de trabajo

- TypeScript estricto, sin `any`. Conventional commits.
- No agregar alcance sin preguntar (nada de auth, multi-tenancy real, websockets;
  el polling es decisión deliberada).
- Si una decisión resulta inviable, explicar el problema y proponer alternativa
  **antes** de cambiarla.
- Explicar brevemente cada pieza nueva: el dueño del proyecto está aprendiendo colas,
  garantías de entrega y HMAC, y quiere poder defender cada línea en entrevista.

## Comandos

- `npm run dev`: dev server de Vite (la UI local proxea `/api` al deploy de
  producción; para correr las functions en local usar `vercel dev`)
- `npm run build`: typecheck (`tsc --noEmit`) + build de producción
- `npm run lint`: ESLint
- `npm test`: Vitest; los tests de integración del drain leen `DATABASE_URL` de `.env`
  (sin él se saltan y solo corren los puros)
- `npm run db:migrate`: aplica las migraciones pendientes (lee `DATABASE_URL` de `.env`)
