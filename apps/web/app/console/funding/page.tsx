'use client';
import { useState } from 'react';
import { JsonBlock, StandInBanner, useDevStatus } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Button, ErrorText, Field, Input, PageTitle, Select, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';

export default function FundingPage() {
  const { t } = useLang();
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.funding]}>
      <PageTitle sub={t('Test stand-in for the partner bank.', 'ለአጋር ባንኩ የሙከራ ምትክ።')}>{t('Confirm funding (test)', 'ክፍያ አረጋግጥ (ሙከራ)')}</PageTitle>
      <Funding />
    </RequireAuth>
  );
}

function Funding() {
  const { t } = useLang();
  const { enabled } = useDevStatus();
  const [reference, setReference] = useState('');
  const [channel, setChannel] = useState('TELEBIRR');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const a = useAction();

  if (!enabled) {
    return <Alert tone="info">{t('Test stand-ins are switched off here. In live use the partner bank confirms each payment into escrow automatically.', 'የሙከራ ምትኮች እዚህ ጠፍተዋል። በቀጥታ አገልግሎት አጋር ባንኩ ክፍያውን ያረጋግጣል።')}</Alert>;
  }

  return (
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
          if (r !== undefined) setResult(r ?? { ok: true });
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
  );
}
