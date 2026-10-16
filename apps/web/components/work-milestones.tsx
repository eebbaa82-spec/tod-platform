'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { post } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { date, etb, toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { Alert, Button, Card, Checkbox, ErrorText, Field, Input, Modal, Spinner, Textarea, useAction } from './ui';
import { Facts, FileLink, FileUploader, MilestoneStatus } from './work-common';

export function Milestones({ a, reload }: { a: any; reload: () => void }) {
  const { t } = useLang();
  const ms: any[] = a.milestones ?? [];
  if (!ms.length) return null;
  return (
    <Card title={ms.length > 1 ? t('Stages of the work', 'የሥራው ደረጃዎች') : t('The work', 'ሥራው')}>
      <ol className="space-y-4">
        {ms.map((m) => (
          <MilestoneItem key={m.id} m={m} a={a} reload={reload} multi={ms.length > 1} />
        ))}
      </ol>
    </Card>
  );
}

function MilestoneItem({ m, a, reload, multi }: { m: any; a: any; reload: () => void; multi: boolean }) {
  const { t, lang } = useLang();
  const role = a.viewerRole;
  const limit = a.packageVersion?.revisionLimit ?? 2;
  const now = Date.now();
  const funded = ['FUNDED', 'DELIVERED'].includes(a.status);
  const canDeliver = role === 'TALENT' && funded && ['IN_PROGRESS', 'REVISION_REQUESTED'].includes(m.status);
  const canReview = role === 'CLIENT' && m.status === 'DELIVERED';
  const inWindow = m.status === 'DELIVERED' && m.reviewWindowEndsAt && new Date(m.reviewWindowEndsAt).getTime() > now;
  const missed = m.status === 'IN_PROGRESS' && m.deadline && new Date(m.deadline).getTime() < now;
  const openDispute = (a.disputes ?? []).some((d: any) => d.milestoneId === m.id && d.stage !== 'CLOSED');
  const canDispute = !openDispute && (role === 'CLIENT' || role === 'TALENT') && ((inWindow && role === 'CLIENT') || m.status === 'REVISION_REQUESTED' || (role === 'CLIENT' && missed));
  const [modal, setModal] = useState<'accept' | 'revision' | 'dispute' | null>(null);

  const rows: [React.ReactNode, React.ReactNode][] = [
    [t('Amount', 'መጠን'), etb(m.amount)],
    [t('Due', 'የማስረከቢያ ቀን'), date(m.deadline, lang)],
  ];
  if (m.reviewWindowEndsAt) rows.push([t('Review by', 'የግምገማ ቀነ ገደብ'), date(m.reviewWindowEndsAt, lang, true)]);
  rows.push([t('Changes used', 'የተጠቀሙት ማስተካከያ'), `${m.revisionsUsed} / ${limit}`]);

  return (
    <li className="rounded-lg border border-stone-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {multi && <span className="text-stone-500">{m.seq}. </span>}
          {m.title}
        </p>
        <MilestoneStatus status={m.status} />
      </div>
      <Facts rows={rows} />

      {m.status === 'PENDING' && role === 'TALENT' && a.status !== 'AGREED' && <p className="mt-2 text-sm text-stone-600">{t('This stage starts after the previous one is accepted.', 'ይህ ደረጃ የሚጀምረው ቀዳሚው ተቀባይነት ሲያገኝ ነው።')}</p>}
      {missed && <Alert tone="warning">{t('The due date has passed.', 'የማስረከቢያው ቀን አልፏል።')}</Alert>}
      {m.status === 'DELIVERED' && role === 'TALENT' && <p className="mt-2 text-sm text-stone-600">{t('The client is reviewing. If they do nothing by the review date, the work is accepted automatically and you are paid.', 'ደንበኛው እየገመገመ ነው። እስከ ግምገማው ቀን ምንም ካላደረጉ ሥራው በራሱ ተቀባይነት ያገኛል እና ይከፈልዎታል።')}</p>}

      {m.deliveries?.length > 0 && <Deliveries m={m} a={a} />}

      {canDeliver && <DeliverForm m={m} a={a} reload={reload} />}

      {canReview && (
        <div className="mt-3 space-y-2 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <p className="text-sm font-semibold">{t('Please check the work', 'እባክዎ ሥራውን ያረጋግጡ')}</p>
          <p className="text-sm text-stone-700">{t(`If you do nothing by ${date(m.reviewWindowEndsAt, lang)}, the work is accepted automatically and the talent is paid.`, `እስከ ${date(m.reviewWindowEndsAt, lang)} ምንም ካላደረጉ ሥራው በራሱ ተቀባይነት ያገኛል እና ባለሙያው ይከፈላል።`)}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button onClick={() => setModal('accept')} className="w-full sm:w-auto">{t('Accept and pay the talent', 'ተቀበል እና ለባለሙያው ክፈል')}</Button>
            {m.revisionsUsed < limit && <Button tone="secondary" onClick={() => setModal('revision')} className="w-full sm:w-auto">{t('Ask for changes', 'ማስተካከያ ጠይቅ')}</Button>}
          </div>
          {m.revisionsUsed >= limit && <p className="text-xs text-stone-600">{t('All included changes have been used.', 'የተካተቱት ማስተካከያዎች በሙሉ ተጠቅመዋል።')}</p>}
        </div>
      )}

      {canDispute && (
        <div className="mt-2">
          <Button tone="ghost" onClick={() => setModal('dispute')} className="w-full text-red-700 sm:w-auto">{t('Something is wrong: open a dispute', 'ችግር አለ፦ ክርክር ክፈት')}</Button>
        </div>
      )}

      {m.settlement && <SettlementBox s={m.settlement} role={role} />}

      {modal === 'accept' && <AcceptWorkModal m={m} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'revision' && <RevisionModal m={m} limit={limit} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'dispute' && <DisputeModal m={m} onClose={() => setModal(null)} />}
    </li>
  );
}

