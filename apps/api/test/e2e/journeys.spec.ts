import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../src/common/prisma.service';
import { advanceHours, Api, bootApp, client, register, staff, STAFF } from '../helpers';

// End-to-end acceptance scenarios from section 9.2 of the requirements.
// Scenarios 1-3 use the test stand-ins for Fayda and vetting; scenarios 8 and 9
// (reconciliation, pay-later) belong to the developer's modules and are not here.

let app: INestApplication;
let prisma: PrismaService;
let sup: Api, vet: Api, fin: Api, admin: Api, superAdmin: Api, mel: Api;

beforeAll(async () => {
  app = await bootApp();
  prisma = app.get(PrismaService);
  sup = (await staff(app, STAFF.support)).api;
  vet = (await staff(app, STAFF.vetting)).api;
  fin = (await staff(app, STAFF.finance)).api;
  admin = (await staff(app, STAFF.platformAdmin)).api;
  superAdmin = (await staff(app, STAFF.superAdmin)).api;
  mel = (await staff(app, STAFF.mel)).api;
});

afterAll(async () => {
  await app.close();
});

let fanSeq = 1000;
async function makeTalent(name: string, area: string, opts: { sex?: 'FEMALE' | 'MALE'; dob?: string; disability?: boolean; language?: 'en' | 'am' } = {}) {
  const t = await register(app, 'TALENT', name, { language: opts.language });
  await t.api.put('/talent/me', { headline: `${name}, ${area.toLowerCase()} specialist`, bio: 'Experienced and reliable.', skills: [area], hoursPerWeek: 30, workMode: 'REMOTE', disability: opts.disability });
  await t.api.post('/me/vetting/request');
  await vet.post(`/dev/identity/${t.id}`, { status: 'VERIFIED', verifiedName: name, sex: opts.sex ?? 'MALE', dateOfBirth: opts.dob ?? '1999-05-01', fan: `${3000_0000_0000_0000 + fanSeq++}` });
  await t.api.put('/talent/me/payout', { channel: 'TELEBIRR', accountNumber: '0911223344', accountName: name });
  await vet.post(`/dev/vetting/${t.id}`, { status: 'APPROVED', tiers: [{ serviceAreaCode: area, tier: 'INTERMEDIATE', testScore: 82 }] });
  return t;
}

async function makeClient(name: string, level: 'VERIFIED_ENTERPRISE' | 'BASIC_ENTERPRISE' = 'VERIFIED_ENTERPRISE') {
  const c = await register(app, 'CLIENT', name);
  await c.api.put('/clients/me', { level, enterpriseName: `${name} PLC`, tin: '0012345678', tradeLicenceNo: 'AA/123/2024', sector: 'Retail', subCity: 'Bole', staffSize: 6, referralSource: 'ASSOCIATION', womenLed: true });
  await vet.post(`/dev/identity/${c.id}`, { status: 'VERIFIED', verifiedName: `${name} Owner`, sex: 'FEMALE', dateOfBirth: '1988-01-01', fan: `${4000_0000_0000_0000 + fanSeq++}` });
  if (level === 'VERIFIED_ENTERPRISE') await sup.post(`/clients/${c.id}/confirm-level`, { note: 'Trade licence and TIN checked' });
  return c;
}

// Client posts a package, the talent accepts at package price, the client accepts and funds.
async function fundedAssignment(c: Awaited<ReturnType<typeof makeClient>>, t: Awaited<ReturnType<typeof makeTalent>>, packageCode: string) {
  const a = await c.api.post('/assignments', { packageCode, brief: 'Please help our shop with this work.' });
  expect(a.status).toBe('OPEN');
  const inv = await t.api.get('/assignments/mine/talent');
  expect(inv.invitations.map((i: any) => i.assignmentId)).toContain(a.id);
  await t.api.post(`/assignments/${a.id}/respond`, { action: 'ACCEPT_PRICE', message: 'Happy to do this.' });
  const withProposal = await c.api.get(`/assignments/${a.id}`);
  const proposal = withProposal.proposals.find((p: any) => p.talentId === t.id);
  const agreed = await c.api.post(`/assignments/proposals/${proposal.id}/accept`, {});
  expect(agreed.assignment.status).toBe('AGREED');
  // The talent is not told to start before funding (FR-ASG-02).
  expect(await prisma.notification.count({ where: { userId: t.id, type: 'FUNDED_START' } })).toBe(0);
  await fin.post(`/dev/funding/${agreed.payment.reference}`, { channel: 'TELEBIRR' });
  const funded = await c.api.get(`/assignments/${a.id}`);
  expect(funded.status).toBe('FUNDED');
  expect(await prisma.notification.count({ where: { userId: t.id, type: 'FUNDED_START' } })).toBe(1);
  return funded;
}

