'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { JsonBlock, KV, Notice, shortId, useAgents } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, Checkbox, ErrorText, Field, Input, PageTitle, Select, Spinner, Textarea, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date, etb, humanise, toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

// Mirrors REMEDIES in apps/api/src/disputes/disputes.service.ts.
const REMEDIES = ['CORRECTION', 'PARTIAL_ACCEPTANCE', 'MILESTONE_ADJUSTMENT', 'REFUND', 'REASSIGNMENT', 'RELEASE_IN_FULL'] as const;
type Remedy = (typeof REMEDIES)[number];
const SPLIT_REMEDIES: Remedy[] = ['PARTIAL_ACCEPTANCE', 'MILESTONE_ADJUSTMENT'];
// Staff who may add case notes (the service's staff check, without auditors who only read).
const NOTE_ROLES = ['SUPPORT_AGENT', 'PLATFORM_ADMIN', 'SUPER_ADMIN', 'FINANCE_OFFICER'];

export default function DisputePage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.disputes]}>
      <Dispute />
    </RequireAuth>
  );
}

function Dispute() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const { has, me } = useSession();
  const { data: d, error, loading, reload, setData } = useApi<any>(`/disputes/${id}`);
  const { agents, name } = useAgents();
  const [ok, setOk] = useState<string | null>(null);
  const stageAct = useAction();
  const manage = has(...CONSOLE_ROLES.disputesManage);

  if (loading && !d) return <Spinner />;
  if (error && !d) return <ErrorText error={error} />;
  if (!d) return null;

  const ev = d.evidence ?? {};
  const amount: number = ev.milestone?.amount ?? d.amountDisputed;
  const a = d.assignment;
  const who = (uid: string) => (uid === a.clientId ? t('Client', 'ደንበኛ') : uid === a.talentId ? t('Talent', 'ተሰጥኦ') : name(uid));
  const closed = d.stage === 'CLOSED';
  const canUsers = has(...CONSOLE_ROLES.users);
  const userLink = (uid: string | null, label: string) => (uid && canUsers ? <Link className="text-brand-700 hover:underline" href={`/console/users/${uid}`}>{label}</Link> : label);

  const advance = async (stage: 'FACILITATION' | 'DECISION') => {
    const r = await stageAct.run(() => post(`/disputes/${id}/stage`, { stage }));
    if (r) {
      setData(r);
      setOk(t(`Moved to ${humanise(stage)}.`, `ወደ ${humanise(stage)} ተዛውሯል።`));
    }
  };

  return (
    <>
      <PageTitle
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <Link className="text-brand-700 hover:underline" href={`/assignments/${a.id}`}>
              {a.ref}: {a.title}
            </Link>
            <Badge tone={closed ? 'gray' : 'amber'}>{humanise(d.stage)}</Badge>
            {d.decisionStatus && <Badge tone={d.decisionStatus === 'REJECTED' ? 'red' : 'blue'}>{humanise(d.decisionStatus)}</Badge>}
            {d.finalDecision && <Badge tone="gray">{t('final', 'የመጨረሻ')}</Badge>}
          </span>
        }
      >
        {t(`Dispute ${d.ref}`, `ክርክር ${d.ref}`)}
      </PageTitle>
      <div className="space-y-4">
        <Notice ok={ok} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('Case', 'ጉዳይ')}>
            <KV
              items={[
                [t('Opened by', 'የከፈተው'), `${humanise(d.openedByRole)} · ${date(d.createdAt, lang, true)}`],
                [t('Reason', 'ምክንያት'), <span key="r" className="whitespace-pre-wrap">{d.reason}</span>],
                [t('Amount disputed', 'የተከራከረበት መጠን'), etb(d.amountDisputed)],
                [t('Milestone amount', 'የደረጃ መጠን'), etb(amount)],
                [t('Parties', 'ወገኖች'), <span key="p">{userLink(a.clientId, t('Client', 'ደንበኛ'))} · {userLink(a.talentId, t('Talent', 'ተሰጥኦ'))}</span>],
                [t('Owner', 'ባለቤት'), name(d.ownerId)],
                [t('Intake by', 'መቀበያ እስከ'), date(d.limits.intakeBy, lang)],
                [t('Facilitation by', 'ማመቻቸት እስከ'), date(d.limits.facilitationBy, lang)],
                [t('Decision by', 'ውሳኔ እስከ'), date(d.limits.decisionBy, lang)],
                ...(d.appealedAt ? ([[t('Appeal', 'ይግባኝ'), `${date(d.appealedAt, lang)} · ${who(d.appealedById)}: ${d.appealReason}`]] as [string, React.ReactNode][]) : []),
              ]}
            />
            {manage && !closed && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-200 pt-3">
                {d.stage === 'INTAKE' && (
                  <Button tone="secondary" busy={stageAct.busy} onClick={() => advance('FACILITATION')}>
                    {t('Move to facilitation', 'ወደ ማመቻቸት')}
                  </Button>
                )}
                {(d.stage === 'INTAKE' || d.stage === 'FACILITATION') && (
                  <Button tone="secondary" busy={stageAct.busy} onClick={() => advance('DECISION')}>
                    {t('Move to decision', 'ወደ ውሳኔ')}
                  </Button>
                )}
                <Reassign id={id} current={d.ownerId} agents={agents} onDone={(r) => { setData(r); setOk(t('Case reassigned.', 'ጉዳዩ ተዛውሯል።')); }} />
              </div>
            )}
            <div className="mt-2">
              <ErrorText error={stageAct.error} />
            </div>
          </Card>

          <Card title={t('Decision', 'ውሳኔ')}>
            {d.remedy ? (
              <KV
                items={[
                  [t('Remedy', 'መፍትሄ'), humanise(d.remedy)],
                  [t('To the talent', 'ለተሰጥኦው'), etb(d.releaseAmount)],
                  [t('Back to the client', 'ለደንበኛው ተመላሽ'), etb(d.refundAmount)],
                  [t('Account action', 'የመለያ እርምጃ'), d.accountAction],
                  [t('Note', 'ማስታወሻ'), <span key="n" className="whitespace-pre-wrap">{d.decisionNote}</span>],
                  [t('Proposed by', 'ያቀረበው'), `${name(d.decidedById)} · ${date(d.decidedAt, lang, true)}`],
                  [t('Approval', 'ማጽደቅ'), d.approval ? `${humanise(d.approval.status)}${d.approval.decidedById ? ` · ${name(d.approval.decidedById)}` : ''}${d.approval.note ? `: ${d.approval.note}` : ''}` : '—'],
                  [t('Appeal window ends', 'የይግባኝ ጊዜ ያበቃል'), d.appealBy ? date(d.appealBy, lang) : null],
                  [t('Accepted by client', 'ደንበኛው ተቀብሏል'), d.clientAcceptedAt ? date(d.clientAcceptedAt, lang) : t('No', 'አይ')],
                  [t('Accepted by talent', 'ተሰጥኦው ተቀብሏል'), d.talentAcceptedAt ? date(d.talentAcceptedAt, lang) : t('No', 'አይ')],
                ]}
              />
            ) : (
              <p className="text-sm text-stone-500">{t('No decision proposed yet.', 'ገና ውሳኔ አልቀረበም።')}</p>
            )}
            {manage && !closed && d.decisionStatus !== 'PENDING_APPROVAL' && d.decisionStatus !== 'APPROVED' && d.decisionStatus !== 'EXECUTED' && (
              <DecisionForm id={id} amount={amount} blockedForMe={d.stage === 'APPEAL' && d.decidedById === me?.id} onDone={(r) => { setData(r); setOk(t('Decision proposed. A finance officer or super administrator must approve it before money moves.', 'ውሳኔ ቀርቧል። ገንዘብ ከመንቀሳቀሱ በፊት ሌላ ሰው ማጽደቅ አለበት።')); }} />
            )}
            {d.decisionStatus === 'PENDING_APPROVAL' && <Alert tone="info">{t('Waiting for a second person to approve on the Approvals page.', 'በማጽደቂያ ገጹ ሁለተኛ ሰው እንዲያጸድቅ በመጠባበቅ ላይ።')}</Alert>}
          </Card>
        </div>

        <Evidence ev={ev} who={who} />

        <Card title={t('Notes', 'ማስታወሻዎች')}>
          <ul className="space-y-2">
            {d.notes.map((n: any) => (
              <li key={n.id} className={`rounded-lg border p-3 text-sm ${n.internal ? 'border-amber-300 bg-amber-50' : 'border-stone-200'}`}>
                <p className="mb-1 text-xs text-stone-500">
                  {n.authorName ?? (n.authorRole === 'STAFF' ? name(n.authorId) : shortId(n.authorId))} · {humanise(n.authorRole)} · {date(n.at, lang, true)} {n.internal && <Badge tone="amber">{t('internal: staff only', 'ውስጣዊ፦ ለሠራተኞች ብቻ')}</Badge>}
                </p>
                <p className="whitespace-pre-wrap">{n.body}</p>
                {n.fileIds?.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-2 text-xs">
                    {n.fileIds.map((f: string) => (
                      <a key={f} className="text-brand-700 underline" href={`/api/files/${f}`}>
                        {n.files?.find((x: any) => x.id === f)?.name ?? `${t('File', 'ፋይል')} ${shortId(f)}`}
                      </a>
                    ))}
                  </p>
                )}
              </li>
            ))}
            {!d.notes.length && <li className="text-sm text-stone-500">{t('No notes yet.', 'ገና ማስታወሻ የለም።')}</li>}
          </ul>
          {!closed && has(...NOTE_ROLES) && <NoteForm id={id} onDone={() => reload()} />}
        </Card>
      </div>
    </>
  );
}

