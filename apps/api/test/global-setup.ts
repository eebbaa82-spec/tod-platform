import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Rebuilds the test database from the migrations and loads the seed data.
// Refuses to touch any database whose name does not end in _test.
export default async function () {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://tod:tod@localhost:5432/tod_test';
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`Refusing to reset ${name}: the test database name must end in _test.`);
  const env = { ...process.env, DATABASE_URL: url, APP_ENV: 'test' };
  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  await prisma.$disconnect();
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  execSync('npx ts-node --transpile-only prisma/seed.ts', { env, stdio: 'ignore' });
}
