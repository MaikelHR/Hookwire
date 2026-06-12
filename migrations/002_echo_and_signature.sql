-- 002_echo_and_signature.sql: receiver de la demo y firma enviada

-- echo_messages: lo que recibe POST /api/echo (el "Demo receiver (echo)" de la UI).
-- Guarda lo mínimo que la consola echo del dashboard necesita mostrar.
-- La sesión no viene en el request: se resuelve buscando la delivery del header
-- X-Hookwire-Delivery, así el endpoint público no acepta filas arbitrarias
-- que no correspondan a una delivery real.
CREATE TABLE echo_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,
  delivery_id UUID NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  attempt     INTEGER NOT NULL DEFAULT 1,
  status_code INTEGER NOT NULL DEFAULT 200,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_echo_session_received ON echo_messages (session_id, received_at DESC);

-- Firma HMAC realmente enviada en el último intento de la delivery, para
-- mostrarla en el drawer del dashboard. NULL hasta el primer intento.
ALTER TABLE deliveries ADD COLUMN signature TEXT;
