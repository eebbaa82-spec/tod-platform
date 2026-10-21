import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { authenticator } from 'otplib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClockService } from '../src/common/clock.service';
import { PrismaService } from '../src/common/prisma.service';
import { configureApp } from '../src/main';

export type Api = ReturnType<typeof client>;

let phoneSeq = Math.floor(Math.random() * 1_000_000);
export const nextPhone = () => `09${String(10_000_000 + (phoneSeq++ % 89_999_999)).padStart(8, '0')}`;

export async function bootApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ logger: ['error'] });
  await configureApp(app);
  await app.init();
  return app;
}

// A small HTTP client bound to one user's session.
export function client(app: INestApplication, token?: string) {
  const h = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  const http = () => request(app.getHttpServer());
  const call = async (method: 'get' | 'post' | 'put' | 'delete', path: string, body?: object, expect?: number) => {
    const res = await h(http()[method](`/api${path}`)).send(body ?? {});
    if (expect !== undefined && res.status !== expect) {
      throw new Error(`${method.toUpperCase()} ${path} returned ${res.status}, expected ${expect}: ${JSON.stringify(res.body)}`);
    }
    if (expect === undefined && res.status >= 400) {
      throw new Error(`${method.toUpperCase()} ${path} failed with ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body;
  };
  return {
    token,
    get: (p: string, expect?: number) => call('get', p, undefined, expect),
    post: (p: string, b?: object, expect?: number) => call('post', p, b, expect),
    put: (p: string, b?: object, expect?: number) => call('put', p, b, expect),
    del: (p: string, expect?: number) => call('delete', p, undefined, expect),
    raw: (p: string) => h(http().get(`/api${p}`)),
  };
}

export async function register(app: INestApplication, role: 'TALENT' | 'CLIENT', name: string, opts: { phone?: string; language?: 'en' | 'am'; password?: string } = {}) {
  const phone = opts.phone ?? nextPhone();
  const anon = client(app);
  const otp = await anon.post('/auth/otp', { phone, purpose: 'REGISTER' });
  const res = await anon.post('/auth/register', {
    phone, otp: otp.devCode, password: opts.password ?? 'secret-123', displayName: name, role, language: opts.language ?? 'en',
    acceptTerms: true, acceptPrivacy: true, acceptCommunity: true,
  });
  return { api: client(app, res.token), id: res.user.id as string, phone };
}

// Staff sign in with an authenticator app; the test computes the code from the secret.
const secrets = new Map<string, string>();
export async function staff(app: INestApplication, phone: string) {
  const anon = client(app);
  let r = await anon.post('/auth/login', { phone, password: 'ChangeMe-2026!' });
  if (r.next === 'MFA_SETUP') secrets.set(phone, r.mfaSetup.secret);
  // Another spec file may already have enrolled this account; read its secret back.
  if (!secrets.has(phone)) {
    const u = await app.get(PrismaService).user.findUniqueOrThrow({ where: { phone } });
    secrets.set(phone, u.mfaSecret!);
  }
  r = await anon.post('/auth/login', { phone, password: 'ChangeMe-2026!', mfaCode: authenticator.generate(secrets.get(phone)!) });
  return { api: client(app, r.token), id: r.user.id as string };
}

export const STAFF = {
  superAdmin: '+251911000001',
  platformAdmin: '+251911000002',
  support: '+251911000003',
  vetting: '+251911000004',
  finance: '+251911000005',
  mel: '+251911000006',
};

export function advanceHours(app: INestApplication, hours: number) {
  app.get(ClockService).advance(hours * 3_600_000);
}
