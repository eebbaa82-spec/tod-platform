'use client';
import Link from 'next/link';
import { useState } from 'react';
import { post } from '@/lib/api';
import { date, etb, toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { Alert, Badge, Button, Card, Empty, ErrorText, Field, Input, Modal, Textarea, useAction } from './ui';
import { TierBadge } from './work-common';

type T = (en: string, am: string) => string;

// Commission explained before a rate is fixed on the assignment.
export function CommissionNote() {
  const { t } = useLang();
  return (
    <p className="text-xs text-stone-500">
      {t(
        'ToD takes a small commission from your payment: usually 5%, or 1% for verified women and talents with a confirmed disability. The exact rate is fixed when the client accepts your offer.',
        'ToD ከክፍያዎ ትንሽ ኮሚሽን ይወስዳል፦ ብዙ ጊዜ 5%፣ ወይም ለተረጋገጡ ሴቶች እና የአካል ጉዳታቸው ለተረጋገጠ ባለሙያዎች 1%። ትክክለኛው መጠን ደንበኛው ቅናሽዎን ሲቀበል ይወሰናል።',
      )}
    </p>
  );
}

function proposalStatusBadge(status: string, t: T) {
  switch (status) {
    case 'SUBMITTED':
      return <Badge tone="blue">{t('Waiting for the client', 'ደንበኛውን በመጠበቅ ላይ')}</Badge>;
    case 'COUNTERED':
      return <Badge tone="amber">{t('Counter-offer', 'የመልስ ቅናሽ')}</Badge>;
    case 'ACCEPTED':
      return <Badge tone="green">{t('Accepted', 'ተቀባይነት አግኝቷል')}</Badge>;
    case 'REJECTED':
      return <Badge tone="gray">{t('Not chosen', 'አልተመረጠም')}</Badge>;
    default:
      return <Badge tone="gray">{status.toLowerCase()}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Invited talent: respond to the invitation, answer a counter-offer
// ---------------------------------------------------------------------------

export function InvitedPanel({ a, reload }: { a: any; reload: () => void }) {
  const { t, lang } = useLang();
  const inv = a.invitation;
  const pv = a.packageVersion;
  const mine = a.proposals?.[0];
  const [mode, setMode] = useState<'none' | 'propose' | 'decline'>('none');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState(pv?.turnaroundDays ? String(pv.turnaroundDays) : '');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [counterReason, setCounterReason] = useState('');
  const act = useAction();

  const respond = (body: Record<string, unknown>) =>
    act.run(async () => {
      await post(`/assignments/${a.id}/respond`, body);
      setMode('none');
      reload();
    });
  const counterResponse = (accept: boolean) =>
    act.run(async () => {
      await post(`/assignments/proposals/${mine.id}/counter-response`, { accept, reason: counterReason.trim() || undefined });
      reload();
    });

  if (mine) {
    return (
      <Card title={t('Your offer', 'ቅናሽዎ')}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold">{etb(mine.amount)}</span>
            {mine.deliveryDays && <span className="text-stone-600">{t(`in ${mine.deliveryDays} working days`, `በ${mine.deliveryDays} የሥራ ቀናት`)}</span>}
            {proposalStatusBadge(mine.status, t)}
          </div>
          {mine.message && <p className="whitespace-pre-wrap text-stone-700">{mine.message}</p>}
          {mine.status === 'REJECTED' && mine.rejectReason && <p className="text-stone-600">{t('Reason', 'ምክንያት')}: {mine.rejectReason}</p>}
          {mine.status === 'COUNTERED' && mine.counterAmount && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="font-semibold">{t(`The client offers ${etb(mine.counterAmount)} instead.`, `ደንበኛው በምትኩ ${etb(mine.counterAmount)} ያቀርባል።`)}</p>
              {mine.counterReason && <p>{t('Their reason', 'ምክንያታቸው')}: {mine.counterReason}</p>}
              <Field label={t('Note to the client (optional)', 'ለደንበኛው ማስታወሻ (አማራጭ)')}>
                <Input value={counterReason} onChange={(e) => setCounterReason(e.target.value)} maxLength={500} />
              </Field>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => counterResponse(true)} busy={act.busy} className="w-full sm:w-auto">
                  {t(`Accept ${etb(mine.counterAmount)}`, `${etb(mine.counterAmount)} ተቀበል`)}
                </Button>
                <Button tone="secondary" onClick={() => counterResponse(false)} busy={act.busy} className="w-full sm:w-auto">
                  {t('Keep my price', 'ዋጋዬን አቆይ')}
                </Button>
              </div>
            </div>
          )}
          <ErrorText error={act.error} />
          <CommissionNote />
        </div>
      </Card>
    );
  }

  if (!inv) return null;
  const expired = new Date(inv.respondBy).getTime() < Date.now();
  if (inv.status !== 'INVITED' || a.status !== 'OPEN' || expired) {
    const msg =
      inv.status === 'DECLINED'
        ? t('You declined this invitation.', 'ይህን ግብዣ አልተቀበሉም።')
        : inv.status === 'WITHDRAWN' || a.status !== 'OPEN'
          ? t('This job is no longer taking offers.', 'ይህ ሥራ ከእንግዲህ ቅናሽ አይቀበልም።')
          : t('The time to answer has passed.', 'የመልስ ጊዜው አልፏል።');
    return <Alert tone="info">{msg}</Alert>;
  }

  const amountSantim = amount ? toSantim(amount) : 0;
  const outOfBand = !!(pv && amount && (amountSantim < pv.priceMin || amountSantim > pv.priceMax));
  const overBudget = !!(!pv && a.budgetMax && amountSantim > a.budgetMax);

  return (
    <Card title={t('You are invited to this job', 'ለዚህ ሥራ ተጋብዘዋል')}>
      <div className="space-y-4 text-sm">
        <Alert tone="warning">{t(`Please answer by ${date(inv.respondBy, lang, true)}.`, `እባክዎ እስከ ${date(inv.respondBy, lang, true)} ይመልሱ።`)}</Alert>
        {pv ? (
          <p>
            {t('Package price', 'የጥቅል ዋጋ')}: <span className="font-bold">{etb(pv.priceStandard)}</span>{' '}
            <span className="text-stone-500">{t(`(you may offer ${etb(pv.priceMin)} to ${etb(pv.priceMax)})`, `(ከ${etb(pv.priceMin)} እስከ ${etb(pv.priceMax)} ማቅረብ ይችላሉ)`)}</span>
          </p>
        ) : a.budgetMax ? (
          <p>{t(`The client's budget is up to ${etb(a.budgetMax)}.`, `የደንበኛው በጀት እስከ ${etb(a.budgetMax)} ነው።`)}</p>
        ) : null}

        {mode === 'none' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {pv && (
              <Button onClick={() => respond({ action: 'ACCEPT_PRICE' })} busy={act.busy} className="w-full sm:w-auto">
                {t(`Accept at ${etb(pv.priceStandard)}`, `በ${etb(pv.priceStandard)} እቀበላለሁ`)}
              </Button>
            )}
            <Button tone="secondary" onClick={() => setMode('propose')} className="w-full sm:w-auto">
              {t('Offer my own price', 'የራሴን ዋጋ አቀርባለሁ')}
            </Button>
            <Button tone="ghost" onClick={() => setMode('decline')} className="w-full sm:w-auto">
              {t('No, thank you', 'አይ፣ አመሰግናለሁ')}
            </Button>
          </div>
        )}

        {mode === 'propose' && (
          <div className="space-y-3 rounded-lg bg-stone-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('My price in birr', 'ዋጋዬ በብር')} hint={outOfBand ? t('The price must be inside the range above.', 'ዋጋው ከላይ ባለው ክልል ውስጥ መሆን አለበት።') : overBudget ? t('This is above the client budget.', 'ይህ ከደንበኛው በጀት በላይ ነው።') : undefined}>
                <Input type="number" min={1} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label={t('Working days I need', 'የሚያስፈልጉኝ የሥራ ቀናት')}>
                <Input type="number" min={1} max={120} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
              </Field>
            </div>
            <Field label={t('Message to the client', 'ለደንበኛው መልእክት')} hint={t('Say why you are a good fit. Do not share phone numbers; they are hidden until payment.', 'ለምን ተስማሚ እንደሆኑ ይግለጹ። ስልክ ቁጥር አያጋሩ፤ ክፍያ እስኪፈጸም ይደበቃሉ።')}>
              <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => respond({ action: 'PROPOSE', amount: amountSantim, deliveryDays: days ? Number(days) : undefined, message: message.trim() || undefined })}
                busy={act.busy}
                disabled={!amount || amountSantim < 100 || outOfBand || overBudget}
                className="w-full sm:w-auto"
              >
                {t('Send my offer', 'ቅናሼን ላክ')}
              </Button>
              <Button tone="ghost" onClick={() => setMode('none')} className="w-full sm:w-auto">{t('Back', 'ተመለስ')}</Button>
            </div>
          </div>
        )}

        {mode === 'decline' && (
          <div className="space-y-3 rounded-lg bg-stone-50 p-3">
            <Field label={t('Why not? (optional)', 'ለምን? (አማራጭ)')}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t('e.g. Too busy this week', 'ለምሳሌ በዚህ ሳምንት ሥራ በዝቶብኛል')} />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button tone="danger" onClick={() => respond({ action: 'DECLINE', reason: reason.trim() || undefined })} busy={act.busy} className="w-full sm:w-auto">
                {t('Decline invitation', 'ግብዣውን አልቀበልም')}
              </Button>
              <Button tone="ghost" onClick={() => setMode('none')} className="w-full sm:w-auto">{t('Back', 'ተመለስ')}</Button>
            </div>
          </div>
        )}
        <ErrorText error={act.error} />
        <CommissionNote />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Client: proposals while the assignment is open
