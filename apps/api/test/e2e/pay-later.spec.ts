import { INestApplication } from '@nestjs/common';
import { ClockService } from '../../src/common/clock.service';
import { ParametersService } from '../../src/common/parameters.service';
import { PrismaService } from '../../src/common/prisma.service';
import { JobsService } from '../../src/jobs/jobs.service';
import { Api, bootApp, register, staff, STAFF } from '../helpers';

// Buy now, pay later (FR-BNP-01 to FR-BNP-13) against the test lender.

let app: INestApplication;
let prisma: PrismaService;
let vet: Api, fin: Api, fin2: Api, sup: Api, superAdmin: Api, admin: Api, lenderView: Api;
let cohortId: string;
let refSeq = 7100;
const DAY = 86_400_000;

async function setParam(key: string, value: unknown) {
  await prisma.parameter.update({ where: { key }, data: { value: value as any } });
  app.get(ParametersService).invalidate();
}
const advanceDays = (n: number) => app.get(ClockService).advance(n * DAY);
const runJobs = () => app.get(JobsService).runAll();

beforeAll(async () => {
  app = await bootApp();
  prisma = app.get(PrismaService);
  vet = (await staff(app, STAFF.vetting)).api;
  fin = (await staff(app, STAFF.finance)).api;
  sup = (await staff(app, STAFF.support)).api;
  superAdmin = (await staff(app, STAFF.superAdmin)).api;
  admin = (await staff(app, STAFF.platformAdmin)).api;
  for (const [phone, name, roles] of [['0911000098', 'Second Finance PL', ['FINANCE_OFFICER']], ['0911000097', 'Lender Viewer', ['LENDER_VIEWER']]] as const) {
    if (!(await prisma.user.findUnique({ where: { phone: `+251${phone.slice(1)}` } }))) {
      await superAdmin.post('/admin/staff', { phone, displayName: name, roles, temporaryPassword: 'ChangeMe-2026!' });
    }
  }
  fin2 = (await staff(app, '+251911000098')).api;
  lenderView = (await staff(app, '+251911000097')).api;
  const c = await superAdmin.post('/admin/cohorts', { name: 'Pay-later test cohort', payLaterEligible: true, payLaterCap: 50_000_00 });
  cohortId = c.id;
});

afterAll(async () => {
  await setParam('PAY_LATER_ENABLED', false);
  await app.close();
});

async function makeTalent(name: string) {
  const t = await register(app, 'TALENT', name);
  await t.api.put('/talent/me', { headline: `${name}, marketer`, bio: 'Reliable and quick.', skills: ['DIGITAL_MKT'], hoursPerWeek: 30, workMode: 'REMOTE' });
  await t.api.post('/me/vetting/request');
  await vet.post(`/dev/identity/${t.id}`, { status: 'VERIFIED', verifiedName: name, sex: 'MALE', dateOfBirth: '2000-05-01', bankReference: `${5000_0000_0000_0000 + refSeq++}` });
  await t.api.put('/talent/me/payout', { channel: 'TELEBIRR', accountNumber: '0911223344', accountName: name });
  await vet.post(`/dev/vetting/${t.id}`, { status: 'APPROVED', tiers: [{ serviceAreaCode: 'DIGITAL_MKT', tier: 'INTERMEDIATE', testScore: 80 }] });
  return t;
}

async function makeClient(name: string, sector = 'Retail') {
  const c = await register(app, 'CLIENT', name);
  await c.api.put('/clients/me', { level: 'VERIFIED_ENTERPRISE', enterpriseName: `${name} PLC`, tin: '0012345678', tradeLicenceNo: 'AA/9/2024', establishedOn: '2020-02-01', beneficialOwner: `${name} Owner`, sector, subCity: 'Bole', staffSize: 4, referralSource: 'ASSOCIATION' });
  await vet.post(`/dev/identity/${c.id}`, { status: 'VERIFIED', verifiedName: `${name} Owner`, sex: 'FEMALE', dateOfBirth: '1985-01-01', bankReference: `${5100_0000_0000_0000 + refSeq++}` });
  await sup.post(`/clients/${c.id}/confirm-level`, { note: 'Checked' });
  return c;
}

async function join(...ids: string[]) {
  await superAdmin.post(`/admin/cohorts/${cohortId}/members`, { add: ids });
  const c = await superAdmin.get(`/admin/cohorts/${cohortId}`);
  if (c.status !== 'APPROVED') await superAdmin.post(`/admin/cohorts/${cohortId}/approve`, { note: 'Pay-later test' });
}

