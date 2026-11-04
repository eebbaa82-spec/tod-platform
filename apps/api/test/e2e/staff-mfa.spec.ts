import { INestApplication } from '@nestjs/common';
import { authenticator } from 'otplib';
import { PrismaService } from '../../src/common/prisma.service';
import { bootApp, client, staff, STAFF } from '../helpers';

// FR-ACC-04: staff sign in with an authenticator app. A code from the
// previous 30-second step is still accepted; an older one is not.

let app: INestApplication;

beforeAll(async () => {
  app = await bootApp();
  await staff(app, STAFF.mel); // makes sure the account is enrolled
});

afterAll(async () => {
  await app.close();
});

describe('Staff authenticator codes', () => {
  const codeAt = (secret: string, offsetSeconds: number) => authenticator.clone({ epoch: Date.now() + offsetSeconds * 1000, window: 0 }).generate(secret);

  it('accepts a code from the previous step and refuses one two steps old', async () => {
    const u = await app.get(PrismaService).user.findUniqueOrThrow({ where: { phone: STAFF.mel } });
    const anon = client(app);
    const ok = await anon.post('/auth/login', { phone: STAFF.mel, password: 'ChangeMe-2026!', mfaCode: codeAt(u.mfaSecret!, -30) });
    expect(ok.token).toBeTruthy();
    const old = await anon.post('/auth/login', { phone: STAFF.mel, password: 'ChangeMe-2026!', mfaCode: codeAt(u.mfaSecret!, -90) }, 400);
    expect(old.code).toBe('MFA_INVALID');
  });
});
