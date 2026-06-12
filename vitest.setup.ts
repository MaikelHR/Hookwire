/* Carga .env para que los tests de integración (drain contra Neon) lean
   DATABASE_URL, igual que hace npm run db:migrate. Sin .env solo corren
   los tests puros: los de integración se saltan solos con skipIf. */
try {
  process.loadEnvFile('.env');
} catch {
  /* sin .env: no hay nada que cargar */
}