function Reassign({ id, current, agents, onDone }: { id: string; current: string | null; agents: { id: string; displayName: string }[]; onDone: (r: any) => void }) {
  const { t } = useLang();
  const [owner, setOwner] = useState(current ?? '');
  const a = useAction();
  useEffect(() => setOwner(current ?? ''), [current]);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await a.run(() => post(`/disputes/${id}/reassign`, { ownerId: owner }));
        if (r) onDone(r);
      }}
    >
      <Select aria-label={t('Owner', 'ባለቤት')} className="!w-56" value={owner} onChange={(e) => setOwner(e.target.value)} options={[{ value: '', label: t('Choose support agent…', 'የድጋፍ ወኪል ይምረጡ…') }, ...agents.map((x) => ({ value: x.id, label: x.displayName }))]} />
      <Button type="submit" tone="secondary" busy={a.busy} disabled={!owner || owner === current}>
        {t('Reassign', 'አዛውር')}
      </Button>
      <ErrorText error={a.error} />
    </form>
  );
}

function DecisionForm({ id, amount, blockedForMe, onDone }: { id: string; amount: number; blockedForMe: boolean; onDone: (r: any) => void }) {
  const { t } = useLang();
  const [remedy, setRemedy] = useState<Remedy>('PARTIAL_ACCEPTANCE');
  const [release, setRelease] = useState('');
  const [refund, setRefund] = useState('');
  const [accountAction, setAccountAction] = useState('');
  const [note, setNote] = useState('');
  const a = useAction();

  const fixed: Partial<Record<Remedy, [number, number]>> = { RELEASE_IN_FULL: [amount, 0], REFUND: [0, amount], REASSIGNMENT: [0, amount], CORRECTION: [0, 0] };
  const split = SPLIT_REMEDIES.includes(remedy);
  const rel = split ? toSantim(release || 0) : fixed[remedy]![0];
  const ref = split ? toSantim(refund || 0) : fixed[remedy]![1];
  const sumOk = remedy === 'CORRECTION' || rel + ref === amount;

  const help: Record<Remedy, string> = {
    CORRECTION: t('The talent corrects the work. The money stays in escrow for normal acceptance.', 'ተሰጥኦው ሥራውን ያስተካክላል። ገንዘቡ በዕግድ ይቆያል።'),
    PARTIAL_ACCEPTANCE: t('Part of the work is accepted; split the milestone between talent and client.', 'የሥራው ክፍል ተቀባይነት አለው፤ መጠኑን ይከፋፍሉ።'),
    MILESTONE_ADJUSTMENT: t('The milestone value is adjusted; split it between talent and client.', 'የደረጃው ዋጋ ይስተካከላል፤ ይከፋፍሉ።'),
    REFUND: t('The full milestone goes back to the client.', 'ሙሉ መጠኑ ለደንበኛው ይመለሳል።'),
    REASSIGNMENT: t('The client is refunded in full so the work can go to another talent.', 'ደንበኛው ሙሉ ተመላሽ ያገኛል፤ ሥራው ለሌላ ይሰጣል።'),
    RELEASE_IN_FULL: t('The full milestone is released to the talent.', 'ሙሉ መጠኑ ለተሰጥኦው ይለቀቃል።'),
  };

  return (
    <form
      className="mt-4 space-y-3 border-t border-stone-200 pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = { remedy, releaseAmount: rel, refundAmount: ref, note, ...(accountAction.trim() ? { accountAction: accountAction.trim() } : {}) };
        const r = await a.run(() => post(`/disputes/${id}/decision`, body));
        if (r) onDone(r);
      }}
    >
      <p className="font-semibold">{t('Propose a decision', 'ውሳኔ አቅርብ')}</p>
      {blockedForMe && <Alert tone="warning">{t('You made the original decision. An appeal must be decided by someone else.', 'የመጀመሪያውን ውሳኔ የሰጡት እርስዎ ነዎት። ይግባኙን ሌላ ሰው መወሰን አለበት።')}</Alert>}
      <Field label={t('Remedy', 'መፍትሄ')} hint={help[remedy]}>
        <Select value={remedy} onChange={(e) => setRemedy(e.target.value as Remedy)} options={REMEDIES.map((r) => ({ value: r, label: humanise(r) }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('To the talent (birr)', 'ለተሰጥኦው (ብር)')}>
          <Input type="number" min={0} step="0.01" disabled={!split} value={split ? release : String(rel / 100)} onChange={(e) => setRelease(e.target.value)} required={split} />
        </Field>
        <Field label={t('Back to the client (birr)', 'ለደንበኛው (ብር)')}>
          <Input type="number" min={0} step="0.01" disabled={!split} value={split ? refund : String(ref / 100)} onChange={(e) => setRefund(e.target.value)} required={split} />
        </Field>
      </div>
      <p className={`text-xs ${sumOk ? 'text-stone-500' : 'font-semibold text-red-700'}`}>
        {remedy === 'CORRECTION'
          ? t('No money moves with a correction.', 'በማስተካከያ ገንዘብ አይንቀሳቀስም።')
          : t(`The two amounts must add up to the milestone amount, ${etb(amount)}. Now: ${etb(rel + ref)}.`, `ሁለቱ መጠኖች ${etb(amount)} መሆን አለባቸው። አሁን፦ ${etb(rel + ref)}።`)}
        {split && (
          <button type="button" className="ml-2 text-brand-700 underline" onClick={() => setRefund(String((amount - toSantim(release || 0)) / 100))}>
            {t('Fill the client share', 'የደንበኛውን ድርሻ ሙላ')}
          </button>
        )}
      </p>
      <Field label={t('Account action (optional)', 'የመለያ እርምጃ (አማራጭ)')} hint={t('For example: warning to talent, reduced visibility for 30 days.', 'ለምሳሌ፦ ማስጠንቀቂያ።')}>
        <Input value={accountAction} maxLength={300} onChange={(e) => setAccountAction(e.target.value)} />
      </Field>
      <Field label={t('Reasoning (shared with both parties)', 'ምክንያት (ለሁለቱም ወገኖች ይታያል)')}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} required minLength={5} maxLength={4000} />
      </Field>
      <ErrorText error={a.error} />
      <Button type="submit" busy={a.busy} disabled={!sumOk || blockedForMe || note.trim().length < 5}>
        {t('Send for approval', 'ለማጽደቅ ላክ')}
      </Button>
    </form>
  );
}

