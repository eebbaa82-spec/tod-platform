'use client';
import Link from 'next/link';
import { PayLaterStatus } from '@/components/pay-later';
import { RequireAuth } from '@/components/shell';
import { Card, Empty, ErrorText, PageTitle, Spinner } from '@/components/ui';
import { date, etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

// A client's pay-later agreements and what is still owed (FR-BNP-05, FR-BNP-07).
export default function PayLaterPage() {
  const { t } = useLang();
  return (
    <RequireAuth roles={['CLIENT']}>
      <PageTitle sub={t('Work the lender paid for, and what you repay it.', 'አበዳሪው የከፈለለት ሥራ እና የሚመልሱለት።')}>{t('Pay later', 'በኋላ ይክፈሉ')}</PageTitle>
      <Mine />
    </RequireAuth>
  );
}

function Mine() {
  const { t, lang } = useLang();
  const { data, error, loading } = useApi<any>('/paylater/me');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm">{data.enabled ? t(`Your pay-later limit is ${etb(data.limit)}. It goes up after each agreement you repay in full.`, `የበኋላ ክፍያ ገደብዎ ${etb(data.limit)} ነው። እያንዳንዱን ስምምነት ሙሉ በሙሉ ሲከፍሉ ይጨምራል።`) : t('Pay-later is not switched on for your business.', 'የበኋላ ክፍያ ለንግድዎ አልተከፈተም።')}</p>
      </Card>
      {!data.agreements.length && <Empty>{t('You have not used pay-later yet. You can choose it on an agreed assignment, instead of paying into escrow.', 'ገና የበኋላ ክፍያ አልተጠቀሙም። ወደ ዕግድ ከመክፈል ይልቅ በተስማሙበት ሥራ ላይ ሊመርጡት ይችላሉ።')}</Empty>}
      {data.agreements.map((a: any) => (
        <Card key={a.id} title={<Link href={`/pay-later/${a.id}`} className="hover:underline">{a.assignment.title}</Link>} actions={<PayLaterStatus status={a.status} />}>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>{t('Amount', 'መጠን')}: <b>{etb(a.amount)}</b></span>
            <span>{t('Still owed', 'ቀሪ')}: <b>{etb(a.outstanding)}</b></span>
            {a.nextDue && <span>{t('Next due', 'ቀጣይ')}: <b>{date(a.nextDue.dueOn, lang)}</b></span>}
            <span className="text-stone-500">{a.ref}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}
