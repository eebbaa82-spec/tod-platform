import '../src/load-env';
// The script registers many accounts from one address, and runs no scheduled jobs.
process.env.THROTTLE_DISABLED = 'true';
process.env.JOBS_DISABLED = 'true';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { config } from '../src/common/config';
import { PrismaService } from '../src/common/prisma.service';
import { configureApp } from '../src/main';

// Loads demo talents, clients and assignments so partners can try the platform.
// Usage (after db:seed): npm run db:demo -w apps/api
// It drives the real API in-process, using the test stand-ins for Fayda,
// vetting and bank funding, so it refuses to run when APP_ENV=production.

const PASSWORD = 'Demo-2026!';

const TALENTS = [
  { phone: '0920000101', name: 'Hanna Tesfaye', area: 'DESIGN', tier: 'EXPERT', sex: 'FEMALE', language: 'am', headline: 'Logos, menus and shop signs' },
  { phone: '0920000102', name: 'Meron Alemu', area: 'SOCIAL', tier: 'INTERMEDIATE', sex: 'FEMALE', language: 'am', headline: 'Facebook, Instagram and TikTok pages for small shops' },
  { phone: '0920000103', name: 'Dawit Bekele', area: 'BOOKKEEPING', tier: 'INTERMEDIATE', sex: 'MALE', language: 'en', headline: 'Monthly books and VAT records' },
  { phone: '0920000104', name: 'Selamawit Girma', area: 'DATA_ENTRY', tier: 'ENTRY', sex: 'FEMALE', language: 'am', headline: 'Fast, accurate data entry in Amharic and English' },
  { phone: '0920000105', name: 'Yonas Haile', area: 'WEB_IT', tier: 'EXPERT', sex: 'MALE', language: 'en', headline: 'Simple business websites and IT setup' },
  { phone: '0920000106', name: 'Liya Mekonnen', area: 'DIGITAL_MKT', tier: 'INTERMEDIATE', sex: 'FEMALE', language: 'en', headline: 'Promotions that bring customers through the door' },
] as const;

const CLIENTS = [
  { phone: '0920000201', name: 'Tsion Assefa', business: 'Abeba Coffee House', sector: 'Food and drink', subCity: 'Bole', staff: 8, womenLed: true },
  { phone: '0920000202', name: 'Rahel Worku', business: 'Piassa Fashion Boutique', sector: 'Retail', subCity: 'Arada', staff: 4, womenLed: true },
  { phone: '0920000203', name: 'Kaleb Tadesse', business: 'Merkato Electronics', sector: 'Retail', subCity: 'Addis Ketema', staff: 12, womenLed: false },
] as const;

type Call = (method: string, path: string, body?: object) => Promise<any>;