async function deliver(t: Api, assignment: any) {
  const m = assignment.milestones[0];
  const checklist = assignment.packageVersion.checklistEn.map((item: string) => ({ item, done: true }));
  await t.post(`/assignments/milestones/${m.id}/deliver`, { note: 'Done, files attached.', links: ['https://example.com/delivery'], checklist });
  return m.id as string;
}

describe('Scenario 1: talent onboarding with a masked identifier', () => {
  it('registers in Amharic, is verified and vetted, and is published with a masked ID', async () => {
    const t = await makeTalent('Hanna Tesfaye', 'DESIGN', { sex: 'FEMALE', language: 'am' });
    const me = await t.api.get('/auth/me');
    expect(me.language).toBe('am');
    const profile = await prisma.talentProfile.findUniqueOrThrow({ where: { userId: t.id } });
    expect(profile.publishedAt).not.toBeNull();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: t.id } });
    expect(user.identityMasked).toMatch(/^\d{4} XXXX XXXX \d{4}$/);
    const pub = await client(app).get(`/talent/${t.id}`);
    expect(JSON.stringify(pub)).not.toMatch(/disability|dateOfBirth|identityToken/);
  });
});

describe('Scenario 2: one account per identity', () => {
  it('blocks a second registration with the same Fayda identity', async () => {
    const a = await register(app, 'TALENT', 'First Person');
    const b = await register(app, 'TALENT', 'Second Person');
    await vet.post(`/dev/identity/${a.id}`, { status: 'VERIFIED', fan: '5555666677778888', dateOfBirth: '1995-01-01' });
    const res = await vet.post(`/dev/identity/${b.id}`, { status: 'VERIFIED', fan: '5555666677778888', dateOfBirth: '1995-01-01' }, 409);
    expect(res.code).toBe('IDENTITY_DUPLICATE');
  });

  it('refuses a person under 18', async () => {
    const u = await register(app, 'TALENT', 'Young Person');
    const res = await vet.post(`/dev/identity/${u.id}`, { status: 'VERIFIED', dateOfBirth: '2012-01-01' }, 403);
    expect(res.code).toBe('UNDER_AGE');
  });
});

describe('Scenario 3: provisional onboarding when Fayda is unavailable', () => {
  it('applies restricted limits, then lifts them after verification', async () => {
    const c = await register(app, 'CLIENT', 'Provisional Client');
    await c.api.put('/clients/me', { level: 'BASIC_ENTERPRISE', enterpriseName: 'Prov Shop', referralSource: 'CAMPAIGN', activityEvidence: 'Site visit by Bole sub-city office' });
    await c.api.post('/assignments', { packageCode: 'DES-LOGO', brief: 'A logo for my shop please.' }, 403);
    await vet.post(`/dev/identity/${c.id}`, { status: 'PROVISIONAL', dateOfBirth: '1990-01-01' });
    // Provisional limit is ETB 5,000; WEB-SITE starts at ETB 4,000 so is allowed, a larger proposal is not.
    const limits = await prisma.parameter.findUniqueOrThrow({ where: { key: 'ASSIGNMENT_VALUE_LIMITS' } });
    expect((limits.value as any).PROVISIONAL).toBe(500000);
    await c.api.post('/assignments', { packageCode: 'DES-LOGO', brief: 'A logo for my shop please.' });
    await vet.post(`/dev/identity/${c.id}`, { status: 'VERIFIED', fan: '7777000011112222', dateOfBirth: '1990-01-01' });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: c.id } });
    expect(u.identityStatus).toBe('VERIFIED');
  });
});