function NoteForm({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useLang();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(true);
  const a = useAction();
  return (
    <form
      className="mt-4 space-y-2 border-t border-stone-200 pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await a.run(() => post(`/disputes/${id}/notes`, { body, internal }));
        if (r) {
          setBody('');
          onDone();
        }
      }}
    >
      <Field label={t('Add a note', 'ማስታወሻ ጨምር')}>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={4000} />
      </Field>
      <Checkbox label={t('Internal note: only staff can see it', 'ውስጣዊ ማስታወሻ፦ ሠራተኞች ብቻ ያዩታል')} checked={internal} onChange={(e) => setInternal(e.target.checked)} />
      {!internal && <p className="text-xs text-amber-800">{t('Both parties will see this note.', 'ሁለቱም ወገኖች ይህን ያያሉ።')}</p>}
      <ErrorText error={a.error} />
      <Button type="submit" tone="secondary" busy={a.busy} disabled={!body.trim()}>
        {t('Add note', 'ጨምር')}
      </Button>
    </form>
  );
}

function Evidence({ ev, who }: { ev: any; who: (id: string) => string }) {
  const { t, lang } = useLang();
  const fileName = (fid: string) => ev.files?.find((f: any) => f.id === fid)?.name ?? shortId(fid);
  const fileLinks = (ids: string[] = []) =>
    ids.length ? (
      <span className="flex flex-wrap gap-2">
        {ids.map((f) => (
          <a key={f} className="text-brand-700 underline" href={`/api/files/${f}`}>
            {fileName(f)}
          </a>
        ))}
      </span>
    ) : null;
  return (
    <Card title={t(`Evidence locked ${date(ev.lockedAt, lang, true)}`, `ማስረጃ የተቆለፈው ${date(ev.lockedAt, lang, true)}`)}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">{t('Agreed scope', 'የተስማሙበት ወሰን')}</p>
          {ev.package?.custom ? (
            <p className="whitespace-pre-wrap text-sm">{ev.package.brief}</p>
          ) : ev.package ? (
            <KV
              items={[
                [t('Package version', 'የጥቅል እትም'), ev.package.version],
                [t('Scope', 'ወሰን'), ev.package.scope],
                [t('Exclusions', 'የማይካተቱ'), ev.package.exclusions],
                [t('Deliverable', 'የሚቀርበው'), ev.package.deliverable],
                [t('Checklist', 'ማረጋገጫ ዝርዝር'), <ul key="c" className="list-disc pl-4">{(ev.package.checklist ?? []).map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>],
                [t('Revision limit', 'የክለሳ ገደብ'), ev.package.revisionLimit],
              ]}
            />
          ) : null}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">{t('Milestone', 'ደረጃ')}</p>
          {ev.milestone && (
            <KV
              items={[
                [t('Milestone', 'ደረጃ'), `${ev.milestone.seq}. ${ev.milestone.title}`],
                [t('Amount', 'መጠን'), etb(ev.milestone.amount)],
                [t('Deadline', 'የመጨረሻ ቀን'), date(ev.milestone.deadline, lang)],
                [t('Delivered', 'የደረሰው'), date(ev.milestone.deliveredAt, lang, true)],
                [t('Revisions used', 'የተጠቀመው ክለሳ'), ev.milestone.revisionsUsed],
              ]}
            />
          )}
        </div>
      </div>
      <p className="mb-2 mt-4 text-sm font-medium">{t('Deliveries', 'ማስረከቢያዎች')}</p>
      <ul className="space-y-2">
        {(ev.deliveries ?? []).map((x: any) => (
          <li key={x.id} className="rounded-lg border border-stone-200 p-3 text-sm">
            <p className="text-xs text-stone-500">{date(x.submittedAt, lang, true)}</p>
            <p className="whitespace-pre-wrap">{x.note}</p>
            {x.links?.length > 0 && (
              <p className="mt-1 break-all text-xs">
                {x.links.map((l: string) => (
                  <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="mr-2 text-brand-700 underline">
                    {l}
                  </a>
                ))}
              </p>
            )}
            {fileLinks(x.fileIds)}
            {Array.isArray(x.checklist) && (
              <ul className="mt-1 text-xs">
                {x.checklist.map((c: any, i: number) => (
                  <li key={i}>{c.done ? '✓' : '✗'} {c.item}</li>
                ))}
              </ul>
            )}
            {x.revisionRequest && <p className="mt-1 text-xs text-amber-800">{t('Revision requested', 'ክለሳ ተጠይቋል')}: {x.revisionRequest}</p>}
          </li>
        ))}
        {!ev.deliveries?.length && <li className="text-sm text-stone-500">{t('Nothing delivered.', 'ምንም አልደረሰም።')}</li>}
      </ul>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">{t(`Messages at the time of opening (${ev.messages?.length ?? 0})`, `በተከፈተበት ጊዜ የነበሩ መልእክቶች (${ev.messages?.length ?? 0})`)}</summary>
        <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto">
          {(ev.messages ?? []).map((m: any) => (
            <li key={m.id} className="rounded bg-stone-50 px-2 py-1 text-sm">
              <span className="text-xs text-stone-500">{who(m.senderId)} · {date(m.at, lang, true)}</span>
              <p className="whitespace-pre-wrap">{m.body}</p>
              {fileLinks(m.fileIds)}
            </li>
          ))}
        </ul>
      </details>
      {ev.files?.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium">{t('File fingerprints', 'የፋይል አሻራዎች')}</summary>
          <JsonBlock value={ev.files} />
        </details>
      )}
    </Card>
  );
}
