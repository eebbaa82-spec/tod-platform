'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CodeField, DevCodeHint, getDeviceId, phoneHint } from '@/components/public-common';
import { Button, Card, Checkbox, ErrorText, Field, Input, PageTitle, Select, Spinner, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';

type Role = 'TALENT' | 'CLIENT';

export default function RegisterPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Register />
    </Suspense>
  );
}

function Register() {
  const { t, lang, setLang } = useLang();
  const { refresh } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = params.get('role');
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<Role | ''>(initialRole === 'TALENT' || initialRole === 'CLIENT' ? initialRole : '');
  const [phone, setPhone] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [secretKind, setSecretKind] = useState<'PASSWORD' | 'PIN'>('PASSWORD');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [language, setLanguage] = useState<'en' | 'am'>(lang);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [community, setCommunity] = useState(false);
  const { busy, error, run, setError } = useAction();

  const requestCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    run(async () => {
      const r = await post<{ sent: boolean; devCode?: string }>('/auth/otp', { phone, purpose: 'REGISTER' });
      setDevCode(r.devCode ?? null);
      setStep(2);
    });
  };

  const secretOk = secretKind === 'PIN' ? /^\d{6}$/.test(password) : password.length >= 6;
  const canSubmit = otp.length === 6 && displayName.trim().length >= 2 && secretOk && password === password2 && terms && privacy && community;

  const register = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== password2) {
      setError(new Error(t('The two entries do not match.', 'ሁለቱ ግቤቶች አይመሳሰሉም።')));
      return;
    }
    run(async () => {
      await post('/auth/register', {
        phone,
        otp,
        password,
        displayName: displayName.trim(),
        role,
        language,
        acceptTerms: terms,
        acceptPrivacy: privacy,
        acceptCommunity: community,
        deviceId: getDeviceId() || undefined,
      });
      setLang(language);
      await refresh();
      router.replace(role === 'TALENT' ? '/profile/talent' : '/profile/client');
    });
  };

  const roleCards: { value: Role; title: string; body: string }[] = [
    { value: 'CLIENT', title: t('I run a business', 'ንግድ አለኝ'), body: t('I want to buy services and get work done.', 'አገልግሎት መግዛትና ሥራ ማሠራት እፈልጋለሁ።') },
    { value: 'TALENT', title: t('I am a talent', 'ባለሙያ ነኝ'), body: t('I want to find paid work with my skills.', 'በክህሎቴ የሚከፈልበት ሥራ ማግኘት እፈልጋለሁ።') },
  ];

  return (
    <div className="mx-auto max-w-md">
      <PageTitle sub={t(`Step ${step} of 2`, `ደረጃ ${step} ከ 2`)}>{t('Create your account', 'መለያዎን ይፍጠሩ')}</PageTitle>
      <Card>
        {step === 1 ? (
          <form onSubmit={requestCode} className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t('How will you use ToD?', 'ቶድን እንዴት ይጠቀማሉ?')}</legend>
              <div className="grid gap-2">
                {roleCards.map((r) => (
                  <label
                    key={r.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${role === r.value ? 'border-brand-600 bg-brand-50' : 'border-stone-300 bg-white'}`}
                  >
                    <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="mt-1 size-5 accent-brand-600" />
                    <span>
                      <span className="block font-semibold">{r.title}</span>
                      <span className="block text-sm text-stone-600">{r.body}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label={t('Phone number', 'ስልክ ቁጥር')} hint={phoneHint(t)}>
              <Input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" busy={busy} disabled={!role || phone.trim().length < 9} className="w-full">
              {t('Send me a code', 'ኮድ ላኩልኝ')}
            </Button>
          </form>
        ) : (
          <form onSubmit={register} className="space-y-4">
            <p className="text-sm text-stone-600">
              {t(`We sent a 6-digit code to ${phone}.`, `ወደ ${phone} ባለ 6 አሃዝ ኮድ ልከናል።`)}{' '}
              <button type="button" onClick={() => { setStep(1); setOtp(''); setError(null); }} className="font-semibold text-brand-700 underline">
                {t('Change number', 'ቁጥር ይቀይሩ')}
              </button>
            </p>
            <DevCodeHint code={devCode} />
            <CodeField label={t('Code from SMS', 'ከኤስኤምኤስ የደረሰዎት ኮድ')} value={otp} onChange={setOtp} />
            <Field label={role === 'CLIENT' ? t('Your name or business name', 'ስምዎ ወይም የንግድ ስም') : t('Your name', 'ስምዎ')}>
              <Input autoComplete="name" required minLength={2} maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>

            <fieldset>
              <legend className="mb-1 text-sm font-medium">{t('How do you want to sign in?', 'እንዴት መግባት ይፈልጋሉ?')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['PASSWORD', 'PIN'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={secretKind === k}
                    onClick={() => { setSecretKind(k); setPassword(''); setPassword2(''); }}
                    className={`min-h-11 rounded-lg border text-sm font-medium ${secretKind === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-stone-300 bg-white'}`}
                  >
                    {k === 'PASSWORD' ? t('Password', 'የይለፍ ቃል') : t('6-digit PIN', 'ባለ 6 አሃዝ ፒን')}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field
              label={secretKind === 'PIN' ? t('Choose a 6-digit PIN', 'ባለ 6 አሃዝ ፒን ይምረጡ') : t('Choose a password', 'የይለፍ ቃል ይምረጡ')}
              hint={secretKind === 'PIN' ? t('Use numbers only. Avoid 123456 or your birth date.', 'ቁጥሮችን ብቻ ይጠቀሙ። 123456 ወይም የልደት ቀንዎን አይጠቀሙ።') : t('At least 6 characters.', 'ቢያንስ 6 ቁምፊዎች።')}
            >
              <Input
                type="password"
                autoComplete="new-password"
                inputMode={secretKind === 'PIN' ? 'numeric' : undefined}
                maxLength={secretKind === 'PIN' ? 6 : 128}
                required
                value={password}
                onChange={(e) => setPassword(secretKind === 'PIN' ? e.target.value.replace(/\D/g, '') : e.target.value)}
              />
            </Field>
            <Field label={t('Type it again', 'እንደገና ይጻፉት')}>
              <Input
                type="password"
                autoComplete="new-password"
                inputMode={secretKind === 'PIN' ? 'numeric' : undefined}
                maxLength={secretKind === 'PIN' ? 6 : 128}
                required
                value={password2}
                onChange={(e) => setPassword2(secretKind === 'PIN' ? e.target.value.replace(/\D/g, '') : e.target.value)}
              />
            </Field>
            {password2 && password !== password2 && <p className="text-sm text-red-700">{t('The two entries do not match.', 'ሁለቱ ግቤቶች አይመሳሰሉም።')}</p>}

            <Field label={t('Language for messages', 'የመልዕክቶች ቋንቋ')}>
              <Select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'am')}
                options={[
                  { value: 'am', label: 'አማርኛ' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Field>

            <fieldset className="rounded-lg bg-stone-50 p-3">
              <legend className="sr-only">{t('Agreements', 'ስምምነቶች')}</legend>
              <p className="mb-1 text-sm font-medium">
                {t('Please read and agree to continue:', 'ለመቀጠል ያንብቡና ይስማሙ፦')}{' '}
                <a href="/policies" target="_blank" className="text-brand-700 underline">{t('Read the rules', 'ደንቦቹን ያንብቡ')}</a>
              </p>
              <Checkbox checked={terms} onChange={(e) => setTerms(e.target.checked)} label={t('I agree to the Terms of Use', 'በአጠቃቀም ደንቦቹ እስማማለሁ')} />
              <Checkbox checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} label={t('I agree to the Privacy Notice (how my data is used)', 'በግላዊነት ማሳሰቢያው (መረጃዬ እንዴት እንደሚያዝ) እስማማለሁ')} />
              <Checkbox checked={community} onChange={(e) => setCommunity(e.target.checked)} label={t('I will follow the Community Rules', 'የማኅበረሰብ ደንቦችን አከብራለሁ')} />
            </fieldset>

            <ErrorText error={error} />
            <Button type="submit" busy={busy} disabled={!canSubmit} className="w-full">
              {t('Create account', 'መለያ ፍጠር')}
            </Button>
            <Button type="button" tone="ghost" className="w-full" onClick={() => requestCode()} disabled={busy}>
              {t('Send a new code', 'አዲስ ኮድ ላክ')}
            </Button>
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-sm text-stone-600">
        {t('Already have an account?', 'መለያ አለዎት?')}{' '}
        <Link href="/login" className="py-2 font-semibold text-brand-700 hover:underline">
          {t('Sign in', 'ይግቡ')}
        </Link>
      </p>
    </div>
  );
}
