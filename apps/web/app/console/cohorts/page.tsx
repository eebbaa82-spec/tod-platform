'use client';
import { useState } from 'react';
import { Notice } from '@/components/console-kit';
import { CONSOLE_ROLES } from '@/components/console-nav';
import { RequireAuth } from '@/components/shell';
import { Alert, Button, Card, Checkbox, Empty, ErrorText, Field, Input, PageTitle, Spinner, StatusBadge, Table, Textarea, useAction } from '@/components/ui';
import { post } from '@/lib/api';
import { date, etb, toSantim } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

// Pilot cohorts (FR-ADM-07): only members of a cohort approved by the
// Project Director can pay for work.
export default function CohortsPage() {
  const { t } = useLang();
  return (
    <RequireAuth roles={[...CONSOLE_ROLES.cohorts]}>
      <PageTitle sub={t('Only members of an approved pilot group can pay for work. The Project Director approves each group.', 'ለሥራ መክፈል የሚችሉት የጸደቀ የሙከራ ቡድን አባላት ብቻ ናቸው። እያንዳንዱን ቡድን የፕሮጀክት ዳይሬክተሩ ያጸድቃል።')}>
        {t('Pilot groups', 'የሙከራ ቡድኖች')}
      </PageTitle>
      <Cohorts />
    </RequireAuth>
  );
}

function Cohorts() {
  const { t, lang } = useLang();
  const { has } = useSession();
  const list = useApi<any[]>('/admin/cohorts');
  const [open, setOpen] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const canCreate = has('PLATFORM_ADMIN', 'SUPER_ADMIN');
  const canApprove = has('SUPER_ADMIN');
  const canMembers = has('PLATFORM_ADMIN', 'SUPER_ADMIN', 'SUPPORT_AGENT');
  const a = useAction();

  return (
    <div className="space-y-4">
      <Notice ok={ok} />
      <ErrorText error={list.error || a.error} />
      <Card title={t('Groups', 'ቡድኖች')}>
        {list.loading && !list.data ? (
          <Spinner />
        ) : (
          <Table
            head={[t('Name', 'ስም'), t('Status', 'ሁኔታ'), t('Members', 'አባላት'), t('Value limit', 'የዋጋ ገደብ'), t('Pay-later', 'በኋላ ክፍያ'), t('Approved', 'የጸደቀበት'), '']}
            empty={t('No groups yet.', 'እስካሁን ቡድን የለም።')}
            rows={(list.data ?? []).map((c) => [
              <span key="n" className="font-semibold">{c.name}</span>,
              <StatusBadge key="s" status={c.status} />,
              c._count?.members ?? 0,
              c.valueLimit === null ? t('Client level limit', 'የደንበኛ ደረጃ ገደብ') : etb(c.valueLimit),
              c.payLaterEligible ? t('Eligible', 'ብቁ') : t('No', 'አይ'),
              date(c.approvedAt, lang),
              <div key="x" className="flex flex-wrap gap-2">
                {canApprove && c.status === 'PROPOSED' && (
                  <Button
                    tone="secondary"
                    busy={a.busy}
                    onClick={async () => {
                      const r = await a.run(() => post(`/admin/cohorts/${c.id}/approve`, {}));
                      if (r) {
                        setOk(t(`${c.name} approved.`, `${c.name} ጸድቋል።`));
                        list.reload();
                      }
                    }}
                  >
                    {t('Approve', 'አጽድቅ')}
                  </Button>
                )}
                {canMembers && c.status !== 'CLOSED' && (
                  <Button tone="ghost" onClick={() => setOpen(open === c.id ? null : c.id)}>
                    {t('Members', 'አባላት')}
                  </Button>
                )}
              </div>,
            ])}
          />
        )}
      </Card>
      {open && <Members id={open} onDone={(m) => { setOk(m); list.reload(); }} />}
      {canCreate && <NewCohort onDone={(m) => { setOk(m); list.reload(); }} />}
      {!canApprove && <Alert tone="info">{t('A super administrator (the Project Director) approves new groups.', 'አዳዲስ ቡድኖችን ዋና አስተዳዳሪው (የፕሮጀክት ዳይሬክተሩ) ያጸድቃል።')}</Alert>}
    </div>
  );
}

