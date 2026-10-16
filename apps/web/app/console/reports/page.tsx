'use client';
import { useState } from 'react';
import { FilterBar, qs } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Button, Card, ErrorText, Field, Input, PageTitle, Select, Spinner, Table } from '@/components/ui';
import { date, etb, humanise } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function ReportsPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.reports]}>
      <Reports />
    </RequireAuth>
  );
}

const DIM_LABELS: Record<string, [string, string]> = {
  sex: ['Sex', 'ጾታ'],
  ageBand: ['Age band', 'የዕድሜ ክልል'],
  disability: ['Disability', 'አካል ጉዳት'],
  displaced: ['Displaced', 'የተፈናቀሉ'],
  otherMarginalised: ['Other marginalised', 'ሌሎች የተገለሉ'],
  level: ['Client level', 'የደንበኛ ደረጃ'],
  sector: ['Sector', 'ዘርፍ'],
  subCity: ['Sub-city', 'ክፍለ ከተማ'],
  womenLed: ['Women-led', 'በሴቶች የሚመራ'],
  youthLed: ['Youth-led', 'በወጣቶች የሚመራ'],
  pwdOwned: ['Owned by a person with disability', 'በአካል ጉዳተኛ የተያዘ'],
  referralSource: ['Referral source', 'የመጡበት'],
};

const colLabel = (k: string) => humanise(k.replace(/Santim$/, '').replace(/([A-Z])/g, ' $1'));
const cell = (k: string, v: unknown) => (typeof v === 'number' && k.endsWith('Santim') ? etb(v) : v === null || v === undefined ? '—' : String(v));

function Breakdown({ data }: { data: Record<string, any[]> }) {
  const { t, lang } = useLang();
  return (
    <div className="space-y-5">
      {Object.entries(data).map(([dim, rows]) => {
        const keys = rows.length ? Object.keys(rows.reduce((a, r) => ({ ...a, ...r }), {})) : [];
        const l = DIM_LABELS[dim];
        return (
          <div key={dim}>
            <p className="mb-1 text-sm font-semibold">{l ? (lang === 'am' ? l[1] : l[0]) : humanise(dim)}</p>
            <Table head={keys.map(colLabel)} rows={rows.map((r) => keys.map((k) => cell(k, r[k])))} empty={t('No data.', 'መረጃ የለም።')} />
          </div>
        );
      })}
    </div>
  );
}

