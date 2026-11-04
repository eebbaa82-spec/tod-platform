'use client';
import Link from 'next/link';
import { useState } from 'react';
import { JsonBlock, KV, Notice, shortId } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Button, Card, Empty, ErrorText, Field, Input, PageTitle, Spinner, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date, etb, humanise } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

export default function ApprovalsPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.approvals]}>
      <Approvals />
    </RequireAuth>
  );
}

function Approvals() {
  const { t, lang } = useLang();
  const { data, error, loading, reload } = useApi<{ parameterChanges: any[]; disputeDecisions: any[] }>('/admin/approvals');
  const [ok, setOk] = useState<string | null>(null);
  const done = (m: string) => {
    setOk(m);
    reload();
  };

  return (
    <>
      <PageTitle sub={t('Money moves and financial parameters change only after a second person approves.', 'ገንዘብ የሚንቀሳቀሰው ሁለተኛ ሰው ሲያጸድቅ ብቻ ነው።')}>{t('Approvals', 'ማጽደቂያዎች')}</PageTitle>
      <div className="space-y-4">
        <Alert tone="info">{t('The approver must be a different person from the one who made the request. You cannot approve your own requests; they wait for a colleague.', 'አጽዳቂው ጠያቂው ሰው መሆን የለበትም። የራስዎን ጥያቄ ማጽደቅ አይችሉም።')}</Alert>
        <Notice ok={ok} />
        <ErrorText error={error} />
        {loading && !data && <Spinner />}
        {data && (
          <>
            <Card title={t(`Dispute decisions (${data.disputeDecisions.length})`, `የክርክር ውሳኔዎች (${data.disputeDecisions.length})`)}>
              {data.disputeDecisions.length ? (
                <ul className="space-y-3">
                  {data.disputeDecisions.map((ap) => (
                    <li key={ap.id} className="rounded-lg border border-stone-200 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <Link className="font-semibold text-brand-700 hover:underline" href={`/console/disputes/${ap.subjectId}`}>
                          {ap.dispute?.ref ?? shortId(ap.subjectId)} · {ap.dispute?.assignment?.ref} {ap.dispute?.assignment?.title}
                        </Link>
                        {ap.payload?.appeal && <span className="text-xs font-semibold text-amber-800">{t('Appeal: final once approved, takes effect at once', 'ይግባኝ፦ ሲጸድቅ የመጨረሻ ነው')}</span>}
                      </div>
                      <KV
                        items={[
                          [t('Remedy', 'መፍትሄ'), humanise(ap.payload?.remedy)],
                          [t('To the talent', 'ለተሰጥኦው'), etb(ap.payload?.releaseAmount)],
                          [t('Back to the client', 'ለደንበኛው'), etb(ap.payload?.refundAmount)],
                          [t('Amount disputed', 'የተከራከረበት'), etb(ap.dispute?.amountDisputed)],
                          [t('Account action', 'የመለያ እርምጃ'), ap.payload?.accountAction],
                          [t('Reasoning', 'ምክንያት'), <span key="n" className="whitespace-pre-wrap">{ap.payload?.note}</span>],
                          [t('Requested', 'የተጠየቀበት'), date(ap.requestedAt, lang, true)],
                        ]}
                      />
                      <Decide requestedById={ap.requestedById} requestedByName={ap.requestedByName} path={`/disputes/approvals/${ap.id}`} onDone={(r: any) => done(r?.status === 'REJECTED' ? t('Decision sent back to the mediator.', 'ውሳኔው ተመልሷል።') : t('Decision approved. Both parties have been told.', 'ውሳኔው ጸድቋል።'))} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{t('No dispute decisions waiting.', 'የሚጠብቅ ውሳኔ የለም።')}</Empty>
              )}
            </Card>
            <Card title={t(`Parameter changes (${data.parameterChanges.length})`, `የመለኪያ ለውጦች (${data.parameterChanges.length})`)}>
              {data.parameterChanges.length ? (
                <ul className="space-y-3">
                  {data.parameterChanges.map((c) => (
                    <li key={c.id} className="rounded-lg border border-stone-200 p-3">
                      <p className="mb-2 font-mono text-sm font-semibold">{c.key}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-stone-500">{t('Current value', 'የአሁኑ ዋጋ')}</p>
                          <JsonBlock value={c.oldValue} />
                        </div>
                        <div>
                          <p className="text-xs text-stone-500">{t('Proposed value', 'የቀረበው ዋጋ')}</p>
                          <JsonBlock value={c.newValue} />
                        </div>
                      </div>
                      <p className="mt-2 text-sm">
                        <span className="text-stone-500">{t('Reason', 'ምክንያት')}:</span> {c.reason}
                      </p>
                      <p className="text-xs text-stone-500">{date(c.requestedAt, lang, true)}</p>
                      <Decide requestedById={c.requestedById} requestedByName={c.requestedByName} path={`/admin/parameter-changes/${c.id}`} onDone={(r: any) => done(r?.status === 'REJECTED' ? t('Change rejected.', 'ለውጡ ውድቅ ሆኗል።') : t(`Change applied to ${c.key}.`, `ለውጡ በ${c.key} ተተግብሯል።`))} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{t('No parameter changes waiting.', 'የሚጠብቅ የመለኪያ ለውጥ የለም።')}</Empty>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function Decide({ requestedById, requestedByName, path, onDone }: { requestedById: string; requestedByName?: string | null; path: string; onDone: (r: unknown) => void }) {
  const { t } = useLang();
  const { me } = useSession();
  const [note, setNote] = useState('');
  const a = useAction();
  const mine = me?.id === requestedById;
  const go = async (approve: boolean) => {
    const r = await a.run(() => post(path, { approve, ...(note.trim() ? { note: note.trim() } : {}) }));
    if (r) onDone(r);
  };
  return (
    <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">
      <p className="text-xs text-stone-500">{mine ? t('You requested this. Another approver must decide it.', 'ይህን የጠየቁት እርስዎ ነዎት። ሌላ አጽዳቂ መወሰን አለበት።') : t(`Requested by ${requestedByName ?? shortId(requestedById)}`, `የጠየቀው ${requestedByName ?? shortId(requestedById)}`)}</p>
      {!mine && (
        <>
          <Field label={t('Note (optional; recommended when rejecting)', 'ማስታወሻ (አማራጭ)')}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button busy={a.busy} onClick={() => go(true)}>
              {t('Approve', 'አጽድቅ')}
            </Button>
            <Button tone="danger" busy={a.busy} onClick={() => go(false)}>
              {t('Reject', 'ውድቅ አድርግ')}
            </Button>
          </div>
        </>
      )}
      <ErrorText error={a.error} />
    </div>
  );
}
