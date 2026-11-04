'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ReportConcern } from '@/components/report-concern';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, ErrorText, Field, Modal, PageTitle, Spinner, StatusBadge, Textarea, useAction } from '@/components/ui';
import { assignmentStatusLabel, AssignmentStatus, Facts } from '@/components/work-common';
import { MessagesPanel } from '@/components/work-messages';
import { Milestones } from '@/components/work-milestones';
import { ClientProposals, CommissionNote, InvitedPanel } from '@/components/work-offers';
import { RatingsPanel } from '@/components/work-ratings';
import { post } from '@/lib/api';
import { date, etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function AssignmentPage() {
  return (
    <RequireAuth>
      <Workspace />
    </RequireAuth>
  );
}

function Workspace() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLang();
  const { data: a, error, loading, reload } = useApi<any>(`/assignments/${id}`);
  const [payment, setPayment] = useState<any>(null);
  const [thread, setThread] = useState<string | null>(null);

  if (loading && !a) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!a) return null;
  const role = a.viewerRole as 'CLIENT' | 'TALENT' | 'INVITED_TALENT' | 'STAFF';

  const openThread = (talentId: string) => {
    setThread(talentId);
    setTimeout(() => document.getElementById('messages')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="text-sm">
        <Link href={role === 'STAFF' ? '/console' : '/dashboard'} className="text-brand-700 hover:underline">← {t('Back to my work', 'ወደ ሥራዎቼ ተመለስ')}</Link>
      </div>
      <Header a={a} />

      {role === 'INVITED_TALENT' && <InvitedPanel a={a} reload={reload} />}
      {role === 'TALENT' && a.status === 'AGREED' && (
        <Alert tone="warning">
          <p className="font-semibold">{t('The client chose your offer. Please do not start yet.', 'ደንበኛው ቅናሽዎን መርጠዋል። እባክዎ ገና አይጀምሩ።')}</p>
          <p>{t('We will tell you by SMS when the partner bank confirms the client has paid. Then you can start safely.', 'አጋር ባንኩ ደንበኛው መክፈሉን ሲያረጋግጥ በSMS እናሳውቅዎታለን። ከዚያ በደኅንነት መጀመር ይችላሉ።')}</p>
        </Alert>
      )}
      {role === 'TALENT' && a.status === 'FUNDED' && a.fundedAt && (
        <Alert tone="success">{t('The money is held safely by the partner bank. You can work now.', 'ገንዘቡ በአጋር ባንኩ በጥንቃቄ ተይዟል። አሁን መሥራት ይችላሉ።')}</Alert>
      )}
      {role === 'CLIENT' && a.status === 'REQUESTED' && (
        <Alert tone="info">{t('Thank you. Our team is reading your request and will turn it into a package with a fair price. Then we invite talents and you will get offers.', 'እናመሰግናለን። ቡድናችን ጥያቄዎን እያነበበ ተመጣጣኝ ዋጋ ያለው ጥቅል ያደርገዋል። ከዚያ ባለሙያዎችን እንጋብዛለን፣ እርስዎም ቅናሾች ያገኛሉ።')}</Alert>
      )}
      {role === 'CLIENT' && a.status === 'OPEN' && <ClientProposals a={a} reload={reload} onAccepted={setPayment} onMessage={openThread} />}
      {role === 'CLIENT' && a.status === 'AGREED' && <PaymentPanel a={a} accepted={payment} />}

      <CancelPanel a={a} reload={reload} />
      {role !== 'INVITED_TALENT' && <Milestones a={a} reload={reload} />}
      <DisputesList a={a} />
      {role !== 'STAFF' || a.talentId ? <MessagesPanel a={a} talentId={thread} setTalentId={setThread} /> : null}
      <RatingsPanel a={a} reload={reload} />
      <Timeline a={a} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
        <ReportConcern assignmentId={a.id} />
        <Link href="/help" className="text-sm text-stone-600 hover:underline">{t('Need help with this job?', 'በዚህ ሥራ እርዳታ ይፈልጋሉ?')}</Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header({ a }: { a: any }) {
  const { t, pick, lang } = useLang();
  const [showBrief, setShowBrief] = useState(false);
  const pv = a.packageVersion;
  const role = a.viewerRole;
  const rate = a.commissionRate !== null && a.commissionRate !== undefined ? Number(a.commissionRate) : null;
  const rows: [React.ReactNode, React.ReactNode][] = [];
  if (pv) rows.push([t('Package', 'ጥቅል'), `${pick(pv, 'title')} · ${t(`version ${pv.version}`, `ቅጂ ${pv.version}`)}`]);
  else if (a.custom) rows.push([t('Package', 'ጥቅል'), t('Custom work', 'ልዩ ሥራ')]);
  if (a.agreedPrice) rows.push([t('Agreed price', 'የተስማሙበት ዋጋ'), <span key="p" className="text-base font-bold">{etb(a.agreedPrice)}</span>]);
  else if (pv) rows.push([t('Package price', 'የጥቅል ዋጋ'), `${etb(pv.priceStandard)} (${etb(pv.priceMin)} – ${etb(pv.priceMax)})`]);
  else if (a.budgetMax) rows.push([t('Budget', 'በጀት'), t(`up to ${etb(a.budgetMax)}`, `እስከ ${etb(a.budgetMax)}`)]);
  if (role === 'TALENT' && a.agreedPrice && rate !== null) {
    const commission = Math.round(a.agreedPrice * rate);
    rows.push([t(`ToD commission (${Math.round(rate * 1000) / 10}%)`, `የToD ኮሚሽን (${Math.round(rate * 1000) / 10}%)`), etb(commission)]);
    rows.push([t('You receive', 'የሚቀበሉት'), <span key="n" className="font-bold text-green-700">{etb(a.agreedPrice - commission)}</span>]);
  }
  if (role !== 'CLIENT') rows.push([t('Client', 'ደንበኛ'), <span key="c">{a.client?.name} {a.client?.verified && <Badge tone="green">✓ {t('Verified', 'ተረጋግጧል')}</Badge>}</span>]);
  if (a.talent && role !== 'TALENT') rows.push([t('Talent', 'ባለሙያ'), <Link key="t" href={`/talent/${a.talent.userId}`} className="text-brand-700 underline">{a.talent.name}</Link>]);
  if (pv) rows.push([t('Time to finish', 'የማጠናቀቂያ ጊዜ'), t(`${pv.turnaroundDays} working days`, `${pv.turnaroundDays} የሥራ ቀናት`)]);
  if (a.deadline) rows.push([t('Client needs it by', 'ደንበኛው የሚፈልገው በ'), date(a.deadline, lang)]);
  rows.push([t('Posted', 'የተለጠፈው'), date(a.createdAt, lang)]);

  return (
    <div>
      <PageTitle sub={a.ref} actions={<AssignmentStatus status={a.status} />}>
        {a.title}
      </PageTitle>
      <Card>
        <Facts rows={rows} />
        {role === 'INVITED_TALENT' && !a.agreedPrice && <div className="mt-2"><CommissionNote /></div>}
        <div className="mt-3 border-t border-stone-100 pt-3">
          <button onClick={() => setShowBrief(!showBrief)} className="min-h-11 text-sm font-semibold text-brand-700" aria-expanded={showBrief}>
            {showBrief ? t('Hide details', 'ዝርዝሩን ደብቅ') : t('Show the job details', 'የሥራውን ዝርዝር አሳይ')}
          </button>
          {showBrief && (
            <div className="mt-2 space-y-3 text-sm">
              <div>
                <p className="font-medium">{t('What the client wrote', 'ደንበኛው የጻፈው')}</p>
                <p className="whitespace-pre-wrap text-stone-700">{a.brief}</p>
              </div>
              {pv && (
                <>
                  <div>
                    <p className="font-medium">{t('Included', 'የተካተተ')}</p>
                    <p className="whitespace-pre-wrap text-stone-700">{pick(pv, 'scope')}</p>
                  </div>
                  <div>
                    <p className="font-medium">{t('Not included', 'ያልተካተተ')}</p>
                    <p className="whitespace-pre-wrap text-stone-700">{pick(pv, 'exclusions')}</p>
                  </div>
                  <div>
                    <p className="font-medium">{t('What is delivered', 'የሚረከቡት')}</p>
                    <p className="text-stone-700">{pick(pv, 'deliverable')}</p>
                  </div>
                  {pv.checklistEn?.length > 0 && (
                    <div>
                      <p className="font-medium">{t('Checklist for accepting the work', 'ሥራውን ለመቀበል ማረጋገጫ ዝርዝር')}</p>
                      <ul className="list-disc pl-5 text-stone-700">
                        {(lang === 'am' && pv.checklistAm?.length ? pv.checklistAm : pv.checklistEn).map((c: string) => <li key={c}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                  <p className="text-stone-600">{t(`Changes included: ${pv.revisionLimit}`, `የተካተቱ ማስተካከያዎች፦ ${pv.revisionLimit}`)}</p>
                </>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function PaymentPanel({ a, accepted }: { a: any; accepted: any }) {
  const { t, lang } = useLang();
  const pay = accepted ?? (a.payments ?? []).find((p: any) => p.status === 'PENDING') ?? a.payments?.[0];
  if (!pay) {
    return <Alert tone="info">{t('Your payment details are being prepared. Refresh this page in a moment.', 'የክፍያ ዝርዝሮችዎ እየተዘጋጁ ነው። ትንሽ ቆይተው ገጹን ያድሱ።')}</Alert>;
  }
  // Instructions are saved with the payment, so they show again after a reload.
  const instructions = lang === 'am' ? pay.instructionsAm ?? pay.instructionsEn : pay.instructionsEn;
  return (
    <Card title={t('Next step: pay into escrow', 'ቀጣይ ደረጃ፦ ለአጋር ባንኩ ይክፈሉ')}>
      <div className="space-y-3 text-sm">
        <p>{t('Pay the amount below to the partner bank. The bank holds the money safely. The talent is paid only after you accept the work.', 'ከታች ያለውን መጠን ለአጋር ባንኩ ይክፈሉ። ባንኩ ገንዘቡን በጥንቃቄ ይይዛል። ባለሙያው የሚከፈለው ሥራውን ከተቀበሉ በኋላ ብቻ ነው።')}</p>
        <div className="grid gap-3 rounded-lg bg-amber-50 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-stone-600">{t('Amount to pay', 'የሚከፍሉት መጠን')}</p>
            <p className="text-2xl font-bold">{etb(pay.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-600">{t('Payment reference (write this on the slip)', 'የክፍያ መለያ ቁጥር (በደረሰኙ ላይ ይጻፉት)')}</p>
            <p className="select-all font-mono text-2xl font-bold tracking-wider">{pay.reference}</p>
          </div>
        </div>
        {instructions && <p className="whitespace-pre-wrap rounded-lg border border-stone-200 p-3">{instructions}</p>}
        {pay.checkoutUrl && pay.status === 'PENDING' && (
          <a href={pay.checkoutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white sm:w-auto">
            {t('Pay online', 'በመስመር ላይ ይክፈሉ')}
          </a>
        )}
        <p className="flex flex-wrap items-center gap-2">
          {t('Status', 'ሁኔታ')}: <StatusBadge status={pay.status} label={pay.status === 'PENDING' ? t('Waiting for your payment', 'ክፍያዎን በመጠበቅ ላይ') : pay.status === 'CONFIRMED' ? t('Received', 'ደርሷል') : pay.status.toLowerCase()} />
        </p>
        <p className="text-stone-600">{t('The talent starts work as soon as the partner bank confirms the money has arrived. We will tell you both by SMS.', 'አጋር ባንኩ ገንዘቡ መድረሱን እንዳረጋገጠ ባለሙያው ሥራውን ይጀምራል። ለሁለታችሁም በSMS እናሳውቃለን።')}</p>
        <p className="text-xs text-stone-500">{t(`Payment details created ${date(pay.createdAt, lang, true)}.`, `የክፍያ ዝርዝሮች የተፈጠሩት ${date(pay.createdAt, lang, true)}።`)}</p>
      </div>
    </Card>
  );
}

function CancelPanel({ a, reload }: { a: any; reload: () => void }) {
  const { t } = useLang();
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const role = a.viewerRole;
  if (role !== 'CLIENT' && role !== 'TALENT') return null;

  const beforeFunding = ['REQUESTED', 'OPEN', 'AGREED'].includes(a.status) && (role === 'CLIENT' || a.status === 'AGREED');
  const afterFunding = ['FUNDED', 'DELIVERED'].includes(a.status);
  if (!beforeFunding && !afterFunding) return null;

  const requestedByMe = a.cancelRequestedById === me?.id;
  const requestedByOther = !!a.cancelRequestedById && !requestedByMe;

  const submit = () =>
    run(async () => {
      await post(`/assignments/${a.id}/cancel`, { reason: reason.trim() });
      setOpen(false);
      setReason('');
      reload();
    });

  return (
    <>
      {afterFunding && requestedByOther && (
        <Alert tone="warning">
          <p className="font-semibold">{t('The other side asked to cancel this job.', 'ሌላኛው ወገን ይህን ሥራ ለመሰረዝ ጠይቋል።')}</p>
          {a.cancelReason && <p>{t('Reason', 'ምክንያት')}: {a.cancelReason}</p>}
          <p>{t('If you agree, money not yet paid out goes back to the client. If you do not agree, open a dispute from the work section.', 'ከተስማሙ ገና ያልተከፈለው ገንዘብ ለደንበኛው ይመለሳል። ካልተስማሙ ከሥራው ክፍል ክርክር ይክፈቱ።')}</p>
          <Button tone="danger" className="mt-2 w-full sm:w-auto" onClick={() => setOpen(true)}>{t('Agree to cancel', 'ለመሰረዝ እስማማለሁ')}</Button>
        </Alert>
      )}
      {afterFunding && requestedByMe && <Alert tone="info">{t('You asked to cancel. Waiting for the other side to agree.', 'ለመሰረዝ ጠይቀዋል። ሌላኛው ወገን እስኪስማማ በመጠበቅ ላይ።')}</Alert>}
      {(beforeFunding || (afterFunding && !a.cancelRequestedById)) && (
        <div className="text-right">
          <button onClick={() => setOpen(true)} className="min-h-11 px-2 text-sm font-medium text-stone-600 underline-offset-2 hover:text-red-700 hover:underline">
            {beforeFunding ? t('Cancel this job', 'ይህን ሥራ ሰርዝ') : t('Ask to cancel', 'ለመሰረዝ ጠይቅ')}
          </button>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={requestedByOther ? t('Agree to cancel', 'ለመሰረዝ እስማማለሁ') : t('Cancel this job', 'ይህን ሥራ ሰርዝ')}>
        <div className="space-y-3 text-sm">
          {beforeFunding ? (
            <p>{t('No money has been paid in yet, so cancelling is free.', 'ገና ምንም ገንዘብ ስላልተከፈለ መሰረዝ ነጻ ነው።')}</p>
          ) : (
            <p>{t('The money is already with the bank. Cancelling now needs both sides to agree. Any stage not yet paid out is refunded to the client. If you cannot agree, open a dispute instead.', 'ገንዘቡ አስቀድሞ በባንኩ ነው። አሁን መሰረዝ የሁለቱንም ወገኖች ስምምነት ይጠይቃል። ገና ያልተከፈለ ማንኛውም ደረጃ ለደንበኛው ይመለሳል። መስማማት ካልቻላችሁ ክርክር ይክፈቱ።')}</p>
          )}
          <Field label={t('Reason', 'ምክንያት')}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <ErrorText error={error} />
          <Button tone="danger" onClick={submit} busy={busy} disabled={reason.trim().length < 3} className="w-full">
            {beforeFunding ? t('Cancel the job', 'ሥራውን ሰርዝ') : requestedByOther ? t('Agree and cancel', 'ተስማማ እና ሰርዝ') : t('Send cancel request', 'የመሰረዝ ጥያቄ ላክ')}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function stageLabel(stage: string, t: (en: string, am: string) => string) {
  const map: Record<string, [string, string]> = {
    INTAKE: ['Received', 'ደርሷል'],
    FACILITATION: ['Talking it through', 'በውይይት ላይ'],
    DECISION: ['Being decided', 'በውሳኔ ላይ'],
    APPEAL: ['Appeal', 'ይግባኝ'],
    CLOSED: ['Closed', 'ተዘግቷል'],
  };
  const v = map[stage];
  return v ? t(v[0], v[1]) : stage;
}

function DisputesList({ a }: { a: any }) {
  const { t, lang } = useLang();
  const ds: any[] = a.disputes ?? [];
  if (!ds.length) return null;
  return (
    <Card title={t('Disputes', 'ክርክሮች')}>
      <ul className="divide-y divide-stone-100">
        {ds.map((d) => (
          <li key={d.id}>
            <Link href={`/disputes/${d.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 hover:bg-stone-50">
              <span className="min-w-0">
                <span className="font-medium">{d.ref}</span> <span className="text-sm text-stone-600">· {etb(d.amountDisputed)} · {date(d.createdAt, lang)}</span>
                <span className="block truncate text-sm text-stone-600">{d.reason}</span>
              </span>
              <StatusBadge status={d.stage === 'CLOSED' ? 'CLOSED' : 'DISPUTED'} label={stageLabel(d.stage, t)} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Timeline({ a }: { a: any }) {
  const { t, lang } = useLang();
  const events: any[] = a.events ?? [];
  if (!events.length) return null;
  return (
    <Card title={t('History', 'ታሪክ')}>
      <ol className="relative space-y-3 border-l-2 border-stone-200 pl-4">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[23px] top-1 size-3 rounded-full bg-brand-600 ring-4 ring-white" />
            <p className="text-sm font-medium">{assignmentStatusLabel(e.toStatus, t)}</p>
            <p className="text-xs text-stone-500">{date(e.at, lang, true)}</p>
            {e.note && !/^Accepted proposal /.test(e.note) && <p className="text-xs text-stone-600">{e.note}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
