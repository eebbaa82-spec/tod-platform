'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Card, ErrorText, Field, Input, Select, Textarea, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date, etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

// Buy now, pay later on the client's assignment page (FR-BNP-02 to FR-BNP-06).

export function usePayLaterLabels() {
  const { t } = useLang();
  const status: Record<string, string> = {
    AWAITING_REASSESSMENT: t('Being reassessed', 'እንደገና እየተገመገመ'),
    SUBMITTED: t('With the lender', 'በአበዳሪው ዘንድ'),
    APPROVED: t('Approved, waiting for your signature', 'ጸድቋል፣ ፊርማዎን በመጠበቅ ላይ'),
    DECLINED: t('Not approved', 'አልጸደቀም'),
    ACTIVE: t('Active', 'ንቁ'),
    REPAID: t('Repaid', 'ተከፍሏል'),
    DEFAULTED: t('In default', 'ያልተከፈለ'),
    CANCELLED: t('Cancelled', 'ተሰርዟል'),
  };
  const reason: Record<string, string> = {
    PAY_LATER_OFF: t('Pay-later is switched off.', 'የበኋላ ክፍያ ጠፍቷል።'),
    CLIENT_NOT_ENABLED: t('Pay-later has not been switched on for your business.', 'የበኋላ ክፍያ ለንግድዎ አልተከፈተም።'),
    NOT_VERIFIED_ENTERPRISE: t('Only confirmed verified enterprises can pay later.', 'የበኋላ ክፍያ ለተረጋገጡ ድርጅቶች ብቻ ነው።'),
    IDENTITY_NOT_VERIFIED: t('Your identity must be confirmed through the partner bank.', 'ማንነትዎ በአጋር ባንኩ መረጋገጥ አለበት።'),
    NOT_ACTIVE_BUSINESS: t('Your business details are not complete.', 'የንግድዎ ዝርዝሮች አልተሟሉም።'),
    COHORT_NOT_ELIGIBLE: t('Your pilot group is not approved for pay-later.', 'የሙከራ ቡድንዎ ለበኋላ ክፍያ አልጸደቀም።'),
    PORTFOLIO_FROZEN: t('New pay-later approvals are paused for now.', 'አዲስ የበኋላ ክፍያ ማጽደቅ ለጊዜው ቆሟል።'),
    DEFAULTED: t('A previous pay-later balance was not repaid.', 'የቀድሞ የበኋላ ክፍያ አልተከፈለም።'),
    ARREARS: t('A repayment is overdue.', 'ክፍያ ዘግይቷል።'),
    BALANCE_OPEN: t('Repay your current pay-later balance first.', 'መጀመሪያ የአሁኑን የበኋላ ክፍያ ሂሳብዎን ይክፈሉ።'),
    ASSIGNMENT_LIMIT: t('This assignment is above the lender’s limit per assignment.', 'ይህ ሥራ ከአበዳሪው የአንድ ሥራ ገደብ በላይ ነው።'),
    ENTERPRISE_LIMIT: t('This is above your pay-later limit.', 'ይህ ከበኋላ ክፍያ ገደብዎ በላይ ነው።'),
    PORTFOLIO_LIMIT: t('The lender’s total limit has been reached.', 'የአበዳሪው ጠቅላላ ገደብ ተሞልቷል።'),
    COHORT_CAP: t('Your pilot group has reached its pay-later cap.', 'የሙከራ ቡድንዎ የበኋላ ክፍያ ጣሪያ ላይ ደርሷል።'),
    SECTOR_CAP: t('Your sector has reached its pay-later share.', 'ዘርፍዎ የበኋላ ክፍያ ድርሻውን ጨርሷል።'),
  };
  return { status, reason };
}

export function PayLaterStatus({ status }: { status: string }) {
  const { status: labels } = usePayLaterLabels();
  const tone = status === 'ACTIVE' || status === 'APPROVED' ? 'blue' : status === 'REPAID' ? 'green' : status === 'DEFAULTED' || status === 'DECLINED' ? 'red' : 'amber';
  return <Badge tone={tone as any}>{labels[status] ?? status}</Badge>;
}

