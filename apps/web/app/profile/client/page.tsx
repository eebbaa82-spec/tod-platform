'use client';
import { useState } from 'react';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, ErrorText, Field, Input, LinkButton, PageTitle, Select, Spinner, Textarea, useAction } from '@/components/ui';
import { FileLink, FileUploader, identityLabel, subCityOptions } from '@/components/work-common';
import { put } from '@/lib/api';
import { etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

export default function ClientProfilePage() {
  return (
    <RequireAuth roles={['CLIENT']}>
      <ClientProfile />
    </RequireAuth>
  );
}

type Level = 'VERIFIED_ENTERPRISE' | 'BASIC_ENTERPRISE' | 'INDIVIDUAL';

function ClientProfile() {
  const { t } = useLang();
  const { data, loading, error, reload } = useApi<{ profile: any; limit: { level: string; limit: number | null } | null }>('/clients/me');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle sub={t('Tell us about your business so talents know who they work for.', 'ባለሙያዎች ለማን እንደሚሠሩ እንዲያውቁ ስለ ንግድዎ ይንገሩን።')}>{t('My business', 'ንግዴ')}</PageTitle>
      {data?.profile && <LimitPanel profile={data.profile} limit={data.limit} />}
      <ClientForm profile={data?.profile} onSaved={reload} />
    </div>
  );
}

function limitText(level: string, limit: number | null, t: (en: string, am: string) => string) {
  if (level === 'UNVERIFIED') return t('You cannot post work until your identity is verified.', 'ማንነትዎ እስኪረጋገጥ ድረስ ሥራ መለጠፍ አይችሉም።');
  if (limit === null) return t('No limit on the value of each assignment.', 'በእያንዳንዱ ሥራ ዋጋ ላይ ገደብ የለም።');
  return t(`Each assignment can be worth up to ${etb(limit)}.`, `እያንዳንዱ ሥራ እስከ ${etb(limit)} ሊደርስ ይችላል።`);
}

function LimitPanel({ profile, limit }: { profile: any; limit: { level: string; limit: number | null } | null }) {
  const { t } = useLang();
  const idStatus = profile.identity?.status;
  return (
    <Card title={t('What you can do now', 'አሁን ማድረግ የሚችሉት')}>
      <div className="space-y-3 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          {t('Identity', 'ማንነት')}: <Badge tone={idStatus === 'VERIFIED' ? 'green' : idStatus === 'PROVISIONAL' || idStatus === 'PENDING' ? 'amber' : 'gray'}>{identityLabel(idStatus, t)}</Badge>
          {profile.identity?.verifiedName && <span className="font-medium">{profile.identity.verifiedName}</span>}
        </p>
        <p className="flex flex-wrap items-center gap-2">
          {t('Business level', 'የንግድ ደረጃ')}: <Badge tone="blue">{levelName(profile.level, t)}</Badge>
          {profile.level === 'VERIFIED_ENTERPRISE' && (profile.levelConfirmedAt ? <Badge tone="green">{t('Confirmed by ToD', 'በToD ተረጋግጧል')}</Badge> : <Badge tone="amber">{t('Waiting for ToD to check your licence', 'ToD ፈቃድዎን እስኪያረጋግጥ በመጠበቅ ላይ')}</Badge>)}
        </p>
        {limit && <Alert tone={limit.level === 'UNVERIFIED' ? 'warning' : 'info'}>{limitText(limit.level, limit.limit, t)}</Alert>}
        {limit?.level === 'PROVISIONAL' && <p className="text-stone-600">{t('Your identity is provisionally verified, so a lower limit applies until the full check is done.', 'ማንነትዎ በጊዜያዊነት ስለተረጋገጠ ሙሉ ማረጋገጫው እስኪጠናቀቅ ዝቅተኛ ገደብ ይሠራል።')}</p>}
        {profile.level === 'VERIFIED_ENTERPRISE' && !profile.levelConfirmedAt && <p className="text-stone-600">{t('Until we confirm your licence and TIN, the Basic enterprise limit applies.', 'ፈቃድዎን እና TINዎን እስክናረጋግጥ ድረስ የመሠረታዊ ድርጅት ገደብ ይሠራል።')}</p>}
        {idStatus !== 'VERIFIED' && idStatus !== 'PROVISIONAL' && (
          <LinkButton href="/account" className="w-full sm:w-auto">{t('Verify my identity', 'ማንነቴን አረጋግጥ')}</LinkButton>
        )}
      </div>
    </Card>
  );
}

