import { INestApplication } from '@nestjs/common';
import { ParametersService } from '../../src/common/parameters.service';
import { PrismaService } from '../../src/common/prisma.service';
import { Api, bootApp, register, staff, STAFF } from '../helpers';

// Requirements Definition V-005: pilot cohorts (FR-ADM-07), interim escrow
// with dual authorisation and case owners (FR-ESC-14), new profile fields
// (FR-TAL-12, FR-CLI-02, FR-CLI-08), BR-16 trust levels and the GESI report
// (FR-MEL-11, FR-MEL-12).

let app: INestApplication;
let prisma: PrismaService;
let vet: Api, fin: Api, fin2: Api, sup: Api, superAdmin: Api, admin: Api, mel: Api;
let refSeq = 9100;

async function setParam(key: string, value: unknown) {
  await prisma.parameter.update({ where: { key }, data: { value: value as any } });
  app.get(ParametersService).invalidate();
}

beforeAll(async () => {
  app = await bootApp();
  prisma = app.get(PrismaService);
  vet = (await staff(app, STAFF.vetting)).api;
  fin = (await staff(app, STAFF.finance)).api;
  sup = (await staff(app, STAFF.support)).api;
  superAdmin = (await staff(app, STAFF.superAdmin)).api;
  admin = (await staff(app, STAFF.platformAdmin)).api;
  mel = (await staff(app, STAFF.mel)).api;
  // A second finance officer for two-person approvals.
  if (!(await prisma.user.findUnique({ where: { phone: '+251911000099' } }))) {
    await superAdmin.post('/admin/staff', { phone: '0911000099', displayName: 'Second Finance', roles: ['FINANCE_OFFICER'], temporaryPassword: 'ChangeMe-2026!' });
  }
  fin2 = (await staff(app, '+251911000099')).api;
});

afterAll(async () => {
  await setParam('ESCROW_MODE', 'REGULATED');
  await setParam('COHORT_CONTROL_ENABLED', false);
  await app.close();
});

async function makeTalent(name: string) {
  const t = await register(app, 'TALENT', name);
  await t.api.put('/talent/me', { headline: `${name}, designer`, bio: 'Reliable and quick.', skills: ['DIGITAL_MKT'], hoursPerWeek: 30, workMode: 'REMOTE', recruitmentChannel: 'TVET', referringOrganisation: 'Entoto TVET' });
  await t.api.post('/me/vetting/request');
  await vet.post(`/dev/identity/${t.id}`, { status: 'VERIFIED', verifiedName: name, sex: 'FEMALE', dateOfBirth: '2000-05-01', bankReference: `${3000_0000_0000_0000 + refSeq++}` });
  await t.api.put('/talent/me/payout', { channel: 'TELEBIRR', accountNumber: '0911223344', accountName: name });
  await vet.post(`/dev/vetting/${t.id}`, { status: 'APPROVED', tiers: [{ serviceAreaCode: 'DIGITAL_MKT', tier: 'INTERMEDIATE', testScore: 80 }] });
  return t;
}

async function makeClient(name: string) {
  const c = await register(app, 'CLIENT', name);
  await c.api.put('/clients/me', { level: 'VERIFIED_ENTERPRISE', enterpriseName: `${name} PLC`, tin: '0012345678', tradeLicenceNo: 'AA/9/2024', establishedOn: '2020-02-01', beneficialOwner: `${name} Owner`, sector: 'Retail', subCity: 'Bole', staffSize: 4, referralSource: 'ASSOCIATION', womenLed: true, youthLed: false });
  await vet.post(`/dev/identity/${c.id}`, { status: 'VERIFIED', verifiedName: `${name} Owner`, sex: 'FEMALE', dateOfBirth: '1985-01-01', bankReference: `${3100_0000_0000_0000 + refSeq++}` });
  await sup.post(`/clients/${c.id}/confirm-level`, { note: 'Checked' });
  return c;
}

async function agree(c: { api: Api }, t: { id: string; api: Api }) {
  const a = await c.api.post('/assignments', { packageCode: 'MKT-CAMPAIGN', brief: 'A promotion for our shop opening, please.' });
  await t.api.post(`/assignments/${a.id}/respond`, { action: 'ACCEPT_PRICE', message: 'Yes.' });
  const withProposal = await c.api.get(`/assignments/${a.id}`);
  const proposal = withProposal.proposals.find((p: any) => p.talentId === t.id);
  return { a, proposalId: proposal.id as string };
}

describe('Profile fields new in V-005', () => {
  it('requires the establishment date and beneficial owner for a verified enterprise (FR-CLI-02)', async () => {
    const c = await register(app, 'CLIENT', 'Missing Fields');
    const res = await c.api.put('/clients/me', { level: 'VERIFIED_ENTERPRISE', enterpriseName: 'X PLC', tin: '0012345678', tradeLicenceNo: 'AA/1', sector: 'Retail', subCity: 'Bole', staffSize: 2, referralSource: 'OTHER' }, 400);
    expect(res.code).toBe('ENTERPRISE_FIELDS');
  });

  it('keeps ownership flags for individual clients too (FR-CLI-08)', async () => {
    const c = await register(app, 'CLIENT', 'Individual Owner');
    const p = await c.api.put('/clients/me', { level: 'INDIVIDUAL', referralSource: 'CAMPAIGN', womenLed: true, youthLed: true, pwdOwned: false });
    expect(p.womenLed).toBe(true);
    expect(p.youthLed).toBe(true);
  });

  it('records the recruitment channel of a talent (FR-TAL-12)', async () => {
    const t = await makeTalent('Channel Talent');
    const me = await t.api.get('/talent/me');
    expect(me.recruitmentChannel).toBe('TVET');
    expect(me.referringOrganisation).toBe('Entoto TVET');
    const pub = await t.api.get(`/talent/${t.id}`);
    expect(pub.recruitmentChannel).toBeUndefined();
  });
});