function Deliveries({ m, a }: { m: any; a: any }) {
  const { t, lang } = useLang();
  const en: string[] = a.packageVersion?.checklistEn ?? [];
  const am: string[] = a.packageVersion?.checklistAm ?? [];
  const label = (item: string) => {
    const i = en.indexOf(item);
    return lang === 'am' && i >= 0 && am[i] ? am[i] : item;
  };
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm font-semibold">{t('Delivered work', 'የቀረበ ሥራ')}</p>
      {m.deliveries.map((d: any, i: number) => (
        <div key={d.id} className={`rounded-md p-3 text-sm ${i === 0 ? 'bg-stone-50' : 'bg-white text-stone-500 ring-1 ring-stone-100'}`}>
          <p className="text-xs text-stone-500">{date(d.submittedAt, lang, true)}{i > 0 ? ` · ${t('earlier version', 'ቀዳሚ ቅጂ')}` : ''}</p>
          <p className="mt-1 whitespace-pre-wrap">{d.note}</p>
          {d.links?.length > 0 && (
            <ul className="mt-1 space-y-1">
              {d.links.map((l: string) => (
                <li key={l}>
                  <a href={l} target="_blank" rel="noopener noreferrer" className="break-all text-brand-700 underline">{l}</a>
                </li>
              ))}
            </ul>
          )}
          {d.fileIds?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-3">
              {d.fileIds.map((f: string, j: number) => <FileLink key={f} id={f} name={t(`File ${j + 1}`, `ፋይል ${j + 1}`)} />)}
            </div>
          )}
          {Array.isArray(d.checklist) && d.checklist.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {d.checklist.map((c: any) => (
                <li key={c.item} className="flex gap-2">
                  <span className={c.done ? 'text-green-700' : 'text-stone-400'}>{c.done ? '✓' : '○'}</span>
                  <span>{label(c.item)}</span>
                </li>
              ))}
            </ul>
          )}
          {d.revisionRequest && (
            <p className="mt-2 rounded bg-amber-50 p-2 text-amber-900">
              {t('Changes asked', 'የተጠየቀ ማስተካከያ')}: {d.revisionRequest}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function DeliverForm({ m, a, reload }: { m: any; a: any; reload: () => void }) {
  const { t, lang } = useLang();
  const en: string[] = a.packageVersion?.checklistEn ?? [];
  const am: string[] = a.packageVersion?.checklistAm ?? [];
  const [note, setNote] = useState('');
  const [links, setLinks] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [ticks, setTicks] = useState<boolean[]>(en.map(() => false));
  const { busy, error, run } = useAction();
  const lastRequest = m.deliveries?.[0]?.revisionRequest;

  const submit = () =>
    run(async () => {
      await post(`/assignments/milestones/${m.id}/deliver`, {
        note: note.trim(),
        links: links.split(/\s+/).map((l) => l.trim()).filter(Boolean),
        fileIds: files.map((f) => f.id),
        checklist: en.map((item, i) => ({ item, done: ticks[i] })),
      });
      setNote('');
      setLinks('');
      setFiles([]);
      reload();
    });

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
      <p className="font-semibold">{m.status === 'REVISION_REQUESTED' ? t('Send the corrected work', 'የተስተካከለውን ሥራ ይላኩ') : t('Deliver your work', 'ሥራዎን ያስረክቡ')}</p>
      {m.status === 'REVISION_REQUESTED' && lastRequest && <Alert tone="warning">{t('The client asked', 'ደንበኛው የጠየቁት')}: {lastRequest}</Alert>}
      <Field label={t('Note to the client', 'ለደንበኛው ማስታወሻ')} hint={t('Say what you did and how to use it.', 'ምን እንደሠሩ እና እንዴት እንደሚጠቀሙበት ይግለጹ።')}>
        <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
      </Field>
      <Field label={t('Links (optional, one per line)', 'ሊንኮች (አማራጭ፣ በየመስመሩ አንድ)')}>
        <Textarea rows={2} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://" />
      </Field>
      <FileUploader purpose="DELIVERY" files={files} onChange={setFiles} label={t('Attach files', 'ፋይሎችን አያይዝ')} />
      {en.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">{t('Check each item you completed', 'ያጠናቀቁትን እያንዳንዱን ነገር ምልክት ያድርጉ')}</legend>
          {en.map((item, i) => (
            <Checkbox key={item} label={lang === 'am' && am[i] ? am[i] : item} checked={ticks[i]} onChange={(e) => setTicks(ticks.map((x, j) => (j === i ? e.target.checked : x)))} />
          ))}
          {ticks.some((x) => !x) && <p className="text-xs text-stone-500">{t('You can still send if an item is not done, but say why in your note.', 'አንድ ነገር ባይጠናቀቅም መላክ ይችላሉ፣ ግን ምክንያቱን በማስታወሻዎ ይግለጹ።')}</p>}
        </fieldset>
      )}
      <ErrorText error={error} />
      <Button onClick={submit} busy={busy} disabled={note.trim().length < 3} className="w-full sm:w-auto">
        {t('Send to the client', 'ለደንበኛው ላክ')}
      </Button>
    </div>
  );
}

function AcceptWorkModal({ m, onClose, onDone }: { m: any; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={t('Accept the work', 'ሥራውን ተቀበል')}>
      <div className="space-y-3 text-sm">
        <p>{t(`When you accept, the partner bank pays ${etb(m.amount)} to the talent. This cannot be undone.`, `ሲቀበሉ አጋር ባንኩ ${etb(m.amount)} ለባለሙያው ይከፍላል። ይህ ሊቀለበስ አይችልም።`)}</p>
        <Field label={t('Enter your password or PIN to sign off', 'ለማጽደቅ የይለፍ ቃልዎን ወይም ፒንዎን ያስገቡ')}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <Button onClick={() => run(async () => { await post(`/assignments/milestones/${m.id}/accept`, { password }); onDone(); })} busy={busy} disabled={!password} className="w-full">
          {t('Accept and release payment', 'ተቀበል እና ክፍያውን ልቀቅ')}
        </Button>
      </div>
    </Modal>
  );
}

function RevisionModal({ m, limit, onClose, onDone }: { m: any; limit: number; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const left = limit - m.revisionsUsed;
  return (
    <Modal open onClose={onClose} title={t('Ask for changes', 'ማስተካከያ ጠይቅ')}>
      <div className="space-y-3 text-sm">
        <p>{t(`You have ${left} change request(s) left for this package.`, `ለዚህ ጥቅል ${left} የማስተካከያ ጥያቄ ቀርቶዎታል።`)}</p>
        <Field label={t('What needs to change?', 'ምን መለወጥ አለበት?')} hint={t('Be specific and stay within what the package includes.', 'በግልጽ ይግለጹ፣ በጥቅሉ ውስጥ ያለውን ብቻ ይጠይቁ።')}>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        </Field>
        <ErrorText error={error} />
        <Button onClick={() => run(async () => { await post(`/assignments/milestones/${m.id}/revision`, { reason: reason.trim() }); onDone(); })} busy={busy} disabled={reason.trim().length < 3} className="w-full">
          {t('Send change request', 'የማስተካከያ ጥያቄ ላክ')}
        </Button>
      </div>
    </Modal>
  );
}

function DisputeModal({ m, onClose }: { m: any; onClose: () => void }) {
  const { t } = useLang();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const { busy, error, run } = useAction();
  const s = amount ? toSantim(amount) : undefined;
  return (
    <Modal open onClose={onClose} title={t('Open a dispute', 'ክርክር ክፈት')}>
      <div className="space-y-3 text-sm">
        <p>{t('A ToD mediator will look at the package, the delivered work and your messages here. The money stays safely with the bank until the case is decided.', 'የToD አስታራቂ ጥቅሉን፣ የቀረበውን ሥራ እና እዚህ ያሉ መልእክቶችዎን ይመለከታል። ጉዳዩ እስኪወሰን ገንዘቡ በባንኩ በጥንቃቄ ይቆያል።')}</p>
        <Field label={t('What is the problem?', 'ችግሩ ምንድን ነው?')} hint={t('At least 10 letters.', 'ቢያንስ 10 ፊደላት።')}>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={3000} />
        </Field>
        <Field label={t(`Amount in dispute, in birr (optional, up to ${etb(m.amount)})`, `የሚከራከሩበት መጠን በብር (አማራጭ፣ እስከ ${etb(m.amount)})`)}>
          <Input type="number" min={1} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <Button
          tone="danger"
          onClick={() => run(async () => { const d = await post<{ id: string }>('/disputes', { milestoneId: m.id, reason: reason.trim(), amountDisputed: s && s > 0 ? Math.min(s, m.amount) : undefined }); router.push(`/disputes/${d.id}`); })}
          busy={busy}
          disabled={reason.trim().length < 10}
          className="w-full"
        >
          {t('Open dispute', 'ክርክር ክፈት')}
        </Button>
      </div>
    </Modal>
  );
}

function SettlementBox({ s, role }: { s: any; role: string }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const kind = s.kind === 'REFUND' ? t('Refund to client', 'ለደንበኛ ተመላሽ') : s.kind === 'SPLIT' ? t('Split between talent and client', 'በባለሙያ እና በደንበኛ መካከል የተከፈለ') : t('Payment to talent', 'ለባለሙያ ክፍያ');
  const rows: [React.ReactNode, React.ReactNode][] = [[t('Type', 'ዓይነት'), kind]];
  if (s.gross > 0) {
    rows.push([t('Amount for the work', 'ለሥራው የተከፈለ'), etb(s.gross)]);
    rows.push([t(`ToD commission (${Math.round(Number(s.commissionRate) * 1000) / 10}%)`, `የToD ኮሚሽን (${Math.round(Number(s.commissionRate) * 1000) / 10}%)`), etb(s.commission)]);
    rows.push([t('Talent receives', 'ባለሙያው የሚቀበለው'), <span key="n" className="font-bold">{etb(s.net)}</span>]);
  }
  if (s.refundAmount > 0) rows.push([t('Returned to client', 'ለደንበኛው የተመለሰ'), etb(s.refundAmount)]);
  rows.push([t('Status', 'ሁኔታ'), s.status === 'PAID' ? t(`Paid on ${date(s.paidAt, lang)}`, `${date(s.paidAt, lang)} ተከፍሏል`) : t('Sent to the bank, waiting for confirmation', 'ለባንኩ ተልኳል፣ ማረጋገጫ በመጠበቅ ላይ')]);
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-green-50 p-3">
      <p className="text-sm font-semibold text-green-900">{t('Payment', 'ክፍያ')}</p>
      <Facts rows={rows} />
      {role !== 'STAFF' && (
        <Button tone="secondary" onClick={() => setOpen(true)} className="w-full sm:w-auto">
          {t('View receipt', 'ደረሰኝ ይመልከቱ')}
        </Button>
      )}
      {open && <ReceiptModal refNo={s.instructionRef} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ReceiptModal({ refNo, onClose }: { refNo: string; onClose: () => void }) {
  const { t, lang } = useLang();
  const { data: r, error } = useApi<any>(`/payments/receipts/${encodeURIComponent(refNo)}`);
  return (
    <Modal open onClose={onClose} title={t('Receipt', 'ደረሰኝ')}>
      {error ? (
        <ErrorText error={error} />
      ) : !r ? (
        <Spinner />
      ) : (
        <div className="space-y-3 text-sm">
          <Facts
            rows={[
              [t('Receipt number', 'የደረሰኝ ቁጥር'), r.receiptNo],
              [t('Date', 'ቀን'), date(r.issuedAt, lang)],
              [t('Assignment', 'ሥራ'), `${r.assignment.ref} · ${r.assignment.title}`],
              [t('Stage', 'ደረጃ'), `${r.milestone.seq}. ${r.milestone.title}`],
              [t('Client', 'ደንበኛ'), `${r.client.name}${r.client.tin ? ` (TIN ${r.client.tin})` : ''}`],
              [t('Talent', 'ባለሙያ'), r.talent.name],
              [t('Amount for the work', 'ለሥራው የተከፈለ'), etb(r.gross)],
              [t(`ToD commission (${Math.round(r.commissionRate * 1000) / 10}%)`, `የToD ኮሚሽን (${Math.round(r.commissionRate * 1000) / 10}%)`), etb(r.commission)],
              [t('Paid to talent', 'ለባለሙያው የተከፈለ'), etb(r.net)],
              ...(r.refund > 0 ? ([[t('Refunded to client', 'ለደንበኛው የተመለሰ'), etb(r.refund)]] as [React.ReactNode, React.ReactNode][]) : []),
              [t('Status', 'ሁኔታ'), r.status === 'PAID' ? t('Paid', 'ተከፍሏል') : t('Waiting for the bank', 'ባንኩን በመጠበቅ ላይ')],
            ]}
          />
          <p className="text-xs text-stone-500">{t('Client money is held by the partner bank in escrow. The ToD commission is taken from the talent payment.', 'የደንበኛ ገንዘብ በአጋር ባንኩ ይያዛል። የToD ኮሚሽን ከባለሙያው ክፍያ ይቀነሳል።')}</p>
          <Button tone="secondary" onClick={() => window.print()} className="w-full">{t('Print', 'አትም')}</Button>
        </div>
      )}
    </Modal>
  );
}
