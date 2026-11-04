'use client';
import { useState } from 'react';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Card, ErrorText, Field, Input, PageTitle, Spinner, Table } from '@/components/ui';
import { date, etb, humanise } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

// Monthly GESI indicators against the Inception Report targets (FR-MEL-11/12).
export default function GesiPage() {
  const { t } = useLang();
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.reports]}>
      <PageTitle sub={t('Inclusion indicators for the month, cumulative from the pilot start, against the Inception Report targets.', 'የወሩ የአካታችነት አመላካቾች፣ ከሙከራው መጀመሪያ ጀምሮ የተደመሩ፣ ከመነሻ ሪፖርቱ ግቦች ጋር።')}>
        {t('GESI report', 'የጾታ እና ማኅበራዊ አካታችነት ሪፖርት')}
      </PageTitle>
      <Gesi />
    </RequireAuth>
  );
}

const GROUPS: Record<string, [string, string]> = {
  ALL: ['All talents', 'ሁሉም ባለሙያዎች'],
  WOMEN: ['Women', 'ሴቶች'],
  MEN: ['Men', 'ወንዶች'],
  YOUTH: ['Youth (18 to 29)', 'ወጣቶች (18 እስከ 29)'],
  YOUNG_WOMEN: ['Young women', 'ወጣት ሴቶች'],
  MALE_YOUTH: ['Young men', 'ወጣት ወንዶች'],
  WOMEN_AND_YOUTH: ['Women and youth', 'ሴቶች እና ወጣቶች'],
  DISABILITY: ['Persons with disability', 'አካል ጉዳተኞች'],
  IDP_RETURNEE: ['Displaced or returnee', 'የተፈናቀሉ ወይም ተመላሾች'],
  OTHER_MARGINALISED: ['Other marginalised', 'ሌሎች የተገለሉ'],
};
const FLAGS: Record<string, [string, string]> = {
  BELOW_TRAJECTORY: ['Below target path', 'ከግቡ መንገድ በታች'],
  ONBOARDING_GAP: ['Onboarding gap', 'የምዝገባ ክፍተት'],
  ACTIVATION_GAP: ['Activation gap', 'የሥራ ጅምር ክፍተት'],
  SATISFACTION_BELOW_TARGET: ['Satisfaction below 80%', 'እርካታ ከ80% በታች'],
  COMPLETED_SHARE_BELOW_TARGET: ['Completed share below target', 'የተጠናቀቀ ድርሻ ከግቡ በታች'],
};

