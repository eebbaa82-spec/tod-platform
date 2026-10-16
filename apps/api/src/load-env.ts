// Loads apps/api/.env when present (Node 22). Real deployments set variables directly.
try {
  if (!process.env.DATABASE_URL) process.loadEnvFile('.env');
} catch {
  /* no .env file */
}
