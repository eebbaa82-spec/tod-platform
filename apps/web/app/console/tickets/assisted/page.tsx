'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Button, Card, Checkbox, ErrorText, Field, Input, PageTitle, Select, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { useLang } from '@/lib/i18n';

export default function AssistedPage() {
  const { t } = useLang();
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.tickets]}>
      <PageTitle sub={t('Register someone at the desk or on the phone. Their one-time code proves they agreed; you are recorded as the agent.', 'በዴስክ ወይም በስልክ ሰውን ይመዝግቡ። የአንድ ጊዜ ኮዱ ፈቃዳቸውን ያረጋግጣል።')}>
        {t('Assisted registration', 'የታገዘ ምዝገባ')}
      </PageTitle>
      <Assisted />
    </RequireAuth>
  );
}

function Assisted() {
  const { t } = useLang();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [f, setF] = useState({ otp: '', displayName: '', role: 'TALENT', language: 'am', acceptTerms: false, acceptPrivacy: false, acceptCommunity: false });
  const [user, setUser] = useState<any>(null);
  const sendA = useAction();
  const regA = useAction();

  const reset = () => {
    setStep(1);
    setPhone('');
    setDevCode(null);
    setUser(null);
    setF({ otp: '', displayName: '', role: 'TALENT', language: 'am', acceptTerms: false, acceptPrivacy: false, acceptCommunity: false });
  };

  const send = async () => {
    const r: any = await sendA.run(() => post('/auth/otp', { phone, purpose: 'ASSISTED_CONSENT' }));
    if (r) {
      setDevCode(r.devCode ?? null);
      setStep(2);
    }
  };

  if (step === 3 && user) {
    return (
      <Card>
        <Alert tone="success">{t(`${user.displayName} is registered.`, `${user.displayName} ተመዝግቧል።`)}</Alert>
        <p className="mt-3 text-sm text-stone-700">
          {t('Tell them to set their own password with "Forgot password" on the sign-in page, using this phone number. Then they can finish their profile and verify their identity.', 'በመግቢያ ገጹ "የይለፍ ቃል ረሳሁ" በመጠቀም የራሳቸውን የይለፍ ቃል እንዲያዘጋጁ ይንገሯቸው።')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/console/users/${user.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            {t('Open their account', 'መለያቸውን ክፈት')}
          </Link>
          <Button tone="secondary" onClick={reset}>
            {t('Register someone else', 'ሌላ ሰው መዝግብ')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t('1. Send a consent code', '1. የፈቃድ ኮድ ላክ')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Field label={t("The person's phone", 'የሰውየው ስልክ')}>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="09…" disabled={step === 2} />
          </Field>
          <ErrorText error={sendA.error} />
          {step === 1 ? (
            <Button type="submit" busy={sendA.busy}>
              {t('Send code by SMS', 'ኮድ በኤስኤምኤስ ላክ')}
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" tone="secondary" busy={sendA.busy} onClick={send}>
                {t('Send again', 'እንደገና ላክ')}
              </Button>
              <Button type="button" tone="ghost" onClick={() => setStep(1)}>
                {t('Change number', 'ቁጥር ቀይር')}
              </Button>
            </div>
          )}
          {devCode && <Alert tone="warning">{t(`Test environment: the code is ${devCode}`, `የሙከራ አካባቢ፦ ኮዱ ${devCode} ነው`)}</Alert>}
        </form>
      </Card>

      {step === 2 && (
        <Card title={t('2. Read the documents and register', '2. ሰነዶቹን አንብበው ይመዝግቡ')}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await regA.run(() => post('/auth/assisted-registration', { phone, ...f }));
              if (r) {
                setUser(r);
                setStep(3);
              }
            }}
          >
            <Field label={t('Code the person read back to you', 'ሰውየው ያነበበልዎት ኮድ')}>
              <Input inputMode="numeric" pattern="\d{6}" maxLength={6} value={f.otp} onChange={(e) => setF({ ...f, otp: e.target.value.replace(/\D/g, '') })} required />
            </Field>
            <Field label={t('Name', 'ስም')}>
              <Input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required minLength={2} maxLength={80} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Joining as', 'የሚቀላቀሉት እንደ')}>
                <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[{ value: 'TALENT', label: t('Talent', 'ተሰጥኦ') }, { value: 'CLIENT', label: t('Client (business)', 'ደንበኛ (ንግድ)') }]} />
              </Field>
              <Field label={t('Language', 'ቋንቋ')}>
                <Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} options={[{ value: 'am', label: 'አማርኛ' }, { value: 'en', label: 'English' }]} />
              </Field>
            </div>
            <fieldset className="rounded-lg border border-stone-200 p-3">
              <legend className="px-1 text-sm font-medium">{t('Confirm the person heard and accepted each document', 'ሰውየው እያንዳንዱን ሰነድ ሰምቶ መቀበሉን ያረጋግጡ')}</legend>
              <Checkbox label={t('Terms of use', 'የአጠቃቀም ደንቦች')} checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} />
              <Checkbox label={t('Privacy notice', 'የግላዊነት ማስታወቂያ')} checked={f.acceptPrivacy} onChange={(e) => setF({ ...f, acceptPrivacy: e.target.checked })} />
              <Checkbox label={t('Community standards', 'የማህበረሰብ መመዘኛዎች')} checked={f.acceptCommunity} onChange={(e) => setF({ ...f, acceptCommunity: e.target.checked })} />
            </fieldset>
            <ErrorText error={regA.error} />
            <Button type="submit" busy={regA.busy} disabled={!f.acceptTerms || !f.acceptPrivacy || !f.acceptCommunity || f.otp.length !== 6}>
              {t('Register', 'መዝግብ')}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
