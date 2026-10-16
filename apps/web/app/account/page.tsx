'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, Checkbox, ErrorText, Field, Input, Modal, PageTitle, Select, StatusBadge, Textarea, useAction } from '@/components/ui';
import { get, post } from '@/lib/api';
import { date, humanise } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}

function Account() {
  const { t } = useLang();
  const { me } = useSession();
  if (!me) return null;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle sub={t('Your details, settings and data.', 'ዝርዝሮችዎ፣ ቅንብሮችዎና መረጃዎ።')}>{t('My account', 'መለያዬ')}</PageTitle>
      <Summary />
      <Identity />
      <Roles />
      <Preferences />
      <MyData />
    </div>
  );
}

function useRoleLabel() {
  const { t } = useLang();
  return (r: string) => (r === 'TALENT' ? t('Talent', 'ባለሙያ') : r === 'CLIENT' ? t('Business', 'ንግድ') : humanise(r));
}

function Summary() {
  const { t } = useLang();
  const { me } = useSession();
  const roleLabel = useRoleLabel();
  if (!me) return null;
  return (
    <Card title={t('Summary', 'ማጠቃለያ')}>
      <dl className="space-y-2 text-sm">
        <Row label={t('Name', 'ስም')} value={me.verifiedName ?? me.displayName} />
        {me.verifiedName && me.verifiedName !== me.displayName && <Row label={t('Display name', 'የሚታይ ስም')} value={me.displayName} />}
        <Row label={t('Phone', 'ስልክ')} value={me.phone} />
        <Row
          label={t('Roles', 'ሚናዎች')}
          value={
            <span className="flex flex-wrap justify-end gap-1">
              {me.roles.map((r) => (
                <Badge key={r} tone="blue">
                  {roleLabel(r)}
                </Badge>
              ))}
            </span>
          }
        />
        <Row label={t('Account status', 'የመለያ ሁኔታ')} value={<StatusBadge status={me.status} />} />
      </dl>
    </Card>
  );
}

