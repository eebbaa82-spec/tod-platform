'use client';
import { useEffect, useRef, useState } from 'react';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, Checkbox, Empty, ErrorText, Field, Input, LinkButton, PageTitle, Select, Spinner, Textarea, useAction } from '@/components/ui';
import { FileLink, FileUploader, identityLabel, subCityOptions, TierBadge, vettingLabel } from '@/components/work-common';
import { del, post, put, upload } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function TalentProfilePage() {
  return (
    <RequireAuth roles={['TALENT']}>
      <TalentProfile />
    </RequireAuth>
  );
}

const DAYS: { v: string; en: string; am: string }[] = [
  { v: 'MON', en: 'Mon', am: 'ሰኞ' },
  { v: 'TUE', en: 'Tue', am: 'ማክሰኞ' },
  { v: 'WED', en: 'Wed', am: 'ረቡዕ' },
  { v: 'THU', en: 'Thu', am: 'ሐሙስ' },
  { v: 'FRI', en: 'Fri', am: 'ዓርብ' },
  { v: 'SAT', en: 'Sat', am: 'ቅዳሜ' },
  { v: 'SUN', en: 'Sun', am: 'እሑድ' },
];

const LANGUAGES: { v: string; en: string; am: string }[] = [
  { v: 'Amharic', en: 'Amharic', am: 'አማርኛ' },
  { v: 'English', en: 'English', am: 'እንግሊዝኛ' },
  { v: 'Afaan Oromo', en: 'Afaan Oromo', am: 'አፋን ኦሮሞ' },
  { v: 'Tigrinya', en: 'Tigrinya', am: 'ትግርኛ' },
  { v: 'Somali', en: 'Somali', am: 'ሶማሊኛ' },
  { v: 'Sidaamu Afoo', en: 'Sidaamu Afoo', am: 'ሲዳምኛ' },
  { v: 'Arabic', en: 'Arabic', am: 'ዓረብኛ' },
];

type Edu = { level: string; institution: string; field?: string; year?: number };
type Cred = { name: string; issuer?: string; year?: number };
type Exp = { role: string; organisation?: string; years?: number; description?: string };

function TalentProfile() {
  const { t } = useLang();
  const { data, loading, error, reload } = useApi<any>('/talent/me');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!data) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle sub={t(`Your profile is ${data.completeness}% complete.`, `መገለጫዎ ${data.completeness}% ተሟልቷል።`)}>{t('My talent profile', 'የባለሙያ መገለጫዬ')}</PageTitle>
      <PhotoPanel p={data} reload={reload} />
      <StatusPanel p={data} reload={reload} />
      <ProfileForm p={data} reload={reload} />
      <Portfolio p={data} reload={reload} />
      <Payout p={data} reload={reload} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------