function Funnel({ title, stages }: { title: string; stages: { label: string; n: number; conversionFromPrevious: number | null }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.n));
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <ul className="space-y-1.5">
        {stages.map((s) => (
          <li key={s.label} className="text-sm">
            <div className="flex justify-between gap-2">
              <span>{s.label}</span>
              <span className="tabular-nums">
                {s.n}
                {s.conversionFromPrevious !== null && <span className="ml-2 text-xs text-stone-500">{s.conversionFromPrevious}%</span>}
              </span>
            </div>
            <div className="h-2 rounded-full bg-stone-100">
              <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(s.n / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reports() {
  const { t, lang, pick } = useLang();
  const { has } = useSession();
  const { data: areas } = useApi<any[]>('/catalogue/service-areas');
  const blank = { from: '', to: '', serviceArea: '', clientLevel: '' };
  const [draft, setDraft] = useState(blank);
  const [f, setF] = useState(blank);
  const q = qs(f);
  const ind = useApi<any>(`/reports/indicators${q}`);
  const talent = useApi<any>(`/reports/talent${q}`);
  const clients = useApi<any>(`/reports/clients${q}`);
  const funnels = useApi<any>(`/reports/funnels${q}`);
  const wtp = useApi<any>(`/reports/willingness-to-pay${q}`);
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [k]: e.target.value });
  const i = ind.data;
  const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${v}%`);

  const indicators: [string, React.ReactNode, string?][] = i
    ? [
        [t('Vetted talents', 'የተገመገሙ ተሰጥኦዎች'), i.vettedTalents, t('All time, with verified or provisional identity', 'ሁሉም ጊዜ')],
        [t('Verified clients', 'የተረጋገጡ ደንበኞች'), i.verifiedClients, t('All time', 'ሁሉም ጊዜ')],
        [t('Completed assignments', 'የተጠናቀቁ ሥራዎች'), i.completedAssignments],
        [t('Completion rate', 'የማጠናቀቅ መጠን'), pct(i.completionRate), i.notes?.completionRate],
        [t('Repeat clients', 'ተደጋጋሚ ደንበኞች'), i.repeatClients, t('Two or more completed assignments', 'ሁለት ወይም ከዚያ በላይ')],
        [t('Talent income (net)', 'የተሰጥኦ ገቢ (የተጣራ)'), etb(i.talentIncomeNetSantim)],
        [t('Gross transaction value', 'ጠቅላላ የግብይት ዋጋ'), etb(i.grossTransactionValueSantim)],
        [t('Commission revenue', 'የኮሚሽን ገቢ'), etb(i.commissionRevenueSantim)],
        [t('Pay-later default rate', 'የዱቤ ያለመክፈል መጠን'), i.payLaterDefaultRate === null ? t('Not applicable', 'አይመለከትም') : pct(i.payLaterDefaultRate), i.notes?.payLaterDefaultRate],
        [t('Satisfaction', 'እርካታ'), i.satisfaction !== null ? `${i.satisfaction} / 5` : '—', t(`${i.ratingCount} ratings`, `${i.ratingCount} ደረጃዎች`)],
        [t('Dispute rate', 'የክርክር መጠን'), pct(i.disputeRate), t(`${i.disputesOpened} opened; share of funded assignments`, `${i.disputesOpened} ተከፍተዋል`)],
        [t('Average resolution', 'አማካይ የመፍቻ ጊዜ'), i.averageResolutionDays !== null ? t(`${i.averageResolutionDays} days`, `${i.averageResolutionDays} ቀናት`) : '—'],
      ]
    : [];

  return (
    <>
      <PageTitle
        sub={i ? t(`Period: ${date(i.period.from, lang)} to ${date(i.period.to, lang)}`, `ጊዜ፦ ${date(i.period.from, lang)} እስከ ${date(i.period.to, lang)}`) : t('Programme indicators', 'የፕሮግራም አመልካቾች')}
        actions={
          has(...CONSOLE_ROLES.reportsExport) ? (
            <a href={`/api/reports/export.xlsx${q}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-100">
              {t('Export to Excel', 'ወደ ኤክሴል ላክ')}
            </a>
          ) : undefined
        }
      >
        {t('Reports', 'ሪፖርቶች')}
      </PageTitle>
      <div className="space-y-4">
        <Card>
          <FilterBar onSubmit={() => setF(draft)}>
            <Field label={t('From', 'ከ')}>
              <Input type="date" value={draft.from} onChange={set('from')} />
            </Field>
            <Field label={t('To', 'እስከ')}>
              <Input type="date" value={draft.to} onChange={set('to')} />
            </Field>
            <Field label={t('Service area', 'የአገልግሎት ዘርፍ')}>
              <Select value={draft.serviceArea} onChange={set('serviceArea')} options={[{ value: '', label: t('All', 'ሁሉም') }, ...(areas ?? []).map((a) => ({ value: a.code, label: pick(a, 'name') }))]} />
            </Field>
            <Field label={t('Client level', 'የደንበኛ ደረጃ')} hint={t('Applies to the client breakdown', 'ለደንበኛ ክፍፍል ይሠራል')}>
              <Select value={draft.clientLevel} onChange={set('clientLevel')} options={[{ value: '', label: t('All', 'ሁሉም') }, ...['VERIFIED_ENTERPRISE', 'BASIC_ENTERPRISE', 'INDIVIDUAL'].map((l) => ({ value: l, label: humanise(l) }))]} />
            </Field>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit">{t('Apply', 'ተግብር')}</Button>
              <Button type="button" tone="ghost" onClick={() => { setDraft(blank); setF(blank); }}>
                {t('Clear', 'አጽዳ')}
              </Button>
            </div>
          </FilterBar>
        </Card>

        <Card title={t('Core indicators', 'ዋና አመልካቾች')}>
          <ErrorText error={ind.error} />
          {ind.loading && !i ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {indicators.map(([label, value, note]) => (
                <div key={label} className="rounded-lg border border-stone-200 p-3">
                  <p className="text-xs text-stone-500">{label}</p>
                  <p className="text-2xl font-bold tabular-nums">{value}</p>
                  {note && <p className="text-xs text-stone-500">{note}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t('Talent breakdown', 'የተሰጥኦ ክፍፍል')}>
          <Alert tone="info">
            {talent.data?.suppressionNote ?? t('Small groups are suppressed.', 'ትናንሽ ቡድኖች ተደብቀዋል።')}{' '}
            {t(`"suppressed" hides a whole group; "<${talent.data?.threshold ?? 5}" hides a small count inside a larger group. They are shown exactly as the system returns them.`, `"suppressed" ሙሉ ቡድንን ይደብቃል፤ "<${talent.data?.threshold ?? 5}" ትንሽ ቁጥርን ይደብቃል።`)}
          </Alert>
          <div className="mt-3">
            <ErrorText error={talent.error} />
            {talent.loading && !talent.data ? <Spinner /> : talent.data && <Breakdown data={talent.data.breakdown} />}
          </div>
        </Card>

        <Card title={t('Client breakdown', 'የደንበኛ ክፍፍል')}>
          <p className="mb-3 text-xs text-stone-500">{t('Ownership by a person with disability is suppressed below the small-cell threshold.', 'በአካል ጉዳተኛ የተያዙ ትናንሽ ቡድኖች ተደብቀዋል።')}</p>
          <ErrorText error={clients.error} />
          {clients.loading && !clients.data ? <Spinner /> : clients.data && <Breakdown data={clients.data.breakdown} />}
        </Card>

        <Card title={t('Funnels', 'የሂደት ደረጃዎች')}>
          <ErrorText error={funnels.error} />
          {funnels.loading && !funnels.data ? (
            <Spinner />
          ) : (
            funnels.data && (
              <>
                <p className="mb-3 text-sm text-stone-600">{t(`Client requests waiting to be scoped: ${funnels.data.openClientRequests}`, `ለመቅረጽ የሚጠብቁ ጥያቄዎች፦ ${funnels.data.openClientRequests}`)}</p>
                <div className="grid gap-6 md:grid-cols-3">
                  <Funnel title={t('Talent: all', 'ተሰጥኦ፦ ሁሉም')} stages={funnels.data.talent.all} />
                  <Funnel title={t('Talent: assisted registration', 'ተሰጥኦ፦ የታገዘ ምዝገባ')} stages={funnels.data.talent.assisted} />
                  <Funnel title={t('Talent: self-registered', 'ተሰጥኦ፦ ራሳቸው የተመዘገቡ')} stages={funnels.data.talent.self} />
                  <Funnel title={t('Clients: all', 'ደንበኞች፦ ሁሉም')} stages={funnels.data.client.all} />
                  {Object.entries(funnels.data.client.bySource as Record<string, any[]>).map(([src, st]) => (
                    <Funnel key={src} title={t(`Clients: ${humanise(src)}`, `ደንበኞች፦ ${humanise(src)}`)} stages={st} />
                  ))}
                </div>
                <p className="mt-3 text-xs text-stone-500">{t('Percentages are conversion from the previous stage. Funnels count everyone registered to date, up to the end of the period.', 'መቶኛዎቹ ከቀዳሚው ደረጃ የተለወጡ ናቸው።')}</p>
              </>
            )
          )}
        </Card>

        <Card title={t('Willingness to pay', 'የመክፈል ፈቃደኝነት')}>
          <ErrorText error={wtp.error} />
          {wtp.loading && !wtp.data ? (
            <Spinner />
          ) : (
            wtp.data && (
              <>
                <p className="mb-3 text-sm">{t('Average assignment value paid', 'የተከፈለ አማካይ የሥራ ዋጋ')}: <strong>{etb(wtp.data.averageAssignmentValueSantim)}</strong></p>
                <Table
                  head={[t('Package', 'ጥቅል'), t('Client segment', 'የደንበኛ ክፍል'), t('Offers', 'ቅናሾች'), t('Avg offered', 'አማካይ ቅናሽ'), t('Accepted', 'ተቀባይነት ያገኙ'), t('Avg accepted', 'አማካይ ተቀባይነት'), t('Assignments paid', 'የተከፈሉ ሥራዎች'), t('Avg paid', 'አማካይ ክፍያ')]}
                  empty={t('No price records in this period.', 'በዚህ ጊዜ የዋጋ መዝገብ የለም።')}
                  rows={wtp.data.rows.map((r: any) => [r.package, humanise(r.segment), r.offers, etb(r.averageOfferedSantim), r.accepted, etb(r.averageAcceptedSantim), r.assignmentsPaid, etb(r.averagePaidSantim)])}
                />
              </>
            )
          )}
        </Card>
      </div>
    </>
  );
}