describe('Pilot cohorts (FR-ADM-07)', () => {
  it('blocks agreements outside an approved cohort and applies the cohort limit', async () => {
    await setParam('COHORT_CONTROL_ENABLED', true);
    const t = await makeTalent('Cohort Talent');
    const c = await makeClient('Cohort Cafe');
    const { proposalId } = await agree(c, t);
    const blocked = await c.api.post(`/assignments/proposals/${proposalId}/accept`, {}, 403);
    expect(blocked.code).toBe('COHORT_NOT_APPROVED');

    const cohort = await admin.post('/admin/cohorts', { name: `Pilot cohort ${refSeq}`, valueLimit: 100000 });
    await admin.post(`/admin/cohorts/${cohort.id}/members`, { add: [t.id, c.id] });
    await admin.post(`/admin/cohorts/${cohort.id}/approve`, {}, 403); // only the Project Director (super admin)
    await superAdmin.post(`/admin/cohorts/${cohort.id}/approve`, { note: 'First group of the pilot' });
    const limited = await c.api.post(`/assignments/proposals/${proposalId}/accept`, {}, 400);
    expect(limited.code).toBe('VALUE_LIMIT');

    await prisma.cohort.update({ where: { id: cohort.id }, data: { valueLimit: null } });
    const ok = await c.api.post(`/assignments/proposals/${proposalId}/accept`, {});
    expect(ok.assignment.status).toBe('AGREED');
    expect(await prisma.auditLog.count({ where: { action: 'COHORT_APPROVED', entityId: cohort.id } })).toBe(1);
    await setParam('COHORT_CONTROL_ENABLED', false);
  });
});

describe('Interim escrow (FR-ESC-14)', () => {
  it('labels the assignment interim, names a case owner and needs two finance officers to release', async () => {
    await setParam('ESCROW_MODE', 'INTERIM');
    const t = await makeTalent('Interim Talent');
    const c = await makeClient('Interim Shop');
    const { a, proposalId } = await agree(c, t);
    const agreed = await c.api.post(`/assignments/proposals/${proposalId}/accept`, {});
    await fin.post(`/dev/funding/${agreed.payment.reference}`, { channel: 'BANK' });
    const row = await prisma.assignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.interim).toBe(true);
    expect(row.caseOwnerId).toBeTruthy();

    const funded = await c.api.get(`/assignments/${a.id}`);
    const m = funded.milestones[0];
    const checklist = funded.packageVersion.checklistEn.map((item: string) => ({ item, done: true }));
    await t.api.post(`/assignments/milestones/${m.id}/deliver`, { note: 'Done.', links: ['https://example.com/x'], checklist });
    await c.api.post(`/assignments/milestones/${m.id}/accept`, { password: 'secret-123' });

    let s = await prisma.settlement.findUniqueOrThrow({ where: { milestoneId: m.id } });
    expect(s.status).toBe('AWAITING_APPROVAL');
    const waiting = await fin.get('/payments/interim');
    expect(waiting.map((w: any) => w.id)).toContain(s.id);

    const ap = await fin.post(`/payments/settlements/${s.id}/authorise`, { note: 'Delivery checked' });
    const same = await fin.post(`/payments/interim-approvals/${ap.id}/decide`, { approve: true }, 403);
    expect(same.code).toBe('SAME_PERSON');
    await fin2.post(`/payments/interim-approvals/${ap.id}/decide`, { approve: true });
    s = await prisma.settlement.findUniqueOrThrow({ where: { milestoneId: m.id } });
    expect(s.status).toBe('PAID');
    expect((await prisma.assignment.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('CLOSED');
    await setParam('ESCROW_MODE', 'REGULATED');
  });
});

describe('GESI report (FR-MEL-11, FR-MEL-12)', () => {
  it('reports every group against its target and suppresses small restricted groups', async () => {
    const r = await mel.get('/reports/gesi');
    const groups = Object.fromEntries(r.groups.map((g: any) => [g.group, g]));
    expect(Object.keys(groups)).toEqual(expect.arrayContaining(['ALL', 'WOMEN', 'YOUTH', 'YOUNG_WOMEN', 'WOMEN_AND_YOUTH', 'DISABILITY', 'IDP_RETURNEE', 'OTHER_MARGINALISED']));
    expect(groups.WOMEN.targetCount).toBe(800);
    expect(groups.YOUTH.targetCount).toBe(1200);
    expect(groups.ALL.registered).toBeGreaterThan(0);
    // Nobody in these tests declared displacement, so the group is too small to show.
    expect(groups.IDP_RETURNEE.registered).toBe('suppressed');
    expect(r.womenLedMsmes.target).toBe(30);
    expect(r.earningsParity.target).toBe(90);
  });
});