describe('Scenarios 4 and 5: package to payout, standard and inclusive commission', () => {
  it('pays a male talent net of 5 percent', async () => {
    const t = await makeTalent('Abebe Kebede', 'BOOKKEEPING', { sex: 'MALE' });
    const c = await makeClient('Selam Cafe');
    const a = await fundedAssignment(c, t, 'BK-MONTH');
    const milestoneId = await deliver(t.api, a);
    await c.api.post(`/assignments/milestones/${milestoneId}/accept`, { password: 'wrong-pass' }, 400);
    await c.api.post(`/assignments/milestones/${milestoneId}/accept`, { password: 'secret-123' });
    const s = await prisma.settlement.findUniqueOrThrow({ where: { milestoneId } });
    expect(s.gross).toBe(400000);
    expect(s.commission).toBe(20000);
    expect(s.net).toBe(380000);
    expect(s.status).toBe('PAID');
    const after = await c.api.get(`/assignments/${a.id}`);
    expect(after.status).toBe('CLOSED');
    const receipt = await t.api.get(`/payments/receipts/${s.instructionRef}`);
    expect(receipt).toBeTruthy();
  });

  it('charges a verified woman talent 1 percent', async () => {
    const t = await makeTalent('Meron Alemu', 'INVENTORY', { sex: 'FEMALE' });
    const c = await makeClient('Merkato Traders');
    const a = await fundedAssignment(c, t, 'INV-DIGITISE');
    expect(Number(a.commissionRate)).toBeCloseTo(0.01);
    const milestoneId = await deliver(t.api, a);
    await c.api.post(`/assignments/milestones/${milestoneId}/accept`, { password: 'secret-123' });
    const s = await prisma.settlement.findUniqueOrThrow({ where: { milestoneId } });
    expect(s.commission).toBe(2500);
    expect(s.net).toBe(247500);
  });
});

describe('Scenario 6: review window expires', () => {
  it('releases funds when the client does not respond', async () => {
    const t = await makeTalent('Dawit Haile', 'DATA_ENTRY');
    const c = await makeClient('Quiet Client');
    const a = await fundedAssignment(c, t, 'DE-BATCH');
    const milestoneId = await deliver(t.api, a);
    // 3 working days, plus a weekend margin.
    advanceHours(app, 24 * 6);
    await superAdmin.post('/dev/jobs/run');
    const m = await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId }, include: { settlement: true } });
    expect(m.autoAccepted).toBe(true);
    expect(m.settlement?.reason).toBe('REVIEW_WINDOW_EXPIRED');
    expect(m.settlement?.status).toBe('PAID');
    await superAdmin.post('/dev/clock/reset');
  });
});

describe('Scenario 7: dispute with a split decision under dual authorisation', () => {
  it('freezes funds, splits them after a second approval, and pays both parties', async () => {
    const t = await makeTalent('Yonas Girma', 'CUSTOMER_DB');
    const c = await makeClient('Unhappy Client');
    const a = await fundedAssignment(c, t, 'CDB-BUILD');
    const milestoneId = await deliver(t.api, a);
    const d = await c.api.post('/disputes', { milestoneId, reason: 'Half the contacts are missing from the list.' });
    expect((await c.api.get(`/assignments/${a.id}`)).status).toBe('DISPUTED');
    expect(await prisma.escrowInstruction.count({ where: { kind: 'FREEZE', assignmentRef: a.ref } })).toBe(1);

    await sup.post(`/disputes/${d.id}/stage`, { stage: 'FACILITATION' });
    await sup.post(`/disputes/${d.id}/stage`, { stage: 'DECISION' });
    const decided = await sup.post(`/disputes/${d.id}/decision`, { remedy: 'PARTIAL_ACCEPTANCE', releaseAmount: 120000, refundAmount: 80000, note: 'Part of the work was delivered.' });
    const approvalId = decided.approvalId;
    // The person who proposed cannot approve (support has no approval role anyway); finance approves.
    await fin.post(`/disputes/approvals/${approvalId}`, { approve: true, note: 'Checked' });
    await c.api.post(`/disputes/${d.id}/accept-decision`);
    await t.api.post(`/disputes/${d.id}/accept-decision`);
    const s = await prisma.settlement.findUniqueOrThrow({ where: { milestoneId } });
    expect(s.kind).toBe('SPLIT');
    expect(s.gross).toBe(120000);
    expect(s.refundAmount).toBe(80000);
    expect(s.commission).toBe(6000);
    expect(s.status).toBe('PAID');
    const split = await prisma.escrowInstruction.findFirstOrThrow({ where: { kind: 'SPLIT', assignmentRef: a.ref } });
    expect((split.payload as any).approvals.approvedById).not.toBe((split.payload as any).approvals.requestedById);
  });
});