function levelName(level: string, t: (en: string, am: string) => string) {
  if (level === 'VERIFIED_ENTERPRISE') return t('Verified enterprise', 'የተረጋገጠ ድርጅት');
  if (level === 'BASIC_ENTERPRISE') return t('Basic enterprise', 'መሠረታዊ ድርጅት');
  return t('Individual', 'ግለሰብ');
}

function tri(v: boolean | null | undefined) {
  return v === true ? 'yes' : v === false ? 'no' : '';
}
function fromTri(v: string) {
  return v === 'yes' ? true : v === 'no' ? false : undefined;
}

function ClientForm({ profile, onSaved }: { profile: any; onSaved: () => void }) {
  const { t } = useLang();
  const [level, setLevel] = useState<Level>(profile?.level ?? 'INDIVIDUAL');
  const [enterpriseName, setEnterpriseName] = useState(profile?.enterpriseName ?? '');
  const [tradeLicenceNo, setTradeLicenceNo] = useState(profile?.tradeLicenceNo ?? '');
  const [tin, setTin] = useState(profile?.tin ?? '');
  const [sector, setSector] = useState(profile?.sector ?? '');
  const [subCity, setSubCity] = useState(profile?.subCity ?? '');
  const [staffSize, setStaffSize] = useState(profile?.staffSize !== null && profile?.staffSize !== undefined ? String(profile.staffSize) : '');
  const [womenLed, setWomenLed] = useState(tri(profile?.womenLed));
  const [youthLed, setYouthLed] = useState(tri(profile?.youthLed));
  const [pwdOwned, setPwdOwned] = useState(tri(profile?.pwdOwned));
  const [activityEvidence, setActivityEvidence] = useState(profile?.activityEvidence ?? '');
  const [evidence, setEvidence] = useState<{ id: string; name: string }[]>([]);
  const [referralSource, setReferralSource] = useState(profile?.referralSource ?? '');
  const [referralDetail, setReferralDetail] = useState(profile?.referralDetail ?? '');
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  const isEnterprise = level !== 'INDIVIDUAL';
  const isVerified = level === 'VERIFIED_ENTERPRISE';
  const levelChanging = profile && profile.level !== level;

  const save = () =>
    run(async () => {
      setSaved(false);
      await put('/clients/me', {
        level,
        enterpriseName: isEnterprise ? enterpriseName.trim() || undefined : undefined,
        tradeLicenceNo: isVerified ? tradeLicenceNo.trim() || undefined : undefined,
        tin: isVerified ? tin.trim() || undefined : undefined,
        sector: sector.trim() || undefined,
        subCity: subCity || undefined,
        staffSize: staffSize.trim() === '' ? undefined : Number(staffSize),
        womenLed: fromTri(womenLed),
        youthLed: fromTri(youthLed),
        pwdOwned: fromTri(pwdOwned),
        activityEvidence: level === 'BASIC_ENTERPRISE' ? activityEvidence.trim() || undefined : undefined,
        evidenceFileId: level === 'BASIC_ENTERPRISE' ? evidence[0]?.id : undefined,
        referralSource,
        referralDetail: referralDetail.trim() || undefined,
      });
      setSaved(true);
      onSaved();
    });

  const levels: { v: Level; title: string; limit: string; needs: string }[] = [
    {
      v: 'VERIFIED_ENTERPRISE',
      title: t('Verified enterprise', 'የተረጋገጠ ድርጅት'),
      limit: t('No limit on assignment value, once ToD checks your licence.', 'ToD ፈቃድዎን ካረጋገጠ በኋላ በሥራ ዋጋ ላይ ገደብ የለም።'),
      needs: t('Needs: business name, trade licence number, TIN (10 digits), sector, sub-city and number of staff.', 'የሚያስፈልገው፦ የንግድ ስም፣ የንግድ ፈቃድ ቁጥር፣ TIN (10 አሃዝ)፣ ዘርፍ፣ ክፍለ ከተማ እና የሠራተኞች ብዛት።'),
    },
    {
      v: 'BASIC_ENTERPRISE',
      title: t('Basic enterprise', 'መሠረታዊ ድርጅት'),
      limit: t('Each assignment up to ETB 20,000.', 'እያንዳንዱ ሥራ እስከ 20,000 ብር።'),
      needs: t('Needs: business name, and proof your business is active (a note from your association or sub-city office, or a photo or document).', 'የሚያስፈልገው፦ የንግድ ስም፣ እና ንግድዎ እየሠራ መሆኑን የሚያሳይ ማስረጃ (ከማኅበርዎ ወይም ከክፍለ ከተማ ጽ/ቤት ማስታወሻ፣ ወይም ፎቶ ወይም ሰነድ)።'),
    },
    {
      v: 'INDIVIDUAL',
      title: t('Individual', 'ግለሰብ'),
      limit: t('Each assignment up to ETB 20,000.', 'እያንዳንዱ ሥራ እስከ 20,000 ብር።'),
      needs: t('Needs: only your verified identity.', 'የሚያስፈልገው፦ የተረጋገጠ ማንነትዎ ብቻ።'),
    },
  ];

  const triOptions = [
    { value: '', label: t('Prefer not to say', 'መናገር አልፈልግም') },
    { value: 'yes', label: t('Yes', 'አዎ') },
    { value: 'no', label: t('No', 'አይ') },
  ];

  const tinBad = isVerified && tin.trim() !== '' && !/^\d{10}$/.test(tin.trim());

  return (
    <Card title={t('Business details', 'የንግድ ዝርዝሮች')}>
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-stone-800">{t('Which describes you?', 'የትኛው ይገልጽዎታል?')}</legend>
          {levels.map((l) => (
            <label key={l.v} className={`block cursor-pointer rounded-lg border p-3 ${level === l.v ? 'border-brand-600 bg-brand-50' : 'border-stone-200'}`}>
              <span className="flex items-start gap-3">
                <input type="radio" name="level" className="mt-1 size-5 accent-brand-600" checked={level === l.v} onChange={() => setLevel(l.v)} />
                <span>
                  <span className="block font-semibold">{l.title}</span>
                  <span className="block text-sm text-stone-700">{l.limit}</span>
                  <span className="block text-xs text-stone-500">{l.needs}</span>
                </span>
              </span>
            </label>
          ))}
          <p className="text-xs text-stone-500">{t('Limits are set by ToD and may change. Your current limit is shown above after you save.', 'ገደቦቹ በToD የሚወሰኑ ሲሆን ሊለወጡ ይችላሉ። ካስቀመጡ በኋላ የአሁኑ ገደብዎ ከላይ ይታያል።')}</p>
          {levelChanging && <Alert tone="warning">{t('Changing your level means ToD needs to check your details again.', 'ደረጃዎን መቀየር ToD ዝርዝሮችዎን እንደገና እንዲያረጋግጥ ያደርጋል።')}</Alert>}
        </fieldset>

        {isEnterprise && (
          <Field label={t('Business name', 'የንግድ ስም')}>
            <Input value={enterpriseName} onChange={(e) => setEnterpriseName(e.target.value)} maxLength={160} />
          </Field>
        )}
        {isVerified && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Trade licence number', 'የንግድ ፈቃድ ቁጥር')}>
              <Input value={tradeLicenceNo} onChange={(e) => setTradeLicenceNo(e.target.value)} maxLength={60} />
            </Field>
            <Field label={t('Taxpayer number (TIN)', 'የግብር ከፋይ መለያ ቁጥር (TIN)')} hint={tinBad ? t('The TIN has 10 digits.', 'TIN 10 አሃዞች አሉት።') : undefined}>
              <Input inputMode="numeric" value={tin} onChange={(e) => setTin(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isVerified ? t('Sector', 'ዘርፍ') : t('Sector (optional)', 'ዘርፍ (አማራጭ)')} hint={t('e.g. Retail, Food, Tailoring', 'ለምሳሌ ችርቻሮ፣ ምግብ፣ ልብስ ስፌት')}>
            <Input value={sector} onChange={(e) => setSector(e.target.value)} maxLength={80} />
          </Field>
          <Field label={isVerified ? t('Sub-city', 'ክፍለ ከተማ') : t('Sub-city (optional)', 'ክፍለ ከተማ (አማራጭ)')}>
            <Select value={subCity} onChange={(e) => setSubCity(e.target.value)} options={subCityOptions(t, t('Choose…', 'ይምረጡ…'))} />
          </Field>
          {isEnterprise && (
            <Field label={isVerified ? t('Number of staff', 'የሠራተኞች ብዛት') : t('Number of staff (optional)', 'የሠራተኞች ብዛት (አማራጭ)')}>
              <Input type="number" min={0} inputMode="numeric" value={staffSize} onChange={(e) => setStaffSize(e.target.value)} />
            </Field>
          )}
        </div>

        {level === 'BASIC_ENTERPRISE' && (
          <div className="space-y-3 rounded-lg bg-stone-50 p-3">
            <p className="text-sm font-semibold">{t('Proof your business is active', 'ንግድዎ እየሠራ መሆኑን የሚያሳይ ማስረጃ')}</p>
            <Field label={t('Who can confirm your business? Or describe the proof', 'ንግድዎን ማን ሊያረጋግጥ ይችላል? ወይም ማስረጃውን ይግለጹ')}>
              <Textarea rows={3} value={activityEvidence} onChange={(e) => setActivityEvidence(e.target.value)} maxLength={1000} />
            </Field>
            {profile?.evidenceFileId && evidence.length === 0 && (
              <p className="text-sm">
                {t('File already added', 'ፋይል ቀድሞ ተጨምሯል')}: <FileLink id={profile.evidenceFileId} />
              </p>
            )}
            <FileUploader purpose="EVIDENCE" files={evidence} onChange={(f) => setEvidence(f.slice(-1))} label={t('Add a photo or document', 'ፎቶ ወይም ሰነድ ያክሉ')} />
          </div>
        )}

        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <p className="font-semibold text-sky-900">{t('About the owners (optional)', 'ስለ ባለቤቶቹ (አማራጭ)')}</p>
          <p className="mt-1 text-sm text-sky-900">{t('This helps us and our partners see who ToD reaches. It is not shown to talents.', 'ይህ እኛ እና አጋሮቻችን ToD እነማንን እንደሚደርስ እንድናይ ይረዳል። ለባለሙያዎች አይታይም።')}</p>
          <div className="mt-3 space-y-3">
            <Field label={isEnterprise ? t('Is the business led by a woman?', 'ንግዱ በሴት ነው የሚመራው?') : t('Are you a woman?', 'ሴት ነዎት?')}>
              <Select value={womenLed} onChange={(e) => setWomenLed(e.target.value)} options={triOptions} />
            </Field>
            <Field label={isEnterprise ? t('Is it led by a young person (under 30)?', 'በወጣት (ከ30 ዓመት በታች) ነው የሚመራው?') : t('Are you under 30?', 'ዕድሜዎ ከ30 በታች ነው?')}>
              <Select value={youthLed} onChange={(e) => setYouthLed(e.target.value)} options={triOptions} />
            </Field>
            <Field label={isEnterprise ? t('Is it owned by a person with a disability?', 'ባለቤቱ የአካል ጉዳተኛ ነው?') : t('Do you have a disability?', 'የአካል ጉዳት አለብዎት?')}>
              <Select value={pwdOwned} onChange={(e) => setPwdOwned(e.target.value)} options={triOptions} />
            </Field>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('How did you hear about ToD?', 'ስለ ToD እንዴት ሰሙ?')}>
            <Select
              value={referralSource}
              onChange={(e) => setReferralSource(e.target.value)}
              options={[
                { value: '', label: t('Choose…', 'ይምረጡ…') },
                { value: 'ASSOCIATION', label: t('My business association', 'የንግድ ማኅበሬ') },
                { value: 'SUBCITY_OFFICE', label: t('Sub-city office', 'የክፍለ ከተማ ጽ/ቤት') },
                { value: 'CAMPAIGN', label: t('Advert or campaign', 'ማስታወቂያ ወይም ዘመቻ') },
                { value: 'OTHER', label: t('Other', 'ሌላ') },
              ]}
            />
          </Field>
          <Field label={t('Which one? (optional)', 'የትኛው? (አማራጭ)')}>
            <Input value={referralDetail} onChange={(e) => setReferralDetail(e.target.value)} maxLength={160} />
          </Field>
        </div>

        <ErrorText error={error} />
        {saved && <Alert tone="success">{t('Saved.', 'ተቀምጧል።')}</Alert>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={save} busy={busy} disabled={!referralSource || tinBad} className="w-full sm:w-auto">
            {t('Save', 'አስቀምጥ')}
          </Button>
          {profile && (
            <LinkButton href="/request/new" tone="secondary" className="w-full sm:w-auto">
              {t('Request work', 'ሥራ ይጠይቁ')}
            </LinkButton>
          )}
        </div>
      </div>
    </Card>
  );
}