export function PayLaterPanel({ a, reload }: { a: any; reload: () => void }) {
  const { t } = useLang();
  const offer = useApi<any>(`/paylater/offer/${a.id}`);
  const o = offer.data;
  if (!o) return null;
  const ag = o.agreement;
  const refresh = () => {
    offer.reload();
    reload();
  };

  if (ag && ['ACTIVE', 'REPAID', 'DEFAULTED'].includes(ag.status)) {
    return (
      <Card title={t('Paid with pay-later', 'በበኋላ ክፍያ ተከፍሏል')} actions={<PayLaterStatus status={ag.status} />}>
        <p className="text-sm">
          {t('The lender paid this assignment into escrow. You repay the lender for each stage you accept.', 'አበዳሪው ይህን ሥራ ወደ ዕግድ ከፍሏል። እርስዎ ለሚቀበሉት እያንዳንዱ ደረጃ ለአበዳሪው ይከፍላሉ።')}{' '}
          <Link href={`/pay-later/${ag.id}`} className="font-semibold text-brand-700 hover:underline">{t('See the repayment schedule', 'የክፍያ መርሐ ግብሩን ይመልከቱ')}</Link>
        </p>
      </Card>
    );
  }
  if (a.status !== 'AGREED') return null;
  if (ag?.status === 'APPROVED') return <Acknowledge agreementId={ag.id} onDone={refresh} />;
  if (ag && ['SUBMITTED', 'AWAITING_REASSESSMENT'].includes(ag.status)) {
    return (
      <Card title={t('Pay later', 'በኋላ ይክፈሉ')} actions={<PayLaterStatus status={ag.status} />}>
        <p className="text-sm">{ag.status === 'SUBMITTED' ? t('Your request is with the lender. We will tell you by SMS when it decides.', 'ጥያቄዎ በአበዳሪው ዘንድ ነው። ሲወስን በSMS እናሳውቅዎታለን።') : t('Because you used pay-later before, our finance team checks that the new amount is affordable before it goes to the lender.', 'ከዚህ በፊት የበኋላ ክፍያ ስለተጠቀሙ፣ የፋይናንስ ቡድናችን አዲሱ መጠን ተመጣጣኝ መሆኑን አረጋግጦ ለአበዳሪው ይልካል።')}</p>
      </Card>
    );
  }
  if (!o.available) return null;
  return <Apply a={a} o={o} declined={ag?.status === 'DECLINED' ? ag : null} onDone={refresh} />;
}

