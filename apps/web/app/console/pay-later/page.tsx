'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Notice, ReasonButton } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { PayLaterStatus } from '@/components/pay-later';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, ErrorText, PageTitle, Select, Spinner, Table, useAction } from '@/components/ui';
import { post, put } from '@/lib/api';
import { date, etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

// The weekly pay-later portfolio view (FR-BNP-08, FR-BNP-11, FR-BNP-12),
// read-only for the lender (FR-BNP-10), with the per-client switch (FR-BNP-01).
export default function PayLaterConsolePage() {
  const { t } = useLang();
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.payLater]}>
      <PageTitle sub={t('Exposure, ageing and default rate for the pay-later facility. The lender makes every credit decision.', 'የበኋላ ክፍያ ተጋላጭነት፣ የዕድሜ ትንተና እና ያለመክፈል መጠን። እያንዳንዱን የብድር ውሳኔ የሚወስነው አበዳሪው ነው።')}>
        {t('Pay-later portfolio', 'የበኋላ ክፍያ ፖርትፎሊዮ')}
      </PageTitle>
      <Portfolio />
    </RequireAuth>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'red' }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone === 'red' ? 'text-red-700' : ''}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-stone-500">{note}</p>}
    </div>
  );
}

function Portfolio() {
  const { t, lang } = useLang();
  const { has } = useSession();
  const p = useApi<any>('/paylater/portfolio');
  const [status, setStatus] = useState('');
  const list = useApi<any[]>(`/paylater/agreements${status ? `?status=${status}` : ''}`);
  const [ok, setOk] = useState<string | null>(null);
  const finance = has('FINANCE_OFFICER', 'SUPER_ADMIN');
  if (p.loading && !p.data) return <Spinner />;
  if (p.error) return <ErrorText error={p.error} />;
  const d = p.data;
  if (!d) return null;
  const ageingRows: [string, string][] = [
    ['current', t('Not yet due', 'ጊዜው ያልደረሰ')],
    ['d1to7', t('1 to 7 days late', 'ከ1 እስከ 7 ቀናት የዘገየ')],
    ['d8to30', t('8 to 30 days late', 'ከ8 እስከ 30 ቀናት የዘገየ')],
    ['d31to60', t('31 to 60 days late', 'ከ31 እስከ 60 ቀናት የዘገየ')],
    ['over60', t('More than 60 days (default)', 'ከ60 ቀናት በላይ (ያልተከፈለ)')],
  ];
  const statusLabels = ['', 'AWAITING_REASSESSMENT', 'SUBMITTED', 'APPROVED', 'ACTIVE', 'DEFAULTED', 'REPAID', 'DECLINED'];

  return (
    <div className="space-y-5">
      <Notice ok={ok} />
      {!d.enabled && <Alert tone="info">{t('Pay-later is switched off globally. Turn on PAY_LATER_ENABLED in Parameters (it needs a second approver).', 'የበኋላ ክፍያ በአጠቃላይ ጠፍቷል። በመለኪያዎች ውስጥ PAY_LATER_ENABLEDን ያብሩ (ሁለተኛ አጽዳቂ ያስፈልገዋል)።')}</Alert>}
      {d.lender === 'test-stand-in' && <Alert tone="warning">{t('Test lender: decisions and drawdowns are simulated until the signed lender is connected.', 'የሙከራ አበዳሪ፦ የተፈረመው አበዳሪ እስኪገናኝ ድረስ ውሳኔዎችና ክፍያዎች አስመሳይ ናቸው።')}</Alert>}
      {d.frozen && (
        <Alert tone="error">
          <p className="font-semibold">{t('New pay-later approvals are frozen.', 'አዲስ የበኋላ ክፍያ ማጽደቅ ታግዷል።')}</p>
          <p>{t(`Arrears over 30 days are ${pct(d.arrearsShare)} of the outstanding balance. Client limits were cut and the event is flagged for the weekly snapshot to SNV.`, `ከ30 ቀናት በላይ የዘገየው ከቀሪ ሂሳቡ ${pct(d.arrearsShare)} ነው። የደንበኞች ገደብ ቀንሷል፤ ክስተቱም ለSNV ሳምንታዊ ሪፖርት ተመዝግቧል።`)}</p>
          {finance && (
            <div className="mt-2">
              <ReasonButton label={t('Lift the freeze', 'እገዳውን አንሳ')} title={t('Lift the pay-later freeze', 'የበኋላ ክፍያ እገዳን አንሳ')} minLength={5} onSubmit={async (reason) => { await post('/paylater/portfolio/unfreeze', { reason }); setOk(t('The freeze is lifted.', 'እገዳው ተነስቷል።')); p.reload(); }} />
            </div>
          )}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t('Outstanding exposure', 'ያልተከፈለ ተጋላጭነት')} value={etb(d.outstanding)} note={t(`${etb(d.portfolioHeadroom)} left of the lender limit`, `ከአበዳሪው ገደብ ${etb(d.portfolioHeadroom)} ቀርቷል`)} />
        <Tile label={t('Default rate', 'ያለመክፈል መጠን')} value={pct(d.defaultRate)} note={t('Over 60 days past due as a share of value disbursed', 'ከ60 ቀናት በላይ የዘገየ ከተከፈለው ዋጋ ድርሻ')} tone={d.defaultRate > 0 ? 'red' : undefined} />
        <Tile label={t('Arrears over 30 days', 'ከ30 ቀናት በላይ የዘገየ')} value={pct(d.arrearsShare)} note={t(`of outstanding; freeze above ${pct(0.05)}`, `ከቀሪው፤ ከ${pct(0.05)} በላይ ሲሆን ይታገዳል`)} tone={d.arrearsShare > 0.05 ? 'red' : undefined} />
        <Tile label={t('Disbursed and repaid', 'የተከፈለ እና የተመለሰ')} value={etb(d.disbursed)} note={t(`${etb(d.repaid)} repaid`, `${etb(d.repaid)} ተመልሷል`)} />
        <Tile label={t('Borrowers', 'ተበዳሪዎች')} value={String(d.borrowers)} note={t(`${d.repeatUse.borrowers} used it more than once`, `${d.repeatUse.borrowers} ከአንድ ጊዜ በላይ ተጠቅመዋል`)} />
        <Tile label={t('Matured loans', 'ጊዜያቸው የደረሱ')} value={String(d.matured.count)} note={etb(d.matured.value)} />
        <Tile label={t('Largest borrower', 'ትልቁ ተበዳሪ')} value={pct(d.concentration.largestBorrowerShare)} note={t('of outstanding', 'ከቀሪው')} />
        <Tile label={t('In the pipeline', 'በሂደት ላይ')} value={String(d.pipeline.reduce((s: number, x: any) => s + x.count, 0))} note={etb(d.pipeline.reduce((s: number, x: any) => s + x.value, 0))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('Ageing', 'የዕድሜ ትንተና')}>
          <Table head={[t('Bucket', 'ምድብ'), t('Instalments', 'ክፍያዎች'), t('Balance', 'ቀሪ')]} rows={ageingRows.map(([k, label]) => [label, String(d.ageingCount[k]), <span key={k} className="tabular-nums">{etb(d.ageing[k])}</span>])} />
        </Card>
        <Card title={t('Concentration by sector', 'በዘርፍ ያለ ክምችት')}>
          <Table head={[t('Sector', 'ዘርፍ'), t('Balance', 'ቀሪ'), t('Share', 'ድርሻ')]} rows={d.concentration.bySector.map((s: any) => [s.sector, etb(s.value), pct(s.share)])} empty={t('Nothing outstanding.', 'ቀሪ የለም።')} />
          <p className="mt-2 text-xs text-stone-500">{t(`Cap per sector: ${pct(d.limits.sectorShare)} of the ${etb(d.limits.lenderPortfolio)} lender limit.`, `የአንድ ዘርፍ ጣሪያ፦ ከ${etb(d.limits.lenderPortfolio)} የአበዳሪ ገደብ ${pct(d.limits.sectorShare)}።`)}</p>
        </Card>
      </div>

      <Card title={t('Agreements', 'ስምምነቶች')} actions={<Select value={status} onChange={(e) => setStatus(e.target.value)} options={statusLabels.map((s) => ({ value: s, label: s ? s.replace(/_/g, ' ').toLowerCase() : t('All', 'ሁሉም') }))} />}>
        {list.loading && !list.data ? <Spinner /> : (
          <Table
            head={[t('Reference', 'መለያ'), t('Business', 'ንግድ'), t('Amount', 'መጠን'), t('Owed', 'ቀሪ'), t('Late', 'ዘግይቷል'), t('Status', 'ሁኔታ')]}
            rows={(list.data ?? []).map((r) => [
              <Link key="r" href={`/console/pay-later/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.ref}</Link>,
              <span key="b">{r.client.enterprise}<span className="block text-xs text-stone-500">{r.client.sector} · {t('cycle', 'ዙር')} {r.cycle}</span></span>,
              etb(r.amount),
              etb(r.outstanding),
              r.maxDaysPastDue > 0 ? <Badge key="l" tone="red">{t(`${r.maxDaysPastDue} days`, `${r.maxDaysPastDue} ቀናት`)}</Badge> : '—',
              <span key="s" className="flex flex-wrap gap-1"><PayLaterStatus status={r.status} />{r.pendingExceptions > 0 && <Badge tone="amber">{t('exception to approve', 'የሚጸድቅ ልዩ ሁኔታ')}</Badge>}</span>,
            ])}
            empty={t('No pay-later agreements yet.', 'ገና የበኋላ ክፍያ ስምምነት የለም።')}
          />
        )}
      </Card>

      {d.events.length > 0 && (
        <Card title={t('Portfolio events', 'የፖርትፎሊዮ ክስተቶች')}>
          <ul className="space-y-1 text-sm">
            {d.events.map((e: any) => (
              <li key={e.id}>{date(e.createdAt, lang, true)} · <b>{e.kind === 'FREEZE' ? t('Frozen', 'ታግዷል') : t('Freeze lifted', 'እገዳ ተነስቷል')}</b> · {t('arrears', 'የዘገየ')} {pct(e.arrearsShare)}{e.flaggedForSnapshot && e.kind === 'FREEZE' ? ` · ${t('flagged for SNV snapshot', 'ለSNV ሪፖርት ተመዝግቧል')}` : ''}</li>
            ))}
          </ul>
        </Card>
      )}

      {has('PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER') && <ClientSwitches onChange={() => p.reload()} />}
    </div>
  );
}

function ClientSwitches({ onChange }: { onChange: () => void }) {
  const { t } = useLang();
  const { has } = useSession();
  const list = useApi<any[]>('/paylater/clients');
  const a = useAction();
  const canSwitch = has('PLATFORM_ADMIN', 'SUPER_ADMIN');
  return (
    <Card title={t('Verified enterprises', 'የተረጋገጡ ድርጅቶች')}>
      <ErrorText error={list.error || a.error} />
      <Table
        head={[t('Business', 'ንግድ'), t('Pilot group', 'የሙከራ ቡድን'), t('Limit', 'ገደብ'), t('Pay-later', 'የበኋላ ክፍያ')]}
        rows={(list.data ?? []).map((c) => [
          <span key="n">{c.enterprise}<span className="block text-xs text-stone-500">{c.sector}</span></span>,
          c.cohort ? <span key="c">{c.cohort.name}{!c.cohort.payLaterEligible && <span className="block text-xs text-amber-700">{t('not pay-later eligible', 'ለበኋላ ክፍያ ብቁ አይደለም')}</span>}</span> : '—',
          etb(c.limit),
          canSwitch ? (
            <Button key="b" tone={c.enabled ? 'secondary' : 'primary'} busy={a.busy} onClick={async () => { if (await a.run(() => put(`/paylater/clients/${c.userId}`, { enabled: !c.enabled }))) { list.reload(); onChange(); } }}>
              {c.enabled ? t('Switch off', 'አጥፋ') : t('Switch on', 'አብራ')}
            </Button>
          ) : c.enabled ? t('On', 'በርቷል') : t('Off', 'ጠፍቷል'),
        ])}
        empty={t('No verified enterprises yet.', 'ገና የተረጋገጠ ድርጅት የለም።')}
      />
    </Card>
  );
}