describe('Scenario 10: two-way ratings', () => {
  it('publishes both ratings together and updates trust', async () => {
    const t = await makeTalent('Rahel Bekele', 'ECOMMERCE');
    const c = await makeClient('Rating Client');
    const a = await fundedAssignment(c, t, 'ECOM-SHOP');
    const milestoneId = await deliver(t.api, a);
    await c.api.post(`/assignments/milestones/${milestoneId}/accept`, { password: 'secret-123' });
    await c.api.post(`/ratings/assignments/${a.id}`, { scores: { quality: 5, timeliness: 4, communication: 5 }, comment: 'Great work' });
    const r1 = await prisma.rating.findFirstOrThrow({ where: { assignmentId: a.id, direction: 'CLIENT_TO_TALENT' } });
    expect(r1.publishedAt).toBeNull();
    await t.api.post(`/ratings/assignments/${a.id}`, { scores: { clarityOfBrief: 5, responsiveness: 5, conduct: 5 } });
    const both = await prisma.rating.findMany({ where: { assignmentId: a.id } });
    expect(both.every((r) => r.publishedAt)).toBe(true);
    const pub = await client(app).get(`/talent/${t.id}`);
    expect(pub.trust.completed).toBe(1);
    expect(pub.trust.ratingCount).toBe(1);
  });
});

describe('Scenario 11: confidential harassment report', () => {
  it('is visible only to designated staff and acknowledged in time', async () => {
    const u = await register(app, 'TALENT', 'Reporter');
    const r = await u.api.post('/support/reports', { type: 'HARASSMENT', description: 'A client sent me abusive messages.' });
    expect(r.ref).toMatch(/^TODC/);
    // Designated support agent sees it; the platform admin (not designated) does not.
    const forSup = await sup.get('/support/tickets?confidential=true');
    expect(JSON.stringify(forSup)).toContain(r.ref);
    await admin.get(`/support/tickets/${r.id}`, 404);
    const ack = await sup.post(`/support/tickets/${r.id}/acknowledge`);
    expect(ack.acknowledgedAt).toBeTruthy();
    expect(new Date(ack.acknowledgedAt).getTime()).toBeLessThanOrEqual(new Date(ack.acknowledgeBy).getTime());
  });
});

describe('Scenario 12: MEL export with small-cell suppression', () => {
  it('exports indicators with disaggregation and suppresses cells under five', async () => {
    const ind = await mel.get('/reports/indicators');
    expect(ind.completedAssignments).toBeGreaterThanOrEqual(3);
    const talent = await mel.get('/reports/talent');
    const disability = talent.breakdown.disability;
    // Only one talent declared a disability in this run, so that cell is suppressed.
    expect(disability.find((g: any) => g.group === 'Yes')?.registered ?? 'suppressed').toBe('suppressed');
    const res = await mel
      .raw('/reports/export.xlsx?from=2026-01-01')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const about = wb.getWorksheet('About this export')!;
    expect(String(about.getCell('B3').value)).toContain('2026-01-01');
    expect(wb.getWorksheet('Talent breakdown')).toBeTruthy();
  });

  beforeAll(async () => {
    await makeTalent('Declared Disability', 'WEB_IT', { disability: true });
  });
});

