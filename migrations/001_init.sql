-- 001_init.sql: esquema inicial de Hookwire
--
-- Modelo: events (lo que publica el cliente) -> deliveries (un intento de
-- entrega por endpoint suscrito, es la unidad de trabajo de la cola) ->
-- delivery_attempts (historial de cada intento HTTP).
-- Todo lleva session_id: la demo aísla los datos por visitante anónimo
-- (cookie) y un cleanup borra sesiones de más de 24h.

-- Endpoints suscritos de una sesión. secret firma los webhooks (HMAC SHA-256).
-- simulate_failure es el toggle de la demo: el receiver responde 500 mientras esté ON.
CREATE TABLE endpoints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       TEXT NOT NULL,
  name             TEXT NOT NULL,
  url              TEXT NOT NULL,
  secret           TEXT NOT NULL,
  disabled         BOOLEAN NOT NULL DEFAULT FALSE,
  simulate_failure BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_endpoints_session ON endpoints (session_id);

-- Eventos publicados vía POST /api/events. El id lo genera el CLIENTE y es
-- la clave de idempotencia: reintentar el mismo POST no duplica el evento.
-- PK compuesta (session_id, id) = el UNIQUE (session_id, id) requerido;
-- compuesta porque ids generados por clientes distintos pueden colisionar
-- entre sesiones sin ser un conflicto real.
CREATE TABLE events (
  id         TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, id)
);

CREATE INDEX idx_events_session_created ON events (session_id, created_at DESC);

-- Cola de entregas sobre Postgres: una fila por (evento x endpoint).
-- El "drain" toma filas vencidas con SELECT ... FOR UPDATE SKIP LOCKED,
-- por eso el índice parcial sobre next_attempt_at solo para estados activos.
CREATE TABLE deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT NOT NULL,
  event_id        TEXT NOT NULL,
  endpoint_id     UUID NOT NULL REFERENCES endpoints (id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'delivered', 'retrying', 'failed', 'dead_lettered')),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, event_id) REFERENCES events (session_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_deliveries_due ON deliveries (next_attempt_at)
  WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_deliveries_session_created ON deliveries (session_id, created_at DESC);
CREATE INDEX idx_deliveries_endpoint ON deliveries (endpoint_id);

-- Historial de intentos HTTP de cada delivery (timeline del drawer).
-- response_status es NULL cuando no hubo respuesta (timeout o error de red; el detalle queda en error).
CREATE TABLE delivery_attempts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           UUID NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
  attempt_number        INTEGER NOT NULL,
  response_status       INTEGER,
  response_body_snippet TEXT,
  duration_ms           INTEGER,
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, attempt_number)
);
