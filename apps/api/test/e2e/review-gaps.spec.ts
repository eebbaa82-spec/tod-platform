import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma.service';
import { Api, bootApp, client, register, staff, STAFF } from '../helpers';

// Fixes from the post-build review: public profile files, dispute evidence
// access, persisted payment instructions, bilingual notifications and the
// smaller support and console gaps.

let app: INestApplication;
let prisma: PrismaService;
let sup: Api, vet: Api, fin: Api, superAdmin: Api;


const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.4\n%test\n');

beforeAll(async () => {
  app = await bootApp();
  prisma = app.get(PrismaService);
  const s = await staff(app, STAFF.support);
  sup = s.api;

  vet = (await staff(app, STAFF.vetting)).api;
  fin = (await staff(app, STAFF.finance)).api;
  superAdmin = (await staff(app, STAFF.superAdmin)).api;
});

afterAll(async () => {
  await app.close();
});

async function uploadAs(api: Api, name: string, data: Buffer, purpose: string) {
  const res = await request(app.getHttpServer()).post('/api/files').set('Authorization', `Bearer ${api.token}`).field('purpose', purpose).attach('file', data, name);
  if (res.status >= 400) throw new Error(`upload failed ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

let fanSeq = 7000;
async function makeTalent(name: string) {
  const t = await register(app, 'TALENT', name);
  await t.api.put('/talent/me', { headline: `${name}, designer`, bio: 'Experienced and reliable.', skills: ['DESIGN'], hoursPerWeek: 30, workMode: 'REMOTE' });
  await t.api.post('/me/vetting/request');
  await vet.post(`/dev/identity/${t.id}`, { status: 'VERIFIED', verifiedName: name, sex: 'FEMALE', dateOfBirth: '1998-05-01', fan: `${5000_0000_0000_0000 + fanSeq++}` });
  await t.api.put('/talent/me/payout', { channel: 'TELEBIRR', accountNumber: '0911223344', accountName: name });
  await vet.post(`/dev/vetting/${t.id}`, { status: 'APPROVED', tiers: [{ serviceAreaCode: 'CUSTOMER_DB', tier: 'INTERMEDIATE', testScore: 82 }] });
  return t;
}

async function makeClient(name: string) {
  const c = await register(app, 'CLIENT', name);
  await c.api.put('/clients/me', { level: 'VERIFIED_ENTERPRISE', enterpriseName: `${name} PLC`, tin: '0012345678', tradeLicenceNo: 'AA/123/2024', sector: 'Retail', subCity: 'Bole', staffSize: 6, referralSource: 'ASSOCIATION', womenLed: true });
  await vet.post(`/dev/identity/${c.id}`, { status: 'VERIFIED', verifiedName: `${name} Owner`, sex: 'FEMALE', dateOfBirth: '1988-01-01', fan: `${6000_0000_0000_0000 + fanSeq++}` });
  await sup.post(`/clients/${c.id}/confirm-level`, { note: 'Checked' });
  return c;
}

describe('Public talent files', () => {
  it('serves the profile photo and portfolio files without sign-in, but nothing else', async () => {
    const t = await makeTalent('Selam Abebe');
    const photo = await uploadAs(t.api, 'me.png', PNG, 'PHOTO');
    await t.api.put('/talent/me/photo', { fileId: photo });
    const doc = await uploadAs(t.api, 'work.pdf', PDF, 'PORTFOLIO');
    await t.api.post('/talent/me/portfolio', { title: 'Shop catalogue', description: 'A printed catalogue.', fileId: doc });
    const other = await uploadAs(t.api, 'private.pdf', PDF, 'MESSAGE');

    const pub = await client(app).get(`/talent/${t.id}`);
    expect(pub.photoFileId).toBe(photo);
    const anon = request(app.getHttpServer());
    expect((await anon.get(`/api/files/public/${photo}`)).status).toBe(200);
    expect((await anon.get(`/api/files/public/${doc}`)).status).toBe(200);
    expect((await anon.get(`/api/files/public/${other}`)).status).toBe(404);

    // A replaced photo is no longer public.
    const photo2 = await uploadAs(t.api, 'me2.png', PNG, 'PHOTO');
    await t.api.put('/talent/me/photo', { fileId: photo2 });
    expect((await anon.get(`/api/files/public/${photo}`)).status).toBe(404);

    // Someone else's file cannot be used as a photo.
    const other2 = await makeTalent('Other Talent');
    await other2.api.put('/talent/me/photo', { fileId: photo2 }, 400);
  });
});

describe('Assignment files, payments and disputes', () => {
  it('keeps payment instructions, names delivery files and lets both parties open dispute evidence', async () => {
    const t = await makeTalent('Meron Haile');
    const c = await makeClient('Evidence Shop');
    const a = await c.api.post('/assignments', { packageCode: 'CDB-BUILD', brief: 'Please build our customer list.' });
    const asInvited = await t.api.get(`/assignments/${a.id}`);
    expect(asInvited.viewerRole).toBe('INVITED_TALENT');
    expect(asInvited.commissionPreview.rule).toBe('INCLUSIVE_WOMEN');

    // The client's thread list names invited talents before any message.
    const threads = await c.api.get(`/assignments/${a.id}/messages/threads`);
    expect(threads.find((x: any) => x.talentId === t.id)?.name).toBe('Meron Haile');

    await t.api.post(`/assignments/${a.id}/respond`, { action: 'ACCEPT_PRICE', message: 'Happy to do this.' });
    const proposal = (await c.api.get(`/assignments/${a.id}`)).proposals[0];
    const agreed = await c.api.post(`/assignments/proposals/${proposal.id}/accept`, {});
    const reloaded = await c.api.get(`/assignments/${a.id}`);
    expect(reloaded.payments[0].reference).toBe(agreed.payment.reference);
    expect(reloaded.payments[0].instructionsEn).toBeTruthy();
    expect(reloaded.payments[0].instructionsAm).toBeTruthy();

    const pending = await fin.get('/admin/payments?status=PENDING');
    expect(pending.find((p: any) => p.reference === agreed.payment.reference)?.clientName).toBe('Evidence Shop Owner');

    await fin.post(`/dev/funding/${agreed.payment.reference}`, { channel: 'TELEBIRR' });
    const funded = await c.api.get(`/assignments/${a.id}`);
    const m = funded.milestones[0];
    const delivery = await uploadAs(t.api, 'contacts.pdf', PDF, 'DELIVERY');
    const checklist = funded.packageVersion.checklistEn.map((item: string) => ({ item, done: true }));
    await t.api.post(`/assignments/milestones/${m.id}/deliver`, { note: 'Done.', links: [], checklist, fileIds: [delivery] });
    const delivered = await c.api.get(`/assignments/${a.id}`);
    expect(delivered.milestones[0].deliveries[0].files[0].name).toBe('contacts.pdf');

    const d = await c.api.post('/disputes', { milestoneId: m.id, reason: 'Half the contacts are missing from the list.' });
    const evidence = await uploadAs(c.api, 'missing.pdf', PDF, 'EVIDENCE');
    await c.api.post(`/disputes/${d.id}/notes`, { body: 'See the attached list.', fileIds: [evidence] });
    const internalFile = await uploadAs(sup, 'notes.pdf', PDF, 'EVIDENCE');
    await sup.post(`/disputes/${d.id}/notes`, { body: 'Staff only.', internal: true, fileIds: [internalFile] });

    const seen = await t.api.get(`/disputes/${d.id}`);
    const note = seen.notes.find((n: any) => n.body === 'See the attached list.');
    expect(note.files[0].name).toBe('missing.pdf');
    expect(seen.notes.some((n: any) => n.internal)).toBe(false);
    expect((await t.api.raw(`/files/${evidence}`)).status).toBe(200);
    expect((await t.api.raw(`/files/${internalFile}`)).status).toBe(403);
    expect((await sup.raw(`/files/${evidence}`)).status).toBe(200);
  });
});

describe('Notifications in the reader’s language', () => {
  it('re-renders stored notifications in the requested language', async () => {
    const t = await makeTalent('Lidya Tadesse');
    const en = await t.api.get('/notifications?lang=en');
    const am = await t.api.get('/notifications?lang=am');
    const id = en.items?.[0]?.id ?? en[0]?.id;
    const list = (x: any) => x.items ?? x;
    const enRow = list(en).find((n: any) => n.id === id);
    const amRow = list(am).find((n: any) => n.id === id);
    expect(enRow).toBeTruthy();
    expect(amRow.title).not.toBe(enRow.title);
  });
});

describe('Support and console gaps', () => {
  it('names reply authors, takes reply files and lets the requester close a ticket', async () => {
    const u = await register(app, 'CLIENT', 'Ticket Owner');
    const tk = await u.api.post('/support/tickets', { category: 'TECHNICAL', subject: 'Cannot upload', description: 'The upload button does nothing.' });
    await sup.post(`/support/tickets/${tk.id}`, { body: 'Which phone do you use?' });
    const shot = await uploadAs(u.api, 'screen.png', PNG, 'TICKET');
    await u.api.post(`/support/tickets/${tk.id}`, { body: 'An Android phone, screenshot attached.', fileIds: [shot] });
    const mine = await u.api.get(`/support/tickets/${tk.id}`);
    expect(mine.updates[0].authorName).toBeNull();
    expect(mine.updates[1].authorName).toBe('Ticket Owner');
    expect(mine.files.map((f: any) => f.name)).toContain('screen.png');
    expect((await sup.raw(`/files/${shot}`)).status).toBe(200);
    const closed = await u.api.post(`/support/tickets/${tk.id}`, { status: 'CLOSED' });
    expect(closed.status).toBe('CLOSED');
    await u.api.post(`/support/tickets/${tk.id}`, { status: 'RESOLVED' }, 403);
  });

  it('lets designated staff log a confidential case for a caller', async () => {
    const caller = await register(app, 'TALENT', 'Caller Person');
    const r = await sup.post('/support/reports', { type: 'HARASSMENT', description: 'Caller reported harassment by phone.', source: 'CALL_LINE', requesterPhone: caller.phone });
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id: r.id } });
    expect(t.requesterId).toBe(caller.id);
    expect(t.source).toBe('CALL_LINE');
    expect(t.confidential).toBe(true);
    // An ordinary user cannot file on someone else's behalf.
    await caller.api.post('/support/reports', { type: 'FRAUD', description: 'Trying to file for another.', source: 'CALL_LINE', requesterPhone: '0911000000' }, 403);
  });

  it('exposes limits, user filters, names and account fields', async () => {
    const limits = await client(app).get('/clients/limits');
    expect(limits).toHaveProperty('PROVISIONAL');
    const toConfirm = await sup.get('/admin/users?levelToConfirm=true');
    expect(Array.isArray(toConfirm)).toBe(true);
    const audit = await superAdmin.get('/admin/audit?take=20');
    expect(audit.some((r: any) => r.actorName)).toBe(true);
    const u = await register(app, 'CLIENT', 'Account Fields');
    const me = await u.api.get('/auth/me');
    expect(me).toHaveProperty('telegramChatId');
    expect(me).toHaveProperty('erasureRequestedAt');
  });
});