function initials(name: string | null | undefined) {
  return (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

function PhotoPanel({ p, reload }: { p: any; reload: () => void }) {
  const { t } = useLang();
  const { me } = useSession();
  const ref = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAction();
  const name = p.identity?.verifiedName ?? me?.verifiedName ?? me?.displayName;

  const choose = (list: FileList | null) => {
    const f = list?.[0];
    if (ref.current) ref.current.value = '';
    if (!f) return;
    run(async () => {
      if (!f.type.startsWith('image/')) throw new Error(t('Choose a PNG, JPEG or WebP photo.', 'PNG፣ JPEG ወይም WebP ፎቶ ይምረጡ።'));
      const r = await upload(f, 'PHOTO');
      await put('/talent/me/photo', { fileId: r.id });
      reload();
    });
  };
  const remove = () =>
    run(async () => {
      await put('/talent/me/photo', { fileId: null });
      reload();
    });

  return (
    <Card title={t('Profile photo', 'የመገለጫ ፎቶ')}>
      <div className="flex flex-wrap items-center gap-4">
        {p.photoFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${p.photoFileId}`} alt={t('Your profile photo', 'የመገለጫ ፎቶዎ')} className="size-20 rounded-full border border-stone-200 object-cover" />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">{initials(name)}</span>
        )}
        <div className="flex-1 space-y-2">
          <p className="text-sm text-stone-600">{t('A clear photo of your face helps clients trust you. It is shown on your public profile.', 'ግልጽ የፊት ፎቶ ደንበኞች እንዲያምኑዎት ይረዳል። በይፋዊ መገለጫዎ ላይ ይታያል።')}</p>
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => choose(e.target.files)} />
          <div className="flex flex-wrap gap-2">
            <Button tone="secondary" busy={busy} onClick={() => ref.current?.click()}>
              {p.photoFileId ? t('Change photo', 'ፎቶ ቀይር') : t('Add a photo', 'ፎቶ ያክሉ')}
            </Button>
            {p.photoFileId && (
              <Button tone="ghost" busy={busy} onClick={remove}>
                {t('Remove photo', 'ፎቶ አስወግድ')}
              </Button>
            )}
          </div>
          <ErrorText error={error} />
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Identity, vetting and tiers
// ---------------------------------------------------------------------------

function StatusPanel({ p, reload }: { p: any; reload: () => void }) {
  const { t, pick } = useLang();
  const { refresh } = useSession();
  const idAct = useAction();
  const vetAct = useAction();
  const [idMsg, setIdMsg] = useState<string | null>(null);
  const idStatus = p.identity?.status as string;
  const idOk = idStatus === 'VERIFIED' || idStatus === 'PROVISIONAL';

  const startIdentity = () =>
    idAct.run(async () => {
      const r = await post<{ status: string; redirectUrl?: string; message?: string }>('/me/identity/start');
      if (r.redirectUrl) {
        window.location.href = r.redirectUrl;
        return;
      }
      setIdMsg(r.status === 'VERIFIED' ? t('Your identity is already verified.', 'ማንነትዎ ቀድሞውኑ ተረጋግጧል።') : t('Your identity check has started. Our team will finish it and let you know by SMS.', 'የማንነት ማረጋገጫዎ ተጀምሯል። ቡድናችን አጠናቅቆ በSMS ያሳውቅዎታል።'));
      await refresh();
      reload();
    });

  const requestVetting = () =>
    vetAct.run(async () => {
      await post('/me/vetting/request');
      reload();
    });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card title={t('Identity', 'ማንነት')}>
        <div className="space-y-3 text-sm">
          <p>
            <Badge tone={idStatus === 'VERIFIED' ? 'green' : idStatus === 'FAILED' ? 'red' : idStatus === 'UNVERIFIED' ? 'gray' : 'amber'}>{identityLabel(idStatus, t)}</Badge>
          </p>
          {p.identity?.verifiedName && (
            <p>
              {t('Verified name', 'የተረጋገጠ ስም')}: <span className="font-semibold">{p.identity.verifiedName}</span>
            </p>
          )}
          {p.identity?.masked && <p className="text-stone-600">{p.identity.masked}</p>}
          {!idOk && idStatus !== 'PENDING' && (
            <Button onClick={startIdentity} busy={idAct.busy} className="w-full">
              {t('Verify my identity with Fayda', 'ማንነቴን በፋይዳ አረጋግጥ')}
            </Button>
          )}
          {idStatus === 'PENDING' && <p className="text-stone-600">{t('We are checking your identity. This usually takes up to two working days.', 'ማንነትዎን እያረጋገጥን ነው። ብዙ ጊዜ እስከ ሁለት የሥራ ቀናት ይወስዳል።')}</p>}
          {idMsg && <Alert tone="success">{idMsg}</Alert>}
          <ErrorText error={idAct.error} />
        </div>
      </Card>

      <Card title={<span id="vetting">{t('Vetting', 'ምዘና')}</span>}>
        <div className="space-y-3 text-sm">
          <p>
            <Badge tone={p.vettingStatus === 'APPROVED' ? 'green' : p.vettingStatus === 'REJECTED' ? 'red' : p.vettingStatus === 'IN_PROGRESS' ? 'amber' : 'gray'}>{vettingLabel(p.vettingStatus, t)}</Badge>
          </p>
          {p.vettingStatus === 'NOT_STARTED' && (
            <>
              <p className="text-stone-600">{t('Vetting checks your skills with a short test and an interview. You need a headline and at least one skill first.', 'ምዘናው ችሎታዎን በአጭር ፈተና እና ቃለ መጠይቅ ያረጋግጣል። መጀመሪያ ርዕስ እና ቢያንስ አንድ ችሎታ ያስፈልጋል።')}</p>
              <Button onClick={requestVetting} busy={vetAct.busy} className="w-full">
                {t('Ask to be vetted', 'ምዘና እንዲደረግልኝ ጠይቅ')}
              </Button>
            </>
          )}
          {p.vettingStatus === 'IN_PROGRESS' && <p className="text-stone-600">{t('A vetting officer will contact you about the test and interview.', 'የምዘና ባለሙያ ስለ ፈተናው እና ቃለ መጠይቁ ያገኝዎታል።')}</p>}
          {p.vettingStatus === 'REJECTED' && <p className="text-stone-600">{t('Your vetting was not approved this time. Contact support to learn what to improve.', 'ምዘናዎ በዚህ ጊዜ አልጸደቀም። ምን ማሻሻል እንዳለብዎ ለማወቅ ድጋፍ ሰጪን ያግኙ።')}</p>}
          <ErrorText error={vetAct.error} />
          {p.tiers?.length > 0 && (
            <div>
              <p className="mb-1 font-medium">{t('My levels', 'ደረጃዎቼ')}</p>
              <ul className="space-y-1">
                {p.tiers.map((tr: any) => (
                  <li key={tr.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-stone-50 px-3 py-2">
                    <span>{pick(tr.serviceArea, 'name')}</span>
                    <span className="flex items-center gap-2">
                      <TierBadge tier={tr.tier} />
                      {tr.testScore !== null && tr.testScore !== undefined && <span className="text-xs text-stone-500">{t(`Test ${tr.testScore}%`, `ፈተና ${tr.testScore}%`)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.publishedAt ? (
            <Alert tone="success">
              {t('Your profile is public.', 'መገለጫዎ ይፋ ነው።')}{' '}
              <a href={`/talent/${p.userId}`} className="font-semibold underline">{t('See it', 'ይመልከቱት')}</a>
            </Alert>
          ) : (
            <p className="text-xs text-stone-500">{t('Your profile becomes public once vetting is approved and your identity is verified.', 'ምዘናዎ ሲጸድቅ እና ማንነትዎ ሲረጋገጥ መገለጫዎ ይፋ ይሆናል።')}</p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile details
// ---------------------------------------------------------------------------

function triValue(v: boolean | null | undefined) {
  return v === true ? 'yes' : v === false ? 'no' : '';
}
function fromTri(v: string): boolean | null {
  return v === 'yes' ? true : v === 'no' ? false : null;
}
const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v));

function ProfileForm({ p, reload }: { p: any; reload: () => void }) {
  const { t } = useLang();
  const [headline, setHeadline] = useState(p.headline ?? '');
  const [bio, setBio] = useState(p.bio ?? '');
  const [subCity, setSubCity] = useState(p.subCity ?? '');
  const [education, setEducation] = useState<Edu[]>(p.education ?? []);
  const [credentials, setCredentials] = useState<Cred[]>(p.credentials ?? []);
  const [experience, setExperience] = useState<Exp[]>(p.experience ?? []);
  const [skills, setSkills] = useState<string>((p.skills ?? []).join(', '));
  const [languages, setLanguages] = useState<string[]>(p.languages ?? []);
  const [hours, setHours] = useState<string>(p.hoursPerWeek ? String(p.hoursPerWeek) : '');
  const [days, setDays] = useState<string[]>(p.workingDays ?? []);
  const [workMode, setWorkMode] = useState<string>(p.workMode ?? 'REMOTE');
  const [disability, setDisability] = useState(triValue(p.disability));
  const [displaced, setDisplaced] = useState(triValue(p.displaced));
  const [otherMarg, setOtherMarg] = useState(triValue(p.otherMarginalised));
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => setSaved(false), [headline, bio, subCity, education, credentials, experience, skills, languages, hours, days, workMode, disability, displaced, otherMarg]);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = () =>
    run(async () => {
      await put('/talent/me', {
        headline: headline.trim() || undefined,
        bio: bio.trim() || undefined,
        subCity: subCity || undefined,
        education: education.filter((e) => e.level.trim() && e.institution.trim()),
        credentials: credentials.filter((c) => c.name.trim()),
        experience: experience.filter((e) => e.role.trim()),
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        languages,
        hoursPerWeek: hours ? Number(hours) : undefined,
        workingDays: days,
        workMode,
        disability: fromTri(disability),
        displaced: fromTri(displaced),
        otherMarginalised: fromTri(otherMarg),
      });
      setSaved(true);
      reload();
    });

  const triOptions = [
    { value: '', label: t('Prefer not to say', 'መናገር አልፈልግም') },
    { value: 'yes', label: t('Yes', 'አዎ') },
    { value: 'no', label: t('No', 'አይ') },
  ];

  return (
    <Card title={t('About me', 'ስለ እኔ')}>
      <div className="space-y-4">
        <Field label={t('Headline', 'ርዕስ')} hint={t('One line about what you do, e.g. "Bookkeeper for small shops"', 'ስለሚሠሩት በአንድ መስመር፣ ለምሳሌ "ለአነስተኛ ሱቆች የሂሳብ መዝገብ ያዥ"')}>
          <Input value={headline} maxLength={120} onChange={(e) => setHeadline(e.target.value)} />
        </Field>
        <Field label={t('About you', 'ስለ እርስዎ')} hint={t('What you are good at and how you work.', 'በምን ጎበዝ እንደሆኑ እና እንዴት እንደሚሠሩ።')}>
          <Textarea value={bio} maxLength={3000} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Field label={t('Sub-city', 'ክፍለ ከተማ')}>
          <Select value={subCity} onChange={(e) => setSubCity(e.target.value)} options={subCityOptions(t, t('Choose…', 'ይምረጡ…'))} />
        </Field>
        <Field label={t('Skills', 'ችሎታዎች')} hint={t('Separate with commas, e.g. Excel, bookkeeping, social media', 'በኮማ ይለዩ፣ ለምሳሌ Excel፣ የሂሳብ አያያዝ፣ ማኅበራዊ ሚዲያ')}>
          <Input value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium text-stone-800">{t('Languages I work in', 'የምሠራባቸው ቋንቋዎች')}</legend>
          <div className="mt-1 grid grid-cols-2 gap-x-4">
            {LANGUAGES.map((l) => (
              <Checkbox key={l.v} label={t(l.en, l.am)} checked={languages.includes(l.v)} onChange={() => setLanguages(toggle(languages, l.v))} />
            ))}
          </div>
        </fieldset>

        <RowsEditor
          title={t('Education', 'ትምህርት')}
          rows={education}
          setRows={setEducation}
          blank={{ level: '', institution: '' }}
          render={(r, set) => (
            <>
              <Field label={t('Level (e.g. Diploma, BA)', 'ደረጃ (ለምሳሌ ዲፕሎማ፣ ዲግሪ)')}><Input value={r.level} onChange={(e) => set({ ...r, level: e.target.value })} /></Field>
              <Field label={t('School or college', 'ትምህርት ቤት ወይም ኮሌጅ')}><Input value={r.institution} onChange={(e) => set({ ...r, institution: e.target.value })} /></Field>
              <Field label={t('Subject', 'የትምህርት ዘርፍ')}><Input value={r.field ?? ''} onChange={(e) => set({ ...r, field: e.target.value || undefined })} /></Field>
              <Field label={t('Year finished', 'ያጠናቀቁበት ዓመት')}><Input inputMode="numeric" value={r.year ?? ''} onChange={(e) => set({ ...r, year: numOrUndef(e.target.value) })} /></Field>
            </>
          )}
        />
        <RowsEditor
          title={t('Certificates and training', 'የምስክር ወረቀቶች እና ስልጠናዎች')}
          rows={credentials}
          setRows={setCredentials}
          blank={{ name: '' }}
          render={(r, set) => (
            <>
              <Field label={t('Name', 'ስም')}><Input value={r.name} onChange={(e) => set({ ...r, name: e.target.value })} /></Field>
              <Field label={t('Given by', 'የሰጠው')}><Input value={r.issuer ?? ''} onChange={(e) => set({ ...r, issuer: e.target.value || undefined })} /></Field>
              <Field label={t('Year', 'ዓመት')}><Input inputMode="numeric" value={r.year ?? ''} onChange={(e) => set({ ...r, year: numOrUndef(e.target.value) })} /></Field>
            </>
          )}
        />
        <RowsEditor
          title={t('Work experience', 'የሥራ ልምድ')}
          rows={experience}
          setRows={setExperience}
          blank={{ role: '' }}
          render={(r, set) => (
            <>
              <Field label={t('What you did', 'የሠሩት ሥራ')}><Input value={r.role} onChange={(e) => set({ ...r, role: e.target.value })} /></Field>
              <Field label={t('Where', 'የት')}><Input value={r.organisation ?? ''} onChange={(e) => set({ ...r, organisation: e.target.value || undefined })} /></Field>
              <Field label={t('How many years', 'ስንት ዓመት')}><Input inputMode="numeric" value={r.years ?? ''} onChange={(e) => set({ ...r, years: numOrUndef(e.target.value) })} /></Field>
              <Field label={t('Short description', 'አጭር መግለጫ')}><Input value={r.description ?? ''} onChange={(e) => set({ ...r, description: e.target.value || undefined })} /></Field>
            </>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Hours I can work each week', 'በሳምንት መሥራት የምችለው ሰዓት')}>
            <Input type="number" min={1} max={80} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <Field label={t('How I work', 'እንዴት እሠራለሁ')}>
            <Select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
              options={[
                { value: 'REMOTE', label: t('From home (remote)', 'ከቤት (በርቀት)') },
                { value: 'ONSITE', label: t('At the business (on site)', 'በሥራ ቦታው ላይ') },
                { value: 'BOTH', label: t('Either', 'ሁለቱም') },
              ]}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-stone-800">{t('Days I can work', 'መሥራት የምችልባቸው ቀናት')}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button key={d.v} type="button" onClick={() => setDays(toggle(days, d.v))} aria-pressed={days.includes(d.v)} className={`min-h-11 min-w-14 rounded-lg border px-3 text-sm font-medium ${days.includes(d.v) ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white text-stone-700'}`}>
                {t(d.en, d.am)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <p className="font-semibold text-sky-900">{t('Optional and private questions', 'አማራጭ እና ሚስጥራዊ ጥያቄዎች')}</p>
          <p className="mt-1 text-sm text-sky-900">
            {t('You do not have to answer. Your answers are never shown on your profile or to clients. They help us make sure ToD reaches everyone, and a confirmed disability can give you a lower commission.', 'መመለስ ግዴታ አይደለም። መልሶችዎ በመገለጫዎ ላይ ወይም ለደንበኞች ፈጽሞ አይታዩም። ToD ሁሉንም እንዲደርስ ይረዱናል፣ የተረጋገጠ የአካል ጉዳትም ዝቅተኛ ኮሚሽን ሊያስገኝልዎ ይችላል።')}
          </p>
          <div className="mt-3 space-y-3">
            <Field label={t('Do you have a disability?', 'የአካል ጉዳት አለብዎት?')}>
              <Select value={disability} onChange={(e) => setDisability(e.target.value)} options={triOptions} />
            </Field>
            <Field label={t('Have you been forced to leave your home (displaced)?', 'ከቤትዎ ለመፈናቀል ተገደው ያውቃሉ?')}>
              <Select value={displaced} onChange={(e) => setDisplaced(e.target.value)} options={triOptions} />
            </Field>
            <Field label={t('Do you belong to another group that is often left out?', 'ብዙ ጊዜ ወደ ጎን የሚገፋ ሌላ ቡድን አባል ነዎት?')}>
              <Select value={otherMarg} onChange={(e) => setOtherMarg(e.target.value)} options={triOptions} />
            </Field>
          </div>
        </div>

        <ErrorText error={error} />
        {saved && <Alert tone="success">{t('Saved.', 'ተቀምጧል።')}</Alert>}
        <Button onClick={save} busy={busy} className="w-full sm:w-auto">
          {t('Save my profile', 'መገለጫዬን አስቀምጥ')}
        </Button>
      </div>
    </Card>
  );
}

function RowsEditor<R>({ title, rows, setRows, blank, render }: { title: string; rows: R[]; setRows: (r: R[]) => void; blank: R; render: (row: R, set: (r: R) => void) => React.ReactNode }) {
  const { t } = useLang();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-stone-800">{title}</legend>
      {rows.map((r, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-stone-200 p-3">
          <div className="grid gap-2 sm:grid-cols-2">{render(r, (nr) => setRows(rows.map((x, j) => (j === i ? nr : x))))}</div>
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="min-h-11 text-sm font-medium text-red-700">
            {t('Remove', 'አስወግድ')}
          </button>
        </div>
      ))}
      <Button type="button" tone="secondary" onClick={() => setRows([...rows, { ...blank }])}>
        + {t('Add', 'ጨምር')}
      </Button>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

function Portfolio({ p, reload }: { p: any; reload: () => void }) {
  const { t } = useLang();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const add = useAction();
  const remove = useAction();

  const submit = () =>
    add.run(async () => {
      await post('/talent/me/portfolio', { title: title.trim(), description: description.trim(), url: url.trim() || undefined, fileId: files[0]?.id });
      setTitle('');
      setDescription('');
      setUrl('');
      setFiles([]);
      reload();
    });

  return (
    <Card title={t('My portfolio', 'የሥራ ናሙናዎቼ')}>
      <p className="mb-3 text-sm text-stone-600">{t('Show clients examples of work you have done. Add a link or a file.', 'የሠሩትን ሥራ ምሳሌ ለደንበኞች ያሳዩ። ሊንክ ወይም ፋይል ያክሉ።')}</p>
      {p.portfolio?.length ? (
        <ul className="mb-4 space-y-2">
          {p.portfolio.map((item: any) => (
            <li key={item.id} className="rounded-lg border border-stone-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-stone-600">{item.description}</p>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-brand-700 underline">
                        {item.url}
                      </a>
                    )}
                    {item.fileId && <FileLink id={item.fileId} />}
                  </div>
                </div>
                <Button tone="ghost" busy={remove.busy} onClick={() => remove.run(async () => { await del(`/talent/me/portfolio/${item.id}`); reload(); })}>
                  {t('Remove', 'አስወግድ')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-4"><Empty>{t('No examples yet.', 'ገና ምሳሌ የለም።')}</Empty></div>
      )}
      <ErrorText error={remove.error} />
      <div className="space-y-3 rounded-lg bg-stone-50 p-3">
        <p className="text-sm font-semibold">{t('Add an example', 'ምሳሌ ያክሉ')}</p>
        <Field label={t('Title', 'ርዕስ')}><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t('What did you do?', 'ምን ሠሩ?')}><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label={t('Link (optional)', 'ሊንክ (አማራጭ)')} hint={t('Start with https://', 'በhttps:// ይጀምሩ')}><Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>
        {files.length === 0 ? <FileUploader purpose="PORTFOLIO" files={files} onChange={(f) => setFiles(f.slice(0, 1))} /> : <FileUploader purpose="PORTFOLIO" files={files} onChange={setFiles} label={t('Replace file', 'ፋይል ቀይር')} />}
        <ErrorText error={add.error} />
        <Button onClick={submit} busy={add.busy} disabled={title.trim().length < 2 || description.trim().length < 2 || (!url.trim() && !files.length)} className="w-full sm:w-auto">
          {t('Add to portfolio', 'ወደ ናሙናዎች ጨምር')}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payout account
// ---------------------------------------------------------------------------

function Payout({ p, reload }: { p: any; reload: () => void }) {
  const { t } = useLang();
  const verifiedName: string | null = p.identity?.verifiedName ?? null;
  const [channel, setChannel] = useState<string>(p.payoutChannel ?? 'TELEBIRR');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState<string>(p.payoutAccountName ?? verifiedName ?? '');
  const [bankName, setBankName] = useState('');
  const [result, setResult] = useState<any>(null);
  const { busy, error, run } = useAction();

  const save = () =>
    run(async () => {
      const r = await put('/talent/me/payout', { channel, accountNumber: accountNumber.trim(), accountName: accountName.trim(), bankName: channel === 'BANK' ? bankName.trim() || undefined : undefined });
      setResult(r);
      setAccountNumber('');
      reload();
    });

  return (
    <Card title={<span id="payout">{t('Where I get paid', 'ክፍያ የምቀበልበት')}</span>}>
      <div className="space-y-3">
        {p.payoutChannel && (
          <div className="rounded-lg bg-stone-50 p-3 text-sm">
            <p>
              {t('Current account', 'አሁን ያለው ሂሳብ')}: <span className="font-semibold">{channelLabel(p.payoutChannel, t)} {p.payoutAccountMasked}</span>
            </p>
            <p>{t('Name on account', 'በሂሳቡ ላይ ያለ ስም')}: {p.payoutAccountName}</p>
            <p className="mt-1">
              {p.payoutNameVerified ? <Badge tone="green">{t('Name matches your verified name', 'ስሙ ከተረጋገጠው ስምዎ ጋር ይዛመዳል')}</Badge> : <Badge tone="amber">{t('Name does not match yet', 'ስሙ ገና አልተዛመደም')}</Badge>}
            </p>
          </div>
        )}
        <Alert tone="info">
          {t('The name on the account must be the same as your verified name', 'በሂሳቡ ላይ ያለው ስም ከተረጋገጠው ስምዎ ጋር አንድ መሆን አለበት')}
          {verifiedName ? ` (${verifiedName})` : ''}. {t('If it does not match, we cannot send your first payment.', 'ካልተዛመደ የመጀመሪያ ክፍያዎን መላክ አንችልም።')}
          {!verifiedName && ` ${t('Verify your identity first so we know your name.', 'ስምዎን እንድናውቅ መጀመሪያ ማንነትዎን ያረጋግጡ።')}`}
        </Alert>
        <Field label={t('How do you want to be paid?', 'እንዴት መከፈል ይፈልጋሉ?')}>
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            options={[
              { value: 'TELEBIRR', label: 'telebirr' },
              { value: 'CBE_BIRR', label: 'CBE Birr' },
              { value: 'BANK', label: t('Bank account', 'የባንክ ሂሳብ') },
            ]}
          />
        </Field>
        {channel === 'BANK' && (
          <Field label={t('Bank name', 'የባንክ ስም')}>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </Field>
        )}
        <Field label={channel === 'BANK' ? t('Account number', 'የሂሳብ ቁጥር') : t('Phone or wallet number', 'ስልክ ወይም የዋሌት ቁጥር')}>
          <Input inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} autoComplete="off" />
        </Field>
        <Field label={t('Name on the account', 'በሂሳቡ ላይ ያለ ስም')}>
          <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        {result && (result.nameVerified ? <Alert tone="success">{t('Saved. The name matches.', 'ተቀምጧል። ስሙ ይዛመዳል።')}</Alert> : <Alert tone="warning">{t('Saved, but the name does not match your verified name. Please check it.', 'ተቀምጧል፣ ነገር ግን ስሙ ከተረጋገጠው ስምዎ ጋር አይዛመድም። እባክዎ ያረጋግጡ።')}</Alert>)}
        <Button onClick={save} busy={busy} disabled={accountNumber.trim().length < 6 || accountName.trim().length < 2} className="w-full sm:w-auto">
          {t('Save payout account', 'የክፍያ ሂሳብ አስቀምጥ')}
        </Button>
        <p className="text-xs text-stone-500">
          {t('For your safety we only show the last digits of your account.', 'ለደኅንነትዎ የሂሳብዎን የመጨረሻ አሃዞች ብቻ እናሳያለን።')}{' '}
          <LinkButton href="/account" tone="ghost" className="!min-h-0 !px-1 !py-0">{t('Account settings', 'የመለያ ቅንብሮች')}</LinkButton>
        </p>
      </div>
    </Card>
  );
}

function channelLabel(c: string, t: (en: string, am: string) => string) {
  return c === 'BANK' ? t('Bank', 'ባንክ') : c === 'CBE_BIRR' ? 'CBE Birr' : 'telebirr';
}
