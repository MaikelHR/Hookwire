-- 004_sessions_and_rate_limit.sql: demo multi-visitante

-- Contador del rate limit por IP (ventana deslizante sobre Postgres).
-- Cada request permitida inserta una fila; contar las filas de la ventana
-- decide si la siguiente pasa. key = '<scope>:<ip>' (p. ej. 'events:1.2.3.4')
-- para que cada endpoint protegido tenga su propio presupuesto.
-- Las filas viejas las barre el cleanup del tick (no necesitan TTL propio).
CREATE TABLE rate_limit_hits (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El chequeo es count(*) sobre (key, ventana): este índice lo resuelve solo.
CREATE INDEX idx_rate_limit_key_created ON rate_limit_hits (key, created_at DESC);

-- Las sesiones expiran a las 24h: el cleanup borra por created_at y la
-- cascada de FKs arrastra deliveries, delivery_attempts y echo_messages.
-- Índices por created_at para que ese DELETE no haga seq scan al crecer.
CREATE INDEX idx_events_created ON events (created_at);
CREATE INDEX idx_endpoints_created ON endpoints (created_at);