function Members({ id, onDone }: { id: string; onDone: (m: string) => void }) {
  const { t } = useLang();
  const c = useApi<any>(`/admin/cohorts/${id}`);
  const [phones, setPhones] = useState('');
  const a = useAction();
  if (!c.data) return <Spinner />;
  return (
    <Card title={t(`Members of ${c.data.name}`, `የ${c.data.name} አባላት`)}>
      {c.data.members.length ? (
        <ul className="mb-4 divide-y divide-stone-100 text-sm">
          {c.data.members.map((m: any) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {m.displayName} <span className="text-stone-500">{m.phone}</span>
              </span>
              <Button
                tone="ghost"
                onClick={async () => {
                  const r = await a.run(() => post(`/admin/cohorts/${id}/members`, { remove: [m.id] }));
                  if (r) {
                    c.reload();
                    onDone(t('Member removed.', 'አባሉ ተወግዷል።'));
                  }
                }}
              >
                {t('Remove', 'አስወግድ')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('No members yet.', 'እስካሁን አባል የለም።')}</Empty>
      )}
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const list = phones.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
          const r = await a.run(() => post(`/admin/cohorts/${id}/members`, { addPhones: list }));
          if (r) {
            setPhones('');
            c.reload();
            onDone(t(`${list.length} added.`, `${list.length} ተጨምረዋል።`));
          }
        }}
      >
        <Field label={t('Add by phone number', 'በስልክ ቁጥር ያክሉ')} hint={t('One or more numbers, separated by commas or new lines.', 'አንድ ወይም ከዚያ በላይ ቁጥሮች፣ በኮማ ወይም በአዲስ መስመር የተለዩ።')}>
          <Textarea rows={3} value={phones} onChange={(e) => setPhones(e.target.value)} />
        </Field>
        <ErrorText error={a.error} />
        <Button type="submit" busy={a.busy} disabled={!phones.trim()}>
          {t('Add members', 'አባላትን ያክሉ')}
        </Button>
      </form>
    </Card>
  );
}

function NewCohort({ onDone }: { onDone: (m: string) => void }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [limit, setLimit] = useState('');
  const [payLater, setPayLater] = useState(false);
  const a = useAction();
  return (
    <Card title={t('New group', 'አዲስ ቡድን')}>
      <form
        className="max-w-lg space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await a.run(() => post('/admin/cohorts', { name: name.trim(), description: description.trim() || undefined, valueLimit: limit ? toSantim(limit) : null, payLaterEligible: payLater }));
          if (r) {
            setName('');
            setDescription('');
            setLimit('');
            onDone(t('Group created. It waits for the Project Director to approve it.', 'ቡድኑ ተፈጥሯል። የፕሮጀክት ዳይሬክተሩን ማጽደቅ ይጠብቃል።'));
          }
        }}
      >
        <Field label={t('Name', 'ስም')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
        </Field>
        <Field label={t('Description (optional)', 'መግለጫ (አማራጭ)')}>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t('Highest assignment value (birr, optional)', 'ከፍተኛው የሥራ ዋጋ (ብር፣ አማራጭ)')} hint={t('Leave empty to use the client-level limits.', 'የደንበኛ ደረጃ ገደቦችን ለመጠቀም ባዶ ይተዉት።')}>
          <Input type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Checkbox checked={payLater} onChange={(e) => setPayLater(e.target.checked)} label={t('Eligible for pay-later (when it is switched on)', 'ለበኋላ ክፍያ ብቁ (ሲበራ)')} />
        <ErrorText error={a.error} />
        <Button type="submit" busy={a.busy}>
          {t('Create group', 'ቡድን ፍጠር')}
        </Button>
      </form>
    </Card>
  );
}