function Identity() {
  const { t } = useLang();
  const { me, refresh } = useSession();
  const { busy, error, run } = useAction();
  const [result, setResult] = useState<{ status: string; message?: string; redirectUrl?: string } | null>(null);
  if (!me) return null;
  const s = me.identityStatus;
  const label: Record<string, string> = {
    UNVERIFIED: t('Not verified', 'አልተረጋገጠም'),
    PENDING: t('Waiting for check', 'ማረጋገጫ በመጠባበቅ ላይ'),
    PROVISIONAL: t('Provisionally verified', 'በጊዜያዊነት የተረጋገጠ'),
    VERIFIED: t('Verified', 'የተረጋገጠ'),
    FAILED: t('Check failed', 'ማረጋገጫው አልተሳካም'),
  };
  const start = () =>
    run(async () => {
      const r = await post<{ status: string; message?: string; redirectUrl?: string }>('/me/identity/start');
      setResult(r);
      await refresh();
      if (r.redirectUrl && /^https?:\/\//i.test(r.redirectUrl)) window.location.href = r.redirectUrl;
    });
  return (
    <Card title={t('Identity (Fayda)', 'ማንነት (ፋይዳ)')}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={s} label={label[s] ?? humanise(s)} />
        {me.identityMasked && <span className="font-mono text-stone-700">{me.identityMasked}</span>}
      </div>
      <p className="mt-2 text-sm text-stone-600">
        {t(
          'A verified identity builds trust. We only keep a masked form of your ID number.',
          'የተረጋገጠ ማንነት እምነትን ይገነባል። የመታወቂያ ቁጥርዎን የምንይዘው በተሸፈነ መልኩ ብቻ ነው።',
        )}
      </p>
      {result?.message && (
        <div className="mt-3">
          <Alert tone="info">{result.message}</Alert>
        </div>
      )}
      {result?.redirectUrl && (
        <a href={result.redirectUrl} className="mt-2 inline-block py-2 text-sm font-semibold text-brand-700 underline">
          {t('Continue to Fayda', 'ወደ ፋይዳ ይቀጥሉ')}
        </a>
      )}
      <ErrorText error={error} />
      {s !== 'VERIFIED' && s !== 'PENDING' && (
        <Button onClick={start} busy={busy} className="mt-3 w-full sm:w-auto">
          {t('Verify my identity', 'ማንነቴን አረጋግጥ')}
        </Button>
      )}
    </Card>
  );
}

function Roles() {
  const { t } = useLang();
  const { me, refresh, isStaff } = useSession();
  const { busy, error, run } = useAction();
  const [added, setAdded] = useState<string | null>(null);
  if (!me || isStaff) return null;
  const missing = (['TALENT', 'CLIENT'] as const).filter((r) => !me.roles.includes(r));
  if (!missing.length && !added) return null;
  const add = (role: 'TALENT' | 'CLIENT') =>
    run(async () => {
      await post('/auth/roles', { role });
      setAdded(role);
      await refresh();
    });
  return (
    <Card title={t('Use ToD another way', 'ቶድን በሌላ መንገድ ይጠቀሙ')}>
      {added ? (
        <div className="space-y-2">
          <Alert tone="success">{t('Role added.', 'ሚናው ተጨምሯል።')}</Alert>
          <Link href={added === 'TALENT' ? '/profile/talent' : '/profile/client'} className="inline-block py-2 text-sm font-semibold text-brand-700 underline">
            {added === 'TALENT' ? t('Set up my talent profile', 'የባለሙያ መገለጫዬን አዘጋጅ') : t('Set up my business profile', 'የንግድ መገለጫዬን አዘጋጅ')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-stone-600">{t('One account can be both a business and a talent.', 'አንድ መለያ ንግድም ባለሙያም ሊሆን ይችላል።')}</p>
          {missing.map((r) => (
            <Button key={r} tone="secondary" onClick={() => add(r)} busy={busy} className="w-full sm:w-auto">
              {r === 'TALENT' ? t('Also work as a talent', 'እንደ ባለሙያም ልሥራ') : t('Also buy services as a business', 'እንደ ንግድም አገልግሎት ልግዛ')}
            </Button>
          ))}
          <ErrorText error={error} />
        </div>
      )}
    </Card>
  );
}

const CHANNELS = ['SMS', 'TELEGRAM', 'EMAIL'] as const;

function Preferences() {
  const { t, setLang } = useLang();
  const { me, refresh } = useSession();
  const [language, setLanguage] = useState<'en' | 'am'>(me?.language ?? 'en');
  const [channels, setChannels] = useState<string[]>((me?.notifyChannels as string[] | undefined) ?? ['IN_APP']);
  const [email, setEmail] = useState<string>(me?.email ?? '');
  const [telegram, setTelegram] = useState('');
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!me) return;
    setLanguage(me.language);
    setChannels((me.notifyChannels as string[] | undefined) ?? ['IN_APP']);
    setEmail(me.email ?? '');
  }, [me]);

  const toggle = (c: string, on: boolean) => setChannels((prev) => (on ? Array.from(new Set([...prev, c])) : prev.filter((x) => x !== c)));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    run(async () => {
      const body: Record<string, unknown> = { language, channels };
      if (email.trim()) body.email = email.trim();
      if (telegram.trim()) body.telegramChatId = telegram.trim();
      await post('/notifications/preferences', body);
      setLang(language);
      await refresh();
      setSaved(true);
    });
  };

  const label: Record<string, string> = { SMS: t('SMS text message', 'የኤስኤምኤስ መልዕክት'), TELEGRAM: 'Telegram', EMAIL: t('Email', 'ኢሜይል') };

  return (
    <Card title={t('Notifications', 'ማሳወቂያዎች')}>
      <form onSubmit={save} className="space-y-3">
        <Field label={t('Language', 'ቋንቋ')}>
          <Select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'en' | 'am')}
            options={[
              { value: 'am', label: 'አማርኛ' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>
        <div>
          <p className="text-sm font-medium">{t('How should we reach you?', 'በምን እናግኝዎት?')}</p>
          <p className="text-xs text-stone-500">{t('You always see notifications in the app.', 'ማሳወቂያዎችን ሁልጊዜ በመተግበሪያው ውስጥ ያያሉ።')}</p>
          {CHANNELS.map((c) => (
            <Checkbox key={c} checked={channels.includes(c)} onChange={(e) => toggle(c, e.target.checked)} label={label[c]} />
          ))}
        </div>
        {channels.includes('EMAIL') && (
          <Field label={t('Email address', 'የኢሜይል አድራሻ')}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        )}
        {channels.includes('TELEGRAM') && (
          <Field label={t('Telegram chat ID', 'የቴሌግራም ቻት መለያ')} hint={t('Leave empty to keep the one you saved before.', 'ቀድሞ ያስቀመጡትን ለማቆየት ባዶ ይተዉት።')}>
            <Input inputMode="numeric" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
          </Field>
        )}
        <ErrorText error={error} />
        {saved && <Alert tone="success">{t('Saved.', 'ተቀምጧል።')}</Alert>}
        <Button type="submit" busy={busy} className="w-full sm:w-auto">
          {t('Save settings', 'ቅንብሮችን አስቀምጥ')}
        </Button>
      </form>
    </Card>
  );
}

function MyData() {
  const { t, lang } = useLang();
  const { logout } = useSession();
  const exp = useAction();
  const deact = useAction();
  const erase = useAction();
  const [deactOpen, setDeactOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [eraseOpen, setEraseOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [erased, setErased] = useState<{ requestedAt: string; ticket?: string } | null>(null);

  const download = () =>
    exp.run(async () => {
      const data = await get('/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tod-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  const deactivate = () =>
    deact.run(async () => {
      await post('/me/deactivate', { password });
      await logout();
    });

  const requestErasure = () =>
    erase.run(async () => {
      const r = await post<{ requestedAt: string; ticket?: string }>('/me/erasure', reason.trim() ? { reason: reason.trim() } : {});
      setErased(r);
    });

  return (
    <Card title={t('My data', 'የእኔ መረጃ')}>
      <div className="space-y-5">
        <div>
          <p className="text-sm text-stone-600">{t('Get a copy of everything ToD holds about you.', 'ቶድ ስለእርስዎ የያዘውን መረጃ በሙሉ ቅጂ ያግኙ።')}</p>
          <Button tone="secondary" onClick={download} busy={exp.busy} className="mt-2 w-full sm:w-auto">
            {t('Download my data', 'መረጃዬን አውርድ')}
          </Button>
          <ErrorText error={exp.error} />
        </div>

        <div className="border-t border-stone-100 pt-4">
          <p className="text-sm font-medium">{t('Deactivate account', 'መለያን አቦዝን')}</p>
          <p className="text-sm text-stone-600">
            {t('Your profile is hidden and you cannot sign in. Finish or cancel active work first.', 'መገለጫዎ ይደበቃል፣ መግባትም አይችሉም። በመጀመሪያ ንቁ ሥራዎችን ይጨርሱ ወይም ይሰርዙ።')}
          </p>
          <Button tone="secondary" onClick={() => setDeactOpen(true)} className="mt-2 w-full sm:w-auto">
            {t('Deactivate', 'አቦዝን')}
          </Button>
        </div>

        <div className="border-t border-stone-100 pt-4">
          <p className="text-sm font-medium">{t('Ask us to erase my data', 'መረጃዬ እንዲሰረዝ ይጠይቁ')}</p>
          <p className="text-sm text-stone-600">
            {t(
              'Our team handles erasure requests. Payment and financial records are kept for the period the law and our funders require, then deleted.',
              'የመሰረዝ ጥያቄዎችን ቡድናችን ያስተናግዳል። የክፍያና የፋይናንስ መዝገቦች ሕጉና ደጋፊዎቻችን ለሚጠይቁት ጊዜ ይቆያሉ፣ ከዚያ ይሰረዛሉ።',
            )}
          </p>
          {erased ? (
            <div className="mt-2">
              <Alert tone="success">
                {t('Request received on', 'ጥያቄው የደረሰው በ')} {date(erased.requestedAt, lang)}
                {erased.ticket ? ` · ${t('Reference', 'መለያ ቁጥር')} ${erased.ticket}` : ''}
              </Alert>
            </div>
          ) : (
            <Button tone="danger" onClick={() => setEraseOpen(true)} className="mt-2 w-full sm:w-auto">
              {t('Request erasure', 'መሰረዝ ጠይቅ')}
            </Button>
          )}
        </div>
      </div>

      <Modal open={deactOpen} onClose={() => setDeactOpen(false)} title={t('Deactivate account', 'መለያን አቦዝን')}>
        <div className="space-y-3">
          <p className="text-sm">{t('Enter your password or PIN to confirm.', 'ለማረጋገጥ የይለፍ ቃልዎን ወይም ፒንዎን ያስገቡ።')}</p>
          <Field label={t('Password or PIN', 'የይለፍ ቃል ወይም ፒን')}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorText error={deact.error} />
          <Button tone="danger" onClick={deactivate} busy={deact.busy} disabled={!password} className="w-full">
            {t('Deactivate my account', 'መለያዬን አቦዝን')}
          </Button>
        </div>
      </Modal>

      <Modal open={eraseOpen && !erased} onClose={() => setEraseOpen(false)} title={t('Request erasure', 'መሰረዝ ጠይቅ')}>
        <div className="space-y-3">
          <Field label={t('Why? (optional)', 'ለምን? (አማራጭ)')}>
            <Textarea maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <ErrorText error={erase.error} />
          <Button tone="danger" onClick={requestErasure} busy={erase.busy} className="w-full">
            {t('Send request', 'ጥያቄ ላክ')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2 last:border-0">
      <dt className="text-stone-600">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
