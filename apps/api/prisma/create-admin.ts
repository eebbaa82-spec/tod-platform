import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { normalisePhone } from '../src/common/phone';

// Creates the first super administrator on a new server, where the seed adds no
// staff. Usage: npm run admin:create -w apps/api -- <phone> "<full name>"
// The other staff accounts are then created from the console.

const prisma = new PrismaClient();

async function main() {
  const [phoneArg, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ').trim();
  if (!phoneArg || !name) {
    console.error('Usage: npm run admin:create -w apps/api -- <phone> "<full name>"');
    process.exitCode = 1;
    return;
  }
  const phone = normalisePhone(phoneArg);
  if (await prisma.user.findUnique({ where: { phone } })) {
    console.error(`An account with ${phone} already exists. Give it the role from the console instead.`);
    process.exitCode = 1;
    return;
  }
  const password = randomBytes(9).toString('base64url');
  await prisma.user.create({
    data: { phone, displayName: name, roles: ['SUPER_ADMIN'], status: 'ACTIVE', passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Super administrator created for ${phone}.`);
  console.log(`Temporary password: ${password}`);
  console.log('Sign in, add the authenticator app when asked, then change the password with "Forgot password".');
}

main().finally(() => prisma.$disconnect());
