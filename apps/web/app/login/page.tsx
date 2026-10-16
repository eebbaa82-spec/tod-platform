'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CodeField, DevCodeHint, getDeviceId, phoneHint } from '@/components/public-common';
import { Alert, Button, Card, ErrorText, Field, Input, PageTitle, Spinner, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { STAFF_ROLES, useSession } from '@/lib/session';

type Step = 'CREDENTIALS' | 'OTP' | 'MFA_SETUP' | 'MFA';
type LoginResponse =
  | { token: string; user: { roles: string[] } }
  | { next: 'OTP' | 'MFA' | 'MFA_SETUP'; devCode?: string; mfaSetup?: { secret: string; otpauth: string } };

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Login />
    </Suspense>
  );
}

// Only allow same-site relative paths as a destination after sign-in.
function safeNext(v: string | null) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
}

function Login() {
  const { t } = useLang();
  const { refresh } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [step, setStep] = useState<Step>('CREDENTIALS');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const { busy, error, run, setError } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const body: Record<string, string> = { phone, password, deviceId: getDeviceId() };
      if (step === 'OTP') body.otp = code.trim();
      if (step === 'MFA' || step === 'MFA_SETUP') body.mfaCode = code.trim();
      const r = await post<LoginResponse>('/auth/login', body);
      if ('next' in r) {
        setCode('');
        setDevCode(r.devCode ?? null);
        if (r.mfaSetup) setSetup(r.mfaSetup);
        setStep(r.next);
        return;
      }
      const u = await refresh();
      const roles = u?.roles ?? r.user.roles ?? [];
      const staff = roles.some((x) => STAFF_ROLES.includes(x));
      router.replace(next ?? (staff ? '/console' : '/dashboard'));
    });
  };

  const back = () => {
    setStep('CREDENTIALS');
    setCode('');
    setDevCode(null);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub={t('Welcome back to Talent on Demand.', 'እንኳን ወደ ቶድ በደህና ተመለሱ።')}>{t('Sign in', 'ይግቡ')}</PageTitle>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          {step === 'CREDENTIALS' && (
            <>
              <Field label={t('Phone number', 'ስልክ ቁጥር')} hint={phoneHint(t)}>
                <Input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" />
              </Field>
              <Field label={t('Password or PIN', 'የይለፍ ቃል ወይም ፒን')}>
                <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </>
          )}

          {step === 'OTP' && (
            <>
              <Alert tone="info">
                {t('This is a new phone or browser. We sent a 6-digit code by SMS to confirm it is you.', 'ይህ አዲስ ስልክ ወይም ብራውዘር ነው። እርስዎ መሆንዎን ለማረጋገጥ ባለ 6 አሃዝ ኮድ በኤስኤምኤስ ልከናል።')}
              </Alert>
              <DevCodeHint code={devCode} />
              <CodeField label={t('Code from SMS', 'ከኤስኤምኤስ የደረሰዎት ኮድ')} value={code} onChange={setCode} />
            </>
          )}

          {step === 'MFA_SETUP' && setup && (
            <>
              <Alert tone="info">
                {t(
                  'Staff accounts need an authenticator app (for example Google Authenticator or Microsoft Authenticator). Add this key to the app, then enter the 6-digit code it shows.',
                  'የሠራተኛ መለያዎች የማረጋገጫ መተግበሪያ ያስፈልጋቸዋል (ለምሳሌ Google Authenticator ወይም Microsoft Authenticator)። ይህን ቁልፍ በመተግበሪያው ላይ ያክሉ፣ ከዚያ የሚያሳየውን ባለ 6 አሃዝ ኮድ ያስገቡ።',
                )}
              </Alert>
              <div>
                <p className="text-sm font-medium">{t('Setup key', 'የማዋቀሪያ ቁልፍ')}</p>
                <p className="mt-1 select-all break-all rounded-lg bg-stone-100 p-3 font-mono text-base tracking-wider">
                  {setup.secret.match(/.{1,4}/g)?.join(' ')}
                </p>
              </div>
              <a href={setup.otpauth} className="block break-all text-sm font-semibold text-brand-700 underline">
                {t('On this phone? Tap to open in your authenticator app', 'በዚህ ስልክ ላይ ነዎት? በማረጋገጫ መተግበሪያዎ ለመክፈት ይጫኑ')}
              </a>
              <CodeField label={t('Code from the app', 'ከመተግበሪያው ኮድ')} value={code} onChange={setCode} />
            </>
          )}

          {step === 'MFA' && <CodeField label={t('Code from your authenticator app', 'ከማረጋገጫ መተግበሪያዎ ኮድ')} value={code} onChange={setCode} />}

          <ErrorText error={error} />
          <Button type="submit" busy={busy} className="w-full" disabled={step !== 'CREDENTIALS' && code.trim().length !== 6}>
            {step === 'CREDENTIALS' ? t('Sign in', 'ይግቡ') : t('Confirm', 'አረጋግጥ')}
          </Button>
          {step !== 'CREDENTIALS' && (
            <Button type="button" tone="ghost" className="w-full" onClick={back}>
              {t('Start again', 'እንደገና ጀምር')}
            </Button>
          )}
        </form>
      </Card>
      <div className="mt-4 flex flex-col items-center gap-1 text-sm">
        <Link href="/reset" className="py-2 font-semibold text-brand-700 hover:underline">
          {t('Forgot password or PIN?', 'የይለፍ ቃል ወይም ፒን ረሱ?')}
        </Link>
        <p className="text-stone-600">
          {t('New to ToD?', 'ለቶድ አዲስ ነዎት?')}{' '}
          <Link href="/register" className="py-2 font-semibold text-brand-700 hover:underline">
            {t('Create an account', 'መለያ ይፍጠሩ')}
          </Link>
        </p>
      </div>
    </div>
  );
}
