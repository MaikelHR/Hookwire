-- 003_echo_verified.sql: resultado de la verificación de firma en el receiver

-- El echo receiver recalcula la firma X-Hookwire-Signature sobre el body
-- crudo con su copia del secreto del endpoint y guarda el veredicto.
-- DEFAULT FALSE es fail-closed: si un insert no se pronuncia, el mensaje
-- cuenta como no verificado.
ALTER TABLE echo_messages ADD COLUMN verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: las filas previas a esta migración las produjo el propio drain
-- firmando correctamente (la verificación aún no existía en el receiver).
-- Se marcan TRUE para no mostrar alarmas falsas en la consola echo.
UPDATE echo_messages SET verified = TRUE;
