'use client';
import Link from 'next/link';
import { useState } from 'react';
import { JsonBlock, StandInBanner, useDevStatus } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Button, Card, ErrorText, Field, Input, PageTitle, Select, Spinner, StatusBadge, Table, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date, etb, humanise, toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function FundingPage() {
  const { t } = useLang();
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.funding]}>
      <PageTitle sub={t('Payments clients have been asked to make into escrow.', 'ደንበኞች ወደ ዕግድ እንዲከፍሉ የተጠየቁ ክፍያዎች።')}>{t('Funding', 'ክፍያ')}</PageTitle>
      <Funding />
    </RequireAuth>
  );
}

function Funding() {
  const { t, lang } = useLang();
  const { has } = useSession();
  const { enabled } = useDevStatus();
  const canConfirm = enabled && has(...CONSOLE_ROLES.fundingConfirm);
  const pending = useApi<any[]>('/admin/payments?status=PENDING');
  const [reference, setReference] = useState('');
  const [channel, setChannel] = useState('TELEBIRR');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const a = useAction();

  const list = (
    <Card title={t('Waiting for payment', 'ክፍያ በመጠበቅ ላይ')}>
      <ErrorText error={pending.error} />
      {pending.loading && !pending.data ? (
        <Spinner />
      ) : (
        <Table
          head={[t('Reference', 'መለያ'), t('Assignment', 'ሥራ'), t('Client', 'ደንበኛ'), t('Amount', 'መጠን'), t('Channel', 'መንገድ'), t('Status', 'ሁኔታ'), t('Created', 'የተፈጠረ')]}
          empty={t('No payments are waiting.', 'የሚጠበቅ ክፍያ የለም።')}
          rows={(pending.data ?? []).map((p) => [
            canConfirm ? (
              <button key="r" type="button" onClick={() => setReference(p.reference)} className="min-h-11 font-mono font-medium text-brand-700 underline" title={t('Use in the test form', 'በሙከራ ቅጹ ተጠቀም')}>
                {p.reference}
              </button>
            ) : (
              <span key="r" className="select-all font-mono">{p.reference}</span>
            ),
            <Link key="a" href={`/assignments/${p.assignment?.id}`} className="text-brand-700 hover:underline">
              {p.assignment?.ref} <span className="block text-xs text-stone-500">{p.assignment?.title}</span>
            </Link>,
            p.clientName ?? '—',
            <span key="m" className="whitespace-nowrap">{etb(p.amount)}</span>,
            p.channel ? humanise(p.channel) : '—',
            <StatusBadge key="s" status={p.status} />,
            <span key="d" className="whitespace-nowrap text-xs">{date(p.createdAt, lang, true)}</span>,
          ])}
        />
      )}
      {canConfirm && (pending.data?.length ?? 0) > 0 && <p className="mt-2 text-xs text-stone-500">{t('Tap a reference to put it in the test form below.', 'ከታች ባለው የሙከራ ቅጽ ለማስገባት መለያውን ይንኩ።')}</p>}
    </Card>
  );

  if (!canConfirm) {
    return (
      <div className="space-y-4">
        {list}
        <Alert tone="info">{t('In live use the partner bank confirms each payment into escrow automatically.', 'በቀጥታ አገልግሎት አጋር ባንኩ ወደ ዕግድ የገባውን እያንዳንዱን ክፍያ በራሱ ያረጋግጣል።')}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {list}
      <StandInBanner>
        <p className="mb-3 text-sm text-amber-900">
          {t(
            'In live use the partner bank confirms that a client\'s payment has reached escrow, and the assignment moves to funded on its own. Here you can mark a payment reference as received to test that flow. It calls the same integration point the bank connection will call.',
            'በቀጥታ አገልግሎት አጋር ባንኩ የደንበኛው ክፍያ ወደ ዕግድ መድረሱን ያረጋግጣል። እዚህ የክፍያ መለያን እንደደረሰ በማድረግ ሂደቱን መሞከር ይችላሉ።',
          )}
        </p>
        <form
          className="max-w-lg space-y-3 rounded-lg bg-white p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await a.run(() => post(`/dev/funding/${encodeURIComponent(reference.trim())}`, { channel, ...(amount ? { amount: toSantim(amount) } : {}) }));
            if (r !== undefined) {
              setResult(r ?? { ok: true });
              pending.reload();
            }
          }}
        >
          <Field label={t('Payment reference', 'የክፍያ መለያ')} hint={t('Shown to the client on the funding screen of the assignment.', 'በሥራው የክፍያ ገጽ ላይ ለደንበኛው ይታያል።')}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} required className="font-mono" />
          </Field>
          <Field label={t('Channel', 'መንገድ')}>
            <Select value={channel} onChange={(e) => setChannel(e.target.value)} options={[{ value: 'TELEBIRR', label: 'telebirr' }, { value: 'CBE_BIRR', label: 'CBE Birr' }, { value: 'BANK', label: t('Bank transfer', 'የባንክ ዝውውር') }]} />
          </Field>
          <Field label={t('Amount received (birr, optional)', 'የደረሰው መጠን (ብር፣ አማራጭ)')} hint={t('Leave empty to use the full amount due. Enter a different amount to test a short or over payment.', 'ሙሉውን መጠን ለመጠቀም ባዶ ይተዉት።')}>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <ErrorText error={a.error} />
          <Button type="submit" busy={a.busy}>
            {t('Mark as received', 'እንደደረሰ ምልክት አድርግ')}
          </Button>
          {result !== null && (
            <>
              <Alert tone="success">{t('Confirmation sent.', 'ማረጋገጫ ተልኳል።')}</Alert>
              <JsonBlock value={result} />
            </>
          )}
        </form>
      </StandInBanner>
    </div>
  );
}
