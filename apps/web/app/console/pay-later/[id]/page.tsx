'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { JsonBlock, KV, Notice, ReasonButton, useAgents } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { PayLaterStatus, Schedule } from '@/components/pay-later';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, ErrorText, Field, Input, PageTitle, Select, Spinner, Textarea, useAction } from '@/components/ui';
import { get, post } from '@/lib/api';
import { date, etb, toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function PayLaterAgreementConsole() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.payLater]}>
      <Detail />
    </RequireAuth>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const { has, me } = useSession();
  const { name } = useAgents();
  const { data: d, error, loading, reload } = useApi<any>(`/paylater/agreements/${id}`);
  const [ok, setOk] = useState<string | null>(null);
  const finance = has(...CONSOLE_ROLES.payLaterManage);
  if (loading && !d) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!d) return null;
  const done = (msg: string) => {
    setOk(msg);
    reload();
  };

  return (
    <div className="space-y-4">
      <Link href="/console/pay-later" className="text-sm text-brand-700 hover:underline">← {t('Pay-later portfolio', 'የበኋላ ክፍያ ፖርትፎሊዮ')}</Link>
      <PageTitle sub={`${d.client.enterprise} · ${d.client.sector ?? ''} · ${t('cycle', 'ዙር')} ${d.cycle}`} actions={<PayLaterStatus status={d.status} />}>
        {d.ref}
      </PageTitle>
      <Notice ok={ok} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('Agreement', 'ስምምነት')}>
          <KV
            items={[
              [t('Assignment', 'ሥራ'), <Link key="a" href={`/assignments/${d.assignment.id}`} className="text-brand-700 hover:underline">{d.assignment.ref} {d.assignment.title}</Link>],
              [t('Amount', 'መጠን'), etb(d.amount)],
              [t('Tenor', 'የመክፈያ ጊዜ'), t(`${d.tenorDays} days from each acceptance`, `ከእያንዳንዱ ተቀባይነት ${d.tenorDays} ቀናት`)],
              [t('Purpose', 'ዓላማ'), d.purpose],
              [t('Lender', 'አበዳሪ'), `${d.lender} · ${d.lenderRef ?? '—'}`],
              [t('Lender decision', 'የአበዳሪ ውሳኔ'), d.decidedAt ? `${d.lenderReason ?? ''} (${date(d.decidedAt, lang, true)})` : '—'],
              [t('Drawn into escrow', 'ወደ ዕግድ የተከፈለ'), d.drawdownRef ? `${etb(d.disbursed)} · ${d.drawdownRef}` : '—'],
              [t('Repaid', 'የተመለሰ'), etb(d.repaid)],
              [t('Outstanding', 'ቀሪ'), <b key="o">{etb(d.outstanding)}</b>],
              [t('Client phone', 'የደንበኛ ስልክ'), d.client.phone],
            ]}
          />
        </Card>
        <Card title={t('Repayment schedule', 'የክፍያ መርሐ ግብር')}>
          <Schedule d={d} />
          {finance && ['ACTIVE', 'DEFAULTED'].includes(d.status) && <Repayment d={d} onDone={() => done(t('Repayment recorded and reported to the lender.', 'ክፍያው ተመዝግቦ ለአበዳሪው ተነግሯል።'))} />}
        </Card>
      </div>

      {d.status === 'AWAITING_REASSESSMENT' && finance && <Reassess id={d.id} onDone={() => done(t('Reassessment recorded.', 'ዳግም ግምገማው ተመዝግቧል።'))} />}

      <Card title={t('Exceptions and negotiated repayments', 'ልዩ ሁኔታዎች እና የተደራደሩ ክፍያዎች')}>
        <div className="space-y-3 text-sm">
          <p className="text-stone-600">{t('There is no automatic rollover. A new due date needs a reason and a second approver.', 'በራሱ የሚራዘም ዕዳ የለም። አዲስ የመክፈያ ቀን ምክንያትና ሁለተኛ አጽዳቂ ያስፈልገዋል።')}</p>
          {!d.exceptions.length && <p className="text-stone-500">{t('None.', 'የለም።')}</p>}
          {d.exceptions.map((x: any) => (
            <div key={x.id} className="rounded-lg border border-stone-200 p-3">
              <p className="flex flex-wrap items-center gap-2">
                <b>{x.kind === 'RESCHEDULE' ? t('New due date', 'አዲስ የመክፈያ ቀን') : t('Other exception', 'ሌላ ልዩ ሁኔታ')}</b>
                {x.newDueOn && <span>{date(x.newDueOn, lang)}</span>}
                <Badge tone={x.status === 'APPROVED' ? 'green' : x.status === 'REJECTED' ? 'red' : 'amber'}>{x.status.toLowerCase()}</Badge>
              </p>
              <p>{x.reason}</p>
              <p className="text-xs text-stone-500">{t('Asked by', 'የጠየቀው')} {name(x.requestedById)}{x.decidedById && ` · ${t('decided by', 'የወሰነው')} ${name(x.decidedById)}${x.note ? `: ${x.note}` : ''}`}</p>
              {finance && x.status === 'PENDING' && x.requestedById !== me?.id && (
                <div className="mt-2 flex gap-2">
                  <Button onClick={async () => { await post(`/paylater/exceptions/${x.id}/decide`, { approve: true }); done(t('Approved.', 'ጸድቋል።')); }}>{t('Approve', 'አጽድቅ')}</Button>
                  <Button tone="secondary" onClick={async () => { await post(`/paylater/exceptions/${x.id}/decide`, { approve: false }); done(t('Rejected.', 'ውድቅ ሆኗል።')); }}>{t('Reject', 'ውድቅ አድርግ')}</Button>
                </div>
              )}
            </div>
          ))}
          {finance && ['ACTIVE', 'DEFAULTED'].includes(d.status) && <ExceptionForm d={d} onDone={() => done(t('Sent for a second approval.', 'ለሁለተኛ ማጽደቂያ ተልኳል።'))} />}
        </div>
      </Card>

      <Card title={t('Acknowledgement of debt', 'የዕዳ ማረጋገጫ')}>
        {d.acknowledgementText ? (
          <>
            <blockquote className="text-sm leading-relaxed">{d.acknowledgementText}</blockquote>
            <p className="mt-2 text-xs text-stone-500">{t('Signed with the client’s PIN', 'በደንበኛው ፒን የተፈረመ')} {date(d.acknowledgedAt, lang, true)} · {d.acknowledgementIp}</p>
          </>
        ) : (
          <p className="text-sm text-stone-500">{t('Not signed yet.', 'ገና አልተፈረመም።')}</p>
        )}
      </Card>

      <Card title={t('Application sent to the lender', 'ለአበዳሪው የተላከው ማመልከቻ')}>
        <JsonBlock value={d.application} />
        {d.reassessment && <p className="mt-2 text-sm">{t('Affordability reassessment', 'የተመጣጣኝነት ዳግም ግምገማ')}: <b>{d.reassessment.affordable ? t('affordable', 'ተመጣጣኝ') : t('not affordable', 'ተመጣጣኝ አይደለም')}</b> · {d.reassessment.note}</p>}
      </Card>

      <EvidencePack id={d.id} refCode={d.ref} />
    </div>
  );
}

