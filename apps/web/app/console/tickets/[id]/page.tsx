'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KV, Notice, useAgents } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { FileUploader } from '@/components/work-common';
import { Alert, Badge, Button, Card, Checkbox, ErrorText, Field, PageTitle, Select, Spinner, StatusBadge, Textarea, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date, humanise } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useApi } from '@/lib/use-api';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function TicketPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.tickets]}>
      <Ticket />
    </RequireAuth>
  );
}

function Ticket() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const { data: tk, error, loading, reload, setData } = useApi<any>(`/support/tickets/${id}`);
  const { agents, name } = useAgents();
  const [ok, setOk] = useState<string | null>(null);
  const ack = useAction();

  if (loading && !tk) return <Spinner />;
  if (error && !tk) return <ErrorText error={error} />;
  if (!tk) return null;

  const author = (u: { authorId: string; authorName?: string | null }) =>
    u.authorId === tk.requesterId ? `${u.authorName ?? ''}${u.authorName ? ' · ' : ''}${t('Requester', 'ጠያቂ')}` : (u.authorName ?? name(u.authorId));

  return (
    <>
      <PageTitle
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={tk.status} />
            {tk.confidential && <Badge tone="red">{t('confidential', 'ሚስጥራዊ')}</Badge>}
            {humanise(tk.safeguardingType ?? tk.category)} · {humanise(tk.source)}
          </span>
        }
      >
        {tk.ref}: {tk.subject}
      </PageTitle>
      <div className="space-y-4">
        <Notice ok={ok} />
        {tk.confidential && !tk.acknowledgedAt && (
          <Alert tone="warning">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t(`Acknowledge this confidential case by ${date(tk.acknowledgeBy, lang)}. The reporter is told by SMS when you do.`, `ይህን ሚስጥራዊ ጉዳይ እስከ ${date(tk.acknowledgeBy, lang)} ያረጋግጡ።`)}</span>
              <Button
                busy={ack.busy}
                onClick={async () => {
                  const r = await ack.run(() => post(`/support/tickets/${id}/acknowledge`));
                  if (r) {
                    setOk(t('Case acknowledged. You are now its owner.', 'ጉዳዩ ተረጋግጧል።'));
                    reload();
                  }
                }}
              >
                {t('Acknowledge', 'አረጋግጥ')}
              </Button>
            </div>
          </Alert>
        )}
        <ErrorText error={ack.error} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('Details', 'ዝርዝሮች')}>
            <KV
              items={[
                [t('Description', 'መግለጫ'), <span key="d" className="whitespace-pre-wrap">{tk.description}</span>],
                [t('Requester', 'ጠያቂ'), tk.requesterId ? <Link key="r" className="text-brand-700 hover:underline" href={`/console/users/${tk.requesterId}`}>{t('Open account', 'መለያውን ክፈት')}</Link> : t('No account linked', 'መለያ አልተገናኘም')],
                [t('Logged by', 'የመዘገበው'), tk.createdById === tk.requesterId ? t('Requester', 'ጠያቂ') : name(tk.createdById)],
                [t('Owner', 'ባለቤት'), name(tk.ownerId)],
                [t('Opened', 'የተከፈተ'), date(tk.createdAt, lang, true)],
                [t('Acknowledged', 'የተረጋገጠ'), tk.confidential ? (tk.acknowledgedAt ? date(tk.acknowledgedAt, lang, true) : t('Not yet', 'ገና')) : null],
                [t('Resolved', 'የተፈታ'), tk.resolvedAt ? date(tk.resolvedAt, lang, true) : null],
                [t('Outcome', 'ውጤት'), tk.outcome ? <span key="o" className="whitespace-pre-wrap">{tk.outcome}</span> : null],
                [t('Assignment', 'ሥራ'), tk.assignmentId ? <Link key="a" className="text-brand-700 hover:underline" href={`/assignments/${tk.assignmentId}`}>{t('Open', 'ክፈት')}</Link> : null],
                [
                  t('Files', 'ፋይሎች'),
                  tk.files?.length ? (
                    <span key="f" className="flex flex-wrap gap-2">
                      {tk.files.map((f: any) => (
                        <a key={f.id} className="text-brand-700 underline" href={`/api/files/${f.id}`}>
                          {f.name}
                        </a>
                      ))}
                    </span>
                  ) : null,
                ],
              ]}
            />
          </Card>
          <Manage tk={tk} agents={agents} onDone={(r) => { setData(r); setOk(t('Ticket updated.', 'ትኬቱ ተሻሽሏል።')); }} />
        </div>
        <Card title={t('Updates', 'ማሻሻያዎች')}>
          <ul className="space-y-2">
            {tk.updates.map((u: any) => (
              <li key={u.id} className={`rounded-lg border p-3 text-sm ${u.internal ? 'border-amber-300 bg-amber-50' : 'border-stone-200'}`}>
                <p className="mb-1 text-xs text-stone-500">
                  {author(u)} · {date(u.at, lang, true)} {u.internal && <Badge tone="amber">{t('internal', 'ውስጣዊ')}</Badge>}
                </p>
                <p className="whitespace-pre-wrap">{u.body}</p>
              </li>
            ))}
            {!tk.updates.length && <li className="text-sm text-stone-500">{t('No updates yet.', 'ገና ማሻሻያ የለም።')}</li>}
          </ul>
          <AddUpdate id={id} hasRequester={!!tk.requesterId} onDone={(r) => setData(r)} />
        </Card>
      </div>
    </>
  );
}

