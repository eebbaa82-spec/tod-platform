import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/prisma.service';
import { IDENTITY_CHECK_CONSENT } from '../../src/me/me.service';
import { Api, bootApp, register, staff, STAFF } from '../helpers';

// Requirements Definition V-005, section 4.2: identity is confirmed through
// the partner bank, with consent recorded before each request.

let app: INestApplication;
let prisma: PrismaService;
let vet: Api;

beforeAll(async () => {
  app = await bootApp();
  prisma = app.get(PrismaService);
  vet = (await staff(app, STAFF.vetting)).api;
});

afterAll(async () => {
  await app.close();
});

describe('Identity check through the partner bank', () => {
  it('refuses to start without consent (FR-KYC-02)', async () => {
    const t = await register(app, 'TALENT', 'Konjit Bekele');
    const body = await t.api.post('/me/identity/start', { consent: false }, 400);
    expect(body.code).toBe('CONSENT_REQUIRED');
    const u = await prisma.user.findUniqueOrThrow({ where: { id: t.id } });
    expect(u.identityStatus).toBe('UNVERIFIED');
  });

  it('records consent for each request and waits for the bank result', async () => {
    const t = await register(app, 'TALENT', 'Abel Girma');
    const r = await t.api.post('/me/identity/start', { consent: true });
    expect(r.status).toBe('PENDING');
    const consents = await prisma.consent.findMany({ where: { userId: t.id, document: IDENTITY_CHECK_CONSENT } });
    expect(consents).toHaveLength(1);
    const audit = await prisma.auditLog.findFirst({ where: { entityId: t.id, action: 'IDENTITY_STARTED' } });
    expect(audit).toBeTruthy();
  });

  it('keeps only a masked identifier and a token for the bank customer reference (FR-KYC-04 to 06)', async () => {
    const a = await register(app, 'TALENT', 'Hirut Tadesse');
    const b = await register(app, 'TALENT', 'Hirut Tadesse Two');
    await vet.post(`/dev/identity/${a.id}`, { status: 'VERIFIED', bankReference: '6302111122229718', dateOfBirth: '1996-02-01' });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(u.identityMasked).toMatch(/^6302.*9718$/);
    expect(u.identityMasked).not.toContain('11112222');
    const dup = await vet.post(`/dev/identity/${b.id}`, { status: 'VERIFIED', bankReference: '6302111122229718', dateOfBirth: '1996-02-01' }, 409);
    expect(dup.code).toBe('IDENTITY_DUPLICATE');
  });
});
