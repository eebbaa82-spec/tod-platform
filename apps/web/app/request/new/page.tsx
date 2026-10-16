'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { RequireAuth } from '@/components/shell';
import { Alert, Button, Card, Field, Input, LinkButton, PageTitle, Select, Spinner, Textarea, useAction } from '@/components/ui';
import { FriendlyError, TierBadge } from '@/components/work-common';
import { ApiError, post } from '@/lib/api';
import { etb, toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

export default function NewRequestPage() {
  return (
    <RequireAuth roles={['CLIENT']}>
      <Suspense fallback={<Spinner />}>
        <NewRequest />
      </Suspense>
    </RequireAuth>
  );
}

function NewRequest() {
  const { t, pick } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const preset = params.get('package');
  const packages = useApi<any[]>('/catalogue/packages');
  const client = useApi<{ profile: any; limit: { level: string; limit: number | null } | null }>('/clients/me');

  const [mode, setMode] = useState<'package' | 'describe'>(params.get('describe') ? 'describe' : 'package');
  const [code, setCode] = useState(preset ?? '');
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [deadline, setDeadline] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [budget, setBudget] = useState('');
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (preset) setCode(preset);
  }, [preset]);

  const selected = useMemo(() => (packages.data ?? []).find((p) => p.code === code), [packages.data, code]);
  const limit = client.data?.limit;
  const overLimit = !!(selected && limit && limit.limit !== null && selected.currentVersion?.priceMin > limit.limit);
  const budgetSantim = budget ? toSantim(budget) : 0;
  const budgetOver = !!(mode === 'describe' && limit && limit.limit !== null && budgetSantim > limit.limit);

  const options = useMemo(() => {
    const list = packages.data ?? [];
    return [{ value: '', label: t('Choose a package…', 'ጥቅል ይምረጡ…') }, ...list.map((p) => ({ value: p.code, label: `${pick(p.serviceArea, 'name')}: ${pick(p.currentVersion, 'title')} (${etb(p.currentVersion?.priceStandard)})` }))];
  }, [packages.data, pick, t]);

  const today = new Date().toISOString().slice(0, 10);

  const submit = () =>
    run(async () => {
      const body: Record<string, unknown> = {
        brief: brief.trim(),
        deadline: deadline ? new Date(`${deadline}T17:00:00+03:00`).toISOString() : undefined,
      };
      if (mode === 'package') {
        body.packageCode = code;
        if (title.trim()) body.title = title.trim();
        if (workMode) body.workMode = workMode;
      } else {
        body.title = title.trim();
        if (budget) body.budgetMax = budgetSantim;
      }
      const a = await post<{ id: string }>('/assignments', body);
      router.push(`/assignments/${a.id}`);
    });

  const noProfile = client.data && !client.data.profile;
  const unverified = limit?.level === 'UNVERIFIED' || (client.error instanceof ApiError && client.error.code === 'NO_CLIENT_PROFILE');
  const canSubmit = brief.trim().length >= 10 && (mode === 'package' ? !!code && !overLimit : title.trim().length >= 2 && !budgetOver && (!budget || budgetSantim >= 100));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle sub={t('Pick a ready-made package, or tell us what you need and we will help.', 'ዝግጁ ጥቅል ይምረጡ፣ ወይም የሚፈልጉትን ይንገሩን እና እንረዳዎታለን።')}>{t('Request work', 'ሥራ ይጠይቁ')}</PageTitle>

      {noProfile && (
        <Alert tone="warning">
          {t('First tell us about your business.', 'መጀመሪያ ስለ ንግድዎ ይንገሩን።')}{' '}
          <Link href="/profile/client" className="font-semibold underline">{t('Fill in business profile', 'የንግድ መገለጫ ይሙሉ')}</Link>
        </Alert>
      )}
      {!noProfile && unverified && (
        <Alert tone="warning">
          {t('You need to verify your identity before you can post work.', 'ሥራ ከመለጠፍዎ በፊት ማንነትዎን ማረጋገጥ ያስፈልግዎታል።')}{' '}
          <Link href="/account" className="font-semibold underline">{t('Verify now', 'አሁን ያረጋግጡ')}</Link>
        </Alert>
      )}
      {limit && limit.limit !== null && limit.level !== 'UNVERIFIED' && (
        <p className="text-sm text-stone-600">{t(`Your account can post work worth up to ${etb(limit.limit)} each.`, `መለያዎ እያንዳንዳቸው እስከ ${etb(limit.limit)} የሚያወጡ ሥራዎችን መለጠፍ ይችላል።`)}</p>
      )}

      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(['package', 'describe'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`min-h-12 rounded-lg border px-3 text-sm font-semibold ${mode === m ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white text-stone-800'}`}>
            {m === 'package' ? t('Choose a package', 'ጥቅል ይምረጡ') : t('Describe what you need', 'የሚፈልጉትን ይግለጹ')}
          </button>
        ))}
      </div>

      <Card>
        <div className="space-y-4">
          {mode === 'package' ? (
            <>
              {packages.loading ? (
                <Spinner />
              ) : (
                <Field label={t('Package', 'ጥቅል')}>
                  <Select value={code} onChange={(e) => setCode(e.target.value)} options={options} />
                </Field>
              )}
              {preset && !packages.loading && !selected && <Alert tone="warning">{t('That package is not available. Choose another one.', 'ያ ጥቅል አይገኝም። ሌላ ይምረጡ።')}</Alert>}
              {selected && <PackageSummary p={selected} />}
              {overLimit && <Alert tone="error">{t('This package costs more than your account level allows. Choose a smaller package or update your business level.', 'ይህ ጥቅል መለያዎ ከሚፈቅደው በላይ ያስከፍላል። አነስተኛ ጥቅል ይምረጡ ወይም የንግድ ደረጃዎን ያሻሽሉ።')} <Link href="/profile/client" className="font-semibold underline">{t('Business profile', 'የንግድ መገለጫ')}</Link></Alert>}
              <Field label={t('Short name for this job (optional)', 'ለዚህ ሥራ አጭር ስም (አማራጭ)')}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
              </Field>
            </>
          ) : (
            <>
              <Alert tone="info">{t('Our team will read your request and turn it into a package with a fair price. We will message you when it is ready for talents.', 'ቡድናችን ጥያቄዎን አንብቦ ተመጣጣኝ ዋጋ ያለው ጥቅል ያደርገዋል። ለባለሙያዎች ዝግጁ ሲሆን እናሳውቅዎታለን።')}</Alert>
              <Field label={t('What do you need? (a few words)', 'ምን ይፈልጋሉ? (በጥቂት ቃላት)')}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={t('e.g. A logo for my café', 'ለምሳሌ ለካፌዬ አርማ')} />
              </Field>
              <Field label={t('Most you want to pay, in birr (optional)', 'መክፈል የሚፈልጉት ከፍተኛ መጠን በብር (አማራጭ)')}>
                <Input type="number" min={1} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </Field>
              {budgetOver && <Alert tone="error">{t(`This is more than your account allows (${etb(limit?.limit)}).`, `ይህ መለያዎ ከሚፈቅደው (${etb(limit?.limit)}) በላይ ነው።`)}</Alert>}
            </>
          )}

          <Field label={t('Describe the work', 'ሥራውን ይግለጹ')} hint={t('What should the talent do? What should you get at the end? At least 10 letters.', 'ባለሙያው ምን ማድረግ አለበት? በመጨረሻ ምን ማግኘት አለብዎት? ቢያንስ 10 ፊደላት።')}>
            <Textarea rows={6} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={4000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Needed by (optional)', 'የሚያስፈልግበት ቀን (አማራጭ)')}>
              <Input type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
            {mode === 'package' && (
              <Field label={t('Where should the work happen?', 'ሥራው የት ይሠራ?')}>
                <Select
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value)}
                  options={[
                    { value: '', label: t('Any', 'ማንኛውም') },
                    { value: 'REMOTE', label: t('Remote (from home)', 'በርቀት (ከቤት)') },
                    { value: 'ONSITE', label: t('At my business', 'በንግዴ ቦታ') },
                    { value: 'BOTH', label: t('Either', 'ሁለቱም') },
                  ]}
                />
              </Field>
            )}
          </div>

          <FriendlyError error={error} />
          {error instanceof ApiError && error.code === 'IDENTITY_REQUIRED' && <LinkButton href="/account" tone="secondary">{t('Go to my account', 'ወደ መለያዬ')}</LinkButton>}
          <Button onClick={submit} busy={busy} disabled={!canSubmit || !!noProfile} className="w-full">
            {mode === 'package' ? t('Send to talents', 'ለባለሙያዎች ላክ') : t('Send my request', 'ጥያቄዬን ላክ')}
          </Button>
          <p className="text-xs text-stone-500">{t('You pay nothing now. You pay into the partner bank only after you accept an offer, and the talent is paid only when you accept the work.', 'አሁን ምንም አይከፍሉም። ቅናሽ ከተቀበሉ በኋላ ብቻ ለአጋር ባንኩ ይከፍላሉ፣ ባለሙያው የሚከፈለው ሥራውን ሲቀበሉ ብቻ ነው።')}</p>
        </div>
      </Card>
    </div>
  );
}