function Manage({ tk, agents, onDone }: { tk: any; agents: { id: string; displayName: string }[]; onDone: (r: any) => void }) {
  const { t } = useLang();
  const [status, setStatus] = useState(tk.status);
  const [ownerId, setOwnerId] = useState(tk.ownerId ?? '');
  const [outcome, setOutcome] = useState(tk.outcome ?? '');
  const a = useAction();
  useEffect(() => {
    setStatus(tk.status);
    setOwnerId(tk.ownerId ?? '');
    setOutcome(tk.outcome ?? '');
  }, [tk]);
  const closing = status === 'RESOLVED' || status === 'CLOSED';
  const needOutcome = tk.confidential && closing && !outcome.trim();
  return (
    <Card title={t('Status, owner and outcome', 'ሁኔታ፣ ባለቤት እና ውጤት')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const body: Record<string, string> = {};
          if (status !== tk.status) body.status = status;
          if (ownerId && ownerId !== tk.ownerId) body.ownerId = ownerId;
          if (outcome.trim() && outcome.trim() !== (tk.outcome ?? '')) body.outcome = outcome.trim();
          const r = await a.run(() => post(`/support/tickets/${tk.id}`, body));
          if (r) onDone(r);
        }}
      >
        <Field label={t('Status', 'ሁኔታ')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={STATUSES.map((s) => ({ value: s, label: humanise(s) }))} />
        </Field>
        <Field label={t('Owner', 'ባለቤት')}>
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} options={[{ value: '', label: t('Unassigned', 'ያልተመደበ') }, ...agents.map((x) => ({ value: x.id, label: x.displayName }))]} />
        </Field>
        <Field label={tk.confidential ? t('Outcome (required to close a confidential case)', 'ውጤት (ሚስጥራዊ ጉዳይ ለመዝጋት ያስፈልጋል)') : t('Outcome', 'ውጤት')}>
          <Textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={3000} />
        </Field>
        <ErrorText error={a.error} />
        <Button type="submit" busy={a.busy} disabled={needOutcome}>
          {t('Save', 'አስቀምጥ')}
        </Button>
        {needOutcome && <p className="text-xs text-red-700">{t('Record the outcome before closing a confidential case.', 'ሚስጥራዊ ጉዳይ ከመዝጋትዎ በፊት ውጤቱን ይመዝግቡ።')}</p>}
      </form>
    </Card>
  );
}

function AddUpdate({ id, hasRequester, onDone }: { id: string; hasRequester: boolean; onDone: (r: any) => void }) {
  const { t } = useLang();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const a = useAction();
  return (
    <form
      className="mt-4 space-y-2 border-t border-stone-200 pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await a.run(() => post(`/support/tickets/${id}`, { body, internal, fileIds: files.length ? files.map((f) => f.id) : undefined }));
        if (r) {
          setBody('');
          setFiles([]);
          onDone(r);
        }
      }}
    >
      <Field label={t('Add an update', 'ማሻሻያ ጨምር')}>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={5000} />
      </Field>
      <FileUploader purpose="TICKET" files={files} onChange={setFiles} label={t('Attach a file', 'ፋይል አያይዝ')} />
      <Checkbox label={t('Internal note: staff only', 'ውስጣዊ ማስታወሻ፦ ለሠራተኞች ብቻ')} checked={internal} onChange={(e) => setInternal(e.target.checked)} />
      {!internal && hasRequester && <p className="text-xs text-stone-500">{t('The requester sees this update and gets a notification.', 'ጠያቂው ይህን ያያል እና ማሳወቂያ ይደርሰዋል።')}</p>}
      <ErrorText error={a.error} />
      <Button type="submit" tone="secondary" busy={a.busy} disabled={!body.trim()}>
        {t('Add update', 'ጨምር')}
      </Button>
    </form>
  );
}
