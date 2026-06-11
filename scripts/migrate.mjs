/* Runner de migraciones: aplica los .sql de /migrations en orden alfabético,
   registrando cada uno en schema_migrations para no re-aplicarlo.
   Uso: npm run db:migrate (lee DATABASE_URL de .env o del entorno). */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from '@neondatabase/serverless';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL no está definida. Copia .env.example a .env y pon el connection string de Neon.');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function main() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (ya aplicada)`);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`+ ${file} aplicada`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  console.log('Migraciones al día.');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
