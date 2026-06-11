# Hookwire

Servicio de entrega de webhooks construido como proyecto de portafolio. Las apps publican
eventos vía `POST /api/events` y Hookwire garantiza la entrega a los endpoints suscritos
con reintentos, backoff exponencial, firma HMAC y dead-letter queue. Es una demo pública
autocontenida: un reclutador entra, manda un evento de prueba, ve la entrega en vivo,
simula un fallo y observa los reintentos — todo en menos de un minuto, sin configurar nada.

## Arquitectura (decisiones firmes, costo $0 — no re-discutir)

- **Frontend:** React + TypeScript estricto + Tailwind (Vite). El diseño de referencia
  high-fidelity vive en `design_handoff_hookwire_dashboard/` (leer su README primero).
  Configuración aprobada: dirección visual **graphite**, accent **#b07ce8**, density
  **comfy** (row padding 12px). Las variantes `phosphor`/`carbon` del CSS se ignoran;
  `tweaks-panel.jsx` NO se porta.
- **Capa de datos del frontend:** TODA la data pasa por `src/lib/data-service.ts` y sus
  hooks tipados (`useStats`, `useEndpoints`, `useDeliveries`, `useEcho`, `useFailureMode`,
  `useDemoActions`). La UI nunca toca el store directamente. En Fase 0 es un mock con
  simulación; en fases siguientes se conecta a la API real **sin tocar componentes**.
- **Backend:** Vercel Functions (Node + TypeScript) en `/api`. NO hay worker 24/7.
- **Base de datos:** Neon Postgres (free tier). Patrón de cola sobre Postgres con
  `SELECT ... FOR UPDATE SKIP LOCKED`.
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
- **Driver de DB:** `@neondatabase/serverless` — queries por HTTP sin estado, ideal para
  funciones serverless (no se agota un pool TCP con cada cold start).
- **Secretos:** `DATABASE_URL` solo se lee en `/api` y en el script de migraciones.
  Nunca llega al cliente (Vite solo expone variables con prefijo `VITE_`).

## Esquema de base de datos

Migraciones SQL versionadas en `/migrations`, aplicadas con `npm run db:migrate`
(el runner registra lo aplicado en `schema_migrations`).

- **endpoints** — destinos suscritos de una sesión.
  `id UUID PK`, `session_id TEXT NOT NULL`, `name`, `url`, `secret` (firma HMAC),
  `disabled BOOL`, `simulate_failure BOOL` (toggle de la demo), `created_at`.
  Índice por `session_id`.
- **events** — eventos publicados por el cliente.
  `id TEXT` (lo genera el CLIENTE: clave de idempotencia), `session_id TEXT NOT NULL`,
  `event_type`, `payload JSONB`, `created_at`. **PK compuesta `(session_id, id)`**
  (= el UNIQUE requerido; compuesta porque ids de clientes distintos pueden colisionar
  entre sesiones sin ser conflicto real).
- **deliveries** — la unidad de trabajo de la cola: una fila por (evento × endpoint).
  `id UUID PK`, `session_id`, `event_id` + FK compuesta `(session_id, event_id)` →
  events, `endpoint_id FK`, `status` CHECK
  (`pending|delivered|retrying|failed|dead_lettered`), `attempt_count`,
  `next_attempt_at`, `created_at`, `updated_at`.
  Índice parcial `(next_attempt_at) WHERE status IN ('pending','retrying')` para el
  drain de la cola; índices por sesión y por endpoint.
- **delivery_attempts** — historial de cada intento HTTP (timeline del drawer).
  `id UUID PK`, `delivery_id FK`, `attempt_number`, `response_status` (NULL si no hubo
  respuesta), `response_body_snippet`, `duration_ms`, `error`, `created_at`.
  `UNIQUE (delivery_id, attempt_number)`.

## Fases del proyecto

- **Fase 0 — Scaffold + UI + fundaciones** ✅ completada
  Vite + React + TS estricto + Tailwind + ESLint; UI pixel-perfect recreada del handoff
  con data-service mock; `/api/health` con `SELECT 1` contra Neon; migración inicial
  (4 tablas); CLAUDE.md; deploy a Vercel (hookwire.vercel.app).
- **Fase 1 — API real de lectura/escritura**
  Sesión anónima por cookie; CRUD de endpoints; `POST /api/events` con idempotencia y
  rate limit por IP; creación de deliveries; drain inline en la misma request (firma
  HMAC, intento HTTP, registro de attempts).
- **Fase 2 — Cola y reintentos**
  `POST /api/tick` (polling del dashboard cada 3-5 s) que toma deliveries vencidas con
  `FOR UPDATE SKIP LOCKED`, ejecuta intentos, aplica backoff y dead-letter a los 6
  intentos; replay manual.
- **Fase 3 — Conectar el frontend a la API real**
  Sustituir el mock de `src/lib/data-service.ts` por fetch a `/api/*` manteniendo los
  hooks idénticos (cero cambios en componentes); echo receiver real; expiración de
  sesión a 24h.
- **Fase 4 — Pulido y portfolio**
  Rate limiting fino, cleanup job de sesiones, README público con diagrama de
  arquitectura, link real de GitHub en el modal de bienvenida, métricas P95 reales.

## Reglas de trabajo

- TypeScript estricto, sin `any`. Conventional commits.
- No agregar alcance sin preguntar (nada de auth, multi-tenancy real, websockets;
  el polling es decisión deliberada).
- Si una decisión resulta inviable, explicar el problema y proponer alternativa
  **antes** de cambiarla.
- Explicar brevemente cada pieza nueva: el dueño del proyecto está aprendiendo colas,
  garantías de entrega y HMAC, y quiere poder defender cada línea en entrevista.

## Comandos

- `npm run dev` — dev server de Vite (solo UI; las functions corren con `vercel dev`)
- `npm run build` — typecheck (`tsc --noEmit`) + build de producción
- `npm run lint` — ESLint
- `npm run db:migrate` — aplica las migraciones pendientes (lee `DATABASE_URL` de `.env`)
