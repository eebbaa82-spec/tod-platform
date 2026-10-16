'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/shell';
import { Alert, Badge, Button, Card, ErrorText, Field, Modal, PageTitle, Spinner, Textarea, useAction } from '@/components/ui';
import { Facts, FileLink, FileUploader } from '@/components/work-common';
import { post } from '@/lib/api';
import { date, etb } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

type T = (en: string, am: string) => string;

export default function DisputePage() {
  return (
    <RequireAuth>
      <Dispute />
    </RequireAuth>
  );
}

const STAGES = ['INTAKE', 'FACILITATION', 'DECISION', 'APPEAL', 'CLOSED'];

function stageLabel(stage: string, t: T) {
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

function remedyLabel(r: string | null | undefined, t: T) {
  const map: Record<string, [string, string]> = {
    CORRECTION: ['The talent corrects the work', 'ባለሙያው ሥራውን ያስተካክላል'],
    PARTIAL_ACCEPTANCE: ['Part of the work is accepted', 'የሥራው ከፊል ተቀባይነት አግኝቷል'],
    MILESTONE_ADJUSTMENT: ['The stage amount is adjusted', 'የደረጃው መጠን ተስተካክሏል'],
    REFUND: ['Money returned to the client', 'ገንዘቡ ለደንበኛው ይመለሳል'],
    REASSIGNMENT: ['Money returned and the job given to another talent', 'ገንዘቡ ይመለሳል፣ ሥራውም ለሌላ ባለሙያ ይሰጣል'],
    RELEASE_IN_FULL: ['Full payment to the talent', 'ሙሉ ክፍያ ለባለሙያው'],
  };
  const v = map[r ?? ''];
  return v ? t(v[0], v[1]) : r ?? '';
}

function roleLabel(r: string, t: T) {
  return r === 'CLIENT' ? t('Client', 'ደንበኛ') : r === 'TALENT' ? t('Talent', 'ባለሙያ') : t('ToD mediator', 'የToD አስታራቂ');
}

function Dispute() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const { data: d, error, loading, reload } = useApi<any>(`/disputes/${id}`);
  if (loading && !d) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!d) return null;
  const decided = d.decisionStatus === 'APPROVED' || d.decisionStatus === 'EXECUTED';
  const stageIdx = STAGES.indexOf(d.stage);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="text-sm">
        <Link href={`/assignments/${d.assignmentId}`} className="text-brand-700 hover:underline">← {t('Back to the job', 'ወደ ሥራው ተመለስ')}</Link>
      </div>
      <PageTitle sub={`${d.assignment?.ref ?? ''} · ${d.assignment?.title ?? ''}`} actions={<Badge tone={d.stage === 'CLOSED' ? 'gray' : 'red'}>{stageLabel(d.stage, t)}</Badge>}>
        {t(`Dispute ${d.ref}`, `ክርክር ${d.ref}`)}
      </PageTitle>

      <Card>
        <ol className={`mb-4 grid gap-1 text-center text-[11px] sm:text-xs ${d.appealedAt ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {STAGES.filter((s) => s !== 'APPEAL' || d.appealedAt).map((s) => {
            const i = STAGES.indexOf(s);
            const done = i < stageIdx || d.stage === 'CLOSED';
            const now = s === d.stage;
            return (
              <li key={s} className={`rounded-md px-1 py-2 ${now ? 'bg-brand-600 font-semibold text-white' : done ? 'bg-brand-50 text-brand-700' : 'bg-stone-100 text-stone-500'}`}>
                {stageLabel(s, t)}
              </li>
            );
          })}
        </ol>
        <Facts
          rows={[
            [t('Opened by', 'የከፈተው'), roleLabel(d.openedByRole, t)],
            [t('Opened on', 'የተከፈተበት'), date(d.createdAt, lang)],
            [t('Amount in dispute', 'የሚከራከሩበት መጠን'), etb(d.amountDisputed)],
            [t('Decision expected by', 'ውሳኔ የሚጠበቅበት'), date(d.limits?.decisionBy, lang)],
            ...(d.closedAt ? ([[t('Closed on', 'የተዘጋበት'), date(d.closedAt, lang)]] as [React.ReactNode, React.ReactNode][]) : []),
          ]}
        />
        <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
          <p className="font-medium">{t('The problem', 'ችግሩ')}</p>
          <p className="whitespace-pre-wrap text-stone-700">{d.reason}</p>
        </div>
        <p className="mt-3 text-xs text-stone-500">{t('The money for this stage is frozen at the bank until the case is closed. The mediator sees the package, the delivered work and the messages on ToD from when the dispute was opened.', 'ጉዳዩ እስኪዘጋ ድረስ የዚህ ደረጃ ገንዘብ በባንኩ ታግዷል። አስታራቂው ጥቅሉን፣ የቀረበውን ሥራ እና ክርክሩ በተከፈተበት ጊዜ በToD ላይ የነበሩትን መልእክቶች ያያል።')}</p>
      </Card>

      {d.decisionStatus === 'PENDING_APPROVAL' && <Alert tone="info">{t('A decision has been written and is being checked by a second person. You will be told by SMS.', 'ውሳኔ ተጽፏል፣ በሁለተኛ ሰው እየተረጋገጠ ነው። በSMS ይነገርዎታል።')}</Alert>}
      {decided && <Decision d={d} reload={reload} />}
      {d.appealedAt && (
        <Card title={t('Appeal', 'ይግባኝ')}>
          <p className="text-sm text-stone-600">{date(d.appealedAt, lang)}</p>
          <p className="whitespace-pre-wrap text-sm">{d.appealReason}</p>
          {d.stage === 'APPEAL' && <p className="mt-2 text-xs text-stone-500">{t('A different mediator is looking at the appeal. The decision on appeal is final.', 'ሌላ አስታራቂ ይግባኙን እየተመለከተ ነው። በይግባኝ የሚሰጠው ውሳኔ የመጨረሻ ነው።')}</p>}
        </Card>
      )}
      <Notes d={d} reload={reload} />
    </div>
  );
}

function Decision({ d, reload }: { d: any; reload: () => void }) {
  const { t, lang } = useLang();
  const [appealOpen, setAppealOpen] = useState(false);
  const accept = useAction();
  const party = d.viewerRole === 'CLIENT' || d.viewerRole === 'TALENT';
  const myAccepted = d.viewerRole === 'CLIENT' ? d.clientAcceptedAt : d.talentAcceptedAt;
  const otherAccepted = d.viewerRole === 'CLIENT' ? d.talentAcceptedAt : d.clientAcceptedAt;
  const appealOpenNow = d.decisionStatus === 'APPROVED' && d.appealBy && !d.appealedAt && !d.finalDecision && new Date(d.appealBy).getTime() > Date.now();

  return (
    <Card title={d.finalDecision ? t('Final decision', 'የመጨረሻ ውሳኔ') : t('Decision', 'ውሳኔ')}>
      <div className="space-y-3 text-sm">
        <p className="text-base font-semibold">{remedyLabel(d.remedy, t)}</p>
        {d.remedy !== 'CORRECTION' && (
          <Facts
            rows={[
              [t('To the talent (before commission)', 'ለባለሙያው (ኮሚሽን ሳይቀነስ)'), etb(d.releaseAmount)],
              [t('Back to the client', 'ለደንበኛው የሚመለስ'), etb(d.refundAmount)],
            ]}
          />
        )}
        {d.decisionNote && (
          <div className="rounded-lg bg-stone-50 p-3">
            <p className="font-medium">{t('Why', 'ምክንያቱ')}</p>
            <p className="whitespace-pre-wrap text-stone-700">{d.decisionNote}</p>
          </div>
        )}
        {d.decisionStatus === 'EXECUTED' ? (
          <Alert tone="success">{t('This decision has been carried out and the case is closed.', 'ይህ ውሳኔ ተፈጽሟል፣ ጉዳዩም ተዘግቷል።')}</Alert>
        ) : (
          party && (
            <>
              {d.appealBy && !d.appealedAt && (
                <p className="text-stone-700">
                  {t(`The decision takes effect after ${date(d.appealBy, lang)}, or sooner if both of you accept it.`, `ውሳኔው ከ${date(d.appealBy, lang)} በኋላ ይፈጸማል፣ ሁለታችሁም ከተቀበላችሁ ደግሞ ቀደም ብሎ።`)}
                </p>
              )}
              {myAccepted ? (
                <Alert tone="info">{otherAccepted ? t('You both accepted.', 'ሁለታችሁም ተቀብላችኋል።') : t('You accepted. Waiting for the other side.', 'ተቀብለዋል። ሌላኛውን ወገን በመጠበቅ ላይ።')}</Alert>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => accept.run(async () => { await post(`/disputes/${d.id}/accept-decision`); reload(); })} busy={accept.busy} className="w-full sm:w-auto">
                    {t('I accept this decision', 'ይህን ውሳኔ እቀበላለሁ')}
                  </Button>
                  {appealOpenNow && (
                    <Button tone="secondary" onClick={() => setAppealOpen(true)} className="w-full sm:w-auto">
                      {t('Appeal (once only)', 'ይግባኝ (አንድ ጊዜ ብቻ)')}
                    </Button>
                  )}
                </div>
              )}
              <ErrorText error={accept.error} />
            </>
          )
        )}
      </div>
      {appealOpen && <AppealModal d={d} onClose={() => setAppealOpen(false)} onDone={() => { setAppealOpen(false); reload(); }} />}
    </Card>
  );
}

function AppealModal({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useLang();
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={t('Appeal the decision', 'በውሳኔው ላይ ይግባኝ')}>
      <div className="space-y-3 text-sm">
        <p>{t(`You can appeal only once, before ${date(d.appealBy, lang)}. A different mediator will look again, and their decision is final.`, `ይግባኝ ማለት የሚችሉት አንድ ጊዜ ብቻ ነው፣ ከ${date(d.appealBy, lang)} በፊት። ሌላ አስታራቂ እንደገና ያያል፣ ውሳኔያቸውም የመጨረሻ ነው።`)}</p>
        <Field label={t('Why do you disagree?', 'ለምን አይስማሙም?')} hint={t('At least 10 letters.', 'ቢያንስ 10 ፊደላት።')}>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={3000} />
        </Field>
        <ErrorText error={error} />
        <Button onClick={() => run(async () => { await post(`/disputes/${d.id}/appeal`, { reason: reason.trim() }); onDone(); })} busy={busy} disabled={reason.trim().length < 10} className="w-full">
          {t('Send appeal', 'ይግባኝ ላክ')}
        </Button>
      </div>
    </Modal>
  );
}

function Notes({ d, reload }: { d: any; reload: () => void }) {
  const { t, lang } = useLang();
  const { me } = useSession();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const { busy, error, run } = useAction();
  const notes: any[] = (d.notes ?? []).filter((n: any) => !n.internal);
  const closed = d.stage === 'CLOSED';

  const submit = () =>
    run(async () => {
      await post(`/disputes/${d.id}/notes`, { body: body.trim(), fileIds: files.length ? files.map((f) => f.id) : undefined });
      setBody('');
      setFiles([]);
      reload();
    });

  return (
    <Card title={t('Notes and evidence', 'ማስታወሻዎች እና ማስረጃዎች')}>
      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-sm text-stone-500">{t('No notes yet. Add anything that helps the mediator understand what happened.', 'ገና ማስታወሻ የለም። አስታራቂው የተከሰተውን እንዲረዳ የሚያግዝ ማንኛውንም ነገር ያክሉ።')}</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => {
              const mine = n.authorId === me?.id;
              return (
                <li key={n.id} className={`rounded-lg p-3 text-sm ${n.authorRole === 'STAFF' ? 'bg-sky-50' : mine ? 'bg-brand-50' : 'bg-stone-50'}`}>
                  <p className="text-xs font-semibold text-stone-600">
                    {mine ? t('You', 'እርስዎ') : roleLabel(n.authorRole, t)} · <span className="font-normal">{date(n.at, lang, true)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
                  {n.fileIds?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-3">
                      {n.fileIds.map((f: string, i: number) => <FileLink key={f} id={f} name={t(`Evidence ${i + 1}`, `ማስረጃ ${i + 1}`)} />)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {closed ? (
          <p className="text-xs text-stone-500">{t('This case is closed.', 'ይህ ጉዳይ ተዘግቷል።')}</p>
        ) : (
          <div className="space-y-2 border-t border-stone-100 pt-3">
            <Field label={t('Add a note', 'ማስታወሻ ያክሉ')}>
              <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
            </Field>
            <FileUploader purpose="EVIDENCE" files={files} onChange={setFiles} label={t('Attach evidence', 'ማስረጃ አያይዝ')} />
            <ErrorText error={error} />
            <Button onClick={submit} busy={busy} disabled={!body.trim()} className="w-full sm:w-auto">
              {t('Send note', 'ማስታወሻ ላክ')}
            </Button>
            <p className="text-xs text-stone-500">{t('Both sides and the mediator can read these notes.', 'ሁለቱም ወገኖች እና አስታራቂው እነዚህን ማስታወሻዎች ማንበብ ይችላሉ።')}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
