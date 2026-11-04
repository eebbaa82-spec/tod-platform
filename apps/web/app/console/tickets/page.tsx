'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FilterBar, Notice, qs, useAgents } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Badge, Button, Card, ErrorText, Field, Input, LinkButton, PageTitle, Select, Spinner, StatusBadge, Table, Textarea, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { humanise, shortDate } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

// Mirrors CATEGORIES in apps/api/src/support/support.service.ts.
const CATEGORIES = ['ACCOUNT', 'VERIFICATION', 'PAYMENT', 'ASSIGNMENT', 'TECHNICAL', 'ACCOMMODATION', 'FEEDBACK', 'OTHER'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function TicketsPage() {
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.tickets]}>
      <Suspense fallback={<Spinner />}>
        <Tickets />
      </Suspense>
    </RequireAuth>
  );
}

function Tickets() {
  const { t } = useLang();
  const { me } = useSession();
  const sp = useSearchParams();
  const designated = !!me?.safeguardingDesignated;
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [confidential, setConfidential] = useState(designated ? sp.get('confidential') ?? '' : '');
  const { data, error, loading, reload } = useApi<any[]>(`/support/tickets${qs({ status, confidential })}`);
  const { name } = useAgents();
  const [ok, setOk] = useState<string | null>(null);

  return (
    <>
      <PageTitle sub={t('Tickets from the app, the call line and the assisted desk.', 'ከመተግበሪያው፣ ከስልክ መስመሩ እና ከእገዛ ዴስኩ የመጡ ትኬቶች።')} actions={<LinkButton href="/console/tickets/assisted" tone="secondary">{t('Assisted registration', 'የታገዘ ምዝገባ')}</LinkButton>}>
        {t('Helpdesk', 'የእርዳታ ዴስክ')}
      </PageTitle>
      <div className="space-y-4">
        <Notice ok={ok} />
        <Card>
          <FilterBar>
            <Field label={t('Status', 'ሁኔታ')}>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: t('Any status', 'ማንኛውም') }, ...STATUSES.map((s) => ({ value: s, label: humanise(s) }))]} />
            </Field>
            {designated ? (
              <Field label={t('Confidential cases', 'ሚስጥራዊ ጉዳዮች')}>
                <Select value={confidential} onChange={(e) => setConfidential(e.target.value)} options={[{ value: '', label: t('Include', 'አካትት') }, { value: 'true', label: t('Only confidential', 'ሚስጥራዊ ብቻ') }, { value: 'false', label: t('Exclude', 'አታካትት') }]} />
              </Field>
            ) : (
              <p className="text-xs text-stone-500 sm:col-span-2">{t('Confidential safeguarding cases are visible only to designated staff.', 'ሚስጥራዊ ጉዳዮች ለተመደቡ ሠራተኞች ብቻ ይታያሉ።')}</p>
            )}
          </FilterBar>
          <ErrorText error={error} />
          {loading && !data ? (
            <Spinner />
          ) : (
            <Table
              head={[t('Reference', 'መለያ'), t('Subject', 'ርዕስ'), t('Category', 'ምድብ'), t('Source', 'ምንጭ'), t('Status', 'ሁኔታ'), t('Owner', 'ባለቤት'), t('Age', 'ዕድሜ'), t('Opened', 'የተከፈተ')]}
              empty={t('No tickets.', 'ትኬት የለም።')}
              rows={(data ?? []).map((x) => [
                <Link key="r" href={`/console/tickets/${x.id}`} className="whitespace-nowrap font-medium text-brand-700 hover:underline">
                  {x.ref}
                </Link>,
                <span key="s">
                  {x.subject}{' '}
                  {x.confidential && <Badge tone="red">{t('confidential', 'ሚስጥራዊ')}</Badge>}{' '}
                  {x.confidential && !x.acknowledgedAt && <Badge tone={x.ackOverdue ? 'red' : 'amber'}>{x.ackOverdue ? t('acknowledgement overdue', 'ማረጋገጫ ዘግይቷል') : t('to acknowledge', 'ሊረጋገጥ')}</Badge>}
                </span>,
                humanise(x.safeguardingType ?? x.category),
                humanise(x.source),
                <StatusBadge key="st" status={x.status} />,
                name(x.ownerId),
                x.ageHours < 48 ? `${x.ageHours} h` : `${Math.round(x.ageHours / 24)} d`,
                <span key="d" className="whitespace-nowrap">{shortDate(x.createdAt)}</span>,
              ])}
            />
          )}
        </Card>
        <LogTicket onDone={(r) => { setOk(t(`Ticket ${r.ref} logged.`, `ትኬት ${r.ref} ተመዝግቧል።`)); reload(); }} />
        {designated && <LogConfidential onDone={(r) => { setOk(t(`Confidential case ${r.ref} logged. You are its owner.`, `ሚስጥራዊ ጉዳይ ${r.ref} ተመዝግቧል። ባለቤቱ እርስዎ ነዎት።`)); reload(); }} />}
      </div>
    </>
  );
}

