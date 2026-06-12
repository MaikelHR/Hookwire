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
  `useDemoActions`). La UI nunca toca el transporte directamente. Desde la Fase 1
  consume la API real con TanStack Query (polling `refetchInterval` 4 s); el cambio
  de mock a API real no tocó ningún componente, como estaba previsto.
- **Backend:** Vercel Functions (Node + TypeScript) en `/api`. NO hay worker 24/7.
- **Base de datos:** Neon Postgres (free tier). Patrón de cola sobre Postgres con
  `SELECT ... FOR NO KEY UPDATE SKIP LOCKED` (NO KEY UPDATE y no FOR UPDATE: las FKs
  que referencian deliveries toman FOR KEY SHARE al insertar, y FOR UPDATE las
  bloquearía generando interbloqueo con el propio echo receiver durante el drain).
- **Procesamiento:** al publicar un evento, la misma request ejecuta un "drain" inline.
  Además existirá `POST /api/tick` (Fase 2) que el dashboard llama por polling cada 3-5 s
  mientras está abierto, para disparar reintentos vencidos. El polling es una decisión
  deliberada (no websockets).
- **Reintentos:** backoff `10s, 30s, 90s, 5m, 5m`; máximo **6 intentos** y la delivery
  pasa a dead-letter.
- **Firma:** header `X-Hookwire-Signature` con HMAC SHA-256 (secreto por endpoint),
  formato `t=<unix>,v1=<hex64>`.
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
- **Fase 2: Cola y reintentos**
  `POST /api/tick` (polling del dashboard cada 3-5 s) que reusa el drain para tomar
  deliveries vencidas, aplica backoff (10s/30s/90s/5m/5m) y dead-letter a los 6
  intentos; replay manual; toggle "Simulate endpoint failure" funcional
  (simulate_failure hace que el echo responda 500).
- **Fase 3: Verificación de firma**
  El echo receiver verifica la firma HMAC con el secreto del endpoint y el badge
  "Signature verified" pasa a ser real (hoy está deshabilitado con "coming soon").
- **Fase 4: Multi-visitante y pulido**
  Sesión anónima por cookie (sustituir la sesión fija 'demo' en `api/_lib/session.ts`),
  aislamiento por visitante, expiración a 24h, rate limit por IP, cleanup job,
  README público con diagrama de arquitectura.

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
- `npm run db:migrate`: aplica las migraciones pendientes (lee `DATABASE_URL` de `.env`)
