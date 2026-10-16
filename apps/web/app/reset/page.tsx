'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CodeField, DevCodeHint, phoneHint } from '@/components/public-common';
import { Alert, Button, Card, ErrorText, Field, Input, LinkButton, PageTitle, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { useLang } from '@/lib/i18n';

export default function ResetPage() {
  const { t } = useLang();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const { busy, error, run, setError } = useAction();

  const requestCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    run(async () => {
      const r = await post<{ sent: boolean; devCode?: string }>('/auth/otp', { phone, purpose: 'RESET' });
      setDevCode(r.devCode ?? null);
      setStep(2);
    });
  };

  const reset = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== password2) {
      setError(new Error(t('The two entries do not match.', 'ሁለቱ ግቤቶች አይመሳሰሉም።')));
      return;
    }
    run(async () => {
      await post('/auth/password/reset', { phone, otp, password });
      setStep(3);
    });
  };

  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub={t('We will send a code to your phone.', 'ወደ ስልክዎ ኮድ እንልካለን።')}>{t('Reset password or PIN', 'የይለፍ ቃል ወይም ፒን ይቀይሩ')}</PageTitle>
      <Card>
        {step === 1 && (
          <form onSubmit={requestCode} className="space-y-4">
            <Field label={t('Phone number', 'ስልክ ቁጥር')} hint={phoneHint(t)}>
              <Input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" busy={busy} disabled={phone.trim().length < 9} className="w-full">
              {t('Send me a code', 'ኮድ ላኩልኝ')}
            </Button>
          </form>
        )}
        {step === 2 && (
          <form onSubmit={reset} className="space-y-4">
            <p className="text-sm text-stone-600">
              {t('If this number has an account, we sent it a 6-digit code.', 'ይህ ቁጥር መለያ ካለው ባለ 6 አሃዝ ኮድ ልከንለታል።')}
            </p>
            <DevCodeHint code={devCode} />
            <CodeField label={t('Code from SMS', 'ከኤስኤምኤስ የደረሰዎት ኮድ')} value={otp} onChange={setOtp} />
            <Field label={t('New password or 6-digit PIN', 'አዲስ የይለፍ ቃል ወይም ባለ 6 አሃዝ ፒን')} hint={t('At least 6 characters.', 'ቢያንስ 6 ቁምፊዎች።')}>
              <Input type="password" autoComplete="new-password" required minLength={6} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label={t('Type it again', 'እንደገና ይጻፉት')}>
              <Input type="password" autoComplete="new-password" required value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" busy={busy} disabled={otp.length !== 6 || password.length < 6 || password !== password2} className="w-full">
              {t('Save new password', 'አዲሱን የይለፍ ቃል አስቀምጥ')}
            </Button>
            <Button type="button" tone="ghost" className="w-full" onClick={() => requestCode()} disabled={busy}>
              {t('Send a new code', 'አዲስ ኮድ ላክ')}
            </Button>
          </form>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <Alert tone="success">{t('Your password was changed. You can sign in now.', 'የይለፍ ቃልዎ ተቀይሯል። አሁን መግባት ይችላሉ።')}</Alert>
            <LinkButton href="/login" className="w-full">
              {t('Sign in', 'ይግቡ')}
            </LinkButton>
          </div>
        )}
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="py-2 font-semibold text-brand-700 hover:underline">
          ← {t('Back to sign in', 'ወደ መግቢያ ተመለስ')}
        </Link>
      </p>
    </div>
  );
}