function LogTicket({ onDone }: { onDone: (r: any) => void }) {
  const { t } = useLang();
  const blank = { source: 'CALL_LINE', requesterPhone: '', category: 'ACCOUNT', subject: '', description: '', assignmentId: '' };
  const [f, setF] = useState(blank);
  const a = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('Log a ticket from the call line or assisted desk', 'ከስልክ መስመር ወይም ከእገዛ ዴስክ ትኬት መዝግብ')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const body = { source: f.source, category: f.category, subject: f.subject, description: f.description, ...(f.requesterPhone ? { requesterPhone: f.requesterPhone } : {}), ...(f.assignmentId ? { assignmentId: f.assignmentId } : {}) };
          const r = await a.run(() => post('/support/tickets', body));
          if (r) {
            setF(blank);
            onDone(r);
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('Source', 'ምንጭ')}>
            <Select value={f.source} onChange={set('source')} options={[{ value: 'CALL_LINE', label: t('Call line', 'የስልክ መስመር') }, { value: 'ASSISTED_DESK', label: t('Assisted desk', 'የእገዛ ዴስክ') }]} />
          </Field>
          <Field label={t("Caller's phone", 'የደዋዩ ስልክ')} hint={t('Links the ticket to their account if one exists.', 'መለያ ካለ ከትኬቱ ጋር ያገናኛል።')}>
            <Input type="tel" value={f.requesterPhone} onChange={set('requesterPhone')} placeholder="09…" />
          </Field>
          <Field label={t('Category', 'ምድብ')}>
            <Select value={f.category} onChange={set('category')} options={CATEGORIES.map((c) => ({ value: c, label: humanise(c) }))} />
          </Field>
        </div>
        <Field label={t('Subject', 'ርዕስ')}>
          <Input value={f.subject} onChange={set('subject')} required minLength={3} maxLength={160} />
        </Field>
        <Field label={t('What the person said', 'ሰውየው የተናገረው')}>
          <Textarea value={f.description} onChange={set('description')} required minLength={5} maxLength={5000} />
        </Field>
        <Field label={t('Assignment id (optional)', 'የሥራ መለያ (አማራጭ)')}>
          <Input value={f.assignmentId} onChange={set('assignmentId')} />
        </Field>
        <p className="text-xs text-stone-500">{t('You become the owner of tickets you log. For harassment, exploitation, discrimination or fraud, do not log it here: a designated staff member logs it as a confidential report, or help the person use "Report a concern" in the app so it stays confidential.', 'የሚመዘግቡት ትኬት ባለቤት እርስዎ ይሆናሉ። ለትንኮሳ፣ ለብዝበዛ፣ ለመድልዎ ወይም ለማጭበርበር እዚህ አይመዝግቡ፦ የተመደበ ሠራተኛ እንደ ሚስጥራዊ ሪፖርት ይመዘግበዋል፣ ወይም ሰውየው በመተግበሪያው "ስጋት ሪፖርት አድርግ" እንዲጠቀም ያግዙት።')}</p>
        <ErrorText error={a.error} />
        <Button type="submit" busy={a.busy}>
          {t('Log ticket', 'መዝግብ')}
        </Button>
      </form>
    </Card>
  );
}

// Designated safeguarding staff log a confidential report for someone who called or came to the desk.
function LogConfidential({ onDone }: { onDone: (r: any) => void }) {
  const { t } = useLang();
  const blank = { type: 'HARASSMENT', source: 'CALL_LINE', requesterPhone: '', description: '' };
  const [f, setF] = useState(blank);
  const a = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title={t('Log a confidential report for a caller', 'ለደዋይ ሚስጥራዊ ሪፖርት መዝግብ')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const body = { type: f.type, source: f.source, description: f.description, ...(f.requesterPhone.trim() ? { requesterPhone: f.requesterPhone.trim() } : {}) };
          const r = await a.run(() => post('/support/reports', body));
          if (r) {
            setF(blank);
            onDone(r);
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('What happened', 'የተከሰተው')}>
            <Select
              value={f.type}
              onChange={set('type')}
              options={[
                { value: 'HARASSMENT', label: t('Harassment', 'ትንኮሳ') },
                { value: 'EXPLOITATION', label: t('Exploitation', 'ብዝበዛ') },
                { value: 'DISCRIMINATION', label: t('Discrimination', 'መድልዎ') },
                { value: 'FRAUD', label: t('Fraud or scam', 'ማጭበርበር') },
              ]}
            />
          </Field>
          <Field label={t('Source', 'ምንጭ')}>
            <Select value={f.source} onChange={set('source')} options={[{ value: 'CALL_LINE', label: t('Call line', 'የስልክ መስመር') }, { value: 'ASSISTED_DESK', label: t('Assisted desk', 'የእገዛ ዴስክ') }]} />
          </Field>
          <Field label={t("Caller's phone (optional)", 'የደዋዩ ስልክ (አማራጭ)')} hint={t('Links the case to their account if one exists.', 'መለያ ካለ ጉዳዩን ከመለያቸው ጋር ያገናኛል።')}>
            <Input type="tel" value={f.requesterPhone} onChange={set('requesterPhone')} placeholder="09…" />
          </Field>
        </div>
        <Field label={t('What the person said', 'ሰውየው የተናገረው')}>
          <Textarea value={f.description} onChange={set('description')} required minLength={5} maxLength={5000} />
        </Field>
        <p className="text-xs text-stone-500">{t('Only designated safeguarding staff can see this case. You become its owner.', 'ይህን ጉዳይ የሚያዩት የተመደቡ የጥበቃ ሠራተኞች ብቻ ናቸው። ባለቤቱ እርስዎ ይሆናሉ።')}</p>
        <ErrorText error={a.error} />
        <Button type="submit" tone="danger" busy={a.busy} disabled={f.description.trim().length < 5}>
          {t('Log confidential report', 'ሚስጥራዊ ሪፖርት መዝግብ')}
        </Button>
      </form>
    </Card>
  );
}