// ---------------------------------------------------------------------------

export function ClientProposals({ a, reload, onAccepted, onMessage }: { a: any; reload: () => void; onAccepted: (payment: any) => void; onMessage: (talentId: string) => void }) {
  const { t } = useLang();
  const [accepting, setAccepting] = useState<any>(null);
  const [countering, setCountering] = useState<any>(null);
  const [rejecting, setRejecting] = useState<any>(null);
  const proposals: any[] = a.proposals ?? [];
  const open = a.status === 'OPEN';

  return (
    <Card title={t(`Offers from talents (${proposals.length})`, `ከባለሙያዎች የቀረቡ ቅናሾች (${proposals.length})`)}>
      {proposals.length === 0 ? (
        <Empty>
          {t('No offers yet. We have invited suitable talents and will tell you by SMS when an offer arrives.', 'ገና ቅናሽ የለም። ተስማሚ ባለሙያዎችን ጋብዘናል፤ ቅናሽ ሲደርስ በSMS እናሳውቅዎታለን።')}
          {a.invitationCount ? ` ${t(`${a.invitationCount} talents invited.`, `${a.invitationCount} ባለሙያዎች ተጋብዘዋል።`)}` : ''}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {proposals.map((p) => (
            <li key={p.id} className="rounded-lg border border-stone-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <Link href={`/talent/${p.talent.userId}`} className="font-semibold text-brand-700 underline underline-offset-2">
                    {p.talent.name}
                  </Link>
                  {p.talent.headline && <p className="text-sm text-stone-600">{p.talent.headline}</p>}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <TierBadge tier={p.talent.tier} />
                    {p.talent.testScore !== null && p.talent.testScore !== undefined && <span className="text-stone-600">{t(`Test score ${p.talent.testScore}%`, `የፈተና ውጤት ${p.talent.testScore}%`)}</span>}
                    {p.talent.verified && <Badge tone="green">✓ {t('Identity verified', 'ማንነቱ ተረጋግጧል')}</Badge>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{etb(p.amount)}</p>
                  {p.atPackagePrice && <p className="text-xs text-stone-500">{t('Package price', 'የጥቅል ዋጋ')}</p>}
                  {p.deliveryDays && <p className="text-xs text-stone-600">{t(`${p.deliveryDays} working days`, `${p.deliveryDays} የሥራ ቀናት`)}</p>}
                </div>
              </div>
              {p.message && <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{p.message}</p>}
              <div className="mt-2">{proposalStatusBadge(p.status, t)}</div>
              {p.status === 'COUNTERED' && <p className="mt-1 text-sm text-stone-600">{t(`You offered ${etb(p.counterAmount)}. Waiting for the talent to answer.`, `${etb(p.counterAmount)} አቅርበዋል። ባለሙያው እስኪመልስ በመጠበቅ ላይ።`)}</p>}
              {open && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {p.status === 'SUBMITTED' && (
                    <>
                      <Button onClick={() => setAccepting(p)} className="w-full sm:w-auto">{t('Choose this talent', 'ይህን ባለሙያ ምረጥ')}</Button>
                      <Button tone="secondary" onClick={() => setCountering(p)} className="w-full sm:w-auto">{t('Offer another price', 'ሌላ ዋጋ አቅርብ')}</Button>
                    </>
                  )}
                  {['SUBMITTED', 'COUNTERED'].includes(p.status) && (
                    <Button tone="ghost" onClick={() => setRejecting(p)} className="w-full sm:w-auto">{t('Say no', 'አልፈልግም')}</Button>
                  )}
                  <Button tone="ghost" onClick={() => onMessage(p.talentId)} className="w-full sm:w-auto">{t('Message', 'መልእክት')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {accepting && <AcceptModal p={accepting} a={a} onClose={() => setAccepting(null)} onDone={(pay) => { setAccepting(null); onAccepted(pay); reload(); }} />}
      {countering && <CounterModal p={countering} a={a} onClose={() => setCountering(null)} onDone={() => { setCountering(null); reload(); }} />}
      {rejecting && <RejectModal p={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); reload(); }} />}
    </Card>
  );
}

type Plan = { title: string; amount: string; days: string };

function AcceptModal({ p, a, onClose, onDone }: { p: any; a: any; onClose: () => void; onDone: (payment: any) => void }) {
  const { t, pick } = useLang();
  const pv = a.packageVersion;
  const defaultDays = String(p.deliveryDays ?? pv?.turnaroundDays ?? 5);
  const [split, setSplit] = useState(false);
  const [plan, setPlan] = useState<Plan[]>([
    { title: '', amount: '', days: '' },
    { title: '', amount: '', days: defaultDays },
  ]);
  const { busy, error, run } = useAction();
  const total = plan.reduce((s, m) => s + (m.amount ? toSantim(m.amount) : 0), 0);
  const valid = !split || (plan.length >= 2 && total === p.amount && plan.every((m) => m.title.trim().length >= 2 && toSantim(m.amount || 0) >= 100 && Number(m.days) >= 1));

  const submit = () =>
    run(async () => {
      const body = split ? { milestones: plan.map((m) => ({ title: m.title.trim(), amount: toSantim(m.amount), dueInWorkingDays: Number(m.days) })) } : {};
      const r = await post<{ assignment: any; payment: any }>(`/assignments/proposals/${p.id}/accept`, body);
      onDone(r.payment);
    });

  return (
    <Modal open onClose={onClose} title={t('Choose this talent', 'ይህን ባለሙያ ምረጥ')}>
      <div className="space-y-4 text-sm">
        <p>
          {t(`You agree to pay ${etb(p.amount)} to ${p.talent.name}.`, `ለ${p.talent.name} ${etb(p.amount)} ለመክፈል ተስማምተዋል።`)}{' '}
          {t('Next you pay this amount to the partner bank, which holds it safely until you accept the work.', 'ቀጥሎ ይህን መጠን ለአጋር ባንኩ ይከፍላሉ፣ ባንኩም ሥራውን እስኪቀበሉ ድረስ በጥንቃቄ ይይዘዋል።')}
        </p>
        {pv && <p className="text-stone-600">{t('Deliverable', 'የሚረከቡት')}: {pick(pv, 'deliverable')}</p>}
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 accent-brand-600" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          <span>{t('Split the work into stages (pay and approve each stage separately)', 'ሥራውን በደረጃዎች ከፋፍል (እያንዳንዱን ደረጃ ለየብቻ ክፈል እና አጽድቅ)')}</span>
        </label>
        {split && (
          <div className="space-y-3">
            {plan.map((m, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-stone-200 p-3">
                <p className="text-xs font-semibold text-stone-500">{t(`Stage ${i + 1}`, `ደረጃ ${i + 1}`)}</p>
                <Field label={t('What will be delivered', 'የሚቀርበው')}>
                  <Input value={m.title} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} maxLength={160} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('Amount (birr)', 'መጠን (ብር)')}>
                    <Input type="number" min={1} inputMode="decimal" value={m.amount} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  </Field>
                  <Field label={t('Working days', 'የሥራ ቀናት')}>
                    <Input type="number" min={1} max={180} inputMode="numeric" value={m.days} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))} />
                  </Field>
                </div>
                {plan.length > 2 && (
                  <button type="button" className="min-h-11 text-sm text-red-700" onClick={() => setPlan(plan.filter((_, j) => j !== i))}>
                    {t('Remove stage', 'ደረጃውን አስወግድ')}
                  </button>
                )}
              </div>
            ))}
            {plan.length < 10 && (
              <Button tone="secondary" onClick={() => setPlan([...plan, { title: '', amount: '', days: defaultDays }])}>
                + {t('Add a stage', 'ደረጃ ጨምር')}
              </Button>
            )}
            <p className="text-xs text-stone-500">{t('Working days are counted from today.', 'የሥራ ቀናት ከዛሬ ጀምሮ ይቆጠራሉ።')}</p>
            <Alert tone={total === p.amount ? 'success' : 'warning'}>
              {t(`Stages add up to ${etb(total)} of ${etb(p.amount)}.`, `ደረጃዎቹ ከ${etb(p.amount)} ውስጥ ${etb(total)} ይደርሳሉ።`)}
              {total !== p.amount && ` ${t('They must add up exactly.', 'በትክክል መመጣጠን አለባቸው።')}`}
            </Alert>
          </div>
        )}
        <ErrorText error={error} />
        <Button onClick={submit} busy={busy} disabled={!valid} className="w-full">
          {t('Agree and get payment details', 'ተስማማ እና የክፍያ ዝርዝር አግኝ')}
        </Button>
      </div>
    </Modal>
  );
}

function CounterModal({ p, a, onClose, onDone }: { p: any; a: any; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const pv = a.packageVersion;
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const s = amount ? toSantim(amount) : 0;
  const outOfBand = !!(pv && amount && (s < pv.priceMin || s > pv.priceMax));
  return (
    <Modal open onClose={onClose} title={t('Offer another price', 'ሌላ ዋጋ አቅርብ')}>
      <div className="space-y-3 text-sm">
        <p>{t(`${p.talent.name} asked for ${etb(p.amount)}.`, `${p.talent.name} ${etb(p.amount)} ጠይቀዋል።`)}</p>
        {pv && <p className="text-stone-600">{t(`Your price must be between ${etb(pv.priceMin)} and ${etb(pv.priceMax)}.`, `ዋጋዎ ከ${etb(pv.priceMin)} እስከ ${etb(pv.priceMax)} መሆን አለበት።`)}</p>}
        <Field label={t('Your price in birr', 'የእርስዎ ዋጋ በብር')}>
          <Input type="number" min={1} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('Why? (optional)', 'ለምን? (አማራጭ)')}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <ErrorText error={error} />
        <Button
          onClick={() => run(async () => { await post(`/assignments/proposals/${p.id}/counter`, { amount: s, reason: reason.trim() || undefined }); onDone(); })}
          busy={busy}
          disabled={!amount || s < 100 || outOfBand}
          className="w-full"
        >
          {t('Send counter-offer', 'የመልስ ቅናሽ ላክ')}
        </Button>
      </div>
    </Modal>
  );
}

function RejectModal({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={t('Say no to this offer', 'ይህን ቅናሽ አልቀበልም')}>
      <div className="space-y-3 text-sm">
        <p>{t(`${p.talent.name} will be told politely.`, `ለ${p.talent.name} በትህትና ይነገራቸዋል።`)}</p>
        <Field label={t('Reason (optional)', 'ምክንያት (አማራጭ)')}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        <ErrorText error={error} />
        <Button tone="danger" onClick={() => run(async () => { await post(`/assignments/proposals/${p.id}/reject`, { reason: reason.trim() || undefined }); onDone(); })} busy={busy} className="w-full">
          {t('Say no', 'አልቀበልም')}
        </Button>
      </div>
    </Modal>
  );
}