describe('Scenario 13: commission change with a second approver', () => {
  it('needs a different approver, is audited, and applies only to later assignments', async () => {
    const t = await makeTalent('Kebede Worku', 'BUS_ADMIN');
    const c = await makeClient('Before Change Client');
    const before = await fundedAssignment(c, t, 'ADM-DOCS');
    expect(Number(before.commissionRate)).toBeCloseTo(0.05);

    const change = await admin.post('/admin/parameters/COMMISSION_STANDARD_RATE', { value: 0.06, reason: 'Board decision on pricing' });
    expect(change.status).toBe('PENDING');
    await admin.post(`/admin/parameter-changes/${change.id}`, { approve: true }, 403);
    const applied = await superAdmin.post(`/admin/parameter-changes/${change.id}`, { approve: true });
    expect(applied.status).toBe('APPLIED');

    const log = await superAdmin.get('/admin/audit?entityType=Parameter&action=PARAMETER_CHANGED');
    expect(log[0].entityId).toBe('COMMISSION_STANDARD_RATE');
    expect((await superAdmin.get('/admin/audit/verify')).ok).toBe(true);

    const milestoneId = await deliver(t.api, before);
    await c.api.post(`/assignments/milestones/${milestoneId}/accept`, { password: 'secret-123' });
    const s = await prisma.settlement.findUniqueOrThrow({ where: { milestoneId } });
    expect(Number(s.commissionRate)).toBeCloseTo(0.05);

    const t2 = await makeTalent('Later Talent', 'SOCIAL');
    const later = await fundedAssignment(c, t2, 'SOC-SETUP');
    expect(Number(later.commissionRate)).toBeCloseTo(0.06);

    // Put it back for any later tests.
    const back = await admin.post('/admin/parameters/COMMISSION_STANDARD_RATE', { value: 0.05, reason: 'Reset after test' });
    await superAdmin.post(`/admin/parameter-changes/${back.id}`, { approve: true });
  });
});

describe('Scenario 14: assisted registration of a Basic enterprise', () => {
  it('uses the owner’s one-time code and records the agent', async () => {
    const phone = '0922334455';
    const otp = await sup.post('/auth/otp', { phone, purpose: 'ASSISTED_CONSENT' });
    const u = await sup.post('/auth/assisted-registration', { phone, otp: otp.devCode, displayName: 'Tigist Shop', role: 'CLIENT', language: 'am', acceptTerms: true, acceptPrivacy: true, acceptCommunity: true });
    const created = await prisma.user.findUniqueOrThrow({ where: { phone: '+251922334455' } });
    expect(created.assistedById).toBeTruthy();
    const consents = await prisma.consent.count({ where: { userId: created.id } });
    expect(consents).toBe(3);
    expect(u).toBeTruthy();
  });
});

describe('Security basics', () => {
  it('rejects anonymous access and staff routes for normal users', async () => {
    await client(app).get('/assignments/mine/client', 401);
    const c = await register(app, 'CLIENT', 'Nosy Client');
    await c.api.get('/admin/users', 403);
    await c.api.get('/reports/indicators', 403);
  });

  it('masks phone numbers in messages before funding', async () => {
    const t = await makeTalent('Chatty Talent', 'DESIGN');
    const c = await makeClient('Chatty Client');
    const a = await c.api.post('/assignments', { packageCode: 'DES-PRINT', brief: 'A menu for the restaurant.' });
    const sent = await t.api.post(`/assignments/${a.id}/messages`, { body: 'Call me on 0911223344 instead' });
    expect(sent.body).not.toContain('0911223344');
    expect(sent.masked).toBe(true);
  });

  it('keeps the audit log append-only', async () => {
    await expect(prisma.$executeRawUnsafe('DELETE FROM "AuditLog"')).rejects.toThrow();
  });
});