function Gesi() {
  const { t, lang } = useLang();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const r = useApi<any>(`/reports/gesi?month=${month}`);
  const l = (m: Record<string, [string, string]>, k: string) => (m[k] ? (lang === 'am' ? m[k][1] : m[k][0]) : humanise(k));
  const hidden = (v: unknown) => v === 'suppressed';
  const n = (v: unknown, suffix = '') => (v === null || v === undefined ? '—' : hidden(v) ? t('Hidden', 'የተደበቀ') : `${v}${typeof v === 'number' ? suffix : ''}`);
  const d = r.data;

  return (
    <div className="space-y-4">
      <Field label={t('Month', 'ወር')}>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[12rem]" />
      </Field>
      <ErrorText error={r.error} />
      {r.loading && !d && <Spinner />}
      {d && (
        <>
          <p className="text-sm text-stone-600">
            {t(`As of ${date(d.asOf, lang)}. ${d.pilotElapsedShare}% of the pilot period has passed. Figures for groups smaller than ${d.threshold} people are hidden to protect privacy.`, `እስከ ${date(d.asOf, lang)}። ከሙከራው ጊዜ ${d.pilotElapsedShare}% አልፏል። ግላዊነትን ለመጠበቅ ከ${d.threshold} ሰዎች ያነሱ ቡድኖች ተደብቀዋል።`)}
          </p>
          <Card title={t('Talents by group', 'ባለሙያዎች በቡድን')}>
            <Table
              head={[t('Group', 'ቡድን'), t('Registered', 'የተመዘገቡ'), t('Vetted', 'የተረጋገጡ'), t('Target', 'ግብ'), t('Path to date', 'እስካሁን ግብ'), t('Onboarding', 'ምዝገባ'), t('Activation', 'ሥራ ጅምር'), t('Completed', 'የተጠናቀቁ'), t('Net income', 'የተጣራ ገቢ'), t('Satisfied', 'የረኩ'), t('Flags', 'ማሳሰቢያዎች')]}
              rows={d.groups.map((g: any) => [
                <span key="g" className="font-semibold">{l(GROUPS, g.group)}</span>,
                n(g.registered),
                `${n(g.vetted)}${typeof g.vettedShare === 'number' ? ` (${g.vettedShare}%)` : ''}`,
                g.targetCount ? `${g.targetCount}${g.targetShare ? ` (${g.targetShare}%)` : ''}` : '—',
                n(g.trajectoryToDate),
                n(g.onboardingRate, '%'),
                n(g.activationRate, '%'),
                `${n(g.completedAssignments)}${typeof g.completedShare === 'number' ? ` (${g.completedShare}%)` : ''}`,
                typeof g.netIncomeSantim === 'number' ? etb(g.netIncomeSantim) : n(g.netIncomeSantim),
                n(g.satisfiedShare, '%'),
                <div key="f" className="flex flex-wrap gap-1">
                  {(Array.isArray(g.flags) ? g.flags : []).map((f: string) => (
                    <Badge key={f} tone="amber">{l(FLAGS, f)}</Badge>
                  ))}
                </div>,
              ])}
            />
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title={t('Earnings parity', 'የገቢ እኩልነት')}>
              <p className="text-sm">{d.earningsParity.womenToMenPercent === null ? t('Not enough paid work yet.', 'እስካሁን በቂ የተከፈለ ሥራ የለም።') : t(`Women earn ${d.earningsParity.womenToMenPercent}% of what men earn per assignment (target ${d.earningsParity.target}% or more).`, `ሴቶች በአንድ ሥራ ወንዶች ከሚያገኙት ${d.earningsParity.womenToMenPercent}% ያገኛሉ (ግብ ${d.earningsParity.target}% ወይም ከዚያ በላይ)።`)}</p>
              {d.earningsParity.flag && <Alert tone="warning">{t('Below the parity target.', 'ከእኩልነት ግቡ በታች።')}</Alert>}
            </Card>
            <Card title={t('Women-led businesses', 'በሴቶች የሚመሩ ንግዶች')}>
              <p className="text-sm">{t(`${d.womenLedMsmes.registered} registered, ${d.womenLedMsmes.transacting} have paid for work. Share of registered businesses: ${n(d.womenLedMsmes.shareOfRegisteredMsmes, '%')} (target ${d.womenLedMsmes.target}%).`, `${d.womenLedMsmes.registered} ተመዝግበዋል፣ ${d.womenLedMsmes.transacting} ለሥራ ከፍለዋል። ከተመዘገቡ ንግዶች ድርሻ፦ ${n(d.womenLedMsmes.shareOfRegisteredMsmes, '%')} (ግብ ${d.womenLedMsmes.target}%)።`)}</p>
              {d.womenLedMsmes.flag && <Alert tone="warning">{t('Below the target share.', 'ከግቡ ድርሻ በታች።')}</Alert>}
            </Card>
            <Card title={t('Safeguarding this month', 'የዚህ ወር ጥበቃ')}>
              <p className="text-sm">{t(`${d.safeguarding.received} complaints received, ${d.safeguarding.acknowledgedWithinTwoWorkingDays} acknowledged within two working days, ${d.safeguarding.closedWithOutcome} closed with an outcome.`, `${d.safeguarding.received} ቅሬታዎች ደርሰዋል፣ ${d.safeguarding.acknowledgedWithinTwoWorkingDays} በሁለት የሥራ ቀናት ውስጥ ምላሽ አግኝተዋል፣ ${d.safeguarding.closedWithOutcome} በውጤት ተዘግተዋል።`)}</p>
            </Card>
            <Card title={t('Accommodation requests this month', 'የዚህ ወር የማመቻቸት ጥያቄዎች')}>
              <p className="text-sm">{t(`${d.accommodation.received} received, ${d.accommodation.fulfilled} fulfilled.`, `${d.accommodation.received} ደርሰዋል፣ ${d.accommodation.fulfilled} ተሟልተዋል።`)}</p>
            </Card>
          </div>
          <p className="text-xs text-stone-500">{t('Outreach events and digital-literacy clinics are counted from attendance sheets outside the platform.', 'የማስተዋወቂያ ዝግጅቶች እና የዲጂታል ክህሎት ስልጠናዎች ከመድረኩ ውጭ ባሉ የተሳታፊ መዝገቦች ይቆጠራሉ።')}</p>
        </>
      )}
    </div>
  );
}