function Repayment({ d, onDone }: { d: any; onDone: () => void }) {
  const { t } = useLang();
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const a = useAction();
  return (
    <form className="mt-4 grid gap-2 border-t border-stone-100 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => post(`/paylater/agreements/${d.id}/repayments`, { amount: toSantim(amount), reference }))) { setAmount(''); setReference(''); onDone(); } }}>
      <Field label={t('Repayment (ETB)', 'ክፍያ (ብር)')}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label={t('Lender reference', 'የአበዳሪ መለያ')}><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      <Button type="submit" busy={a.busy} disabled={!amount || reference.length < 3}>{t('Record', 'መዝግብ')}</Button>
      <div className="sm:col-span-3"><ErrorText error={a.error} /></div>
    </form>
  );
}

function Reassess({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useLang();
  const [note, setNote] = useState('');
  const a = useAction();
  const send = async (affordable: boolean) => { if (await a.run(() => post(`/paylater/agreements/${id}/reassess`, { affordable, note }))) onDone(); };
  return (
    <Card title={t('Affordability reassessment before repeat use', 'ከድጋሚ አጠቃቀም በፊት የተመጣጣኝነት ዳግም ግምገማ')}>
      <div className="space-y-3">
        <Field label={t('What you checked (sales, cash flow, past repayments)', 'ያረጋገጡት (ሽያጭ፣ የገንዘብ ፍሰት፣ ያለፉ ክፍያዎች)')}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorText error={a.error} />
        <div className="flex gap-2">
          <Button busy={a.busy} disabled={note.trim().length < 5} onClick={() => send(true)}>{t('Affordable: send to the lender', 'ተመጣጣኝ ነው፦ ለአበዳሪው ላክ')}</Button>
          <Button tone="secondary" busy={a.busy} disabled={note.trim().length < 5} onClick={() => send(false)}>{t('Not affordable', 'ተመጣጣኝ አይደለም')}</Button>
        </div>
      </div>
    </Card>
  );
}

function ExceptionForm({ d, onDone }: { d: any; onDone: () => void }) {
  const { t, lang } = useLang();
  const open = d.installments.filter((i: any) => i.remaining > 0);
  const [inst, setInst] = useState(open[0]?.id ?? '');
  const [due, setDue] = useState('');
  return (
    <ReasonButton label={t('Ask for an exception', 'ልዩ ሁኔታ ጠይቅ')} title={t('Negotiated repayment or exception', 'የተደራደረ ክፍያ ወይም ልዩ ሁኔታ')} minLength={5} onSubmit={async (reason) => {
      await post(`/paylater/agreements/${d.id}/exceptions`, inst && due ? { kind: 'RESCHEDULE', installmentId: inst, newDueOn: due, reason } : { kind: 'OTHER', reason });
      onDone();
    }}>
      {open.length > 0 && (
        <>
          <Field label={t('Instalment', 'ክፍያ')}><Select value={inst} onChange={(e) => setInst(e.target.value)} options={open.map((i: any) => ({ value: i.id, label: `${etb(i.remaining)} · ${date(i.dueOn, lang)}` }))} /></Field>
          <Field label={t('New due date (leave empty for another kind of exception)', 'አዲስ የመክፈያ ቀን (ለሌላ ዓይነት ባዶ ይተዉ)')}><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </>
      )}
    </ReasonButton>
  );
}

// FR-BNP-12: the evidence pack for the lender's collections and legal recourse.
function EvidencePack({ id, refCode }: { id: string; refCode: string }) {
  const { t, lang } = useLang();
  const [pack, setPack] = useState<any>(null);
  const a = useAction();
  const download = () => {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `evidence-${refCode}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Card title={t('Evidence pack', 'የማስረጃ ጥቅል')} actions={pack ? <Button tone="secondary" onClick={download}>{t('Download', 'አውርድ')}</Button> : <Button tone="secondary" busy={a.busy} onClick={async () => setPack(await a.run(() => get(`/paylater/agreements/${id}/evidence`)))}>{t('Prepare', 'አዘጋጅ')}</Button>}>
      <ErrorText error={a.error} />
      {!pack ? (
        <p className="text-sm text-stone-600">{t('The agreement, application, acknowledgement of debt, accepted work, schedule, reminders sent, repayments, exceptions and the audit trail, in one file for the lender.', 'ስምምነቱ፣ ማመልከቻው፣ የዕዳ ማረጋገጫው፣ የተቀበለው ሥራ፣ መርሐ ግብሩ፣ የተላኩ ማስታወሻዎች፣ ክፍያዎች፣ ልዩ ሁኔታዎች እና የኦዲት መዝገቡ በአንድ ፋይል ለአበዳሪው።')}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <Alert tone="info">{t(`Prepared ${date(pack.generatedAt, lang, true)}. Viewing it is recorded in the audit log.`, `የተዘጋጀው ${date(pack.generatedAt, lang, true)}። መታየቱ በኦዲት መዝገብ ይመዘገባል።`)}</Alert>
          <p><b>{t('Reminders sent', 'የተላኩ ማስታወሻዎች')}</b></p>
          <ul className="list-disc pl-5">{pack.reminders.map((r: any, i: number) => <li key={i}>{date(r.createdAt, lang, true)} · {r.title} · {r.channels.join(', ')}</li>)}</ul>
          <p><b>{t('Audit trail', 'የኦዲት መዝገብ')}</b></p>
          <ul className="list-disc pl-5">{pack.auditTrail.map((e: any, i: number) => <li key={i}>{date(e.at, lang, true)} · {e.action.replace(/^PAY_LATER_/, '').replace(/_/g, ' ').toLowerCase()}</li>)}</ul>
        </div>
      )}
    </Card>
  );
}