function Apply({ a, o, declined, onDone }: { a: any; o: any; declined: any; onDone: () => void }) {
  const { t } = useLang();
  const { reason } = usePayLaterLabels();
  const [tenor, setTenor] = useState(String(o.tenor.min));
  const [purpose, setPurpose] = useState('');
  const act = useAction();
  const days = [30, 45, 60].filter((d) => d >= o.tenor.min && d <= o.tenor.max);
  return (
    <Card title={t('Or pay later', 'ወይም በኋላ ይክፈሉ')}>
      <div className="space-y-3 text-sm">
        {declined && <Alert tone="info">{t('The lender did not approve your last request for this assignment. You can still pay into escrow above.', 'አበዳሪው ለዚህ ሥራ ያቀረቡትን ጥያቄ አላጸደቀም። አሁንም ከላይ ወደ ዕግድ መክፈል ይችላሉ።')}</Alert>}
        <p>{t(`A partner lender can pay ${etb(o.amount)} into escrow for you now. You repay the lender within 30 to 60 days of accepting each stage of the work. The lender decides, not ToD.`, `አጋር አበዳሪ ${etb(o.amount)} አሁን ወደ ዕግድ ሊከፍልልዎ ይችላል። እያንዳንዱን የሥራ ደረጃ ከተቀበሉ በ30 እስከ 60 ቀናት ውስጥ ለአበዳሪው ይከፍላሉ። የሚወስነው አበዳሪው ነው እንጂ ሥለ አይደለም።`)}</p>
        <p className="text-stone-600">{t(`Your pay-later limit: ${etb(o.limit)}.`, `የበኋላ ክፍያ ገደብዎ፦ ${etb(o.limit)}።`)}</p>
        {!o.eligible ? (
          <Alert tone="warning">
            <p className="font-semibold">{t('Pay-later is not available for this assignment:', 'ለዚህ ሥራ የበኋላ ክፍያ አይገኝም፦')}</p>
            <ul className="list-disc pl-5">{o.reasons.map((r: string) => <li key={r}>{reason[r] ?? r}</li>)}</ul>
          </Alert>
        ) : (
          <>
            <Field label={t('Repay within', 'የሚከፍሉበት ጊዜ')}>
              <Select value={tenor} onChange={(e) => setTenor(e.target.value)} options={days.map((d) => ({ value: String(d), label: t(`${d} days of accepting each stage`, `እያንዳንዱን ደረጃ ከተቀበሉ በ${d} ቀናት`) }))} />
            </Field>
            <Field label={t('What is this work for in your business?', 'ይህ ሥራ በንግድዎ ውስጥ ለምን ይጠቅማል?')} hint={t('The lender reads this.', 'አበዳሪው ይህንን ያነባል።')}>
              <Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </Field>
            {o.needsReassessment && <p className="text-stone-600">{t('You used pay-later before, so our finance team checks affordability first.', 'ከዚህ በፊት የበኋላ ክፍያ ስለተጠቀሙ፣ የፋይናንስ ቡድናችን መጀመሪያ ተመጣጣኝነቱን ያረጋግጣል።')}</p>}
            <ErrorText error={act.error} />
            <Button tone="secondary" busy={act.busy} disabled={purpose.trim().length < 10} onClick={async () => { if (await act.run(() => post('/paylater/applications', { assignmentId: a.id, tenorDays: Number(tenor), purpose }))) onDone(); }}>
              {t('Ask the lender to pay now', 'አበዳሪው አሁን እንዲከፍል ይጠይቁ')}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function Acknowledge({ agreementId, onDone }: { agreementId: string; onDone: () => void }) {
  const { t } = useLang();
  const ag = useApi<any>(`/paylater/agreements/${agreementId}`);
  const [password, setPassword] = useState('');
  const act = useAction();
  if (!ag.data) return null;
  const d = ag.data;
  return (
    <Card title={t('Sign the acknowledgement of debt', 'የዕዳ ማረጋገጫውን ይፈርሙ')} actions={<PayLaterStatus status={d.status} />}>
      <div className="space-y-3 text-sm">
        <p>{t(`The lender approved ${etb(d.amount)}, repaid within ${d.tenorDays} days of accepting each stage. Once you sign, the lender pays into escrow and the talent starts.`, `አበዳሪው ${etb(d.amount)} አጽድቋል፤ እያንዳንዱን ደረጃ ከተቀበሉ በ${d.tenorDays} ቀናት ውስጥ ይከፈላል። ሲፈርሙ አበዳሪው ወደ ዕግድ ይከፍላል ባለሙያውም ይጀምራል።`)}</p>
        <blockquote className="rounded-lg border-l-4 border-brand-600 bg-stone-50 p-3 leading-relaxed">{d.acknowledgementPreview}</blockquote>
        <Field label={t('Enter your password or PIN to sign', 'ለመፈረም የይለፍ ቃልዎን ወይም ፒንዎን ያስገቡ')}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText error={act.error} />
        <Button busy={act.busy} disabled={!password} className="w-full sm:w-auto" onClick={async () => { if (await act.run(() => post(`/paylater/agreements/${agreementId}/acknowledge`, { password }))) onDone(); }}>
          {t('Sign and start the work', 'ፈርመው ሥራውን ያስጀምሩ')}
        </Button>
      </div>
    </Card>
  );
}

export function Schedule({ d }: { d: any }) {
  const { t, lang } = useLang();
  if (!d.installments.length) return <p className="text-sm text-stone-600">{t('The schedule starts when you accept the first stage of the work.', 'መርሐ ግብሩ የመጀመሪያውን የሥራ ደረጃ ሲቀበሉ ይጀምራል።')}</p>;
  return (
    <ul className="divide-y divide-stone-100 text-sm">
      {d.installments.map((i: any) => (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>
            {t('Due', 'የሚከፈልበት')} <span className="font-semibold">{date(i.dueOn, lang)}</span>
          </span>
          <span className="tabular-nums">
            {etb(i.amount)}
            {i.paid > 0 && i.remaining > 0 && <span className="text-stone-500"> · {t(`${etb(i.remaining)} left`, `${etb(i.remaining)} ቀሪ`)}</span>}
          </span>
          {i.remaining <= 0 ? <Badge tone="green">{t('Paid', 'ተከፍሏል')}</Badge> : i.daysPastDue > 0 ? <Badge tone="red">{t(`${i.daysPastDue} days late`, `${i.daysPastDue} ቀናት ዘግይቷል`)}</Badge> : <Badge tone="gray">{t('Not yet due', 'ጊዜው አልደረሰም')}</Badge>}
        </li>
      ))}
    </ul>
  );
}
