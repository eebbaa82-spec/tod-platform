'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PayLaterStatus, Schedule } from '@/components/pay-later';
import { RequireAuth } from '@/components/shell';
import { Alert, Card, ErrorText, PageTitle, Spinner } from '@/components/ui';
import { date, etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

export default function PayLaterAgreementPage() {
  return (
    <RequireAuth roles={['CLIENT']}>
      <Agreement />
    </RequireAuth>
  );
}

function Agreement() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const { data: d, error, loading } = useApi<any>(`/paylater/agreements/${id}`);
  if (loading && !d) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!d) return null;
  const late = d.installments.some((i: any) => i.daysPastDue > 0);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/pay-later" className="text-sm text-brand-700 hover:underline">← {t('All pay-later', 'ሁሉም የበኋላ ክፍያዎች')}</Link>
      <PageTitle sub={`${d.ref} · ${d.assignment.ref}`} actions={<PayLaterStatus status={d.status} />}>{d.assignment.title}</PageTitle>
      {late && <Alert tone="error">{t('A repayment is late. New requests are paused until you repay. Call support if you need to agree a new date.', 'ክፍያ ዘግይቷል። እስኪከፍሉ ድረስ አዲስ ጥያቄ አይቻልም። አዲስ ቀን ለመስማማት ከፈለጉ ድጋፍን ይደውሉ።')}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        {[[t('Paid by the lender', 'አበዳሪው የከፈለው'), etb(d.disbursed)], [t('Repaid', 'የተመለሰ'), etb(d.repaid)], [t('Still owed', 'ቀሪ'), etb(d.outstanding)]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs text-stone-500">{k}</p>
            <p className="text-xl font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <Card title={t('Repayment schedule', 'የክፍያ መርሐ ግብር')}>
        <Schedule d={d} />
        <p className="mt-3 text-xs text-stone-500">{t(`Pay the lender quoting ${d.ref}. Each stage is due ${d.tenorDays} days after you accept it.`, `${d.ref}ን በመጥቀስ ለአበዳሪው ይክፈሉ። እያንዳንዱ ደረጃ ከተቀበሉት ከ${d.tenorDays} ቀናት በኋላ ይከፈላል።`)}</p>
      </Card>
      {d.repayments.length > 0 && (
        <Card title={t('Repayments received', 'የደረሱ ክፍያዎች')}>
          <ul className="divide-y divide-stone-100 text-sm">
            {d.repayments.map((r: any) => (
              <li key={r.id} className="flex justify-between py-2"><span>{date(r.paidOn, lang)} · {r.reference}</span><span className="tabular-nums">{etb(r.amount)}</span></li>
            ))}
          </ul>
        </Card>
      )}
      {d.acknowledgementText && (
        <Card title={t('Your acknowledgement of debt', 'የዕዳ ማረጋገጫዎ')}>
          <blockquote className="text-sm leading-relaxed">{d.acknowledgementText}</blockquote>
          <p className="mt-2 text-xs text-stone-500">{t('Signed', 'የተፈረመው')} {date(d.acknowledgedAt, lang, true)}</p>
        </Card>
      )}
    </div>
  );
}