function PackageSummary({ p }: { p: any }) {
  const { t, pick } = useLang();
  const v = p.currentVersion;
  if (!v) return null;
  return (
    <div className="space-y-2 rounded-lg bg-stone-50 p-3 text-sm">
      <p className="font-semibold">{pick(v, 'title')}</p>
      <p className="text-stone-700">{pick(v, 'scope')}</p>
      <p>
        <span className="text-stone-500">{t('You get', 'የሚያገኙት')}: </span>
        {pick(v, 'deliverable')}
      </p>
      <p>
        <span className="text-stone-500">{t('Not included', 'ያልተካተተ')}: </span>
        {pick(v, 'exclusions')}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <span className="text-stone-500">{t('Price', 'ዋጋ')}: </span>
          <span className="font-semibold">{etb(v.priceStandard)}</span> <span className="text-xs text-stone-500">({etb(v.priceMin)} – {etb(v.priceMax)})</span>
        </span>
        <span>
          <span className="text-stone-500">{t('Time', 'ጊዜ')}: </span>
          {t(`${v.turnaroundDays} working days`, `${v.turnaroundDays} የሥራ ቀናት`)}
        </span>
        <span>
          <span className="text-stone-500">{t('Changes included', 'የተካተቱ ማስተካከያዎች')}: </span>
          {v.revisionLimit}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-stone-500">{t('Talent level', 'የባለሙያ ደረጃ')}:</span> <TierBadge tier={v.minTier} />
        </span>
      </div>
      <p className="text-xs text-stone-500">{t('Talents may offer a price within the range shown.', 'ባለሙያዎች በተጠቀሰው ክልል ውስጥ ዋጋ ሊያቀርቡ ይችላሉ።')}</p>
    </div>
  );
}
