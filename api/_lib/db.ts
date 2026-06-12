import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

/* WebSocket explícito para que Pool (transacciones interactivas) funcione en
   cualquier runtime de Node, tenga o no WebSocket global. El driver HTTP no
   lo necesita, pero configurarlo aquí cubre a todos los handlers. */
neonConfig.webSocketConstructor = ws;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return url;
}

export type Sql = ReturnType<typeof neon>;

/* Cliente HTTP de Neon: cada query es un request sin estado. Para lecturas
   sueltas es lo más barato (no abre conexión). No soporta BEGIN/COMMIT. */
export function getSql(): Sql {
  return neon(databaseUrl());
}

/* Pool sobre WebSocket para transacciones interactivas (el claim del drain
   con FOR UPDATE SKIP LOCKED las necesita). Crear por invocación y cerrar
   con pool.end() en un finally para no dejar la conexión colgada. */
export function createPool(): Pool {
  return new Pool({ connectionString: databaseUrl() });
}