async function main() {
  if (config.isProduction) throw new Error('Demo data is for staging and development only (APP_ENV=production).');

  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  await configureApp(app);
  await app.listen(0);
  const base = `${await app.getUrl()}/api`.replace('[::1]', 'localhost');
  const prisma = app.get(PrismaService);

  try {
    if (await prisma.user.findUnique({ where: { phone: '+251920000101' } })) {
      console.log('Demo accounts already exist, so nothing was loaded.');
      return;
    }

    const as = (token?: string): Call => async (method, path, body) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}: ${JSON.stringify(json)}`);
      return json;
    };
    // Staff steps run as a super administrator (the seeded one locally, or the one
    // made with admin:create on a server); the script signs that account an MFA session.
    const admin = await prisma.user.findFirst({ where: { roles: { has: 'SUPER_ADMIN' }, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    if (!admin) throw new Error('Create a super administrator first: npm run admin:create -w apps/api -- <phone> "<name>"');
    const staffCall = as(jwt.sign({ sub: admin.id, mfa: true }, config.jwtSecret, { expiresIn: '1h' }));
    const vet = staffCall, sup = staffCall, fin = staffCall;

    const register = async (role: 'TALENT' | 'CLIENT', phone: string, name: string, language: string) => {
      const anon = as();
      const otp = await anon('POST', '/auth/otp', { phone, purpose: 'REGISTER' });
      const r = await anon('POST', '/auth/register', {
        phone, otp: otp.devCode, password: PASSWORD, displayName: name, role, language,
        acceptTerms: true, acceptPrivacy: true, acceptCommunity: true,
      });
      return { id: r.user.id as string, call: as(r.token) };
    };

    let fan = 6000_0000_0000_0001;
    const talents: Record<string, { id: string; call: Call }> = {};
    for (const t of TALENTS) {
      const u = await register('TALENT', t.phone, t.name, t.language);
      await u.call('PUT', '/talent/me', { headline: t.headline, bio: `${t.name.split(' ')[0]} has worked with small businesses across Addis Ababa.`, skills: [t.area], hoursPerWeek: 30, workMode: 'REMOTE' });
      await u.call('POST', '/me/vetting/request');
      await vet('POST', `/dev/identity/${u.id}`, { status: 'VERIFIED', verifiedName: t.name, sex: t.sex, dateOfBirth: '1999-03-15', fan: String(fan++) });
      await u.call('PUT', '/talent/me/payout', { channel: 'TELEBIRR', accountNumber: `09${t.phone.slice(-8)}`, accountName: t.name });
      await vet('POST', `/dev/vetting/${u.id}`, { status: 'APPROVED', tiers: [{ serviceAreaCode: t.area, tier: t.tier, testScore: 85 }] });
      talents[t.area] = u;
    }

    const clients: { id: string; call: Call }[] = [];
    for (const c of CLIENTS) {
      const u = await register('CLIENT', c.phone, c.name, 'en');
      await u.call('PUT', '/clients/me', { level: 'VERIFIED_ENTERPRISE', enterpriseName: c.business, tin: '0012345678', tradeLicenceNo: 'AA/14/2025', sector: c.sector, subCity: c.subCity, staffSize: c.staff, referralSource: 'ASSOCIATION', womenLed: c.womenLed });
      await vet('POST', `/dev/identity/${u.id}`, { status: 'VERIFIED', verifiedName: c.name, sex: c.womenLed ? 'FEMALE' : 'MALE', dateOfBirth: '1987-06-01', fan: String(fan++) });
      await sup('POST', `/clients/${u.id}/confirm-level`, { note: 'Trade licence and TIN checked (demo)' });
      clients.push(u);
    }
    const [coffee, boutique, electronics] = clients;

    // Request a package, have the talent accept at the package price, agree and fund it.
    const funded = async (client: { call: Call }, area: string, packageCode: string, brief: string) => {
      const talent = talents[area];
      const a = await client.call('POST', '/assignments', { packageCode, brief });
      await talent.call('POST', `/assignments/${a.id}/respond`, { action: 'ACCEPT_PRICE', message: 'Happy to help with this.' });
      const full = await client.call('GET', `/assignments/${a.id}`);
      const proposal = full.proposals.find((p: any) => p.talentId === talent.id);
      const agreed = await client.call('POST', `/assignments/proposals/${proposal.id}/accept`, {});
      await fin('POST', `/dev/funding/${agreed.payment.reference}`, { channel: 'TELEBIRR' });
      return { talent, assignment: await client.call('GET', `/assignments/${a.id}`) };
    };
    const deliver = async (talent: { call: Call }, a: any) => {
      const m = a.milestones[0];
      const checklist = a.packageVersion.checklistEn.map((item: string) => ({ item, done: true }));
      await talent.call('POST', `/assignments/milestones/${m.id}/deliver`, { note: 'All done, the files are in the link.', links: ['https://example.com/delivery'], checklist });
      return m.id as string;
    };

    // 1 and 2: completed, paid and rated.
    for (const [client, area, code, brief] of [
      [coffee, 'DESIGN', 'DES-LOGO', 'A new logo for our coffee house, warm and traditional.'],
      [boutique, 'SOCIAL', 'SOC-SETUP', 'Set up Instagram and Facebook pages for the boutique.'],
    ] as const) {
      const { talent, assignment } = await funded(client, area, code, brief);
      const milestoneId = await deliver(talent, assignment);
      await client.call('POST', `/assignments/milestones/${milestoneId}/accept`, { password: PASSWORD });
      await client.call('POST', `/ratings/assignments/${assignment.id}`, { scores: { quality: 5, timeliness: 5, communication: 4 }, comment: 'Excellent work, delivered on time.' });
      await talent.call('POST', `/ratings/assignments/${assignment.id}`, { scores: { clarityOfBrief: 5, responsiveness: 5, conduct: 5 } });
    }

    // 3: delivered, waiting for the client to accept.
    const books = await funded(coffee, 'BOOKKEEPING', 'BK-MONTH', 'Monthly books for September, receipts are in a folder.');
    await deliver(books.talent, books.assignment);

    // 4: funded and in progress.
    await funded(electronics, 'WEB_IT', 'WEB-SITE', 'A simple website listing our products and location.');

    // 5: open, the talent has an invitation to answer.
    await boutique.call('POST', '/assignments', { packageCode: 'DES-PRINT', brief: 'A price list and flyer for the new season.' });

    console.log('Demo data loaded. Every demo account uses the password Demo-2026!');
    console.log('Talents:  0920000101 to 0920000106 (Hanna, Meron, Dawit, Selamawit, Yonas, Liya)');
    console.log('Clients:  0920000201 Abeba Coffee House, 0920000202 Piassa Fashion Boutique, 0920000203 Merkato Electronics');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