// An assignment agreed between them and waiting for payment.
async function agreed(c: { api: Api }, t: { id: string; api: Api }) {
  const a = await c.api.post('/assignments', { packageCode: 'MKT-CAMPAIGN', brief: 'A promotion for our shop opening, please.' });
  await t.api.post(`/assignments/${a.id}/respond`, { action: 'ACCEPT_PRICE', message: 'Yes.' });
  const full = await c.api.get(`/assignments/${a.id}`);
  const proposal = full.proposals.find((p: any) => p.talentId === t.id);
  const res = await c.api.post(`/assignments/proposals/${proposal.id}/accept`, {});
  return { id: a.id as string, reference: res.payment.reference as string };
}

async function deliverAndAccept(c: { api: Api }, t: { api: Api }, assignmentId: string) {
  const a = await c.api.get(`/assignments/${assignmentId}`);
  const m = a.milestones[0];
  const checklist = a.packageVersion.checklistEn.map((item: string) => ({ item, done: true }));
  await t.api.post(`/assignments/milestones/${m.id}/deliver`, { note: 'Done.', links: ['https://example.com/x'], checklist });
  await c.api.post(`/assignments/milestones/${m.id}/accept`, { password: 'secret-123' });
}

describe('Pay-later', () => {
  let t: Awaited<ReturnType<typeof makeTalent>>;
  let c: Awaited<ReturnType<typeof makeClient>>;
  let agreementId: string;
  let price: number;

  beforeAll(async () => {
    t = await makeTalent('PL Talent');
    c = await makeClient('PL Shop');
    await join(t.id, c.id);
  });

  it('is off until switched on globally and for the client (FR-BNP-01)', async () => {
    const a = await agreed(c, t);
    expect((await c.api.get(`/paylater/offer/${a.id}`)).available).toBe(false);
    const res = await c.api.post('/paylater/applications', { assignmentId: a.id, tenorDays: 30, purpose: 'Launch campaign for the new branch' }, 403);
    expect(res.code).toBe('PAY_LATER_NOT_ELIGIBLE');
    await setParam('PAY_LATER_ENABLED', true);
    expect((await c.api.get(`/paylater/offer/${a.id}`)).available).toBe(false);
    await c.api.put(`/paylater/clients/${c.id}`, { enabled: true }, 403);
    await admin.put(`/paylater/clients/${c.id}`, { enabled: true });
    const offer = await c.api.get(`/paylater/offer/${a.id}`);
    expect(offer).toMatchObject({ available: true, eligible: true, cycle: 1, needsReassessment: false });
    price = offer.amount;
    expect(offer.limit).toBe(1_500_000);
    (c as any).assignment = a;
  });

  it('checks the tenor, passes the agreed data to the lender and records its decision (FR-BNP-03, BR-04)', async () => {
    const a = (c as any).assignment;
    const bad = await c.api.post('/paylater/applications', { assignmentId: a.id, tenorDays: 20, purpose: 'Launch campaign for the new branch' }, 400);
    expect(bad.code).toBe('TENOR');
    const ag = await c.api.post('/paylater/applications', { assignmentId: a.id, tenorDays: 30, purpose: 'Launch campaign for the new branch' });
    expect(ag.status).toBe('APPROVED');
    expect(ag.acknowledgementPreview).toContain('this is a debt');
    agreementId = ag.id;
    const row = await prisma.payLaterAgreement.findUniqueOrThrow({ where: { id: ag.id } });
    expect(row.application).toMatchObject({ amount: price, tenorDays: 30, enterprise: { name: 'PL Shop PLC', beneficialOwner: 'PL Shop Owner', establishedOn: '2020-02-01' }, history: { previousCycles: 0 } });
    expect(await prisma.escrowInstruction.count({ where: { idempotencyKey: `apply:${row.ref}` } })).toBe(1);
    const note = await prisma.notification.findFirst({ where: { userId: c.id, type: 'PAY_LATER_APPROVED' } });
    expect(note).toBeTruthy();
  });

  it('funds escrow from the facility only after the acknowledgement of debt (FR-BNP-06)', async () => {
    const a = (c as any).assignment;
    expect((await c.api.get(`/assignments/${a.id}`)).status).toBe('AGREED');
    const wrong = await c.api.post(`/paylater/agreements/${agreementId}/acknowledge`, { password: 'nope' }, 400);
    expect(wrong.code).toBe('SIGN_OFF_PASSWORD');
    const ag = await c.api.post(`/paylater/agreements/${agreementId}/acknowledge`, { password: 'secret-123' });
    expect(ag.status).toBe('ACTIVE');
    expect(ag.acknowledgementText).toContain(ag.ref);
    expect(ag.outstanding).toBe(price);
    const full = await c.api.get(`/assignments/${a.id}`);
    expect(full.status).toBe('FUNDED');
    const pi = await prisma.paymentInstruction.findUniqueOrThrow({ where: { reference: a.reference } });
    expect(pi.channel).toBe('PAY_LATER_FACILITY');
  });

  it('creates the repayment schedule when the work is accepted (FR-BNP-05)', async () => {
    const a = (c as any).assignment;
    await deliverAndAccept(c, t, a.id);
    const ag = await c.api.get(`/paylater/agreements/${agreementId}`);
    expect(ag.installments).toHaveLength(1);
    expect(ag.installments[0].amount).toBe(price);
    const due = new Date(ag.installments[0].dueOn).getTime();
    expect(Math.round((due - app.get(ClockService).now().getTime()) / DAY)).toBeGreaterThanOrEqual(29);
  });

  it('refuses a second agreement while a balance is open: no rollover (FR-BNP-09)', async () => {
    const b = await agreed(c, t);
    const offer = await c.api.get(`/paylater/offer/${b.id}`);
    expect(offer.reasons).toContain('BALANCE_OPEN');
    (c as any).second = b;
  });

  it('sends reminders before, on and after the due date, and pauses new assignments in arrears (FR-BNP-07)', async () => {
    advanceDays(27);
    await runJobs();
    expect(await prisma.notification.count({ where: { userId: c.id, type: 'PAY_LATER_REMINDER' } })).toBe(1);
    advanceDays(3);
    await runJobs();
    expect(await prisma.notification.count({ where: { userId: c.id, type: 'PAY_LATER_DUE_TODAY' } })).toBe(1);
    advanceDays(1);
    await runJobs();
    await runJobs();
    expect(await prisma.notification.count({ where: { userId: c.id, type: 'PAY_LATER_OVERDUE' } })).toBe(1);
    const blocked = await c.api.post('/assignments', { packageCode: 'MKT-CAMPAIGN', brief: 'Another promotion for the shop.' }, 403);
    expect(blocked.code).toBe('PAY_LATER_ARREARS');
    advanceDays(7);
    await runJobs();
    expect(await prisma.notification.count({ where: { userId: c.id, type: 'PAY_LATER_OVERDUE' } })).toBe(2);
  });

  it('tracks partial repayments and shows them in the ageing report (FR-BNP-08)', async () => {
    const half = Math.round(price / 2);
    await c.api.post(`/paylater/agreements/${agreementId}/repayments`, { amount: half, reference: 'LND-1' }, 403);
    const ag = await fin.post(`/paylater/agreements/${agreementId}/repayments`, { amount: half, reference: 'LND-1' });
    expect(ag.outstanding).toBe(price - half);
    expect(ag.installments[0].paid).toBe(half);
    const dup = await fin.post(`/paylater/agreements/${agreementId}/repayments`, { amount: 1, reference: 'LND-1' }, 409);
    expect(dup.code).toBe('DUPLICATE_REFERENCE');
    const p = await fin.get('/paylater/portfolio');
    expect(p.ageing.d8to30).toBe(price - half);
    expect(p.outstanding).toBe(price - half);
  });

  it('records a negotiated repayment with a second approver and reason (FR-BNP-13)', async () => {
    const ag = await fin.get(`/paylater/agreements/${agreementId}`);
    const newDue = new Date(app.get(ClockService).now().getTime() + 10 * DAY).toISOString().slice(0, 10);
    const x = await fin.post(`/paylater/agreements/${agreementId}/exceptions`, { kind: 'RESCHEDULE', installmentId: ag.installments[0].id, newDueOn: newDue, reason: 'Shop closed for two weeks after flooding' });
    const same = await fin.post(`/paylater/exceptions/${x.id}/decide`, { approve: true }, 403);
    expect(same.code).toBe('SAME_PERSON');
    await fin2.post(`/paylater/exceptions/${x.id}/decide`, { approve: true, note: 'Agreed with the lender' });
    const after = await c.api.get(`/paylater/agreements/${agreementId}`);
    expect(after.installments[0].dueOn.slice(0, 10)).toBe(newDue);
    expect(after.installments[0].daysPastDue).toBe(0);
    // No longer in arrears, so the client can post again.
    await c.api.post('/assignments', { packageCode: 'MKT-CAMPAIGN', brief: 'Another promotion for the shop.' });
  });

  it('closes the agreement on full repayment and steps the limit up (FR-BNP-04)', async () => {
    const ag = await fin.post(`/paylater/agreements/${agreementId}/repayments`, { amount: price - Math.round(price / 2), reference: 'LND-2' });
    expect(ag.status).toBe('REPAID');
    expect(ag.outstanding).toBe(0);
    const me = await c.api.get('/paylater/me');
    expect(me.limit).toBe(2_250_000);
  });

  it('gives the lender a read-only view and an evidence pack (FR-BNP-10, FR-BNP-12)', async () => {
    const p = await lenderView.get('/paylater/portfolio');
    expect(p.disbursed).toBeGreaterThanOrEqual(price);
    expect(p.matured.count).toBeGreaterThanOrEqual(1);
    await lenderView.post(`/paylater/agreements/${agreementId}/repayments`, { amount: 1, reference: 'X-1' }, 403);
    const pack = await lenderView.get(`/paylater/agreements/${agreementId}/evidence`);
    expect(pack.acknowledgement.text).toContain('this is a debt');
    expect(pack.schedule).toHaveLength(1);
    expect(pack.repayments).toHaveLength(2);
    expect(pack.exceptions[0]).toMatchObject({ kind: 'RESCHEDULE', status: 'APPROVED' });
    expect(pack.reminders.map((r: any) => r.type)).toEqual(expect.arrayContaining(['PAY_LATER_REMINDER', 'PAY_LATER_DUE_TODAY', 'PAY_LATER_OVERDUE', 'PAY_LATER_REPAYMENT']));
    expect(pack.auditTrail.map((e: any) => e.action)).toEqual(expect.arrayContaining(['PAY_LATER_ACKNOWLEDGED', 'PAY_LATER_REPAID']));
  });

  it('needs an affordability reassessment before repeat use (FR-BNP-13)', async () => {
    const b = (c as any).second;
    const ag = await c.api.post('/paylater/applications', { assignmentId: b.id, tenorDays: 45, purpose: 'Second campaign for the holiday season' });
    expect(ag.status).toBe('AWAITING_REASSESSMENT');
    expect(ag.cycle).toBe(2);
    const done = await fin.post(`/paylater/agreements/${ag.id}/reassess`, { affordable: true, note: 'Sales records show steady income' });
    expect(done.status).toBe('APPROVED');
    const active = await c.api.post(`/paylater/agreements/${ag.id}/acknowledge`, { password: 'secret-123' });
    expect(active.status).toBe('ACTIVE');
    await deliverAndAccept(c, t, b.id);
    (c as any).secondAgreement = ag.id;
  });

  it('marks a default after 60 days, freezes new approvals and cuts limits (FR-BNP-11, BR-05)', async () => {
    const other = await makeClient('PL Bakery', 'Food and drink');
    await join(other.id);
    await admin.put(`/paylater/clients/${other.id}`, { enabled: true });
    advanceDays(45 + 62);
    await runJobs();
    const ag = await fin.get(`/paylater/agreements/${(c as any).secondAgreement}`);
    expect(ag.status).toBe('DEFAULTED');
    const p = await fin.get('/paylater/portfolio');
    expect(p.frozen).toBe(true);
    expect(p.defaultRate).toBeGreaterThan(0);
    expect(p.events[0]).toMatchObject({ kind: 'FREEZE', flaggedForSnapshot: true });
    const b = await agreed(other, t);
    const offer = await other.api.get(`/paylater/offer/${b.id}`);
    expect(offer.reasons).toContain('PORTFOLIO_FROZEN');
    expect(offer.limit).toBe(750_000);
    const ind = await superAdmin.get('/reports/indicators');
    expect(ind.payLaterDefaultRate).toBeGreaterThan(0);
    // Recovered in full, then the finance lead lifts the freeze.
    await fin.post(`/paylater/agreements/${ag.id}/repayments`, { amount: ag.outstanding, reference: 'LND-3' });
    await fin.post('/paylater/portfolio/unfreeze', { reason: 'Defaulted balance recovered by the lender' });
    expect((await fin.get('/paylater/portfolio')).frozen).toBe(false);
  });
});
